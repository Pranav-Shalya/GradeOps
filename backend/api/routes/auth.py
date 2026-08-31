import secrets
import string
from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.security import OAuth2PasswordRequestForm
from core.database import db
from core.security import get_password_hash, verify_password, create_access_token
from models.auth import UserCreate
from models.documents import UserRole
from api.dependencies import get_current_user

router = APIRouter()

def generate_access_code(length: int = 6) -> str:
    """Generates a random uppercase alphanumeric access code for instructors."""
    alphabet = string.ascii_uppercase + string.digits
    # Remove ambiguous characters like 0/O, 1/I if desired, or standard alphanumeric
    return ''.join(secrets.choice(alphabet) for _ in range(length))


@router.post("/register", status_code=status.HTTP_201_CREATED)
async def register_user(user: UserCreate):
    """Creates a new Instructor or TA account with access code linking."""
    # 1. Check if the email already exists
    existing_user = await db["users"].find_one({"email": user.email.lower()})
    if existing_user:
        raise HTTPException(status_code=400, detail="Email already registered")

    # 2. Hash the password
    hashed_password = get_password_hash(user.password)
    
    # 3. Prepare user record
    user_dict = user.model_dump()
    user_dict["email"] = user.email.lower()
    user_dict["hashed_password"] = hashed_password
    del user_dict["password"]
    user_dict["assigned_exams"] = []

    # 4. Multi-tenancy & Instructor-TA linking logic
    raw_role = str(user.role).upper()
    is_instructor = raw_role in ["PROFESSOR", "INSTRUCTOR"]

    if is_instructor:
        user_dict["role"] = UserRole.INSTRUCTOR.value
        # Generate unique 6-character uppercase access code for the Instructor
        while True:
            code = generate_access_code(6)
            conflict = await db["users"].find_one({"access_code": code})
            if not conflict:
                break
        user_dict["access_code"] = code
        user_dict["instructor_id"] = None
    else:
        user_dict["role"] = UserRole.TA.value
        # TA registration strictly requires a valid instructor access code
        if not user.access_code or not user.access_code.strip():
            raise HTTPException(
                status_code=400,
                detail="Instructor access code is required for Teaching Assistant registration."
            )

        submitted_code = user.access_code.strip().upper()
        instructor = await db["users"].find_one({
            "access_code": submitted_code,
            "role": {"$in": ["INSTRUCTOR", "PROFESSOR", "instructor", "professor"]}
        })

        if not instructor:
            raise HTTPException(
                status_code=400,
                detail="Invalid Instructor Code. Please verify the code provided by your professor."
            )

        user_dict["instructor_id"] = str(instructor["_id"])
        user_dict["access_code"] = None

    # 5. Save to MongoDB
    result = await db["users"].insert_one(user_dict)
    
    response_payload = {
        "message": f"Successfully created {user_dict['role']} account for {user_dict['email']}",
        "role": user_dict["role"],
        "user_id": str(result.inserted_id)
    }
    if user_dict.get("access_code"):
        response_payload["access_code"] = user_dict["access_code"]
    if user_dict.get("instructor_id"):
        response_payload["instructor_id"] = user_dict["instructor_id"]

    return response_payload


@router.post("/login")
async def login(form_data: OAuth2PasswordRequestForm = Depends()):
    """Authenticates a user and returns a secure JWT token with profile details."""
    user = await db["users"].find_one({"email": form_data.username.lower()})
    
    if not user or not verify_password(form_data.password, user["hashed_password"]):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect email or password",
            headers={"WWW-Authenticate": "Bearer"},
        )

    # Normalize role
    raw_role = str(user.get("role", "TA")).upper()
    role_val = UserRole.INSTRUCTOR.value if raw_role in ["PROFESSOR", "INSTRUCTOR"] else UserRole.TA.value

    # If the user is an INSTRUCTOR but doesn't have an access_code yet (legacy accounts), generate one now!
    access_code = user.get("access_code")
    if role_val == UserRole.INSTRUCTOR.value and not access_code:
        while True:
            code = generate_access_code(6)
            conflict = await db["users"].find_one({"access_code": code})
            if not conflict:
                break
        await db["users"].update_one({"_id": user["_id"]}, {"$set": {"access_code": code}})
        access_code = code

    # Generate JWT token
    access_token = create_access_token(
        data={"sub": user["email"], "role": role_val}
    )
    
    return {
        "access_token": access_token,
        "token_type": "bearer",
        "role": role_val,
        "user_id": str(user["_id"]),
        "full_name": user.get("full_name", ""),
        "email": user["email"],
        "access_code": access_code,
        "instructor_id": user.get("instructor_id")
    }


@router.get("/me")
async def get_current_user_profile(current_user: dict = Depends(get_current_user)):
    """Fetches the active user's profile, including access code and team affiliation."""
    return {
        "user_id": current_user.get("_id"),
        "email": current_user.get("email"),
        "full_name": current_user.get("full_name", ""),
        "role": current_user.get("role"),
        "access_code": current_user.get("access_code"),
        "instructor_id": current_user.get("instructor_id")
    }