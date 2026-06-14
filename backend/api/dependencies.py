# backend/api/dependencies.py
import os
from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from jose import JWTError, jwt
from core.database import db

# This tells FastAPI where our login route is, enabling the visual "Authorize" button in Swagger UI!
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="api/auth/login")

SECRET_KEY = os.getenv("SECRET_KEY")
ALGORITHM = os.getenv("ALGORITHM", "HS256")

async def get_current_user(token: str = Depends(oauth2_scheme)):
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
    return user