# backend/ml_pipeline/grading/rubric_agent.py
import os
import json
from typing import List, Dict, Any
from pydantic import BaseModel, Field
from dotenv import load_dotenv

load_dotenv()

# Define structured Pydantic schemas for the Rubric Generator
class RubricStep(BaseModel):
    description: str = Field(description="Objective requirement or condition the student must satisfy to earn these points")
    points: float = Field(description="Point value allocated to this step")

class GeneratedQuestionRubric(BaseModel):
    question_number: str = Field(description="The question identifier (e.g., '1', '1a', 'Q1', '2')")
    max_score: float = Field(description="Total maximum score for this question (sum of step points)")
    criteria_steps: Dict[str, RubricStep] = Field(description="Granular step-by-step grading criteria mapped to step_1, step_2, etc.")

class RubricListResponse(BaseModel):
    rubrics: List[GeneratedQuestionRubric] = Field(description="List of rubric criteria for all questions")


async def generate_rubric_from_key(exam_text: str, answer_key_text: str) -> List[Dict[str, Any]]:
    """
    Agentic JSON Rubric Generator:
    Takes the raw text from an un-graded exam and the professor's answer key,
    and produces a strict, granular partial-credit JSON grading rubric.
    """
    api_key = os.getenv("GEMINI_API_KEY") or os.getenv("GOOGLE_API_KEY")

    prompt = f"""
    You are an expert university professor, academic evaluator, and strict exam architect.
    Your task is to analyze the provided Blank Exam and the Professor's Official Answer Key,
    and construct a rigorous, granular, partial-credit JSON grading rubric.

    --- INSTRUCTIONS ---
    1. Identify every individual question or sub-question from the Blank Exam.
    2. Map each question to its corresponding solution, derivations, equations, and explanations in the Answer Key.
    3. Break down each question's evaluation into granular, objective criteria steps (e.g., 'step_1', 'step_2', 'step_3').
    4. Allocate partial-credit points to each step such that the sum of the step points equals the 'max_score' for that question.
    5. Each step description must be specific, objective, and testable (e.g., "State the conservation of energy law", "Apply Bernoulli equation with correct density term").

    --- BLANK EXAM CONTENT ---
    {exam_text}

    --- PROFESSOR'S OFFICIAL ANSWER KEY ---
    {answer_key_text}

    Generate the complete structured rubric for all questions in the exam.
    """

    # --- ATTEMPT 1: Google GenAI Client (gemini-2.5-flash) ---
    try:
        from google import genai
        client = genai.Client(api_key=api_key) if api_key else genai.Client()
        
        print("🟢 Rubric Agent: Invoking Gemini structured rubric generator...")
        response = client.models.generate_content(
            model='gemini-2.5-flash',
            contents=prompt,
            config={
                "response_mime_type": "application/json",
                "response_schema": RubricListResponse,
                "temperature": 0.2
            }
        )
        
        parsed = RubricListResponse.model_validate_json(response.text)
        return [q.model_dump() for q in parsed.rubrics]

    except Exception as gemini_err:
        print(f"⚠️ Google GenAI Client notice: {gemini_err}. Attempting fallback...")

    # --- ATTEMPT 2: google.generativeai legacy package ---
    try:
        import google.generativeai as legacy_genai
        if api_key:
            legacy_genai.configure(api_key=api_key)
            
        model = legacy_genai.GenerativeModel(
            model_name="gemini-1.5-flash",
            generation_config={"response_mime_type": "application/json"}
        )
        
        formatted_prompt = prompt + "\nOutput JSON matching format: {\"rubrics\": [{\"question_number\": \"1\", \"max_score\": 10, \"criteria_steps\": {\"step_1\": {\"description\": \"...\", \"points\": 5}}}]}"
        response = model.generate_content(formatted_prompt)
        
        data = json.loads(response.text)
        if isinstance(data, dict) and "rubrics" in data:
            return data["rubrics"]
        elif isinstance(data, list):
            return data
            
    except Exception as legacy_err:
        print(f"⚠️ google.generativeai notice: {legacy_err}. Attempting Groq fallback...")

    # --- ATTEMPT 3: Groq GPT-OSS 120B Fallback ---
    try:
        from groq import Groq
        groq_client = Groq(api_key=os.getenv("GROQ_API_KEY"))
        
        schema_json = json.dumps(RubricListResponse.model_json_schema(), indent=2)
        system_prompt = f"You are a strict academic evaluator. Output valid JSON matching this schema:\n{schema_json}"
        
        groq_model = os.getenv("GROQ_TEXT_MODEL", "openai/gpt-oss-120b")
        chat_completion = groq_client.chat.completions.create(
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": prompt}
            ],
            model=groq_model,
            temperature=0.2,
            response_format={"type": "json_object"}
        )
        
        groq_data = json.loads(chat_completion.choices[0].message.content)
        if "rubrics" in groq_data:
            return groq_data["rubrics"]
        return [groq_data]

    except Exception as groq_err:
        print(f"❌ Critical Failure: All rubric generation engines failed. Error: {groq_err}")
        # Default minimal fallback
        return [
            {
                "question_number": "1",
                "max_score": 10.0,
                "criteria_steps": {
                    "step_1": {
                        "description": "Student provided correct core reasoning and equations based on answer key.",
                        "points": 10.0
                    }
                }
            }
        ]
