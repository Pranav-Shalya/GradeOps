# backend/test_vision.py
import os
from ml_pipeline.vision.extractor import VisionExtractor

def run_test():
    # 1. Locate the uploads directory
    base_dir = os.path.dirname((__file__))
    upload_dir = os.path.join(base_dir, "data", "uploads")
    
    # 2. Find the first available PDF
    pdf_files = [f for f in os.listdir(upload_dir) if f.endswith(".pdf")]
    
    if not pdf_files:
        print("❌ No PDFs found. Please upload a test PDF via Swagger UI first!")
        return
    
    test_pdf_path = os.path.join(upload_dir, pdf_files[0])
    print(f"📄 Found test PDF: {pdf_files[0]}")

    # 3. Define a dummy bounding box
    # Format: (x0, y0, x1, y1, page_num)
    # We grab a large chunk of the top-left of the first page
    bounding_boxes = {
        "test_q1": (50, 50, 400, 400, 0) 
    }

    # 4. Run the Extractor
    print("🚀 Initializing Vision Extractor...")
    extractor = VisionExtractor()
    
    print("📸 Cropping PDF and sending to Gemini Vision API...")
    results = extractor.process_pdf_submission(
        pdf_path=test_pdf_path,
        submission_id="test_student_001",
        bounding_boxes=bounding_boxes
    )

    # 5. Output the results
    print("\n✅ --- EXTRACTION RESULTS --- ✅")
    for res in results:
        print(f"Question Number: {res['question_number']}")
        print(f"Saved Image Crop To: {res['crop_image_path']}")
        print("-" * 30)
        print("Extracted Text:\n")
        print(res['transcribed_text'])
        print("-" * 30)

if __name__ == "__main__":
    run_test()