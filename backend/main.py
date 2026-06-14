import os
from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware # <-- 1. New import
from fastapi.staticfiles import StaticFiles
from core.database import ping_database
from api.routes import exams, auth 

@asynccontextmanager
async def lifespan(app: FastAPI):
    if await ping_database():
        print("✅ Successfully connected to MongoDB Atlas!")
    else:
        print("❌ Database connection failed. Please check your MONGODB_URL configuration.")
    yield
    print("Shutting down GRADEOPS API...")

app = FastAPI(title="GRADEOPS API (MongoDB)", version="1.0", lifespan=lifespan)

# --- 2. ADD THIS CORS CONFIGURATION BLOCK ---
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173", 
        "http://127.0.0.1:5173",
        "http://localhost:5174", # <-- Add this line
        "http://127.0.0.1:5174"  # <-- And this line
    ],
    allow_credentials=True,
    allow_methods=["*"], # Allow all HTTP methods (GET, POST, etc.)
    allow_headers=["*"], # Allow all headers
)
# --------------------------------------------
# --- 3. ADD THIS STATIC FILES BLOCK ---
# Create an absolute path to your crops directory
CROP_DIR = os.path.join(os.path.dirname(__file__), "data", "crops")
os.makedirs(CROP_DIR, exist_ok=True) # Ensure the folder exists to prevent crashes

# Serve the folder to the web at the /api/crops URL
app.mount("/api/crops", StaticFiles(directory=CROP_DIR), name="crops")
app.include_router(auth.router, prefix="/api/auth", tags=["Authentication"])
app.include_router(exams.router, prefix="/api/exams", tags=["Exams"])

@app.get("/")
async def read_root():
    return {
        "status": "GRADEOPS Backend is running!",
        "engine": "MongoDB Async (Motor)"
    }


# app.include_router(exams.router, prefix="/api/exams", tags=["Exams"])