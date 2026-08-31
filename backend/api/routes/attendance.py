# backend/api/routes/attendance.py
import uuid
from datetime import datetime
from typing import Optional, List, Dict, Any
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form, Response
from core.database import db
from core.security import RoleChecker
from models.attendance import AttendanceSession, AttendanceRecord, CourseAttendanceSummary
from services.attendance_service import AttendanceService

router = APIRouter()


@router.get("/courses")
async def list_available_courses(
    current_user: dict = Depends(RoleChecker(["INSTRUCTOR", "TA"]))
):
    """Returns a list of unique courses available in the system."""
    try:
        distinct_courses = await db["attendance_sessions"].distinct("course_id")
        
        # Also grab exam titles for quick selection
        exam_cursor = db["exams"].find({}, {"title": 1})
        exams = await exam_cursor.to_list(length=100)
        exam_titles = [e.get("title") for e in exams if e.get("title")]

        all_courses = sorted(list(set(distinct_courses + exam_titles + ["PHYS101", "CS101", "MATH201"])))
        return {"courses": all_courses}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/{course_id}/upload")
async def upload_attendance_sheet(
    course_id: str,
    file: UploadFile = File(...),
    session_date: Optional[str] = Form(None),
    session_type: Optional[str] = Form("Lecture"),
    current_user: dict = Depends(RoleChecker(["INSTRUCTOR", "TA"]))
):
    """
    Ingests an attendance sheet (CSV, XLSX, or Scanned PNG/JPG/PDF via Gemini Vision)
    and saves the session to MongoDB.
    """
    try:
        file_bytes = await file.read()
        filename = file.filename or "attendance.csv"
        ext = filename.split(".")[-1].lower()

        # Parse file based on format
        if ext in ["csv", "xlsx", "xls"]:
            records = AttendanceService.parse_tabular_file(file_bytes, filename)
        elif ext in ["png", "jpg", "jpeg", "pdf", "webp"]:
            records = AttendanceService.parse_scanned_sheet_multimodal(file_bytes, filename)
        else:
            raise HTTPException(status_code=400, detail="Unsupported file format. Please upload CSV, XLSX, PNG, JPG, or PDF.")

        if not records:
            raise HTTPException(status_code=400, detail="Could not extract any student attendance records from the uploaded file.")

        session_id = str(uuid.uuid4())
        effective_date = session_date or datetime.utcnow().strftime("%Y-%m-%d")
        uploader_role = current_user.get("role", "INSTRUCTOR")
        user_id = str(current_user.get("_id", "system"))

        session_doc = {
            "session_id": session_id,
            "course_id": course_id,
            "session_date": effective_date,
            "session_type": session_type or "Lecture",
            "uploaded_by": user_id,
            "uploader_role": uploader_role,
            "created_at": datetime.utcnow(),
            "records": records
        }

        await db["attendance_sessions"].insert_one(session_doc)

        # Calculate updated course summary
        summary = await AttendanceService.calculate_course_summary(course_id, db)

        return {
            "message": f"Successfully ingested {len(records)} student records for {session_type} on {effective_date}.",
            "session_id": session_id,
            "records_count": len(records),
            "summary": summary
        }
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to process attendance sheet: {str(e)}")


@router.get("/{course_id}/summary")
async def get_course_attendance_summary(
    course_id: str,
    current_user: dict = Depends(RoleChecker(["INSTRUCTOR", "TA"]))
):
    """Returns the cumulative attendance statistics, class averages, and 75% shortage list."""
    try:
        summary = await AttendanceService.calculate_course_summary(course_id, db)
        return summary
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/{course_id}/sessions")
async def get_course_sessions(
    course_id: str,
    current_user: dict = Depends(RoleChecker(["INSTRUCTOR", "TA"]))
):
    """Returns all recorded attendance sessions for a course."""
    try:
        cursor = db["attendance_sessions"].find({"course_id": course_id}).sort("session_date", -1)
        sessions = await cursor.to_list(length=500)
        
        formatted = []
        for s in sessions:
            formatted.append({
                "session_id": s.get("session_id"),
                "session_date": s.get("session_date"),
                "session_type": s.get("session_type"),
                "student_count": len(s.get("records", [])),
                "uploader_role": s.get("uploader_role"),
                "created_at": s.get("created_at")
            })
        return {"sessions": formatted}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.put("/{course_id}/sessions/{session_id}/student/{student_id}")
async def toggle_student_attendance(
    course_id: str,
    session_id: str,
    student_id: str,
    payload: Dict[str, Any],
    current_user: dict = Depends(RoleChecker(["INSTRUCTOR", "TA"]))
):
    """Allows manual override of a student's attendance for a specific session."""
    new_status = payload.get("status", "Present")
    if new_status not in ["Present", "Absent"]:
        raise HTTPException(status_code=400, detail="Status must be 'Present' or 'Absent'.")

    try:
        result = await db["attendance_sessions"].update_one(
            {"course_id": course_id, "session_id": session_id, "records.student_id": student_id},
            {"$set": {"records.$.status": new_status}}
        )

        if result.matched_count == 0:
            # Insert record if not present
            await db["attendance_sessions"].update_one(
                {"course_id": course_id, "session_id": session_id},
                {"$push": {"records": {"student_id": student_id, "name": student_id, "status": new_status}}}
            )

        summary = await AttendanceService.calculate_course_summary(course_id, db)
        return {"message": f"Updated {student_id} to {new_status}", "summary": summary}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/{course_id}/export")
async def export_attendance_ledger_csv(
    course_id: str,
    current_user: dict = Depends(RoleChecker(["INSTRUCTOR", "TA"]))
):
    """Generates and downloads a CSV export of the complete attendance ledger."""
    try:
        summary = await AttendanceService.calculate_course_summary(course_id, db)
        students = summary.get("students", [])

        headers = [
            "Student ID / Roll No",
            "Student Name",
            "Attended Sessions",
            "Total Sessions",
            "Attendance Percentage",
            "Eligibility Status",
            "Classes Needed for 75%"
        ]

        rows = [",".join(headers)]
        for s in students:
            status_label = "SHORTAGE (Detained Alert)" if s["is_shortage"] else "ELIGIBLE (Safe)"
            row = [
                f'"{s["student_id"]}"',
                f'"{s["name"] or s["student_id"]}"',
                str(s["attended_sessions"]),
                str(s["total_sessions"]),
                f'{s["percentage"]}%',
                f'"{status_label}"',
                str(s.get("classes_needed_for_75", 0))
            ]
            rows.append(",".join(row))

        csv_text = "\n".join(rows)
        filename = f"{course_id}_Attendance_Ledger.csv"

        return Response(
            content=csv_text,
            media_type="text/csv",
            headers={"Content-Disposition": f"attachment; filename={filename}"}
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
