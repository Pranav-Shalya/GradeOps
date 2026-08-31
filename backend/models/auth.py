from pydantic import BaseModel, EmailStr, Field
from typing import Optional, List
from enum import Enum
from models.documents import UserRole

class UserCreate(BaseModel):
    email: EmailStr
    password: str = Field(..., max_length=72, description="Password cannot exceed 72 characters")
    full_name: str
    role: str = "TA" # "INSTRUCTOR" / "professor" or "TA"
    access_code: Optional[str] = None # Required for TA registration

class UserInDB(BaseModel):
    email: str
    hashed_password: str
    full_name: str
    role: UserRole = UserRole.TA
    instructor_id: Optional[str] = None
    access_code: Optional[str] = None
    assigned_exams: List[str] = [] # List of exam_ids they are allowed to see

class Token(BaseModel):
    access_token: str
    token_type: str

class TokenData(BaseModel):
    email: Optional[str] = None
    role: Optional[str] = None