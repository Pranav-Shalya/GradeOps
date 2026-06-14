# GradeOps 🚀

GradeOps is an enterprise-grade, Human-in-the-Loop (HITL) AI-powered examination grading and management platform. Designed for professors and teaching assistants, it automates the bulk ingestion and grading of handwritten student exam papers via advanced vision-language processing while offering powerful visual override tools for manual human audit and verification.

---

## 🌟 Key Features

### 🏢 Module 1: The Command Center & Unified Ingestion
* **Secure Professor Dashboard:** A personalized space displaying all active classrooms and created exam templates, completely secured via OAuth2 JWT authentication.
* **Unified Setup Portal:** Single-click exam creation where instructors provide the Exam Title, strict JSON Grading Rubrics, and a bulk `.zip` folder of student PDFs all at once.
* **Ghost-Space Sanitizer:** Automatic backend filename normalization that strips leading/trailing trailing whitespace from student submissions to eliminate system-breaking URL mismatches.
* **Late Ingestion Engine:** Ability to seamlessly append individual late student PDFs to an existing exam structure directly from the UI dashboard.

### 🛠️ Module 2: TA Workbench (Human-in-the-Loop Workspace)
* **Searchable Navigation:** Datalist-powered search boxes to query exams by Title (e.g., "PT3") and instantly select matching student roll numbers from a dynamically filtered roster.
* **Interactive Canvas Crop Tool:** TAs can visually drag bounding boxes directly onto rendered student handwritten papers to trigger target sub-question re-evaluation.
* **Real-time AI Re-grading:** Immediate ML-pipeline invocation over a targeted crop region to dynamically recalculate sub-scores and update justifications.
* **Granular Manual Overrides:** Native numerical score fields and editable justification text blocks allowing humans to overwrite the AI's evaluations before committing.

### 📊 Module 3: Class Ledger & Analytics
* **Status-Aware Ledger Table:** A structured tracking table filtering student progress seamlessly through *Pending*, *AI Graded*, and *Human Verified* lifecycles.
* **One-Click CSV Export:** Instant extraction of finalized, locked grade sheets, auto-named dynamically matching the specific exam title for painless grade-book synchronization.
* **Direct Insights Dashboard:** Lightweight analytics visualizer computing class averages, maximum/minimum distributions, and per-question bell curves to pinpoint problematic questions.

---

## 🛠️ Tech Stack

### Frontend
* **Core:** React (Vite environment)
* **Routing:** React Router DOM (v6)
* **API Client:** Axios (Incorporate robust asynchronous request interceptors for automated JWT injection)
* **Icons:** Lucide React

### Backend
* **Framework:** FastAPI (Python 3.10+)
* **Database:** MongoDB (Asynchronous Driver: Motor)
* **PDF Processing:** PyMuPDF (`fitz`)
* **Security:** Python-Jose (JWT Tokens), Passlib (Bcrypt hashing)

---

## 📁 Repository Structure

```text
gradeops/
├── backend/
│   ├── api/
│   │   ├── dependencies.py      # JWT Auth validation bouncer
│   │   └── routes/
│   │       ├── auth.py         # Authentication & registration logic
│   │       └── exams.py        # Core Unified pipelines, CROPS, & analytics routes
│   ├── core/
│   │   └── database.py         # Async Motor-MongoDB connection client
│   ├── ml_pipeline/
│   │   ├── vision/             # PDF coordinates mapping and extraction engine
│   │   └── grading/            # AI Agent grading evaluation models
│   ├── data/
│   │   └── uploads/            # Organized sanitized directory structure for unpacked files
│   └── main.py                 # FastAPI initialization & CORS gateway configuration
└── frontend/
    ├── src/
    │   ├── services/
    │   │   └── api.js          # Central Axios configuration and bulletproof interceptors
    │   ├── pages/
    │   │   ├── Login.jsx
    │   │   ├── Register.jsx
    │   │   ├── Dashboard.jsx        # Professor Command Center
    │   │   ├── SetupPortal.jsx      # Ingestion gateway
    │   │   ├── ReviewDashboard.jsx  # TA Workbench & Cropping tool
    │   │   ├── RosterDashboard.jsx  # Ledger matrix & CSV exporter
    │   │   └── InsightsDashboard.jsx# Core Bell-curve analytics component
    │   └── App.jsx                  # Main client-side router & authentication state provider
```
# 🚀 Getting Started

## Prerequisites

Before running the project, ensure you have:

* **Python** v3.10 or higher
* **Node.js** v18 or higher
* **MongoDB** instance running locally on `mongodb://localhost:27017`

---

## Backend Setup

### 1. Navigate to the backend directory

```bash
cd backend
```

### 2. Install dependencies

```bash
pip install -r requirements.txt
```

### 3. Configure environment variables (`.env`)

```env
SECRET_KEY=your_mathematically_secure_jwt_secret_key_here
ALGORITHM=HS256
ACCESS_TOKEN_EXPIRE_MINUTES=60
```

### 4. Start the development server

```bash
uvicorn main:app --reload
```

---

## Frontend Setup

### 1. Navigate to the frontend directory

```bash
cd ../frontend
```

### 2. Install package dependencies

```bash
npm install
```

### 3. Start the Vite development server

```bash
npm run dev
```

### 4. Access the application

Open your browser and navigate to:

```text
http://localhost:5173
```

(or the port assigned by Vite)

---

# 🔐 Security Framework

All frontend service endpoints communicate asynchronously via dynamic interceptor validation wrappers.

### Authentication Flow

```text
Request
   ↓
Axios Interceptor
   ↓ (Injects Token)
Authorization: Bearer JWT
   ↓
FastAPI Dependency (get_current_user)
   ↓
Protected Route
```

### Mathematical Representation

[
\text{Request}
\longrightarrow
\text{Axios Interceptor}
\overset{\text{Injects Token}}{\longrightarrow}
\text{Authorization: Bearer JWT}
\longrightarrow
\text{FastAPI Dependency (get_current_user)}
]

### Security Enforcement

If a token is:

* Absent
* Corrupted
* Expired
* Structurally invalid

the backend immediately returns:

```http
401 Unauthorized
```

This mechanism protects sensitive academic evaluation environments and prevents unauthorized access.
