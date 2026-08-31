# backend/services/attendance_service.py
import io
import os
import math
import json
import csv
from PIL import Image
from typing import List, Dict, Any, Optional
from dotenv import load_dotenv
from google import genai
from groq import Groq

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

# Load environment variables
load_dotenv(os.path.join(os.path.dirname(__file__), "../.env"))
load_dotenv(os.path.join(os.path.dirname(__file__), "../../.env"))
load_dotenv()

GEMINI_API_KEY = os.getenv("GEMINI_API_KEY") or os.getenv("GOOGLE_API_KEY")

try:
    gemini_client = genai.Client(api_key=GEMINI_API_KEY) if GEMINI_API_KEY else genai.Client()
except Exception:
    gemini_client = None

try:
    groq_client = Groq(api_key=os.getenv("GROQ_API_KEY"))
except Exception:
    groq_client = None

GEMINI_MODELS = ["gemini-2.5-flash", "gemini-3.6-flash", "gemini-flash-latest", "gemini-2.0-flash"]


class AttendanceService:
    @staticmethod
    def parse_tabular_file(file_bytes: bytes, filename: str) -> List[Dict[str, Any]]:
        """
        Parses CSV or Excel attendance sheets into a normalized list of student attendance records.
        Handles both Single-Session format (Roll No, Name, Status) and Multi-Date Matrix format.
        """
        ext = os.path.splitext(filename)[1].lower()

        # If pandas is not installed or file is plain CSV, support built-in csv parsing
        if pd is None and ext not in ['.xlsx', '.xls']:
            try:
                text_content = file_bytes.decode('utf-8', errors='ignore')
                reader = csv.reader(io.StringIO(text_content))
                rows = [r for r in reader if r and any(cell.strip() for cell in r)]
                if not rows:
                    return []
                
                headers = [h.strip() for h in rows[0]]
                records = []
                
                # Detect ID col and status col
                id_idx = 0
                name_idx = None
                status_idx = None
                for idx, h in enumerate(headers):
                    hl = h.lower().replace("_", "").replace(" ", "")
                    if hl in ["rollno", "rollnumber", "studentid", "studentno", "id", "roll", "regno", "usn"]:
                        id_idx = idx
                    elif hl in ["name", "studentname", "fullname", "student"]:
                        name_idx = idx
                    elif hl in ["status", "attendance", "presentabsent", "attendance_status", "attend"]:
                        status_idx = idx

                if status_idx is None:
                    status_idx = len(headers) - 1

                for row in rows[1:]:
                    if len(row) <= id_idx:
                        continue
                    raw_id = row[id_idx].strip()
                    if not raw_id:
                        continue
                    raw_name = row[name_idx].strip() if name_idx is not None and len(row) > name_idx else ""
                    raw_status = row[status_idx].strip().lower() if len(row) > status_idx else "present"
                    is_present = raw_status in ["p", "present", "1", "1.0", "true", "yes", "y", "attended"]
                    records.append({
                        "student_id": raw_id,
                        "name": raw_name or None,
                        "status": "Present" if is_present else "Absent"
                    })
                return records
            except Exception as csv_err:
                print(f"⚠️ Built-in CSV parser error: {csv_err}")
                return []

        if ext in ['.xlsx', '.xls']:
            df = pd.read_excel(io.BytesIO(file_bytes))
        else:
            try:
                df = pd.read_csv(io.BytesIO(file_bytes))
            except Exception:
                df = pd.read_csv(io.BytesIO(file_bytes), sep=None, engine='python')

        # Clean column names (strip whitespace and lower-case)
        df.columns = [str(c).strip() for c in df.columns]
        cols_lower = {c: c.lower() for c in df.columns}

        # Identify Roll Number / Student ID column
        id_col = None
        for c in df.columns:
            cl = c.lower().replace("_", "").replace(" ", "")
            if cl in ["rollno", "rollnumber", "studentid", "studentno", "id", "roll", "regno", "usn"]:
                id_col = c
                break
        if not id_col:
            # Fallback to first column
            id_col = df.columns[0]

        # Identify Student Name column
        name_col = None
        for c in df.columns:
            cl = c.lower().replace("_", "").replace(" ", "")
            if cl in ["name", "studentname", "fullname", "student"]:
                name_col = c
                break

        # Identify Status column
        status_col = None
        for c in df.columns:
            cl = c.lower().replace("_", "").replace(" ", "")
            if cl in ["status", "attendance", "presentabsent", "attendance_status", "attend"]:
                status_col = c
                break

        records = []

        if status_col:
            # Single session format (Row = student)
            for _, row in df.iterrows():
                raw_id = str(row.get(id_col, "")).strip()
                if not raw_id or raw_id.lower() in ["nan", "none", ""]:
                    continue

                raw_name = str(row.get(name_col, "")).strip() if name_col else ""
                if raw_name.lower() in ["nan", "none"]:
                    raw_name = ""

                raw_status = str(row.get(status_col, "")).strip().lower()
                is_present = raw_status in ["p", "present", "1", "1.0", "true", "yes", "y", "attended"]

                records.append({
                    "student_id": raw_id,
                    "name": raw_name or None,
                    "status": "Present" if is_present else "Absent"
                })
        else:
            # Multi-date Matrix format or general row list
            # Find date or attendance columns
            non_id_cols = [c for c in df.columns if c not in [id_col, name_col]]
            
            # If multiple session columns exist, take the last/latest column as the session
            target_col = non_id_cols[-1] if non_id_cols else df.columns[-1]

            for _, row in df.iterrows():
                raw_id = str(row.get(id_col, "")).strip()
                if not raw_id or raw_id.lower() in ["nan", "none", ""]:
                    continue

                raw_name = str(row.get(name_col, "")).strip() if name_col else ""
                if raw_name.lower() in ["nan", "none"]:
                    raw_name = ""

                val = str(row.get(target_col, "")).strip().lower()
                is_present = val in ["p", "present", "1", "1.0", "true", "yes", "y"]

                records.append({
                    "student_id": raw_id,
                    "name": raw_name or None,
                    "status": "Present" if is_present else "Absent"
                })

        return records

    @staticmethod
    def parse_scanned_sheet_multimodal(file_bytes: bytes, filename: str = "") -> List[Dict[str, Any]]:
        """
        Extracts student attendance records from a scanned image or PDF sign-in sheet using Gemini Multimodal.
        """
        ext = os.path.splitext(filename)[1].lower() if filename else ".png"
        img = None

        if ext == ".pdf" or file_bytes[:4] == b"%PDF":
            doc = fitz.open(stream=file_bytes, filetype="pdf")
            if doc.page_count > 0:
                page = doc.load_page(0)
                pix = page.get_pixmap(matrix=fitz.Matrix(2, 2))
                img = Image.open(io.BytesIO(pix.tobytes("png")))
            doc.close()
        else:
            img = Image.open(io.BytesIO(file_bytes))

        if not img:
            return []

        prompt = """
You are an expert OCR and document analysis engine for university classroom attendance sheets.

TASK:
1. Extract the full list of students from the attendance sheet/roster image.
2. For each student, extract their Student ID/Roll Number, Name (if visible), and attendance status ("Present" or "Absent").
   - A checkmark, tick (✓), 'P', initials, or handwritten signature indicates "Present".
   - A cross (✗), 'A', blank space, or red mark indicates "Absent".
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
                        return [
                            {
                                "student_id": str(item.get("student_id", "")).strip(),
                                "name": item.get("name"),
                                "status": "Present" if str(item.get("status", "")).strip().lower() == "present" else "Absent"
                            }
                            for item in data if item.get("student_id")
                        ]
                except Exception as e:
                    print(f"⚠️ Gemini multimodal parsing notice: {e}")
                    continue

        return []

    @staticmethod
    async def calculate_course_summary(course_id: str, db) -> Dict[str, Any]:
        """
        Aggregates attendance sessions for a course and calculates cumulative attendance percentage,
        75% shortage eligibility status, and classes needed to reach 75%.
        """
        cursor = db["attendance_sessions"].find({"course_id": course_id})
        sessions = await cursor.to_list(length=1000)

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
                "students": []
            }

        # Aggregate student attendance
        student_stats: Dict[str, Dict[str, Any]] = {}

        for sess in sessions:
            records = sess.get("records", [])
            for rec in records:
                s_id = str(rec.get("student_id", "")).strip()
                if not s_id:
                    continue

                if s_id not in student_stats:
                    student_stats[s_id] = {
                        "student_id": s_id,
                        "name": rec.get("name"),
                        "attended": 0,
                        "total": 0
                    }
                elif not student_stats[s_id]["name"] and rec.get("name"):
                    student_stats[s_id]["name"] = rec.get("name")

                student_stats[s_id]["total"] += 1
                if rec.get("status") == "Present":
                    student_stats[s_id]["attended"] += 1

        students_list = []
        total_pct_sum = 0.0
        shortage_count = 0
        safe_count = 0

        for s_id, stat in student_stats.items():
            s_attended = stat["attended"]
            # Student total can be either their recorded sessions or total course sessions
            s_total = max(stat["total"], total_sessions)
            pct = round((s_attended / s_total) * 100.0, 1) if s_total > 0 else 0.0
            is_shortage = pct < 75.0

            # Formula for classes needed to reach 75%:
            # (attended + k) / (total + k) >= 0.75 ==> k = max(0, ceil(3*total - 4*attended))
            if is_shortage:
                shortage_count += 1
                classes_needed = max(0, math.ceil(3 * s_total - 4 * s_attended))
            else:
                safe_count += 1
                classes_needed = 0

            total_pct_sum += pct

            students_list.append({
                "student_id": s_id,
                "name": stat["name"] or s_id,
                "attended_sessions": s_attended,
                "total_sessions": s_total,
                "percentage": pct,
                "is_shortage": is_shortage,
                "classes_needed_for_75": classes_needed
            })

        # Sort students by roll number
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
            "students": students_list
        }
