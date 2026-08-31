# backend/api/routes/exams.py
import os
import json
import zipfile
import asyncio
import shutil
from typing import List, Optional
try:
    import fitz
except ImportError:
    try:
        import pymupdf as fitz
    except ImportError:
        fitz = None
from fastapi import APIRouter, UploadFile, File, Form, HTTPException, Body, Response, BackgroundTasks, Depends, status
from api.dependencies import get_current_user, RoleChecker
from core.database import db
from pydantic import BaseModel
from bson import ObjectId
from ml_pipeline.vision.extractor import VisionExtractor
from ml_pipeline.grading.engine import GradingEngine
from ml_pipeline.grading.similarity import run_similarity_check
from ml_pipeline.grading.rubric_agent import generate_rubric_from_key

router = APIRouter()
vision_engine = VisionExtractor()
grading_engine = GradingEngine()

UPLOAD_DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(__file__))), "data", "uploads")
os.makedirs(UPLOAD_DIR, exist_ok=True)

class CommitGradeRequest(BaseModel):
    question_key: str
    final_score: int
    justification: str

class BoundingBox(BaseModel):
    x: float
    y: float
    w: float
    h: float
    page: int

# --- BACKGROUND WORKERS ---

async def process_submissions_worker(exam_id: str, extract_dir: str, pdf_files: list, rubrics_list: list):
    """Auto-crops and auto-grades the stack of exams in the background using Unified Multimodal Single-Call Grading."""
    rubric_map = {r["question_number"]: r for r in rubrics_list}
    
    # Retrieve master exam metadata for reference answer key
    exam = await db["exams"].find_one({"_id": ObjectId(exam_id)})
    master_answer_key = exam.get("answer_key") if exam else None

    for pdf_file in pdf_files:
        submission_id = os.path.splitext(pdf_file)[0]
        pdf_path = os.path.join(extract_dir, pdf_file)

        await db["submissions"].update_one(
            {"exam_id": ObjectId(exam_id), "submission_id": submission_id},
            {"$set": {"status": "Processing AI"}},
            upsert=True
        )

        try:
            student_grades = {}
            for q_num, rubric_data in rubric_map.items():
                auto_bounding_box = (50, 50, 500, 500, 0)
                
                # Fast local slicing without separate OCR API call
                crop_path = vision_engine.slice_single_crop(pdf_path, submission_id, q_num, auto_bounding_box)
                if not crop_path or not os.path.exists(crop_path):
                    continue

                q_answer_key = rubric_data.get("solution") or rubric_data.get("reference_answer") or rubric_data.get("answer_key") or master_answer_key
                
                # UNIFIED MULTIMODAL CALL: Vision OCR + Rubric Reasoning in a single request
                evaluation = await grading_engine.grade_crop_multimodal(
                    crop_image_path=crop_path,
                    rubric_data=rubric_data,
                    answer_key_text=q_answer_key
                )

                status_tag = "fast_exit" if evaluation.is_blank_or_unattempted else "ai_graded"

                student_grades[q_num] = {
                    "total_score": evaluation.total_score,
                    "justification": evaluation.justification,
                    "step_breakdown": [step.model_dump() for step in evaluation.step_breakdown],
                    "transcribed_text": evaluation.transcribed_text,
                    "crop_image_path": crop_path,
                    "similarity_flag": False,
                    "similarity_matches": [],
                    "similarity_score": 0.0,
                    "plagiarism_flag": False,
                    "status": status_tag,
                    "tokens_used": 0
                }

            await db["submissions"].update_one(
                {"exam_id": ObjectId(exam_id), "submission_id": submission_id},
                {"$set": {"grades": student_grades, "status": "AI Graded"}}
            )
            
        except Exception as e:
            print(f"Auto-grade failed for {submission_id}: {str(e)}")
            await db["submissions"].update_one(
                {"exam_id": ObjectId(exam_id), "submission_id": submission_id},
                {"$set": {"status": "Failed"}}
            )
        await asyncio.sleep(1)


# --- CORE API ROUTES ---

@router.get("", response_model=dict)
async def list_user_exams(current_user: dict = Depends(RoleChecker(["INSTRUCTOR", "TA"]))):
    """Dashboard Command Center: Fetches exams segregated by instructor / linked TA."""
    try:
        user_role = str(current_user.get("role", "")).upper()
        user_id = str(current_user.get("_id"))
        user_email = current_user.get("email")

        if user_role in ["INSTRUCTOR", "PROFESSOR"]:
            # Instructors only see exams created by their ID or email
            query = {"$or": [{"created_by": user_id}, {"created_by": user_email}]}
            cursor = db["exams"].find(query)
            exams = await cursor.to_list(length=100)
            
        else:
            # TAs only see exams created by their linked Instructor
            instructor_id = current_user.get("instructor_id")
            if not instructor_id:
                return {"exams": []}

            # Find linked instructor to also match on their email if legacy
            try:
                instructor = await db["users"].find_one({"_id": ObjectId(instructor_id)})
            except Exception:
                instructor = await db["users"].find_one({"_id": instructor_id})

            instructor_email = instructor.get("email") if instructor else None
            
            query_conditions = [{"created_by": instructor_id}]
            if instructor_email:
                query_conditions.append({"created_by": instructor_email})
                
            cursor = db["exams"].find({"$or": query_conditions})
            exams = await cursor.to_list(length=100)

        for exam in exams:
            exam["_id"] = str(exam["_id"])
        return {"exams": exams}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/initialize")
async def initialize_exam_and_batch(
    background_tasks: BackgroundTasks,
    title: str = Form(...),
    rubric_json: str = Form(...),
    file: UploadFile = File(...),
    current_user: dict = Depends(RoleChecker(["INSTRUCTOR"]))
):
    """INSTRUCTOR ONLY: Creates the exam, saves the rubric, and unpacks the ZIP."""
    if not file.filename.lower().endswith('.zip'):
        raise HTTPException(status_code=400, detail="Must upload a .zip file containing student PDFs.")

    try:
        # 1. Parse Rubric
        rubrics = json.loads(rubric_json)
        
        # 2. Create the Master Exam Record linked to Instructor ID
        exam_dict = {
            "title": title,
            "created_by": str(current_user.get("_id")),
            "created_by_email": current_user.get("email"),
            "rubrics": rubrics
        }
        result = await db["exams"].insert_one(exam_dict)
        exam_id = str(result.inserted_id)

        # 3. Unpack the ZIP
        upload_dir = os.path.join(UPLOAD_DIR, exam_id)
        extract_dir = os.path.join(upload_dir, "extracted")
        os.makedirs(extract_dir, exist_ok=True)
        
        zip_path = os.path.join(upload_dir, file.filename)
        with open(zip_path, "wb") as buffer:
            buffer.write(await file.read())
            
        with zipfile.ZipFile(zip_path, 'r') as zip_ref:
            zip_ref.extractall(extract_dir)

        # Sanitize ghost spaces in filenames
        clean_pdf_files = []
        for filename in os.listdir(extract_dir):
            if filename.lower().endswith('.pdf'):
                name, ext = os.path.splitext(filename)
                clean_name = name.strip() + ext
                
                old_path = os.path.join(extract_dir, filename)
                new_path = os.path.join(extract_dir, clean_name)
                
                if old_path != new_path:
                    os.rename(old_path, new_path)
                
                clean_pdf_files.append(clean_name)

        # 4. Pre-populate the Ledger (Class Roster) using clean names
        for pdf_file in clean_pdf_files:
            submission_id = os.path.splitext(pdf_file)[0]
            await db["submissions"].update_one(
                {"exam_id": ObjectId(exam_id), "submission_id": submission_id},
                {"$set": {"status": "Pending AI"}},
                upsert=True
            )

        # 5. Hand off to auto-grader
        background_tasks.add_task(
            process_submissions_worker, 
            exam_id=exam_id, 
            extract_dir=extract_dir, 
            pdf_files=clean_pdf_files,
            rubrics_list=rubrics
        )

        return {"message": "Exam pipeline initialized and background grading started!", "exam_id": exam_id}

    except json.JSONDecodeError:
        raise HTTPException(status_code=400, detail="Invalid JSON format in rubric.")
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/{exam_id}/single-upload")
async def upload_late_submission(
    exam_id: str, 
    background_tasks: BackgroundTasks, 
    file: UploadFile = File(...),
    current_user: dict = Depends(RoleChecker(["INSTRUCTOR"]))
):
    """INSTRUCTOR ONLY: Allows uploading a single late student's PDF to an existing exam bucket."""
    if not file.filename.lower().endswith('.pdf'):
        raise HTTPException(status_code=400, detail="Must upload a .pdf file.")

    try:
        exam = await db["exams"].find_one({"_id": ObjectId(exam_id)})
        if not exam:
            raise HTTPException(status_code=404, detail="Exam not found.")

        extract_dir = os.path.join(UPLOAD_DIR, exam_id, "extracted")
        os.makedirs(extract_dir, exist_ok=True)
        
        name, ext = os.path.splitext(file.filename)
        clean_filename = name.strip() + ext
        submission_id = name.strip()

        pdf_path = os.path.join(extract_dir, clean_filename)
        with open(pdf_path, "wb") as buffer:
            buffer.write(await file.read())

        await db["submissions"].update_one(
            {"exam_id": ObjectId(exam_id), "submission_id": submission_id},
            {"$set": {"status": "Pending AI"}},
            upsert=True
        )

        background_tasks.add_task(
            process_submissions_worker, 
            exam_id=exam_id, 
            extract_dir=extract_dir, 
            pdf_files=[clean_filename],
            rubrics_list=exam.get("rubrics", [])
        )
        return {"message": f"Late submission {submission_id} queued for grading."}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.delete("/{exam_id}")
async def delete_exam(
    exam_id: str, 
    current_user: dict = Depends(RoleChecker(["INSTRUCTOR"]))
):
    """INSTRUCTOR ONLY: Deletes an exam and associated submissions with cascading deletion."""
    try:
        obj_id = ObjectId(exam_id)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid Exam ID format.")

    # 1. Cascading database deletion: Submissions first, then the Exam
    sub_res = await db["submissions"].delete_many({"exam_id": obj_id})
    exam_res = await db["exams"].delete_one({"_id": obj_id})
    
    if exam_res.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Exam not found.")

    # 2. Local filesystem cleanup: Uploads directory
    upload_dir = os.path.join(UPLOAD_DIR, exam_id)
    if os.path.exists(upload_dir):
        shutil.rmtree(upload_dir, ignore_errors=True)

    # 3. Local filesystem cleanup: Crop directory if present
    crop_dir = os.path.join(os.path.dirname(UPLOAD_DIR), "crops", exam_id)
    if os.path.exists(crop_dir):
        shutil.rmtree(crop_dir, ignore_errors=True)

    return {
        "message": "Exam and all associated submissions deleted successfully",
        "exam_id": exam_id,
        "submissions_deleted": sub_res.deleted_count
    }


@router.post("/{exam_id}/submissions/{submission_id}/regrade/{question_key}")
async def regrade_manual_crop(
    exam_id: str,
    submission_id: str,
    question_key: str,
    box: BoundingBox = Body(...),
    current_user: dict = Depends(RoleChecker(["INSTRUCTOR", "TA"]))
):
    """TA / INSTRUCTOR Workbench Tool: Re-evaluates a specific question using a human-drawn bounding box."""
    try:
        exam = await db["exams"].find_one({"_id": ObjectId(exam_id)})
        rubric_map = {r["question_number"]: r for r in exam.get("rubrics", [])}
        
        if question_key not in rubric_map:
            raise HTTPException(status_code=404, detail="Question not found in rubric.")

        pdf_path = os.path.join(UPLOAD_DIR, exam_id, "extracted", f"{submission_id}.pdf")
        custom_box = (box.x, box.y, box.x + box.w, box.y + box.h, box.page)
        
        crop_path = vision_engine.slice_single_crop(pdf_path, submission_id, question_key, custom_box)
        if not crop_path or not os.path.exists(crop_path):
            raise HTTPException(status_code=500, detail="Failed to slice image crop from PDF.")

        q_rubric = rubric_map[question_key]
        q_answer_key = q_rubric.get("solution") or q_rubric.get("reference_answer") or q_rubric.get("answer_key") or exam.get("answer_key")

        # Unified Multimodal Call: Transcribes and grades the manual crop in one pass
        evaluation = await grading_engine.grade_crop_multimodal(
            crop_image_path=crop_path,
            rubric_data=q_rubric,
            answer_key_text=q_answer_key
        )

        new_grade_data = {
            "total_score": evaluation.total_score,
            "justification": evaluation.justification,
            "step_breakdown": [step.model_dump() for step in evaluation.step_breakdown],
            "transcribed_text": evaluation.transcribed_text,
            "crop_image_path": crop_path,
            "similarity_flag": False,
            "similarity_matches": [],
            "similarity_score": 0.0,
            "plagiarism_flag": False,
            "status": "ta_regraded",
            "tokens_used": 0
        }

        await db["submissions"].update_one(
            {"exam_id": ObjectId(exam_id), "submission_id": submission_id},
            {"$set": {f"grades.{question_key}": new_grade_data}}
        )

        return {"message": "Re-grade successful!", "new_grade": new_grade_data}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.put("/{exam_id}/submissions/{submission_id}/commit")
async def commit_grade(
    exam_id: str, 
    submission_id: str, 
    payload: CommitGradeRequest, 
    current_user: dict = Depends(RoleChecker(["INSTRUCTOR", "TA"]))
):
    """The Final Audit: TA or Instructor manually locks in the grade."""
    try:
        reviewer_id = str(current_user.get("_id"))
        await db["submissions"].update_one(
            {"exam_id": ObjectId(exam_id), "submission_id": submission_id},
            {"$set": {
                f"grades.{payload.question_key}.total_score": payload.final_score,
                f"grades.{payload.question_key}.final_score": payload.final_score,
                f"grades.{payload.question_key}.justification": payload.justification,
                f"grades.{payload.question_key}.status": "human_verified",
                f"grades.{payload.question_key}.reviewed_by": reviewer_id,
                f"grades.{payload.question_key}.reviewer_email": current_user.get("email")
            }}
        )
        return {"message": "Grade successfully locked in!"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/{exam_id}/roster")
async def get_exam_roster(
    exam_id: str, 
    current_user: dict = Depends(RoleChecker(["INSTRUCTOR", "TA"]))
):
    """The Ledger: Returns the full class list and scores."""
    try:
        cursor = db["submissions"].find({"exam_id": ObjectId(exam_id)})
        submissions = await cursor.to_list(length=1000)
        
        roster = []
        for sub in submissions:
            grades = sub.get("grades", {})
            total_score = sum(q.get("total_score", 0) for q in grades.values() if isinstance(q, dict))
            
            if not grades:
                status = "Pending AI"
            else:
                all_verified = all(q.get("status") == "human_verified" for q in grades.values() if isinstance(q, dict))
                status = "Human Verified" if all_verified else "AI Graded"
                
            has_fast_exit = any(isinstance(q, dict) and q.get("status") == "fast_exit" for q in grades.values())

            roster.append({
                "submission_id": sub.get("submission_id"),
                "total_score": total_score,
                "questions_graded": len(grades),
                "status": status,
                "has_fast_exit": has_fast_exit
            })
        roster.sort(key=lambda x: x["submission_id"].lower())
        return {"roster": roster}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/{exam_id}/submissions/{submission_id}")
async def get_submission(
    exam_id: str, 
    submission_id: str, 
    current_user: dict = Depends(RoleChecker(["INSTRUCTOR", "TA"]))
):
    """Workbench Data: Gets the AI's grading data for a specific student."""
    try:
        obj_id = ObjectId(exam_id)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid Exam ID format.")

    submission = await db["submissions"].find_one({
        "exam_id": obj_id,
        "submission_id": submission_id
    })
    
    if not submission:
        raise HTTPException(status_code=404, detail=f"Submission '{submission_id}' not found in database.")
        
    submission["_id"] = str(submission["_id"])
    submission["exam_id"] = str(submission["exam_id"])
    return {"data": submission} 


@router.get("/{exam_id}/submissions/{submission_id}/pages/{page_num}")
async def get_student_page_image(exam_id: str, submission_id: str, page_num: int):
    """Workbench Visuals: Converts the specific student's PDF page to a PNG for the cropping tool."""
    pdf_path = os.path.join(UPLOAD_DIR, exam_id, "extracted", f"{submission_id}.pdf")
    
    if not os.path.exists(pdf_path):
        raise HTTPException(status_code=404, detail=f"Student PDF not found at {pdf_path}")
        
    try:
        doc = fitz.open(pdf_path)
        if page_num < 0 or page_num >= doc.page_count:
            doc.close()
            raise HTTPException(status_code=400, detail=f"PDF only has {doc.page_count} pages.")
            
        page = doc.load_page(page_num)
        pix = page.get_pixmap(matrix=fitz.Matrix(1, 1))
        img_bytes = pix.tobytes("png")
        doc.close()
        return Response(content=img_bytes, media_type="image/png")
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error rendering PDF: {str(e)}")


@router.post("/{exam_id}/run-plagiarism-check", status_code=status.HTTP_202_ACCEPTED)
async def trigger_plagiarism_check(
    exam_id: str,
    background_tasks: BackgroundTasks,
    current_user: dict = Depends(RoleChecker(["INSTRUCTOR"]))
):
    """
    INSTRUCTOR ONLY: Asynchronously executes Gemini embedding-based cross-submission
    similarity and plagiarism detection across all student answers for the exam.
    """
    try:
        obj_id = ObjectId(exam_id)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid Exam ID format.")

    exam = await db["exams"].find_one({"_id": obj_id})
    if not exam:
        raise HTTPException(status_code=404, detail="Exam not found.")

    # Queue the similarity check asynchronously so the request doesn't hang
    background_tasks.add_task(run_similarity_check, exam_id=exam_id, db=db)

    return {
        "message": f"Cross-submission plagiarism and logic similarity check started for exam '{exam.get('title', exam_id)}'.",
        "exam_id": exam_id,
        "status": "processing"
    }


@router.post("/generate-rubric")
async def create_agentic_rubric(
    exam_text: Optional[str] = Form(None),
    answer_key_text: Optional[str] = Form(None),
    exam_file: Optional[UploadFile] = File(None),
    answer_key_file: Optional[UploadFile] = File(None),
    current_user: dict = Depends(RoleChecker(["INSTRUCTOR"]))
):
    """
    INSTRUCTOR ONLY: Agentic JSON Rubric Generator.
    Accepts blank exam text/PDF and answer key text/PDF, extracts raw text with PyMuPDF,
    and calls the rubric generator agent to build structured JSON criteria.
    """
    combined_exam_text = (exam_text or "").strip()
    combined_key_text = (answer_key_text or "").strip()

    # Extract text from blank exam PDF / file if uploaded
    if exam_file and exam_file.filename:
        try:
            content = await exam_file.read()
            if exam_file.filename.lower().endswith(".pdf"):
                doc = fitz.open(stream=content, filetype="pdf")
                pages_text = [page.get_text() for page in doc]
                doc.close()
                extracted = "\n".join(pages_text).strip()
            else:
                extracted = content.decode("utf-8", errors="ignore").strip()
            combined_exam_text = (combined_exam_text + "\n" + extracted).strip()
        except Exception as e:
            raise HTTPException(status_code=400, detail=f"Failed to read exam file: {str(e)}")

    # Extract text from answer key PDF / file if uploaded
    if answer_key_file and answer_key_file.filename:
        try:
            content = await answer_key_file.read()
            if answer_key_file.filename.lower().endswith(".pdf"):
                doc = fitz.open(stream=content, filetype="pdf")
                pages_text = [page.get_text() for page in doc]
                doc.close()
                extracted = "\n".join(pages_text).strip()
            else:
                extracted = content.decode("utf-8", errors="ignore").strip()
            combined_key_text = (combined_key_text + "\n" + extracted).strip()
        except Exception as e:
            raise HTTPException(status_code=400, detail=f"Failed to read answer key file: {str(e)}")

    if not combined_exam_text:
        raise HTTPException(
            status_code=400,
            detail="Blank exam content is missing. Please provide text or upload a PDF/text file."
        )
    if not combined_key_text:
        raise HTTPException(
            status_code=400,
            detail="Answer key content is missing. Please provide text or upload a PDF/text file."
        )

    try:
        rubric = await generate_rubric_from_key(
            exam_text=combined_exam_text,
            answer_key_text=combined_key_text
        )
        return {"rubric": rubric, "message": "Rubric generated successfully!"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Rubric generation failed: {str(e)}")