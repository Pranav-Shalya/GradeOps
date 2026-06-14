# backend/ml_pipeline/vision/extractor.py
import os
import fitz  # PyMuPDF
from PIL import Image
import io
import base64
from google import genai
from groq import Groq
from dotenv import load_dotenv

# Load environment variables
load_dotenv()

class VisionExtractor:
    def __init__(self):
        # Initialize the new Gemini Client
        self.gemini_client = genai.Client()
        
        # Initialize the Groq Client for fallback
        self.groq_client = Groq(api_key=os.getenv("GROQ_API_KEY"))
        
        self.crop_dir = os.path.join(
            os.path.dirname(os.path.dirname(os.path.dirname(__file__))), 
            "data", "crops"
        )
        os.makedirs(self.crop_dir, exist_ok=True)

    def process_pdf_submission(self, pdf_path: str, submission_id: str, bounding_boxes: dict):
        """
        Opens a PDF, extracts specific answer regions as images, and calls the Cloud VLM.
        bounding_boxes format: {"1a": (x0, y0, x1, y1, page_num)}
        """
        print(f"Processing PDF: {pdf_path}")
        doc = fitz.open(pdf_path)
        total_pages = doc.page_count # Get the total pages in the file
        extracted_data = []

        for question_num, bbox_info in bounding_boxes.items():
            x0, y0, x1, y1, page_num = bbox_info
            
            # --- DEFENSIVE VALIDATION ---
            # Ensure the requested page index exists in this specific PDF
            if page_num >= total_pages or page_num < 0:
                print(f"⚠️ Warning: Question {question_num} requested page index {page_num}, "
                      f"but the PDF only has {total_pages} page(s) (0-indexed). Skipping extraction.")
                continue
            # ----------------------------

            page = doc.load_page(page_num)
            pix = page.get_pixmap(matrix=fitz.Matrix(2, 2))
            img = Image.open(io.BytesIO(pix.tobytes("png")))

            crop_box = (x0 * 2, y0 * 2, x1 * 2, y1 * 2)
            cropped_img = img.crop(crop_box)

            crop_filename = f"{submission_id}_q{question_num}.png"
            crop_filepath = os.path.join(self.crop_dir, crop_filename)
            cropped_img.save(crop_filepath)

            print(f"Sending Q{question_num} crop to Cloud VLM for transcription...")
            transcribed_text = self._cloud_vlm_transcription(cropped_img)

            extracted_data.append({
                "question_number": question_num,
                "crop_image_path": crop_filepath,
                "transcribed_text": transcribed_text
            })

        doc.close()
        return extracted_data
    
    
    def _cloud_vlm_transcription(self, image: Image.Image) -> str:
        """
        Sends the cropped image to Gemini. Falls back to Groq if rate limits are hit.
        """
        prompt = (
            "You are an expert OCR system for handwritten academic exams. "
            "Transcribe the handwritten text in this image exactly as written. "
            "If there are mathematical formulas, transcribe them cleanly. "
            "Do not add any conversational filler. Just return the text."
        )
        
        # --- ATTEMPT 1: Primary Engine (Gemini 2.5 Flash) ---
        try:
            print("🟢 Attempting primary engine: Gemini 2.5 Flash...")
            response = self.gemini_client.models.generate_content(
                model='gemini-2.5-flash',
                contents=[prompt, image]
            )
            return response.text.strip()
            
        except Exception as e:
            error_msg = str(e)
            if "429" in error_msg or "RESOURCE_EXHAUSTED" in error_msg:
                print(f"⚠️ Gemini Rate Limit Hit! Rerouting to Groq fallback...")
            else:
                print(f"⚠️ Gemini Error: {error_msg}. Rerouting to Groq fallback...")

        # --- ATTEMPT 2: Fallback Engine (Groq Llama 3.2 Vision) ---
        try:
            print("🟠 Firing fallback engine: Groq (Llama 3.2 Vision)...")
            
            # Convert the PIL Image to a base64 string in memory for Groq
            buffered = io.BytesIO()
            image.save(buffered, format="PNG")
            base64_image = base64.b64encode(buffered.getvalue()).decode('utf-8')
            
            chat_completion = self.groq_client.chat.completions.create(
                messages=[
                    {
                        "role": "user",
                        "content": [
                            {"type": "text", "text": prompt},
                            {
                                "type": "image_url",
                                "image_url": {
                                    "url": f"data:image/png;base64,{base64_image}",
                                },
                            },
                        ],
                    }
                ],
                model="meta-llama/llama-4-scout-17b-16e-instruct",
                temperature=0.1, # Keep it low for strict OCR
            )
            
            return chat_completion.choices[0].message.content.strip()

        except Exception as groq_error:
            print(f"❌ Critical Failure: Both Gemini and Groq engines failed.")
            print(f"Groq Error: {str(groq_error)}")
            return "ERROR_IN_TRANSCRIPTION"