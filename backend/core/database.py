# backend/core/database.py
import os
from motor.motor_asyncio import AsyncIOMotorClient
from dotenv import load_dotenv

load_dotenv()

# Fallback to local MongoDB if Atlas URL is not specified
MONGODB_URL = os.getenv("MONGODB_URL", "mongodb://localhost:27017")

client = AsyncIOMotorClient(MONGODB_URL)
db = client.get_default_database() # Automatically targets the database specified in the URL string

# Helper to verify connection health
async def ping_database():
    try:
        await db.command("ping")
        return True
    except Exception:
        return False