# backend/services/attendance_service.py
import io
import os
import re
import math
import json
import csv
from datetime import datetime
from PIL import Image
from typing import List, Dict, Any, Optional
from dotenv import load_dotenv

# Safe pandas import
try:
    import pandas as pd
except ImportError:
    pd = None

# Safe PyMuPDF import
try:
    import fitz
except ImportError:
    try:
        import pymupdf as fitz
    except ImportError:
        fitz = None

# Safe Gemini Client import
try:
    from google import genai
except ImportError:
    genai = None

# Safe Groq Client import
try:
    from groq import Groq
except ImportError:
    Groq = None

# Load environment variables
load_dotenv(os.path.join(os.path.dirname(__file__), "../.env"))
load_dotenv(os.path.join(os.path.dirname(__file__), "../../.env"))
load_dotenv()

GEMINI_API_KEY = os.getenv("GEMINI_API_KEY") or os.getenv("GOOGLE_API_KEY")

try:
    gemini_client = genai.Client(api_key=GEMINI_API_KEY) if (genai and GEMINI_API_KEY) else (genai.Client() if genai else None)
except Exception:
    gemini_client = None

try:
    groq_client = Groq(api_key=os.getenv("GROQ_API_KEY")) if (Groq and os.getenv("GROQ_API_KEY")) else None
except Exception:
    groq_client = None

GEMINI_MODELS = ["gemini-2.5-flash", "gemini-3.6-flash", "gemini-flash-latest", "gemini-2.0-flash"]


class AttendanceService:
    @staticmethod
    def normalize_status(val: Any) -> str:
        """Normalizes various text or numeric indicators into 'Present', 'Late', or 'Absent'."""
        if val is None:
            return "Absent"
        s = str(val).strip().lower()
        if s in ["present", "p", "1", "1.0", "true", "yes", "y", "attended"]:
            return "Present"
        elif s in ["late", "l", "0.5", "half", "tardy"]:
            return "Late"
        else:
            return "Absent"

    @staticmethod
    def parse_tabular_file(file_bytes: bytes, filename: str) -> List[Dict[str, Any]]:
        """
        Parses CSV or Excel files.
        Detects Single-Session files vs. Wide Multi-Class/Multi-Date Sheets.
        Returns a list of session payloads:
        [
            {
                "session_date": "2026-08-10" (or None for single upload),
                "session_type": "Lecture",
                "records": [ { "student_id": "...", "name": "...", "status": "Present" }, ... ]
            },
            ...
        ]
        """
        ext = os.path.splitext(filename)[1].lower()
        
        # Load into DataFrame (or fallback to CSV parser)
        if pd is not None:
            if ext in ['.xlsx', '.xls']:
                df = pd.read_excel(io.BytesIO(file_bytes))
            else:
                try:
                    df = pd.read_csv(io.BytesIO(file_bytes))
                except Exception:
                    df = pd.read_csv(io.BytesIO(file_bytes), sep=None, engine='python')
        else:
            # Fallback when pandas is absent
            text_content = file_bytes.decode('utf-8', errors='ignore')
            reader = csv.reader(io.StringIO(text_content))
            rows = [r for r in reader if r and any(cell.strip() for cell in r)]
            if not rows:
                return []
            headers = [h.strip() for h in rows[0]]
            data_rows = rows[1:]
            
            # Simple single session or wide parser fallback
            id_idx = 0
            name_idx = None
            session_cols = []
            for idx, h in enumerate(headers):
                hl = h.lower().replace("_", "").replace(" ", "")
                if hl in ["rollno", "rollnumber", "studentid", "studentno", "id", "roll", "regno", "usn"]:
                    id_idx = idx
                elif hl in ["name", "studentname", "fullname", "student"]:
                    name_idx = idx
                else:
                    session_cols.append((idx, h))

            if not session_cols:
                session_cols = [(len(headers) - 1, "Session")]

            sessions = []
            for col_idx, col_name in session_cols:
                records = []
                for row in data_rows:
                    if len(row) <= id_idx:
                        continue
                    s_id = row[id_idx].strip()
                    if not s_id:
                        continue
                    s_name = row[name_idx].strip() if name_idx is not None and len(row) > name_idx else ""
                    val = row[col_idx].strip() if len(row) > col_idx else "Absent"
                    records.append({
                        "student_id": s_id,
                        "name": s_name or None,
                        "status": AttendanceService.normalize_status(val)
                    })
                sessions.append({
                    "session_date": col_name if (len(session_cols) > 1 and re.match(r'^\d{4}-\d{2}-\d{2}$', col_name)) else None,
                    "session_type": "Lecture",
                    "records": records
                })
            return sessions

        # Using Pandas DataFrame
        df.columns = [str(c).strip() for c in df.columns]

        # Identify Student ID / Roll No Column
        id_col = None
        for c in df.columns:
            cl = c.lower().replace("_", "").replace(" ", "")
            if cl in ["rollno", "rollnumber", "studentid", "studentno", "id", "roll", "regno", "usn"]:
                id_col = c
                break
        if not id_col:
            id_col = df.columns[0]

        # Identify Student Name Column
        name_col = None
        for c in df.columns:
            cl = c.lower().replace("_", "").replace(" ", "")
            if cl in ["name", "studentname", "fullname", "student"]:
                name_col = c
                break

        # Remaining non-ID, non-Name columns are session/date columns
        session_cols = [c for c in df.columns if c not in [id_col, name_col]]

        # If only 1 session column and it's named 'Status'/'Attendance', it's a single-session sheet
        if len(session_cols) == 1 and session_cols[0].lower().replace("_", "").replace(" ", "") in ["status", "attendance", "presentabsent", "attendance_status", "attend"]:
            records = []
            for _, row in df.iterrows():
                raw_id = str(row.get(id_col, "")).strip()
                if not raw_id or raw_id.lower() in ["nan", "none", ""]:
                    continue
                raw_name = str(row.get(name_col, "")).strip() if name_col else ""
                if raw_name.lower() in ["nan", "none"]:
                    raw_name = ""
                raw_val = row.get(session_cols[0], "")
                records.append({
                    "student_id": raw_id,
                    "name": raw_name or None,
                    "status": AttendanceService.normalize_status(raw_val)
                })
            return [{
                "session_date": None,
                "session_type": "Lecture",
                "records": records
            }]

        # WIDE MULTI-CLASS / MULTI-DATE SHEET UNPIVOTING
        sessions = []
        for col_name in session_cols:
            records = []
            for _, row in df.iterrows():
                raw_id = str(row.get(id_col, "")).strip()
                if not raw_id or raw_id.lower() in ["nan", "none", ""]:
                    continue
                raw_name = str(row.get(name_col, "")).strip() if name_col else ""
                if raw_name.lower() in ["nan", "none"]:
                    raw_name = ""
                raw_val = row.get(col_name, "")
                records.append({
                    "student_id": raw_id,
                    "name": raw_name or None,
                    "status": AttendanceService.normalize_status(raw_val)
                })
            
            # Check if column header looks like a date (e.g. YYYY-MM-DD or MM/DD/YYYY)
            date_match = re.search(r'\b\d{4}-\d{2}-\d{2}\b', col_name)
            parsed_date = date_match.group(0) if date_match else None

            sessions.append({
                "session_date": parsed_date or col_name,
                "session_type": "Lecture",
                "records": records
            })

        return sessions

    @staticmethod
    def parse_scanned_sheet_multimodal(file_bytes: bytes, filename: str = "") -> List[Dict[str, Any]]:
        """
        Extracts student attendance records from a scanned image or PDF sign-in sheet using Gemini Multimodal.
        Supports Present, Late, and Absent statuses.
        """
        ext = os.path.splitext(filename)[1].lower() if filename else ".png"
        img = None

        if (ext == ".pdf" or file_bytes[:4] == b"%PDF") and fitz is not None:
            doc = fitz.open(stream=file_bytes, filetype="pdf")
            if doc.page_count > 0:
                page = doc.load_page(0)
                pix = page.get_pixmap(matrix=fitz.Matrix(2, 2))
                img = Image.open(io.BytesIO(pix.tobytes("png")))
            doc.close()
        else:
            try:
                img = Image.open(io.BytesIO(file_bytes))
            except Exception:
                img = None

        if not img:
            return []

        prompt = """
You are an expert OCR and document analysis engine for university classroom attendance sheets.

TASK:
1. Extract the full list of students from the attendance sheet/roster image.
2. For each student, extract their Student ID/Roll Number, Name (if visible), and attendance status:
   - "Present" (for checks, ticks, 'P', initials, or signatures)
   - "Late" (for 'L', 'Late', yellow/amber markers, or half credit)
   - "Absent" (for crosses, 'A', blanks, or red marks)
3. Return a valid JSON list in the following schema:
[
  {
    "student_id": "<string roll number or ID>",
    "name": "<string full name or null>",
    "status": "Present"
  }
]
"""
        if gemini_client:
            for model_name in GEMINI_MODELS:
                try:
                    res = gemini_client.models.generate_content(
                        model=model_name,
                        contents=[img, prompt],
                        config={
                            "response_mime_type": "application/json",
                            "temperature": 0.1
                        }
                    )
                    data = json.loads(res.text)
                    if isinstance(data, list):
                        records = [
                            {
                                "student_id": str(item.get("student_id", "")).strip(),
                                "name": item.get("name"),
                                "status": AttendanceService.normalize_status(item.get("status", "Present"))
                            }
                            for item in data if item.get("student_id")
                        ]
                        return [{
                            "session_date": None,
                            "session_type": "Lecture",
                            "records": records
                        }]
                except Exception as e:
                    print(f"⚠️ Gemini multimodal parsing notice: {e}")
                    continue

        return []

    @staticmethod
    async def calculate_course_summary(course_id: str, db, late_policy: str = "lenient") -> Dict[str, Any]:
        """
        Aggregates all attendance sessions for a course and calculates:
        - Dual policy percentages (Strict: Late=0, Lenient: Late=1)
        - Shortage threshold (75%)
        - Recovery classes needed (k)
        - Full chronological day-by-day session history per student
        """
        cursor = db["attendance_sessions"].find({"course_id": course_id}).sort("session_date", 1)
        sessions = await cursor.to_list(length=2000)

        total_sessions = len(sessions)
        if total_sessions == 0:
            return {
                "course_id": course_id,
                "total_sessions": 0,
                "shortage_cutoff": 75.0,
                "total_students": 0,
                "shortage_count": 0,
                "safe_count": 0,
                "class_average_pct": 0.0,
                "late_policy": late_policy,
                "students": []
            }

        # Build student maps and session history
        student_stats: Dict[str, Dict[str, Any]] = {}

        for sess in sessions:
            sess_id = sess.get("session_id")
            sess_date = sess.get("session_date", "")
            sess_type = sess.get("session_type", "Lecture")
            records = sess.get("records", [])

            # Create a lookup for this session's records
            sess_record_map = {str(r.get("student_id", "")).strip(): r for r in records if r.get("student_id")}

            for s_id, rec in sess_record_map.items():
                if s_id not in student_stats:
                    student_stats[s_id] = {
                        "student_id": s_id,
                        "name": rec.get("name"),
                        "present_count": 0,
                        "late_count": 0,
                        "absent_count": 0,
                        "history": []
                    }
                elif not student_stats[s_id]["name"] and rec.get("name"):
                    student_stats[s_id]["name"] = rec.get("name")

            # Record status for all known students in this session
            for s_id in list(student_stats.keys()):
                if s_id in sess_record_map:
                    raw_st = sess_record_map[s_id].get("status", "Present")
                    st = AttendanceService.normalize_status(raw_st)
                else:
                    st = "Absent"

                if st == "Present":
                    student_stats[s_id]["present_count"] += 1
                elif st == "Late":
                    student_stats[s_id]["late_count"] += 1
                else:
                    student_stats[s_id]["absent_count"] += 1

                student_stats[s_id]["history"].append({
                    "session_id": sess_id,
                    "session_date": sess_date,
                    "session_type": sess_type,
                    "status": st
                })

        students_list = []
        total_pct_sum = 0.0
        shortage_count = 0
        safe_count = 0

        for s_id, stat in student_stats.items():
            s_present = stat["present_count"]
            s_late = stat["late_count"]
            s_absent = stat["absent_count"]
            N = total_sessions

            # Strict: Late = 0
            pct_strict = round((s_present / N) * 100.0, 1) if N > 0 else 0.0
            is_shortage_strict = pct_strict < 75.0
            needed_strict = max(0, math.ceil(3 * N - 4 * s_present)) if is_shortage_strict else 0

            # Lenient: Late = 1
            pct_lenient = round(((s_present + s_late) / N) * 100.0, 1) if N > 0 else 0.0
            is_shortage_lenient = pct_lenient < 75.0
            needed_lenient = max(0, math.ceil(3 * N - 4 * (s_present + s_late))) if is_shortage_lenient else 0

            # Active policy values
            if late_policy.lower() == "strict":
                active_pct = pct_strict
                active_shortage = is_shortage_strict
                active_needed = needed_strict
                active_attended = s_present
            else:
                active_pct = pct_lenient
                active_shortage = is_shortage_lenient
                active_needed = needed_lenient
                active_attended = s_present + s_late

            if active_shortage:
                shortage_count += 1
            else:
                safe_count += 1

            total_pct_sum += active_pct

            students_list.append({
                "student_id": s_id,
                "name": stat["name"] or s_id,
                "total_sessions": N,
                "present_count": s_present,
                "late_count": s_late,
                "absent_count": s_absent,
                "percentage_strict": pct_strict,
                "percentage_lenient": pct_lenient,
                "is_shortage_strict": is_shortage_strict,
                "is_shortage_lenient": is_shortage_lenient,
                "needed_strict": needed_strict,
                "needed_lenient": needed_lenient,
                "attended_sessions": active_attended,
                "percentage": active_pct,
                "is_shortage": active_shortage,
                "classes_needed_for_75": active_needed,
                "session_history": stat["history"]
            })

        students_list.sort(key=lambda x: x["student_id"].lower())

        total_students = len(students_list)
        class_avg = round(total_pct_sum / total_students, 1) if total_students > 0 else 0.0

        return {
            "course_id": course_id,
            "total_sessions": total_sessions,
            "shortage_cutoff": 75.0,
            "total_students": total_students,
            "shortage_count": shortage_count,
            "safe_count": safe_count,
            "class_average_pct": class_avg,
            "late_policy": late_policy,
            "students": students_list
        }
