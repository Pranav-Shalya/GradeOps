# backend/models/auth.py
from pydantic import BaseModel, EmailStr, Field
from typing import Optional, List

class UserCreate(BaseModel):
    email: EmailStr
    password: str = Field(..., max_length=72, description="Password cannot exceed 72 characters")
    full_name: str
    role: str # "professor" or "ta"

class UserInDB(BaseModel):
    email: str
    hashed_password: str
    full_name: str
    role: str
    assigned_exams: List[str] = [] # List of exam_ids they are allowed to see

class Token(BaseModel):
    access_token: str
    token_type: str

class TokenData(BaseModel):
    email: Optional[str] = None
    role: Optional[str] = None