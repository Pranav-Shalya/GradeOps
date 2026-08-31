# backend/api/dependencies.py
import os
from typing import List
from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from jose import JWTError, jwt
from core.database import db

# This tells FastAPI where our login route is, enabling the visual "Authorize" button in Swagger UI!
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="api/auth/login")

SECRET_KEY = os.getenv("SECRET_KEY")
ALGORITHM = os.getenv("ALGORITHM", "HS256")

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
        # Decrypt the token using our secret key
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        email: str = payload.get("sub")
        role_from_token: str = payload.get("role")
        if email is None:
            raise credentials_exception
    except JWTError:
        raise credentials_exception
        
    # Look up the user in the database to ensure their account hasn't been deleted
    user = await db["users"].find_one({"email": email})
    if user is None:
        raise credentials_exception
        
    # Convert MongoDB ObjectId to string before returning
    user["_id"] = str(user["_id"])
    
    # Ensure role is present and normalized
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
        # Normalize allowed roles to uppercase for consistency
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
                detail="Not enough permissions"
            )
        return current_user