# backend/api/routes/team.py
from fastapi import APIRouter, Depends, HTTPException, status
from bson import ObjectId
from core.database import db
from api.dependencies import RoleChecker

router = APIRouter()

@router.get("/activity")
async def get_team_activity(current_user: dict = Depends(RoleChecker(["INSTRUCTOR"]))):
    """
    INSTRUCTOR ONLY: Team Activity Analytics.
    Fetches all Teaching Assistants linked to the current professor and aggregates
    their grading verification throughput across all owned exams.
    """
    instructor_id = str(current_user.get("_id"))
    instructor_email = current_user.get("email")

    # 1. Query users collection for all TAs linked to this instructor
    tas = await db["users"].find({
        "instructor_id": instructor_id,
        "role": {"$in": ["TA", "ta"]}
    }).to_list(length=200)

    # 2. Fetch all exams owned by this instructor
    exams = await db["exams"].find({
        "$or": [{"created_by": instructor_id}, {"created_by": instructor_email}]
    }).to_list(length=500)
    
    exam_ids = [e["_id"] for e in exams]

    # 3. Fetch submissions across these exams
    submissions = []
    if exam_ids:
        submissions = await db["submissions"].find({
            "exam_id": {"$in": exam_ids}
        }).to_list(length=5000)

    team_members = []
    total_team_reviews = 0

    for ta in tas:
        ta_id = str(ta["_id"])
        ta_email = ta.get("email")
        
        reviews_count = 0
        verified_submissions = 0

        for sub in submissions:
            sub_verified_by_ta = False
            grades = sub.get("grades", {})
            for q_key, q_data in grades.items():
                if isinstance(q_data, dict):
                    rev = q_data.get("reviewed_by")
                    rev_email = q_data.get("reviewer_email")
                    if (rev and rev in [ta_id, ta_email]) or (rev_email and rev_email == ta_email):
                        reviews_count += 1
                        sub_verified_by_ta = True
            
            if sub_verified_by_ta:
                verified_submissions += 1

        total_team_reviews += reviews_count

        team_members.append({
            "ta_id": ta_id,
            "full_name": ta.get("full_name", "Teaching Assistant"),
            "email": ta_email,
            "reviews_completed": reviews_count,
            "submissions_verified": verified_submissions,
            "status": "Active" if reviews_count > 0 else "Joined"
        })

    # Sort TAs by review volume descending
    team_members.sort(key=lambda x: x["reviews_completed"], reverse=True)

    return {
        "access_code": current_user.get("access_code"),
        "total_tas": len(team_members),
        "total_reviews_completed": total_team_reviews,
        "team_members": team_members
    }
