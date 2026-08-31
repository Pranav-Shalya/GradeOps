# backend/core/security.py
import os
import bcrypt
from datetime import datetime, timedelta
from typing import Optional, List
from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from dotenv import load_dotenv
from core.database import db

# Dual support for python-jose and PyJWT
try:
    from jose import JWTError, jwt
except ImportError:
    try:
        import jwt
        JWTError = getattr(jwt, "PyJWTError", Exception)
    except ImportError:
        jwt = None
        class JWTError(Exception):
            pass

load_dotenv()

SECRET_KEY = os.getenv("SECRET_KEY", "gradeops_super_secret_jwt_key_2026")
ALGORITHM = os.getenv("ALGORITHM", "HS256")
ACCESS_TOKEN_EXPIRE_MINUTES = int(os.getenv("ACCESS_TOKEN_EXPIRE_MINUTES", "1440"))

# OAuth2 Scheme for Swagger UI & Authorization Headers
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="api/auth/login")


def verify_password(plain_password: str, hashed_password: str) -> bool:
    """Checks if the typed password matches the database hash."""
    return bcrypt.checkpw(
        plain_password.encode('utf-8'), 
        hashed_password.encode('utf-8')
    )


def get_password_hash(password: str) -> str:
    """Turns a plain text password into a secure bcrypt hash."""
    salt = bcrypt.gensalt()
    hashed_bytes = bcrypt.hashpw(password.encode('utf-8'), salt)
    return hashed_bytes.decode('utf-8')


def create_access_token(data: dict, expires_delta: Optional[timedelta] = None):
    """Generates the secure JWT token for the user."""
    to_encode = data.copy()
    if expires_delta:
        expire = datetime.utcnow() + expires_delta
    else:
        expire = datetime.utcnow() + timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
        
    to_encode.update({"exp": expire})
    encoded_jwt = jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)
    return encoded_jwt


async def get_current_user(token: str = Depends(oauth2_scheme)) -> dict:
    """
    Acts as a bouncer. Intercepts the request, decrypts the token, 
    and checks if the user is real before letting them hit the database.
    """
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials. Please log in again.",
        headers={"WWW-Authenticate": "Bearer"},
    )
    
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        email: str = payload.get("sub")
        role_from_token: str = payload.get("role")
        if email is None:
            raise credentials_exception
    except JWTError:
        raise credentials_exception
        
    user = await db["users"].find_one({"email": email})
    if user is None:
        raise credentials_exception
        
    user["_id"] = str(user["_id"])
    
    if "role" not in user and role_from_token:
        user["role"] = role_from_token
        
    raw_role = str(user.get("role", "TA")).upper()
    user["role"] = "INSTRUCTOR" if raw_role in ["INSTRUCTOR", "PROFESSOR"] else "TA"
    
    return user


class RoleChecker:
    """
    Role-Based Access Control (RBAC) dependency.
    Validates that the authenticated user possesses one of the allowed roles.
    """
    def __init__(self, allowed_roles: List[str]):
        normalized = []
        for role in allowed_roles:
            r = str(role).upper()
            if r in ["INSTRUCTOR", "PROFESSOR"]:
                normalized.extend(["INSTRUCTOR", "PROFESSOR"])
            else:
                normalized.append(r)
        self.allowed_roles = list(set(normalized))

    def __call__(self, current_user: dict = Depends(get_current_user)) -> dict:
        user_role = str(current_user.get("role", "")).upper()
        if user_role not in self.allowed_roles:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Insufficient role permissions"
            )
        return current_user