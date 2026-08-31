import os
from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware # <-- 1. New import
from fastapi.staticfiles import StaticFiles
from core.database import ping_database
from api.routes import exams, auth, team, attendance

@asynccontextmanager
async def lifespan(app: FastAPI):
    if await ping_database():
        print("✅ Successfully connected to MongoDB Atlas!")
    else:
        print("❌ Database connection failed. Please check your MONGODB_URL configuration.")
    yield
    print("Shutting down GRADEOPS API...")

app = FastAPI(title="GRADEOPS API (MongoDB)", version="1.0", lifespan=lifespan)

# --- DYNAMIC PRODUCTION CORS CONFIGURATION ---
raw_origins = os.getenv(
    "CORS_ORIGINS", 
    "http://localhost:5173,http://localhost:5174,http://localhost:5175,http://127.0.0.1:5173,http://127.0.0.1:5174,http://127.0.0.1:5175"
)
cors_origins = [origin.strip() for origin in raw_origins.split(",") if origin.strip()]

app.add_middleware(
    CORSMiddleware,
    allow_origins=cors_origins,
    allow_origin_regex=r"https://.*\.vercel\.app",  # Automatically permit all Vercel preview & production deployments
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
# --------------------------------------------
# --- STATIC FILES BLOCK ---
# Create an absolute path to your crops directory
CROP_DIR = os.path.join(os.path.dirname(__file__), "data", "crops")
os.makedirs(CROP_DIR, exist_ok=True) # Ensure the folder exists to prevent crashes

# Serve the folder to the web at the /api/crops URL
app.mount("/api/crops", StaticFiles(directory=CROP_DIR), name="crops")
app.include_router(auth.router, prefix="/api/auth", tags=["Authentication"])
app.include_router(exams.router, prefix="/api/exams", tags=["Exams"])
app.include_router(team.router, prefix="/api/team", tags=["Team Analytics"])
app.include_router(attendance.router, prefix="/api/attendance", tags=["Attendance"])

@app.get("/healthz", tags=["Health"])
async def health_check():
    """Cloud Orchestrator (Render/K8s) Health Probe"""
    return {
        "status": "healthy",
        "service": "gradeops-api"
    }

@app.get("/")
async def read_root():
    return {
        "status": "GRADEOPS Backend is running!",
        "engine": "MongoDB Async (Motor)",
        "service": "gradeops-api"
    }


if __name__ == "__main__":
    import uvicorn
    port = int(os.getenv("PORT", "8000"))
    uvicorn.run("main:app", host="0.0.0.0", port=port, reload=True)