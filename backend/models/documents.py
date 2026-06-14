# backend/models/documents.py
from pydantic import BaseModel, Field, EmailStr
from typing import List, Optional, Dict, Any
from datetime import datetime
from enum import Enum

class UserRole(str, Enum):
    INSTRUCTOR = "instructor"
    TA = "ta"

# --- EMBEDDED SCHEMAS ---

class RubricCriteria(BaseModel):
    question_number: str       # e.g., "1a", "2"
    max_score: float
    criteria_steps: Dict[str, Any]  # Rich JSON mapping for strict logic steps

class GradedAnswer(BaseModel):
    rubric_question_number: str
    crop_image_path: str       # Path to the cropped answer box image
    transcribed_text: Optional[str] = None
    
    # AI Proposal Engine Outputs
    ai_score: Optional[float] = None
    ai_justification: Optional[str] = None
    plagiarism_flag: bool = False
    similarity_score: float = 0.0
    
    # Human Override States
    final_score: Optional[float] = None
    final_justification: Optional[str] = None
    reviewed_by: Optional[str] = None  # User ID of the reviewing TA

# --- PRIMARY DOCUMENTS (COLLECTIONS) ---

class UserDocument(BaseModel):
    email: EmailStr
    hashed_password: str
    role: UserRole = UserRole.TA

class ExamDocument(BaseModel):
    title: str
    pdf_path: str              # Path to original bulk file
    created_by: str            # User ID
    created_at: datetime = Field(default_factory=datetime.utcnow)
    rubrics: List[RubricCriteria] = []

class SubmissionDocument(BaseModel):
    exam_id: str               # Links back to ExamDocument
    student_roll_number: str
    is_fully_reviewed: bool = False
    answers: List[GradedAnswer] = []