# backend/models/attendance.py
from datetime import datetime
from typing import List, Optional, Dict, Any, Literal
from pydantic import BaseModel, Field


class AttendanceRecord(BaseModel):
    student_id: str = Field(description="Student Roll Number or ID")
    name: Optional[str] = Field(default=None, description="Student Full Name")
    status: Literal["Present", "Absent", "Late"] = Field(default="Present", description="Attendance Status: 'Present', 'Absent', or 'Late'")


class AttendanceSession(BaseModel):
    session_id: str = Field(description="Unique UUID for this attendance session")
    course_id: str = Field(description="Course or Subject Code, e.g. 'PHYS101'")
    session_date: str = Field(description="Session Date in YYYY-MM-DD format")
    session_type: str = Field(default="Lecture", description="Session Type: 'Lecture', 'Tutorial', or 'Lab'")
    uploaded_by: str = Field(description="User ID of uploader")
    uploader_role: str = Field(default="INSTRUCTOR", description="Role of uploader ('INSTRUCTOR' or 'TA')")
    created_at: datetime = Field(default_factory=datetime.utcnow)
    records: List[AttendanceRecord] = Field(default_factory=list)


class StudentSessionHistory(BaseModel):
    session_id: str
    session_date: str
    session_type: str = "Lecture"
    status: str = "Present" # "Present" | "Late" | "Absent"


class StudentAttendanceSummary(BaseModel):
    student_id: str
    name: Optional[str] = None
    total_sessions: int
    present_count: int = 0
    late_count: int = 0
    absent_count: int = 0
    
    # Dual Policies
    percentage_strict: float = 0.0    # Late = Absent (0 credit)
    percentage_lenient: float = 0.0   # Late = Present (1 credit)
    is_shortage_strict: bool = False
    is_shortage_lenient: bool = False
    needed_strict: int = 0
    needed_lenient: int = 0
    
    # Active Policy View (defaults to lenient)
    attended_sessions: int = 0
    percentage: float = 0.0
    is_shortage: bool = False
    classes_needed_for_75: int = 0
    
    # Chronological session history
    session_history: List[StudentSessionHistory] = []


class CourseAttendanceSummary(BaseModel):
    course_id: str
    total_sessions: int
    shortage_cutoff: float = 75.0
    total_students: int
    shortage_count: int
    safe_count: int
    class_average_pct: float
    late_policy: str = "lenient" # "lenient" | "strict"
    students: List[StudentAttendanceSummary] = []
