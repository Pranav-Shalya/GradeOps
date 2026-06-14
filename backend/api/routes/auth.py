# backend/api/routes/auth.py
from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.security import OAuth2PasswordRequestForm
from core.database import db
from core.security import get_password_hash, verify_password, create_access_token
from models.auth import UserCreate

router = APIRouter()

@router.post("/register", status_code=status.HTTP_201_CREATED)
async def register_user(user: UserCreate):
    """Creates a new Professor or TA account."""
    # 1. Check if the email already exists
    existing_user = await db["users"].find_one({"email": user.email})
    if existing_user:
        raise HTTPException(status_code=400, detail="Email already registered")

    # 2. Hash the password (NEVER save plain text passwords!)
    hashed_password = get_password_hash(user.password)
    
    # 3. Prepare the database document
    user_dict = user.model_dump()
    user_dict["hashed_password"] = hashed_password
    del user_dict["password"] # Remove the plain text password from memory
    user_dict["assigned_exams"] = [] # Default to no access

    # 4. Save to MongoDB
    await db["users"].insert_one(user_dict)
    
    return {"message": f"Successfully created {user.role} account for {user.email}"}


@router.post("/login")
async def login(form_data: OAuth2PasswordRequestForm = Depends()):
    """Authenticates a user and returns a secure JWT token."""
    # Note: OAuth2 strictly expects the field to be called 'username', so we map email to username here.
    user = await db["users"].find_one({"email": form_data.username})
    
    if not user or not verify_password(form_data.password, user["hashed_password"]):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect email or password",
            headers={"WWW-Authenticate": "Bearer"},
        )

    # Generate the cryptographic token
    access_token = create_access_token(
        data={"sub": user["email"], "role": user["role"]}
    )
    
    return {"access_token": access_token, "token_type": "bearer"}