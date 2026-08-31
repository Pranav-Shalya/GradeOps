import os
import zipfile
from fpdf import FPDF

# Ensure output directory exists
root_dir = os.path.dirname(os.path.abspath(__file__))
output_dir = os.path.join(root_dir, "mock_exams")
os.makedirs(output_dir, exist_ok=True)

questions = {
    "Q1": "State the First Law of Thermodynamics.",
    "Q2": "Define mechanical stress.",
    "Q3": "Explain Bernoulli's Principle.",
    "Q4": "What is the function of a PID Controller?"
}

students = {
    "Student_A.pdf": {
        "name": "Student A (Standard Correct Answers)",
        "roll_number": "STU_A_001",
        "answers": {
            "Q1": "The first law of thermodynamics states that energy cannot be created or destroyed, only transformed from one form to another. The general equation is dQ = dU + dW.",
            "Q2": "Stress is the internal restoring force per unit area of a material subjected to external loads. The formula is Sigma = F / A.",
            "Q3": "Bernoulli's principle states that for an inviscid flow, an increase in the speed of the fluid occurs simultaneously with a decrease in static pressure.",
            "Q4": "A PID controller continuously calculates an error value as the difference between a desired setpoint and a measured process variable, applying proportional, integral, and derivative terms to correct the system."
        }
    },
    "Student_B.pdf": {
        "name": "Student B (High Similarity / Plagiarized from Student A)",
        "roll_number": "STU_B_002",
        "answers": {
            "Q1": "The 1st law of thermodynamics states that energy can't be created or destroyed, just transformed from one form to another form. The equation is dQ = dU + dW.",
            "Q2": "Stress is defined as the internal restoring force per unit area of a material under external loads. Formula is Sigma = F/A.",
            "Q3": "Bernoulli's principle says that for inviscid flow, an increase in fluid speed happens simultaneously with a decrease in static pressure.",
            "Q4": "A PID controller constantly calculates an error value as the difference between the desired setpoint and the measured process variable, using proportional, integral, and derivative parts."
        }
    },
    "Student_C.pdf": {
        "name": "Student C (Completely Incorrect Answers)",
        "roll_number": "STU_C_003",
        "answers": {
            "Q1": "Thermodynamics is about how thermometers work and measure the heat of the sun. Energy is always lost to the void.",
            "Q2": "Stress is when a machine gets too hot and stops working because of high friction.",
            "Q3": "Bernoulli's principle is the rule that heavier liquids will always sink to the bottom of a container.",
            "Q4": "PID stands for Pressure Internal Device, which stops pipes from exploding when water is moving too fast inside them."
        }
    }
}

generated_pdf_paths = []

for filename, data in students.items():
    pdf = FPDF()
    pdf.set_auto_page_break(auto=True, margin=15)
    pdf.add_page()
    
    # Title / Header
    pdf.set_font("Arial", 'B', 16)
    pdf.cell(0, 10, "GradeOps Engineering Examination", ln=True, align='C')
    
    pdf.set_font("Arial", 'B', 12)
    pdf.cell(0, 8, f"Student: {data['name']} | Roll No: {data['roll_number']}", ln=True, align='C')
    pdf.ln(5)
    
    # Draw line separator
    pdf.line(10, pdf.get_y(), 200, pdf.get_y())
    pdf.ln(8)
    
    # Render Questions & Answers
    for q_key, q_text in questions.items():
        # Question Header
        pdf.set_font("Arial", 'B', 12)
        pdf.set_text_color(30, 41, 59)
        pdf.multi_cell(0, 7, f"{q_key}: {q_text}")
        pdf.ln(2)
        
        # Student Answer
        ans_text = data["answers"].get(q_key, "")
        pdf.set_font("Arial", '', 11)
        pdf.set_text_color(51, 65, 85)
        pdf.multi_cell(0, 6, f"Answer: {ans_text}")
        pdf.ln(8)

    file_path = os.path.join(output_dir, filename)
    pdf.output(file_path)
    generated_pdf_paths.append((filename, file_path))
    print(f"Generated PDF: {file_path}")

# Package into ZIP files
zip_in_root = os.path.join(root_dir, "mock_exams.zip")
zip_in_folder = os.path.join(output_dir, "mock_exams.zip")

for zip_path in [zip_in_root, zip_in_folder]:
    with zipfile.ZipFile(zip_path, "w", zipfile.ZIP_DEFLATED) as zipf:
        for fname, fpath in generated_pdf_paths:
            zipf.write(fpath, arcname=fname)
    print(f"Created ZIP archive: {zip_path}")

print("\nMock exams creation and ZIP packaging completed successfully!")
