# backend/models/documents.py
from pydantic import BaseModel, Field, EmailStr
from typing import List, Optional, Dict, Any
from datetime import datetime
from enum import Enum

class UserRole(str, Enum):
    INSTRUCTOR = "INSTRUCTOR"
    TA = "TA"

# --- EMBEDDED SCHEMAS ---

class RubricCriteria(BaseModel):
    question_number: str       # e.g., "1a", "2"
    max_score: float
    criteria_steps: Dict[str, Any]  # Rich JSON mapping for strict logic steps

class GradedAnswer(BaseModel):
    rubric_question_number: str
    crop_image_path: Optional[str] = None
    transcribed_text: Optional[str] = None
    
    # AI Proposal Engine Outputs
    ai_score: Optional[float] = None
    ai_justification: Optional[str] = None
    plagiarism_flag: bool = False
    similarity_score: float = 0.0
    similarity_flag: bool = False
    similarity_matches: List[str] = []
    
    # Human Override States
    final_score: Optional[float] = None
    final_justification: Optional[str] = None
    reviewed_by: Optional[str] = None  # User ID of the reviewing TA

# --- PRIMARY DOCUMENTS (COLLECTIONS) ---

class UserDocument(BaseModel):
    email: EmailStr
    hashed_password: str
    role: UserRole = UserRole.TA
    full_name: Optional[str] = None
    instructor_id: Optional[str] = None # Link TA to their professor's User ID
    access_code: Optional[str] = None   # Unique invite code generated for INSTRUCTORs

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