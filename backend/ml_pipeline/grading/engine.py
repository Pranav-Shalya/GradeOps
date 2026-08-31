# backend/ml_pipeline/grading/engine.py
import os
import io
import json
import base64
from typing import List, Dict, Optional
from PIL import Image
from pydantic import BaseModel, Field
from google import genai
from groq import Groq
from dotenv import load_dotenv
from ml_pipeline.grading.similarity import get_embedding, compute_cosine_similarity

load_dotenv()

# --- STEP & EVALUATION SCHEMAS ---

class StepScore(BaseModel):
    step_id: str = Field(description="The key of the step from the rubric (e.g., 'step_1')")
    criterion_met: bool = Field(description="True if the student completely fulfilled this step's condition, otherwise False")
    points_awarded: float = Field(description="Points awarded for this specific step")
    comment: str = Field(default="", description="Brief evaluation comment for this specific step")

class StepEvaluation(BaseModel):
    step_id: str = Field(description="The key of the step from the rubric (e.g., 'step_1')")
    points_awarded: int = Field(description="Points awarded for this specific step")
    criterion_met: bool = Field(description="True if the student completely fulfilled this step's condition, otherwise False")

class EvaluationResult(BaseModel):
    total_score: float = Field(default=0.0, description="The cumulative score awarded for the entire question")
    justification: str = Field(default="", description="Detailed, objective explanation of where points were awarded or deducted.")
    step_breakdown: List[StepEvaluation] = Field(default_factory=list, description="Breakdown of performance on each individual rubric step")
    status: str = Field(default="ai_graded", description="Evaluation status: 'fast_exit' or 'ai_graded'")
    similarity_score: float = Field(default=0.0, description="Cosine similarity score against the reference key")
    tokens_used: int = Field(default=0, description="Total LLM tokens consumed for this evaluation")

class UnifiedGradingResult(BaseModel):
    transcribed_text: str = Field(default="", description="Precise transcription of handwriting, equations (formatted in LaTeX), and diagrams")
    total_score: float = Field(default=0.0, description="The cumulative score awarded for the entire question")
    max_score: float = Field(default=10.0, description="The maximum possible points for this question")
    step_breakdown: List[StepScore] = Field(default_factory=list, description="Step-by-step scoring breakdown based on the rubric")
    justification: str = Field(default="", description="Detailed, objective explanation of where points were awarded or deducted.")
    is_blank_or_unattempted: bool = Field(default=False, description="True if the crop is empty, blank, or scribbled out")


class GradingEngine:
    def __init__(self):
        # Initialize primary and fallback clients
        self.gemini_client = genai.Client()
        self.groq_client = Groq(api_key=os.getenv("GROQ_API_KEY"))

    # =========================================================================
    # MULTIMODAL COLLAPSE (Unified Single-Call Ingestion & Grading)
    # =========================================================================
    async def grade_crop_multimodal(
        self, 
        crop_image_path: str, 
        rubric_data: Dict, 
        answer_key_text: Optional[str] = None
    ) -> UnifiedGradingResult:
        """
        Multimodal Collapse: Evaluates a student's handwritten answer crop in a SINGLE
        atomic API call to Gemini 2.5 Flash, generating both LaTeX transcription and
        rubric step evaluations simultaneously (reducing API requests by 50%).
        """
        max_score = float(rubric_data.get('max_score', 10.0))
        criteria_steps = rubric_data.get('criteria_steps', {})

        if not os.path.exists(crop_image_path):
            return UnifiedGradingResult(
                transcribed_text="[Image not found]",
                total_score=0.0,
                max_score=max_score,
                step_breakdown=[],
                justification="Image crop file not found on disk.",
                is_blank_or_unattempted=True
            )

        try:
            image = Image.open(crop_image_path)
        except Exception as e:
            return UnifiedGradingResult(
                transcribed_text="[Image corrupted]",
                total_score=0.0,
                max_score=max_score,
                step_breakdown=[],
                justification=f"Failed to load image crop: {e}",
                is_blank_or_unattempted=True
            )

        ref_key = answer_key_text or rubric_data.get('reference_answer') or rubric_data.get('solution') or rubric_data.get('answer_key') or "Standard academic solution corresponding to the rubric criteria."

        prompt = f"""
You are an expert academic evaluator, mathematician, and OCR transcription engine for university-level engineering exams.

TASK:
1. Accurately transcribe all handwritten text, mathematical derivations (formatted in standard LaTeX, e.g. \\Delta U = Q - W), chemical formulas, and diagrams visible in the provided image into Markdown/LaTeX.
   - If the student's answer region is completely empty, blank, or scribbled out, set is_blank_or_unattempted = true, total_score = 0.0, and transcribed_text = "[BLANK / UNATTEMPTED]".
2. Compare the student's handwritten work step-by-step against the [REFERENCE ANSWER KEY].
   - Validate mathematical equivalence: If the student uses a different but scientifically sound method to reach the correct result, award full credit.
   - Detect direct contradictions to physical laws (e.g. stating energy is created/destroyed) or sign errors and penalize accordingly.
3. Strictly evaluate each criterion step in the [GRADING RUBRIC] and assign points adhering to the schema.
4. Output your response strictly following the JSON schema.

[REFERENCE ANSWER KEY]
{ref_key}

[GRADING RUBRIC]
Max Score: {max_score}
Criteria Steps:
{json.dumps(criteria_steps, indent=2)}
"""

        # --- ATTEMPT 1: Primary Multimodal Engine (Gemini) ---
        gemini_models = ["gemini-2.5-flash", "gemini-3.6-flash", "gemini-flash-latest", "gemini-2.0-flash"]
        for model_name in gemini_models:
            try:
                print(f"🟢 Grading Engine (Multimodal Collapse): Evaluating {os.path.basename(crop_image_path)} with {model_name}...")
                response = self.gemini_client.models.generate_content(
                    model=model_name,
                    contents=[image, prompt],
                    config={
                        "response_mime_type": "application/json",
                        "response_schema": UnifiedGradingResult,
                        "temperature": 0.1
                    }
                )
                return UnifiedGradingResult.model_validate_json(response.text)

            except Exception as e:
                error_msg = str(e)
                print(f"⚠️ Gemini {model_name} notice: {error_msg}. Trying next engine...")

        # --- ATTEMPT 2: Fallback Engine (Groq Vision / Text) ---
        try:
            buffered = io.BytesIO()
            image.save(buffered, format="PNG")
            img_b64 = base64.b64encode(buffered.getvalue()).decode("utf-8")
            
            schema_json = json.dumps(UnifiedGradingResult.model_json_schema(), indent=2)
            system_prompt = f"You are a strict academic evaluator. Output valid JSON matching this schema:\n{schema_json}"
            
            vision_model = os.getenv("GROQ_VISION_MODEL", "meta-llama/llama-4-scout-17b-16e-instruct")
            chat_completion = self.groq_client.chat.completions.create(
                messages=[
                    {"role": "system", "content": system_prompt},
                    {
                        "role": "user",
                        "content": [
                            {"type": "text", "text": prompt},
                            {"type": "image_url", "image_url": {"url": f"data:image/png;base64,{img_b64}"}}
                        ]
                    }
                ],
                model=vision_model,
                temperature=0.1,
                response_format={"type": "json_object"}
            )
            return UnifiedGradingResult.model_validate_json(chat_completion.choices[0].message.content)

        except Exception as groq_err:
            print(f"⚠️ Groq vision attempt failed: {groq_err}. Attempting Groq text reasoning fallback...")
            try:
                # Text-only Groq evaluation with default transcription placeholder
                text_model = os.getenv("GROQ_TEXT_MODEL", "openai/gpt-oss-120b")
                chat_completion = self.groq_client.chat.completions.create(
                    messages=[
                        {"role": "system", "content": "You are a strict academic evaluator. Output valid JSON."},
                        {"role": "user", "content": prompt}
                    ],
                    model=text_model,
                    temperature=0.1,
                    response_format={"type": "json_object"}
                )
                data = json.loads(chat_completion.choices[0].message.content)
                return UnifiedGradingResult(
                    transcribed_text=data.get("transcribed_text", "[Visual Transcription via Groq Fallback]"),
                    total_score=float(data.get("total_score", 0.0)),
                    max_score=max_score,
                    step_breakdown=[],
                    justification=data.get("justification", "Evaluated via Groq fallback engine."),
                    is_blank_or_unattempted=False
                )
            except Exception as final_err:
                print(f"❌ Critical Failure: All grading engines exhausted: {final_err}")
                return UnifiedGradingResult(
                    transcribed_text="[Extraction failed]",
                    total_score=0.0,
                    max_score=max_score,
                    step_breakdown=[],
                    justification="Multimodal AI Pipeline Failed due to rate limits or network issues. Requires manual review.",
                    is_blank_or_unattempted=False
                )

    # =========================================================================
    # DECOUPLED / TEXT-ONLY EVALUATION (Two-Stage Gatekeeper)
    # =========================================================================
    async def evaluate_answer(
        self, 
        transcribed_text: str, 
        rubric: Dict, 
        answer_key_text: Optional[str] = None,
        ref_embedding: Optional[List[float]] = None
    ) -> EvaluationResult:
        """
        Two-Stage Hybrid Evaluation:
        - Rule A: Fast-exits trivial or empty responses (< 3 words) with 0 pts and 0 tokens.
        - Rule B: Vector Gatekeeper evaluates cosine similarity against reference key.
                  If similarity < 0.40, fast-exits with 0 pts and 0 tokens.
        - Rule C: If similarity >= 0.40 (or rubric-only mode), executes deep NLI reasoning
                  via Gemini 2.5 Flash with failover to Groq.
        """
        clean_text = (transcribed_text or "").strip()
        words = clean_text.split()

        # RULE A: Trivial / Blank Response Detection
        if len(words) < 3:
            print(f"⚡ [Fast Exit] Blank or unattempted response ({len(words)} words < 3). Skipping LLM.")
            return EvaluationResult(
                total_score=0.0,
                justification="Fast Exit: Blank or unattempted response (< 3 words).",
                step_breakdown=[],
                status="fast_exit",
                similarity_score=0.0,
                tokens_used=0
            )

        ref_key = answer_key_text or rubric.get('reference_answer') or rubric.get('solution') or rubric.get('answer_key')
        similarity = 0.0

        # RULE B: Coarse Vector Gatekeeper
        if ref_key and len(ref_key.strip()) > 5:
            try:
                key_emb = ref_embedding if ref_embedding is not None else get_embedding(ref_key)
                student_emb = get_embedding(clean_text)
                similarity = compute_cosine_similarity(key_emb, student_emb)

                if similarity < 0.40:
                    print(f"⚡ [Fast Exit] Cosine similarity ({similarity:.3f}) < 0.40 against reference key. Skipping LLM.")
                    return EvaluationResult(
                        total_score=0.0,
                        justification=f"Fast Exit: Cosine similarity ({similarity:.2f}) < 0.40 against reference key. Off-topic or invalid answer.",
                        step_breakdown=[],
                        status="fast_exit",
                        similarity_score=round(similarity, 3),
                        tokens_used=0
                    )
            except Exception as gate_err:
                print(f"⚠️ Vector gatekeeper warning: {gate_err}. Passing through to Stage 2 NLI...")

        # RULE C: Stage 2 - Fine NLI Logical Reasoning & Rubric Evaluation
        effective_ref_key = ref_key or "Standard academic solution corresponding to the rubric criteria."
        
        prompt = f"""
        You are an expert academic grader evaluating a student's answer.

        [REFERENCE ANSWER KEY]
        {effective_ref_key}

        [GRADING RUBRIC]
        Max Score: {rubric.get('max_score')}
        Steps Breakdown:
        {json.dumps(rubric.get('criteria_steps'), indent=2)}

        [STUDENT TRANSCRIPTION]
        {clean_text}

        EVALUATION INSTRUCTIONS:
        1. Compare the student's logic step-by-step against the REFERENCE ANSWER KEY.
        2. Check for mathematical equivalence. If the student uses a different but fundamentally correct method to reach the correct final value, treat it as equivalent to the key.
        3. Use the GRADING RUBRIC strictly to assign points based on your comparison. Do not invent penalty criteria outside the rubric.
        4. Output your final grading breakdown in the required JSON schema.
        """

        # --- ATTEMPT 1: Primary Engine (Gemini 2.5 Flash) ---
        try:
            print("🟢 Grading Engine: Stage 2 NLI - Attempting Gemini 2.5 Flash...")
            
            response = self.gemini_client.models.generate_content(
                model='gemini-2.5-flash',
                contents=prompt,
                config={
                    "response_mime_type": "application/json",
                    "response_schema": EvaluationResult,
                    "temperature": 0.1
                }
            )
            
            result = EvaluationResult.model_validate_json(response.text)
            result.status = "ai_graded"
            result.similarity_score = round(similarity, 3)
            
            if hasattr(response, "usage_metadata") and response.usage_metadata:
                result.tokens_used = getattr(response.usage_metadata, "total_token_count", 0) or 0
                
            return result
            
        except Exception as e:
            error_msg = str(e)
            if "429" in error_msg or "RESOURCE_EXHAUSTED" in error_msg:
                print("⚠️ Gemini Rate Limit Hit! Rerouting grading to Groq...")
            else:
                print(f"⚠️ Gemini Error: {error_msg}. Rerouting grading to Groq...")

        # --- ATTEMPT 2: Fallback Engine (Groq GPT-OSS 120B) ---
        try:
            print("🟠 Grading Engine: Firing fallback engine: Groq (openai/gpt-oss-120b)...")
            
            schema_json = json.dumps(EvaluationResult.model_json_schema(), indent=2)
            
            system_prompt = f"""
            You are a strict academic grader. You must output valid JSON. 
            Your response MUST strictly adhere to the following JSON schema:
            {schema_json}
            """

            groq_model = os.getenv("GROQ_TEXT_MODEL", "openai/gpt-oss-120b")
            chat_completion = self.groq_client.chat.completions.create(
                messages=[
                    {"role": "system", "content": system_prompt},
                    {"role": "user", "content": prompt}
                ],
                model=groq_model,
                temperature=0.1,
                response_format={"type": "json_object"}
            )
            
            result = EvaluationResult.model_validate_json(chat_completion.choices[0].message.content)
            result.status = "ai_graded"
            result.similarity_score = round(similarity, 3)
            if hasattr(chat_completion, "usage") and chat_completion.usage:
                result.tokens_used = getattr(chat_completion.usage, "total_tokens", 0) or 0
            return result

        except Exception as groq_error:
            print(f"❌ Critical Failure: Both grading engines failed. Groq Error: {groq_error}")
            
            return EvaluationResult(
                total_score=0.0,
                justification="AI Grading Pipeline Failed due to server exhaustion. Requires manual TA review.",
                step_breakdown=[],
                status="ai_graded",
                similarity_score=round(similarity, 3),
                tokens_used=0
            )