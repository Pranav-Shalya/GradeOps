
import os
import pandas as pd
import numpy as np

os.makedirs("backend/test_data", exist_ok=True)

STUDENT_NAMES = [
    "Aarav Sharma", "Diya Patel", "Rohan Verma", "Ananya Iyer", "Kabir Singh",
    "Pooja Nair", "Arjun Bhatt", "Rhea Saxena", "Aditya Joshi", "Ishita Roy",
    "Siddharth Rao", "Meera Sen", "Varun Chopra", "Tanvi Kulkarni", "Harsh Mehta",
    "Sanya Kapoor", "Gaurav Das", "Sneha Menon", "Pranav Shalya", "Bhavna Jain",
    "Kunal Malhotra", "Divya Pillai", "Nikhil Sethi", "Kavya Pandey", "Yash Singhal",
    "Tara Deshmukh", "Ayush Agrawal", "Ritu Chawla", "Devansh Nanda", "Anika Kaur",
    "Manish Tiwari", "Simran Bedi", "Abhishek Hegde", "Priyanka Ghosh", "Karthik Raja",
    "Nisha Goel", "Alok Mishra", "Shweta Sundaram", "Vikram Rathore", "Pallavi Vyas",
    "Deepak Grover", "Shreya Dutta", "Sameer Kaul", "Anjali Bansal", "Tushar Ahuja",
    "Monika Reddy", "Mohit Chauhan", "Preeti Varma", "Suraj Narang", "Barkha Bisht"
]

NUM_STUDENTS = 50
BLOCK_SIZE = 10
TOTAL_CLASSES = 40

# Assign archetypes: 0-27 Safe (28), 28-39 Borderline (12), 40-49 Shortage (10)
records_40_days = []

for i in range(NUM_STUDENTS):
    roll = f"2024ME{i+1:02d}"
    name = STUDENT_NAMES[i]
    
    if i < 28:
        # Safe: ~82% P, ~10% L, ~8% A
        probs = [0.82, 0.10, 0.08]
    elif i < 40:
        # Borderline: ~68% P, ~15% L, ~17% A
        probs = [0.68, 0.15, 0.17]
    else:
        # Severe Shortage: ~45% P, ~10% L, ~45% A
        probs = [0.45, 0.10, 0.45]
        
    statuses = np.random.choice(["P", "L", "A"], size=TOTAL_CLASSES, p=probs)
    records_40_days.append({"Roll No": roll, "Student Name": name, "statuses": statuses})

# Generate 4 rolling 10-class CSV files
excel_path = "backend/test_data/attendance_master_40_classes.xlsx"
with pd.ExcelWriter(excel_path, engine="openpyxl") as writer:
    for block_idx in range(4):
        start_c = block_idx * BLOCK_SIZE + 1
        end_c = (block_idx + 1) * BLOCK_SIZE
        
        block_data = []
        for r in records_40_days:
            row_dict = {"Roll No": r["Roll No"], "Student Name": r["Student Name"]}
            for c_num in range(start_c, end_c + 1):
                col_name = f"Class_{c_num:02d}"
                row_dict[col_name] = r["statuses"][c_num - 1]
            block_data.append(row_dict)
            
        df_block = pd.DataFrame(block_data)
        
        # Save individual 10-class CSV
        csv_filename = f"backend/test_data/attendance_block_{block_idx+1}_classes_{start_c:02d}_to_{end_c:02d}.csv"
        df_block.to_csv(csv_filename, index=False)
        print(f"Generated: {csv_filename}")
        
        # Save as tab in master Excel workbook
        sheet_tab_name = f"Classes_{start_c:02d}-{end_c:02d}"
        df_block.to_excel(writer, sheet_name=sheet_tab_name, index=False)

print(f"\nGenerated Master Multi-Tab Workbook: {excel_path}")