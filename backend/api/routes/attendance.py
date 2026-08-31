# backend/api/routes/attendance.py
import uuid
from datetime import datetime
from typing import Optional, List, Dict, Any
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form, Response, Query
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

        all_courses = sorted(list(set(distinct_courses + exam_titles + ["PHYS101", "CS101", "MATH201", "ME2024"])))
        return {"courses": all_courses}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/{course_id}/upload")
async def upload_attendance_sheet(
    course_id: str,
    file: UploadFile = File(...),
    session_date: Optional[str] = Form(None),
    session_type: Optional[str] = Form("Lecture"),
    late_policy: Optional[str] = Form("lenient"),
    current_user: dict = Depends(RoleChecker(["INSTRUCTOR", "TA"]))
):
    """
    Ingests an attendance sheet (CSV, XLSX, or Scanned PNG/JPG/PDF).
    Supports wide-format multi-date sheets (e.g. 10-day rolling sheets) and unpivots
    each class into an individual session in MongoDB without overwriting previous sessions.
    """
    try:
        file_bytes = await file.read()
        filename = file.filename or "attendance.csv"
        ext = filename.split(".")[-1].lower()

        # Parse file based on format into a list of session payloads
        if ext in ["csv", "xlsx", "xls"]:
            sessions_parsed = AttendanceService.parse_tabular_file(file_bytes, filename)
        elif ext in ["png", "jpg", "jpeg", "pdf", "webp"]:
            sessions_parsed = AttendanceService.parse_scanned_sheet_multimodal(file_bytes, filename)
        else:
            raise HTTPException(status_code=400, detail="Unsupported file format. Please upload CSV, XLSX, PNG, JPG, or PDF.")

        if not sessions_parsed or not any(s.get("records") for s in sessions_parsed):
            raise HTTPException(status_code=400, detail="Could not extract any student attendance records from the uploaded file.")

        uploader_role = current_user.get("role", "INSTRUCTOR")
        user_id = str(current_user.get("_id", "system"))
        fallback_date = session_date or datetime.utcnow().strftime("%Y-%m-%d")

        ingested_count = 0
        total_records_count = 0

        # Upsert each session by (course_id, session_date) for rolling sheet support
        for idx, sess in enumerate(sessions_parsed):
            records = sess.get("records", [])
            if not records:
                continue

            sess_date = sess.get("session_date") or (
                fallback_date if len(sessions_parsed) == 1 else f"{fallback_date}_session_{idx+1}"
            )
            s_type = sess.get("session_type") or session_type or "Lecture"

            await db["attendance_sessions"].update_one(
                {"course_id": course_id, "session_date": sess_date},
                {
                    "$set": {
                        "course_id": course_id,
                        "session_date": sess_date,
                        "session_type": s_type,
                        "uploaded_by": user_id,
                        "uploader_role": uploader_role,
                        "created_at": datetime.utcnow(),
                        "records": records
                    },
                    "$setOnInsert": {
                        "session_id": str(uuid.uuid4())
                    }
                },
                upsert=True
            )
            ingested_count += 1
            total_records_count += len(records)

        # Calculate updated course summary under the active policy
        summary = await AttendanceService.calculate_course_summary(course_id, db, late_policy=late_policy or "lenient")

        return {
            "message": f"Successfully ingested {ingested_count} session(s) with {total_records_count} student entries for {course_id}.",
            "sessions_ingested": ingested_count,
            "total_records": total_records_count,
            "summary": summary
        }
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to process attendance sheet: {str(e)}")


@router.get("/{course_id}/summary")
async def get_course_attendance_summary(
    course_id: str,
    late_policy: str = Query("lenient", description="Policy for handling Late status: 'lenient' (Late=1) or 'strict' (Late=0)"),
    current_user: dict = Depends(RoleChecker(["INSTRUCTOR", "TA"]))
):
    """Returns the cumulative attendance statistics, class averages, and dual policy shortage calculations."""
    try:
        summary = await AttendanceService.calculate_course_summary(course_id, db, late_policy=late_policy)
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
        cursor = db["attendance_sessions"].find({"course_id": course_id}).sort("session_date", 1)
        sessions = await cursor.to_list(length=1000)
        
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
    """Allows manual override / toggle of a student's attendance (Present <-> Late <-> Absent) for a specific session."""
    raw_status = payload.get("status", "Present")
    new_status = AttendanceService.normalize_status(raw_status)
    late_policy = payload.get("late_policy", "lenient")

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

        summary = await AttendanceService.calculate_course_summary(course_id, db, late_policy=late_policy)
        
        # Find updated student record
        updated_student = next((s for s in summary.get("students", []) if s["student_id"] == student_id), None)

        return {
            "message": f"Updated {student_id} to {new_status}",
            "summary": summary,
            "student": updated_student
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/{course_id}/export")
async def export_attendance_ledger_csv(
    course_id: str,
    late_policy: str = Query("lenient", description="Active late policy for the CSV export"),
    current_user: dict = Depends(RoleChecker(["INSTRUCTOR", "TA"]))
):
    """Generates and downloads a CSV export of the complete attendance ledger with dual policy breakdowns."""
    try:
        summary = await AttendanceService.calculate_course_summary(course_id, db, late_policy=late_policy)
        students = summary.get("students", [])

        headers = [
            "Roll Number",
            "Student Name",
            "Total Sessions",
            "Present (P)",
            "Late (L)",
            "Absent (A)",
            "Strict % (Late=0)",
            "Lenient % (Late=1)",
            f"Active Status ({late_policy.upper()})",
            "Classes Needed for 75%"
        ]

        rows = [",".join(headers)]
        for s in students:
            status_label = "SHORTAGE (Detained Alert)" if s["is_shortage"] else "ELIGIBLE (Safe)"
            row = [
                f'"{s["student_id"]}"',
                f'"{s["name"] or s["student_id"]}"',
                str(s["total_sessions"]),
                str(s["present_count"]),
                str(s["late_count"]),
                str(s["absent_count"]),
                f'{s["percentage_strict"]}%',
                f'{s["percentage_lenient"]}%',
                f'"{status_label}"',
                str(s.get("classes_needed_for_75", 0))
            ]
            rows.append(",".join(row))

        csv_text = "\n".join(rows)
        filename = f"{course_id}_Attendance_Ledger_{late_policy.upper()}.csv"

        return Response(
            content=csv_text,
            media_type="text/csv",
            headers={"Content-Disposition": f"attachment; filename={filename}"}
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
