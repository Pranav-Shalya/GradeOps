# backend/scripts/generate_mock_attendance.py
import os
import math
import random
import pandas as pd
from datetime import datetime, timedelta

# Output directory
OUTPUT_DIR = os.path.join(os.path.dirname(os.path.dirname(__file__)), "test_data")
os.makedirs(OUTPUT_DIR, exist_ok=True)

# 1. Generate 10 Weekdays starting from 2026-08-10
dates = [
    "2026-08-10", "2026-08-11", "2026-08-12", "2026-08-13", "2026-08-14",
    "2026-08-17", "2026-08-18", "2026-08-19", "2026-08-20", "2026-08-21"
]

# 2. 50 Realistic Student Names
STUDENT_NAMES = [
    "Aarav Sharma", "Diya Patel", "Rohan Verma", "Ananya Iyer", "Kabir Singh",
    "Pooja Nair", "Vikram Reddy", "Sneha Gupta", "Aditya Joshi", "Ishita Roy",
    "Rahul Deshmukh", "Kavya Menon", "Siddharth Rao", "Meera Pillai", "Arjun Bhatt",
    "Rhea Saxena", "Manish Mehra", "Tanvi Kulkarni", "Gaurav Malhotra", "Anika Jain",
    "Harsh Vardhan", "Priyanka Sen", "Rishabh Kapoor", "Shruti Choudhury", "Nikhil Chopra",
    "Shreya Nambiar", "Varun Aggarwal", "Divya Swaminathan", "Karan Singhal", "Simran Kaur",
    "Akash Tripathi", "Neha Ghosh", "Pranav Hegde", "Sanjana Murthy", "Ayush Pandey",
    "Bhavna Chawla", "Devendra Yadav", "Gayatri Rangan", "Kartik Soni", "Lavanya Sundaram",
    "Mohit Bansal", "Nandini Mittal", "Omkar Phadke", "Payal Bose", "Rohit Prasad",
    "Sakshi Shinde", "Tarun Mathur", "Urvi Goswami", "Vivek Anand", "Zoya Khan"
]

def generate_mock_attendance():
    random.seed(42) # Deterministic for reproducible testing
    
    students_data = []
    
    # 35 Students Safe (>= 75%: 8, 9, or 10 present out of 10)
    # 15 Students Shortage (< 75%: 4, 5, 6, or 7 present out of 10)
    target_counts = (
        [10] * 12 + [9] * 13 + [8] * 10 +   # 35 Safe students (80% - 100%)
        [7] * 4 + [6] * 4 + [5] * 4 + [4] * 3  # 15 Shortage students (40% - 70%)
    )
    random.shuffle(target_counts)

    summary_stats = []

    for i in range(50):
        roll_no = f"2024ME{i+1:02d}"
        name = STUDENT_NAMES[i]
        present_days_count = target_counts[i]
        
        # Select which random days the student was present
        present_indices = set(random.sample(range(len(dates)), present_days_count))
        
        row = {
            "Roll No": roll_no,
            "Student Name": name
        }
        
        attended = 0
        for d_idx, d_str in enumerate(dates):
            if d_idx in present_indices:
                row[d_str] = "Present"
                attended += 1
            else:
                row[d_str] = "Absent"

        total_sessions = len(dates)
        pct = round((attended / total_sessions) * 100.0, 1)
        is_shortage = pct < 75.0
        classes_needed = max(0, math.ceil(3 * total_sessions - 4 * attended)) if is_shortage else 0

        summary_stats.append({
            "roll_no": roll_no,
            "name": name,
            "attended": attended,
            "total": total_sessions,
            "percentage": pct,
            "is_shortage": is_shortage,
            "classes_needed": classes_needed
        })

        students_data.append(row)

    df = pd.DataFrame(students_data)

    # File paths
    csv_path = os.path.join(OUTPUT_DIR, "sample_attendance_10days_50students.csv")
    xlsx_path = os.path.join(OUTPUT_DIR, "sample_attendance_10days_50students.xlsx")

    # Export CSV & Excel
    df.to_csv(csv_path, index=False)
    df.to_excel(xlsx_path, index=False, engine='openpyxl')

    # Print Summary Report
    total_students = len(summary_stats)
    safe_students = sum(1 for s in summary_stats if not s["is_shortage"])
    shortage_students = sum(1 for s in summary_stats if s["is_shortage"])
    class_avg = round(sum(s["percentage"] for s in summary_stats) / total_students, 1)

    print("=" * 80)
    print("MOCK ATTENDANCE DATASET GENERATED SUCCESSFULLY")
    print("=" * 80)
    print(f"Output CSV   : {csv_path}")
    print(f"Output Excel : {xlsx_path}")
    print("-" * 80)
    print(f"Total Students          : {total_students}")
    print(f"Conducted Sessions      : {len(dates)} dates ({dates[0]} to {dates[-1]})")
    print(f"Class Average Attendance : {class_avg}%")
    print(f"Safe Students (>= 75%)   : {safe_students} ({safe_students/total_students*100:.0f}%)")
    print(f"Shortage Students (<75%): {shortage_students} ({shortage_students/total_students*100:.0f}%)")
    print("=" * 80)
    print("\nSAMPLE BREAKDOWN (First 10 Students):")
    print(f"{'Roll No':<10} | {'Student Name':<22} | {'Attended':<10} | {'Pct':<7} | {'Status':<12} | {'Recovery Needed'}")
    print("-" * 80)
    for s in summary_stats[:10]:
        status_tag = "[SHORTAGE]" if s["is_shortage"] else "[SAFE]"
        recovery = f"Must attend next {s['classes_needed']} classes" if s["is_shortage"] else "Criteria Met"
        print(f"{s['roll_no']:<10} | {s['name']:<22} | {s['attended']}/{s['total']:<7} | {s['percentage']:>5.1f}% | {status_tag:<12} | {recovery}")
    print("=" * 80)

if __name__ == "__main__":
    generate_mock_attendance()
