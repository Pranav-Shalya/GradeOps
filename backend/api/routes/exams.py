# # backend/api/routes/exams.py
# import os
# import zipfile
# import asyncio
# import shutil
# from typing import List
# import fitz
# from fastapi import APIRouter, UploadFile, File, Form, HTTPException, Path, Body, Response, BackgroundTasks, Depends
# from api.dependencies import get_current_user
# from core.database import db
# from pydantic import BaseModel
# from models.documents import ExamDocument, RubricCriteria
# from ml_pipeline.vision.extractor import VisionExtractor
# from ml_pipeline.grading.engine import GradingEngine
# from bson import ObjectId

# class CommitGradeRequest(BaseModel):
#     question_key: str
#     final_score: int
#     justification: str

# router = APIRouter()

# # Initialize core engines
# vision_extractor = VisionExtractor()
# grading_engine = GradingEngine()

# # Ensure the upload directory exists
# UPLOAD_DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(__file__))), "data", "uploads")
# os.makedirs(UPLOAD_DIR, exist_ok=True)


# # --- ASYNCHRONOUS BACKGROUND WORKER ---
# async def process_exam_batch_worker(exam_id: str, extract_dir: str, pdf_files: list, rubrics_list: list):
#     """
#     Runs asynchronously. Iterates through all uploaded PDFs, extracts answer regions,
#     runs the transcription/grading fallback engine, and updates MongoDB.
#     """
#     vision_engine = VisionExtractor()
#     grad_engine = GradingEngine()

#     # Map rubrics list to a dictionary by question number for quick lookup
#     rubric_map = {r["question_number"]: r for r in rubrics_list}

#     for pdf_file in pdf_files:
#         submission_id = os.path.splitext(pdf_file)[0]
#         pdf_path = os.path.join(extract_dir, pdf_file)

#         # 1. Update status to processing
#         await db["submissions"].update_one(
#             {"exam_id": ObjectId(exam_id), "submission_id": submission_id},
#             {"$set": {"status": "Processing AI"}},
#             upsert=True
#         )

#         try:
#             student_grades = {}

#             # Process every question defined in the attached rubric
#             for q_num, rubric_data in rubric_map.items():
#                 # Default coordinate frame bounding box for baseline extraction
#                 bounding_boxes = {q_num: (50, 50, 500, 500, 0)}
                
#                 # 2. Run Vision Pipeline
#                 extracted_slices = vision_engine.process_pdf_submission(pdf_path, submission_id, bounding_boxes)
#                 if not extracted_slices:
#                     continue

#                 transcribed_text = extracted_slices[0]["transcribed_text"]
                
#                 # 3. Run Grading Pipeline
#                 evaluation = await grad_engine.evaluate_answer(transcribed_text, rubric_data)

#                 student_grades[q_num] = {
#                     "total_score": evaluation.total_score,
#                     "justification": evaluation.justification,
#                     "step_breakdown": [step.model_dump() for step in evaluation.step_breakdown],
#                     "status": "ai_graded"
#                 }

#             # 4. Atomically commit the evaluated score matrix to Atlas
#             await db["submissions"].update_one(
#                 {"exam_id": ObjectId(exam_id), "submission_id": submission_id},
#                 {
#                     "$set": {
#                         "grades": student_grades,
#                         "status": "AI Graded"
#                     }
#                 }
#             )
            
#         except Exception as e:
#             print(f"Failed to process batch submission for {submission_id}: {str(e)}")
#             await db["submissions"].update_one(
#                 {"exam_id": ObjectId(exam_id), "submission_id": submission_id},
#                 {"$set": {"status": "Failed"}}
#             )
            
#         # Introduce cool-down interval to protect external API rate ceilings
#         await asyncio.sleep(1)

# # Add this right ABOVE the @router.post("/upload") route
# @router.get("", response_model=dict)
# async def list_user_exams(current_user: dict = Depends(get_current_user)):
#     """Fetches all exams created by the currently logged-in user."""
#     try:
#         # Find all exams where the created_by field matches the logged-in email
#         cursor = db["exams"].find({"created_by": current_user["email"]})
#         exams = await cursor.to_list(length=100)
        
#         # Format the IDs for React
#         formatted_exams = []
#         for exam in exams:
#             exam["_id"] = str(exam["_id"])
#             formatted_exams.append(exam)
            
#         return {"exams": formatted_exams}
#     except Exception as e:
#         raise HTTPException(status_code=500, detail=f"Database error: {str(e)}")
# # --- ROUTE ENDPOINTS ---

# @router.post("/upload", response_model=dict)
# async def upload_exam(
#     title: str = Form(...),
#     file: UploadFile = File(...),
#     current_user: dict = Depends(get_current_user) # <-- THE BOUNCER
# ):
#     if file.content_type != "application/pdf":
#         raise HTTPException(status_code=400, detail="Only PDF files are allowed.")

#     file_path = os.path.join(UPLOAD_DIR, file.filename)
#     with open(file_path, "wb") as buffer:
#         shutil.copyfileobj(file.file, buffer)

#     new_exam = ExamDocument(
#         title=title,
#         pdf_path=file_path,
#         created_by=current_user["email"], # <-- Securely pulled from the token!
#         rubrics=[]
#     )

#     exam_dict = new_exam.model_dump()
#     result = await db["exams"].insert_one(exam_dict)

#     return {
#         "message": f"Exam uploaded successfully by {current_user['full_name']}",
#         "exam_id": str(result.inserted_id),
#         "title": title
#     }
# @router.post("/{exam_id}/rubrics", response_model=dict)
# async def add_rubrics(
#     exam_id: str = Path(..., title="The ID of the exam to update"),
#     rubrics: List[RubricCriteria] = Body(..., title="List of grading rubrics")
# ):
#     try:
#         obj_id = ObjectId(exam_id)
#     except Exception:
#         raise HTTPException(status_code=400, detail="Invalid Exam ID format. It must be a 24-character hex string.")

#     result = await db["exams"].update_one(
#         {"_id": obj_id},
#         {"$set": {"rubrics": [rubric.model_dump() for rubric in rubrics]}}
#     )

#     if result.matched_count == 0:
#         raise HTTPException(status_code=404, detail=f"Exam with ID {exam_id} not found.")

#     return {
#         "message": f"Successfully attached {len(rubrics)} rubric(s) to the exam.",
#         "exam_id": exam_id
#     }

# @router.post("/{exam_id}/submissions/{submission_id}/grade", response_model=dict)
# async def grade_submission(
#     exam_id: str,
#     submission_id: str,
#     bounding_boxes: dict = Body(..., description="Layout mapping for the questions")
# ):
#     try:
#         exam = await db["exams"].find_one({"_id": ObjectId(exam_id)})
#     except Exception:
#         raise HTTPException(status_code=400, detail="Invalid Exam ID format.")
        
#     if not exam:
#         raise HTTPException(status_code=404, detail="Exam setup not found.")

#     pdf_path = exam.get("pdf_path") 
#     if not pdf_path or not os.path.exists(pdf_path):
#         raise HTTPException(status_code=404, detail="Exam baseline PDF file missing from storage.")

#     transcribed_slices = vision_extractor.process_pdf_submission(
#         pdf_path=pdf_path,
#         submission_id=submission_id,
#         bounding_boxes=bounding_boxes
#     )

#     rubrics_list = exam.get("rubrics", [])
#     rubric_map = {r["question_number"]: r for r in rubrics_list}
#     final_evaluation_report = {}

#     for slice_data in transcribed_slices:
#         q_num = slice_data["question_number"]
#         text = slice_data["transcribed_text"]
        
#         if q_num in rubric_map:
#             eval_result = await grading_engine.evaluate_answer(
#                 transcribed_text=text,
#                 rubric=rubric_map[q_num]
#             )
#             final_evaluation_report[q_num] = eval_result.model_dump()
#         else:
#             final_evaluation_report[q_num] = {
#                 "error": "No matching rubric found for this question number."
#             }

#     # FIX: Swapped insert_one for an upsert update_one to prevent collision states with batch runs
#     await db["submissions"].update_one(
#         {"exam_id": ObjectId(exam_id), "submission_id": submission_id},
#         {
#             "$set": {
#                 "grades": final_evaluation_report,
#                 "status": "AI Graded"
#             }
#         },
#         upsert=True
#     )

#     return {
#         "message": f"Submission {submission_id} graded successfully.",
#         "results": final_evaluation_report
#     }

# @router.get("/{exam_id}/submissions/{submission_id}", response_model=dict)
# async def get_submission(exam_id: str, submission_id: str):
#     try:
#         submission = await db["submissions"].find_one({
#             "exam_id": ObjectId(exam_id),
#             "submission_id": submission_id
#         })
        
#         if not submission:
#             raise HTTPException(status_code=404, detail="Submission not found.")
            
#         submission["_id"] = str(submission["_id"])
#         submission["exam_id"] = str(submission["exam_id"])
        
#         return {"data": submission} 
        
#     except Exception as e:
#         raise HTTPException(status_code=400, detail="Invalid ID format or database error.")

# @router.get("/{exam_id}/pages/{page_num}")
# async def get_exam_page_image(exam_id: str, page_num: int):
#     try:
#         exam = await db["exams"].find_one({"_id": ObjectId(exam_id)})
#         if not exam or not exam.get("pdf_path"):
#             raise HTTPException(status_code=404, detail="Exam PDF not found in database.")
            
#         doc = fitz.open(exam["pdf_path"])
#         if page_num < 0 or page_num >= doc.page_count:
#             doc.close()
#             raise HTTPException(status_code=400, detail=f"PDF only has {doc.page_count} pages.")
            
#         page = doc.load_page(page_num)
#         pix = page.get_pixmap(matrix=fitz.Matrix(1, 1))
#         img_bytes = pix.tobytes("png")
#         doc.close()
        
#         return Response(content=img_bytes, media_type="image/png")
        
#     except Exception as e:
#         raise HTTPException(status_code=500, detail=f"Error rendering page: {str(e)}")

# @router.put("/{exam_id}/submissions/{submission_id}/commit")
# async def commit_grade(exam_id: str, submission_id: str, payload: CommitGradeRequest, current_user: dict = Depends(get_current_user)):
#     try:
#         result = await db["submissions"].update_one(
#             {
#                 "exam_id": ObjectId(exam_id),
#                 "submission_id": submission_id
                
#             },
#             {
#                 "$set": {
#                     f"grades.{payload.question_key}.total_score": payload.final_score,
#                     f"grades.{payload.question_key}.justification": payload.justification,
#                     f"grades.{payload.question_key}.status": "human_verified"
#                 }
#             }
#         )

#         if result.matched_count == 0:
#             raise HTTPException(status_code=404, detail="Submission not found.")

#         return {"message": "Grade successfully locked in Atlas!"}
        
#     except Exception as e:
#         raise HTTPException(status_code=500, detail=f"Database error: {str(e)}")

# @router.get("/{exam_id}/roster")
# async def get_exam_roster(exam_id: str):
#     try:
#         cursor = db["submissions"].find({"exam_id": ObjectId(exam_id)})
#         submissions = await cursor.to_list(length=1000)
        
#         roster = []
#         for sub in submissions:
#             grades = sub.get("grades", {})
#             total_student_score = sum(q_data.get("total_score", 0) for q_data in grades.values() if isinstance(q_data, dict))
            
#             if not grades:
#                 status = "Pending AI"
#             else:
#                 all_verified = all(q.get("status") == "human_verified" for q in grades.values() if isinstance(q))
#                 status = "Human Verified" if all_verified else "AI Graded"

#             roster.append({
#                 "submission_id": sub.get("submission_id"),
#                 "total_score": total_student_score,
#                 "questions_graded": len(grades),
#                 "status": status
#             })
            
#         roster.sort(key=lambda x: x["submission_id"].lower())
#         return {"roster": roster}
        
#     except Exception as e:
#         raise HTTPException(status_code=500, detail=f"Database error: {str(e)}")

# @router.post("/{exam_id}/batch-upload")
# async def upload_exam_batch(
#     exam_id: str, 
#     background_tasks: BackgroundTasks, 
#     file: UploadFile = File(...),
#     current_user: dict = Depends(get_current_user)
# ):
#     if not file.filename.endswith('.zip'):
#         raise HTTPException(status_code=400, detail="Must upload a .zip file.")

#     try:
#         # 1. Fetch template context and ensure 'rubrics' list field exists
#         exam = await db["exams"].find_one({"_id": ObjectId(exam_id)})
#         if not exam or "rubrics" not in exam or not exam["rubrics"]:
#             raise HTTPException(status_code=404, detail="Exam structure or associated rubrics matrix missing.")

#         # 2. Save the ZIP file locally
#         upload_dir = os.path.join(os.path.dirname(os.path.dirname(__file__)), "..", "data", "uploads", exam_id)
#         os.makedirs(upload_dir, exist_ok=True)
#         zip_path = os.path.join(upload_dir, file.filename)
        
#         with open(zip_path, "wb") as buffer:
#             buffer.write(await file.read())

#         # 3. Unzip the archive contents
#         extract_dir = os.path.join(upload_dir, "extracted")
#         os.makedirs(extract_dir, exist_ok=True)
        
#         with zipfile.ZipFile(zip_path, 'r') as zip_ref:
#             zip_ref.extractall(extract_dir)

#         pdf_files = [f for f in os.listdir(extract_dir) if f.lower().endswith('.pdf')]
#         if not pdf_files:
#             raise HTTPException(status_code=400, detail="No PDF files found in the ZIP folder archive.")

#         # 4. Initialize entries on the class roster
#         for pdf_file in pdf_files:
#             submission_id = os.path.splitext(pdf_file)[0]
#             await db["submissions"].update_one(
#                 {"exam_id": ObjectId(exam_id), "submission_id": submission_id},
#                 {"$set": {"status": "Pending AI"}},
#                 upsert=True
#             )

#         # 5. Hand over job execution context to async thread pool
#         background_tasks.add_task(
#             process_exam_batch_worker, 
#             exam_id=exam_id, 
#             extract_dir=extract_dir, 
#             pdf_files=pdf_files, 
#             rubrics_list=exam["rubrics"] # FIXED: Plural key alignment
#         )

#         return {
#             "message": f"Successfully queued {len(pdf_files)} exams for processing.",
#             "status": "processing"
#         }

#     except HTTPException as he:
#         raise he
#     except Exception as e:
#         raise HTTPException(status_code=500, detail=f"Batch processing failed: {str(e)}")
    

# @router.post("/{exam_id}/single-upload")
# async def upload_single_submission(
#     exam_id: str, 
#     background_tasks: BackgroundTasks, 
#     file: UploadFile = File(...),
#     current_user: dict = Depends(get_current_user)
# ):
#     """Uploads a single student's PDF (e.g. late submission) and queues it for grading."""
#     if not file.filename.lower().endswith('.pdf'):
#         raise HTTPException(status_code=400, detail="Must upload a .pdf file.")

#     try:
#         # 1. Verify the exam and rubrics exist
#         exam = await db["exams"].find_one({"_id": ObjectId(exam_id)})
#         if not exam or "rubrics" not in exam or not exam["rubrics"]:
#             raise HTTPException(status_code=404, detail="Exam structure or rubrics missing.")

#         # 2. Save the PDF into the exact same "extracted" folder the ZIP uses
#         extract_dir = os.path.join(os.path.dirname(os.path.dirname(__file__)), "..", "data", "uploads", exam_id, "extracted")
#         os.makedirs(extract_dir, exist_ok=True)
#         pdf_path = os.path.join(extract_dir, file.filename)
        
#         with open(pdf_path, "wb") as buffer:
#             buffer.write(await file.read())

#         # 3. Add this specific student to the roster
#         submission_id = os.path.splitext(file.filename)[0]
#         await db["submissions"].update_one(
#             {"exam_id": ObjectId(exam_id), "submission_id": submission_id},
#             {"$set": {"status": "Pending AI"}},
#             upsert=True
#         )

#         # 4. Trigger the exact same background worker, but pass it a list of just ONE file
#         background_tasks.add_task(
#             process_exam_batch_worker, 
#             exam_id=exam_id, 
#             extract_dir=extract_dir, 
#             pdf_files=[file.filename], 
#             rubrics_list=exam["rubrics"]
#         )

#         return {"message": f"Successfully queued {file.filename} for processing.", "status": "processing"}

#     except Exception as e:
#         raise HTTPException(status_code=500, detail=f"Single upload failed: {str(e)}")

# backend/api/routes/exams.py
import os
import json
import zipfile
import asyncio
import shutil
from typing import List
import fitz
from fastapi import APIRouter, UploadFile, File, Form, HTTPException, Body, Response, BackgroundTasks, Depends
from api.dependencies import get_current_user
from core.database import db
from pydantic import BaseModel
from bson import ObjectId
from ml_pipeline.vision.extractor import VisionExtractor
from ml_pipeline.grading.engine import GradingEngine

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
    """Auto-crops and auto-grades the stack of exams in the background."""
    rubric_map = {r["question_number"]: r for r in rubrics_list}

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
                # In production, an AI agent would dynamically calculate these coordinates by scanning the page.
                # For now, we use a default auto-crop area.
                auto_bounding_boxes = {q_num: (50, 50, 500, 500, 0)} 
                
                extracted_slices = vision_engine.process_pdf_submission(pdf_path, submission_id, auto_bounding_boxes)
                if not extracted_slices:
                    continue

                transcribed_text = extracted_slices[0]["transcribed_text"]
                evaluation = await grading_engine.evaluate_answer(transcribed_text, rubric_data)

                student_grades[q_num] = {
                    "total_score": evaluation.total_score,
                    "justification": evaluation.justification,
                    "step_breakdown": [step.model_dump() for step in evaluation.step_breakdown],
                    "status": "ai_graded"
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
async def list_user_exams(current_user: dict = Depends(get_current_user)):
    """Dashboard Command Center: Fetches all exams for the logged-in professor."""
    try:
        cursor = db["exams"].find({"created_by": current_user["email"]})
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
    current_user: dict = Depends(get_current_user)
):
    """The unified Ingestion Point: Creates the exam, saves the rubric, and unpacks the ZIP."""
    if not file.filename.lower().endswith('.zip'):
        raise HTTPException(status_code=400, detail="Must upload a .zip file containing student PDFs.")

    try:
        # 1. Parse Rubric
        rubrics = json.loads(rubric_json)
        
        # 2. Create the Master Exam Record
        exam_dict = {
            "title": title,
            "created_by": current_user["email"],
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

        # --- THE FIX: SANITIZE GHOST SPACES ---
        clean_pdf_files = []
        for filename in os.listdir(extract_dir):
            if filename.lower().endswith('.pdf'):
                # Split the name and the .pdf extension
                name, ext = os.path.splitext(filename)
                # Strip invisible trailing/leading spaces from the name
                clean_name = name.strip() + ext
                
                old_path = os.path.join(extract_dir, filename)
                new_path = os.path.join(extract_dir, clean_name)
                
                # Rename the actual file on the hard drive if it had a space
                if old_path != new_path:
                    os.rename(old_path, new_path)
                
                clean_pdf_files.append(clean_name)

        # 4. Pre-populate the Ledger (Class Roster) using the CLEAN names
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
            pdf_files=clean_pdf_files, # Pass the clean list
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
    current_user: dict = Depends(get_current_user)
):
    """Allows uploading a single late student's PDF to an existing exam bucket."""
    if not file.filename.lower().endswith('.pdf'):
        raise HTTPException(status_code=400, detail="Must upload a .pdf file.")

    try:
        exam = await db["exams"].find_one({"_id": ObjectId(exam_id)})
        extract_dir = os.path.join(UPLOAD_DIR, exam_id, "extracted")
        os.makedirs(extract_dir, exist_ok=True)
        
        # --- THE FIX: SANITIZE GHOST SPACES FOR SINGLE UPLOADS ---
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
            pdf_files=[clean_filename], # Pass clean filename
            rubrics_list=exam["rubrics"]
        )
        return {"message": f"Late submission {submission_id} queued for grading."}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
    

@router.post("/{exam_id}/submissions/{submission_id}/regrade/{question_key}")
async def regrade_manual_crop(
    exam_id: str,
    submission_id: str,
    question_key: str,
    box: BoundingBox = Body(...),
    current_user: dict = Depends(get_current_user)
):
    """The TA Workbench Tool: Re-evaluates a specific question using a human-drawn bounding box."""
    try:
        exam = await db["exams"].find_one({"_id": ObjectId(exam_id)})
        rubric_map = {r["question_number"]: r for r in exam.get("rubrics", [])}
        
        if question_key not in rubric_map:
            raise HTTPException(status_code=404, detail="Question not found in rubric.")

        pdf_path = os.path.join(UPLOAD_DIR, exam_id, "extracted", f"{submission_id}.pdf")
        
        # Format the TA's drawn box for the vision engine
        custom_boxes = {question_key: (box.x, box.y, box.x + box.w, box.y + box.h, box.page)}
        
        extracted_slices = vision_engine.process_pdf_submission(pdf_path, submission_id, custom_boxes)
        if not extracted_slices:
            raise HTTPException(status_code=500, detail="Failed to extract text from crop.")

        transcribed_text = extracted_slices[0]["transcribed_text"]
        evaluation = await grading_engine.evaluate_answer(transcribed_text, rubric_map[question_key])

        # Save the re-calculated score
        new_grade_data = {
            "total_score": evaluation.total_score,
            "justification": evaluation.justification,
            "step_breakdown": [step.model_dump() for step in evaluation.step_breakdown],
            "status": "ta_regraded"
        }

        await db["submissions"].update_one(
            {"exam_id": ObjectId(exam_id), "submission_id": submission_id},
            {"$set": {f"grades.{question_key}": new_grade_data}}
        )

        return {"message": "Re-grade successful!", "new_grade": new_grade_data}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.put("/{exam_id}/submissions/{submission_id}/commit")
async def commit_grade(exam_id: str, submission_id: str, payload: CommitGradeRequest, current_user: dict = Depends(get_current_user)):
    """The Final Audit: TA manually locks in the grade."""
    try:
        await db["submissions"].update_one(
            {"exam_id": ObjectId(exam_id), "submission_id": submission_id},
            {"$set": {
                f"grades.{payload.question_key}.total_score": payload.final_score,
                f"grades.{payload.question_key}.justification": payload.justification,
                f"grades.{payload.question_key}.status": "human_verified"
            }}
        )
        return {"message": "Grade successfully locked in!"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/{exam_id}/roster")
async def get_exam_roster(exam_id: str, current_user: dict = Depends(get_current_user)):
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

            roster.append({
                "submission_id": sub.get("submission_id"),
                "total_score": total_score,
                "questions_graded": len(grades),
                "status": status
            })
        roster.sort(key=lambda x: x["submission_id"].lower())
        return {"roster": roster}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/{exam_id}/submissions/{submission_id}")
async def get_submission(exam_id: str, submission_id: str, current_user: dict = Depends(get_current_user)):
    """Workbench Data: Gets the AI's grading data for a specific student."""
    # 1. Safely validate the ID outside the main block
    try:
        obj_id = ObjectId(exam_id)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid Exam ID format.")

    # 2. Query the database
    submission = await db["submissions"].find_one({
        "exam_id": obj_id,
        "submission_id": submission_id
    })
    
    # 3. Handle Not Found cleanly! (No try/except masking this)
    if not submission:
        raise HTTPException(status_code=404, detail=f"Submission '{submission_id}' not found in database.")
        
    submission["_id"] = str(submission["_id"])
    submission["exam_id"] = str(submission["exam_id"])
    return {"data": submission} 


@router.get("/{exam_id}/submissions/{submission_id}/pages/{page_num}")
async def get_student_page_image(exam_id: str, submission_id: str, page_num: int):
    """Workbench Visuals: Converts the specific student's PDF page to a PNG for the cropping tool."""
    pdf_path = os.path.join(UPLOAD_DIR, exam_id, "extracted", f"{submission_id}.pdf")
    
    # Check if file exists BEFORE entering the try/except block
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
        raise # Safely pass up HTTP exceptions
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error rendering PDF: {str(e)}")