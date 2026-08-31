# backend/ml_pipeline/grading/similarity.py
import os
import math
import asyncio
from typing import List, Dict, Any, Optional
from bson import ObjectId
from dotenv import load_dotenv
import google.generativeai as genai

# Load environment variables for Gemini API
load_dotenv()
api_key = os.getenv("GEMINI_API_KEY") or os.getenv("GOOGLE_API_KEY")
if api_key:
    genai.configure(api_key=api_key)


def compute_cosine_similarity(v1: List[float], v2: List[float]) -> float:
    """
    Computes the cosine similarity between two numeric vectors.
    Returns a value between -1.0 and 1.0 (or 0.0 if vectors are empty/zero).
    """
    if not v1 or not v2 or len(v1) != len(v2):
        return 0.0
    
    dot_product = sum(a * b for a, b in zip(v1, v2))
    norm_a = math.sqrt(sum(a * a for a in v1))
    norm_b = math.sqrt(sum(b * b for b in v2))
    
    if norm_a == 0 or norm_b == 0:
        return 0.0
        
    return dot_product / (norm_a * norm_b)


def get_embedding(text: str) -> List[float]:
    """
    Calls the Gemini Embedding API (models/text-embedding-004) to generate vector embeddings.
    """
    if not text or not text.strip():
        return []
        
    # Attempt 1: google.generativeai
    try:
        response = genai.embed_content(
            model="models/text-embedding-004",
            content=text.strip()
        )
        if isinstance(response, dict) and "embedding" in response:
            return response["embedding"]
    except Exception as e:
        print(f"⚠️ google.generativeai embedding error: {e}")

    # Attempt 2: google.genai fallback
    try:
        from google import genai as google_genai
        client = google_genai.Client(api_key=api_key) if api_key else google_genai.Client()
        res = client.models.embed_content(
            model="text-embedding-004",
            contents=text.strip()
        )
        if hasattr(res, "embedding") and res.embedding and hasattr(res.embedding, "values"):
            return list(res.embedding.values)
        if hasattr(res, "embeddings") and res.embeddings and len(res.embeddings) > 0:
            return list(res.embeddings[0].values)
    except Exception as e:
        print(f"⚠️ google.genai fallback error: {e}")

    return []


async def run_similarity_check(exam_id: str, db) -> Dict[str, Any]:
    """
    Runs cross-submission Plagiarism and Logic Similarity detection across an entire exam.
    
    Workflow:
    1. Fetches all submissions for the exam_id from MongoDB.
    2. Groups transcribed student answers by question number.
    3. Generates vector embeddings for each student answer using text-embedding-004.
    4. Computes pairwise cosine similarity for each question.
    5. Flags submissions exceeding similarity threshold 0.85 with similarity_matches.
    6. Persists updates back to MongoDB.
    """
    print(f"🔍 Starting cross-submission similarity check for Exam: {exam_id}")
    
    try:
        obj_id = ObjectId(exam_id)
    except Exception:
        print(f"❌ Invalid Exam ID: {exam_id}")
        return {"status": "error", "message": "Invalid Exam ID"}

    # a) Fetch all submissions for the given exam_id
    submissions = await db["submissions"].find({"exam_id": obj_id}).to_list(length=2000)
    if not submissions or len(submissions) < 2:
        print(f"ℹ️ Fewer than 2 submissions found for exam {exam_id}. No pairwise comparison needed.")
        return {"status": "skipped", "reason": "Insufficient submissions to compare", "total_submissions": len(submissions)}

    # b) Group transcribed student answers by question
    # Format: questions_map[q_key] = list of {"submission_id": sub_id, "text": transcribed_text}
    questions_map: Dict[str, List[Dict[str, str]]] = {}
    
    for sub in submissions:
        sub_id = sub.get("submission_id")
        grades = sub.get("grades", {})
        
        for q_key, q_data in grades.items():
            if not isinstance(q_data, dict):
                continue
                
            text = q_data.get("transcribed_text") or q_data.get("justification") or ""
            if text and len(text.strip()) > 5: # Only compare substantive answers
                if q_key not in questions_map:
                    questions_map[q_key] = []
                questions_map[q_key].append({
                    "submission_id": sub_id,
                    "text": text.strip()
                })

    total_flagged_pairs = 0
    updates_by_submission: Dict[str, Dict[str, Any]] = {
        sub.get("submission_id"): {} for sub in submissions
    }

    # Process each question group
    for q_key, answers_list in questions_map.items():
        if len(answers_list) < 2:
            continue
            
        print(f"📊 Question {q_key}: Computing embeddings for {len(answers_list)} student answers...")
        
        # c) Generate vector embeddings for all answers in this question
        embedded_answers = []
        for item in answers_list:
            emb = get_embedding(item["text"])
            if emb:
                embedded_answers.append({
                    "submission_id": item["submission_id"],
                    "embedding": emb
                })
            # Small cooldown between embedding requests
            await asyncio.sleep(0.05)

        # Initialize tracking for all participants in this question
        flags = {item["submission_id"]: False for item in embedded_answers}
        matches = {item["submission_id"]: set() for item in embedded_answers}
        max_scores = {item["submission_id"]: 0.0 for item in embedded_answers}

        # d) Compute pairwise cosine similarity
        n = len(embedded_answers)
        for i in range(n):
            for j in range(i + 1, n):
                sub_a = embedded_answers[i]["submission_id"]
                sub_b = embedded_answers[j]["submission_id"]
                emb_a = embedded_answers[i]["embedding"]
                emb_b = embedded_answers[j]["embedding"]
                
                sim_score = compute_cosine_similarity(emb_a, emb_b)
                
                # e) If cosine similarity exceeds 0.85, flag both submissions
                if sim_score >= 0.85:
                    total_flagged_pairs += 1
                    flags[sub_a] = True
                    flags[sub_b] = True
                    matches[sub_a].add(sub_b)
                    matches[sub_b].add(sub_a)
                    max_scores[sub_a] = max(max_scores[sub_a], round(sim_score, 4))
                    max_scores[sub_b] = max(max_scores[sub_b], round(sim_score, 4))
                    print(f"🚨 Similarity Alert! Q{q_key}: {sub_a} <-> {sub_b} (Score: {sim_score:.4f})")

        # Record updates for each submission
        for item in embedded_answers:
            s_id = item["submission_id"]
            if s_id not in updates_by_submission:
                updates_by_submission[s_id] = {}
                
            updates_by_submission[s_id][q_key] = {
                "similarity_flag": flags[s_id],
                "similarity_matches": sorted(list(matches[s_id])),
                "similarity_score": max_scores[s_id],
                "plagiarism_flag": flags[s_id]
            }

    # f) Persist updates back to MongoDB documents
    print("💾 Persisting similarity check results to MongoDB...")
    for sub_id, q_updates in updates_by_submission.items():
        if not q_updates:
            continue
            
        update_fields = {}
        for q_key, metrics in q_updates.items():
            update_fields[f"grades.{q_key}.similarity_flag"] = metrics["similarity_flag"]
            update_fields[f"grades.{q_key}.similarity_matches"] = metrics["similarity_matches"]
            update_fields[f"grades.{q_key}.similarity_score"] = metrics["similarity_score"]
            update_fields[f"grades.{q_key}.plagiarism_flag"] = metrics["plagiarism_flag"]

        if update_fields:
            await db["submissions"].update_one(
                {"exam_id": obj_id, "submission_id": sub_id},
                {"$set": update_fields}
            )

    print(f"✅ Similarity check complete for Exam {exam_id}. Total flagged pairs: {total_flagged_pairs}")
    return {
        "status": "completed",
        "exam_id": exam_id,
        "total_submissions_analyzed": len(submissions),
        "questions_analyzed": len(questions_map),
        "total_flagged_pairs": total_flagged_pairs
    }
