# backend/models/attendance.py
from datetime import datetime
from typing import List, Optional
from pydantic import BaseModel, Field


class AttendanceRecord(BaseModel):
    student_id: str = Field(description="Student Roll Number or ID")
    name: Optional[str] = Field(default=None, description="Student Full Name")
    status: str = Field(default="Present", description="Attendance Status: 'Present' or 'Absent'")


class AttendanceSession(BaseModel):
    session_id: str = Field(description="Unique UUID for this attendance session")
    course_id: str = Field(description="Course or Subject Code, e.g. 'PHYS101'")
    session_date: str = Field(description="Session Date in YYYY-MM-DD format")
    session_type: str = Field(default="Lecture", description="Session Type: 'Lecture', 'Tutorial', or 'Lab'")
    uploaded_by: str = Field(description="User ID of uploader")
    uploader_role: str = Field(default="INSTRUCTOR", description="Role of uploader ('INSTRUCTOR' or 'TA')")
    created_at: datetime = Field(default_factory=datetime.utcnow)
    records: List[AttendanceRecord] = Field(default_factory=list)


class StudentAttendanceSummary(BaseModel):
    student_id: str
    name: Optional[str] = None
    attended_sessions: int
    total_sessions: int
    percentage: float
    is_shortage: bool
    classes_needed_for_75: int = 0


class CourseAttendanceSummary(BaseModel):
    course_id: str
    total_sessions: int
    shortage_cutoff: float = 75.0
    total_students: int
    shortage_count: int
    safe_count: int
    class_average_pct: float
    students: List[StudentAttendanceSummary] = []
