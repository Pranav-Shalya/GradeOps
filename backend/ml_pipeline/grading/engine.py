# backend/ml_pipeline/grading/engine.py
import os
import json
from typing import List, Dict
from pydantic import BaseModel, Field
from google import genai
from groq import Groq
from dotenv import load_dotenv

load_dotenv()

# Define the exact JSON structure we want the AI to return
class StepEvaluation(BaseModel):
    step_id: str = Field(description="The key of the step from the rubric (e.g., 'step_1')")
    points_awarded: int = Field(description="Points awarded for this specific step")
    criterion_met: bool = Field(description="True if the student completely fulfilled this step's condition, otherwise False")

class EvaluationResult(BaseModel):
    total_score: int = Field(description="The cumulative score awarded for the entire question")
    justification: str = Field(description="Detailed, objective explanation of where points were awarded or deducted based strictly on the rubric.")
    step_breakdown: List[StepEvaluation] = Field(description="Breakdown of performance on each individual rubric step")

class GradingEngine:
    def __init__(self):
        # Initialize primary and fallback clients
        self.gemini_client = genai.Client()
        self.groq_client = Groq(api_key=os.getenv("GROQ_API_KEY"))

    async def evaluate_answer(self, transcribed_text: str, rubric: Dict) -> EvaluationResult:
        """
        Evaluates a transcribed student answer against a specific question's rubric.
        Fails over to Groq Llama 3.3 if Gemini hits a rate limit.
        """
        
        prompt = f"""
        You are an expert academic evaluator. Grade the following student answer based strictly on the provided rubric. 
        Be fair but rigorous. Award partial credit only if the specific step conditions are explicitly met.

        --- RUBRIC CRITERIA ---
        Max Score: {rubric.get('max_score')}
        Steps Breakdown:
        {json.dumps(rubric.get('criteria_steps'), indent=2)}

        --- STUDENT TRANSCRIBED ANSWER ---
        {transcribed_text}
        """

        # --- ATTEMPT 1: Primary Engine (Gemini 2.5 Flash) ---
        try:
            print("🟢 Grading Engine: Attempting Gemini 2.5 Flash...")
            
            # We call the model forcing a structured JSON output matching our Pydantic schema
            response = self.gemini_client.models.generate_content(
                model='gemini-2.5-flash',
                contents=prompt,
                config={
                    "response_mime_type": "application/json",
                    "response_schema": EvaluationResult,
                    "temperature": 0.1 # Low temperature ensures deterministic, objective grading
                }
            )
            
            # The SDK automatically parses the JSON into our Pydantic model instance
            return EvaluationResult.model_validate_json(response.text)
            
        except Exception as e:
            error_msg = str(e)
            if "429" in error_msg or "RESOURCE_EXHAUSTED" in error_msg:
                print("⚠️ Gemini Rate Limit Hit! Rerouting grading to Groq...")
            else:
                print(f"⚠️ Gemini Error: {error_msg}. Rerouting grading to Groq...")

        # --- ATTEMPT 2: Fallback Engine (Groq Llama 3.3 70B) ---
        try:
            print("🟠 Grading Engine: Firing fallback engine: Groq (Llama 3.3 70B)...")
            
            # Groq needs the Pydantic schema injected into the system prompt to enforce structure
            schema_json = json.dumps(EvaluationResult.model_json_schema(), indent=2)
            
            system_prompt = f"""
            You are a strict academic grader. You must output valid JSON. 
            Your response MUST strictly adhere to the following JSON schema:
            {schema_json}
            """

            chat_completion = self.groq_client.chat.completions.create(
                messages=[
                    {"role": "system", "content": system_prompt},
                    {"role": "user", "content": prompt}
                ],
                model="llama-3.3-70b-versatile",
                temperature=0.1,
                response_format={"type": "json_object"}
            )
            
            # Parse Groq's JSON string back into our Pydantic model so the rest of your app doesn't break
            return EvaluationResult.model_validate_json(chat_completion.choices[0].message.content)

        except Exception as groq_error:
            print(f"❌ Critical Failure: Both grading engines failed. Groq Error: {groq_error}")
            
            # Fallback safe structure in case of total failure
            return EvaluationResult(
                total_score=0,
                justification="AI Grading Pipeline Failed due to server exhaustion. Requires manual TA review.",
                step_breakdown=[]
            )