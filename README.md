# GradeOps 🚀

GradeOps is an enterprise-grade, Human-in-the-Loop (HITL) AI-powered examination grading and management platform. Designed for professors and teaching assistants, it automates the bulk ingestion and grading of handwritten student exam papers via advanced vision-language processing while offering powerful visual override tools for manual human audit and verification.

---

## 🌟 Key Features

### 🏢 Module 1: The Command Center & Unified Ingestion
* **Secure Professor Dashboard:** A personalized space displaying all active classrooms and created exam templates, completely secured via OAuth2 JWT authentication.
* **Unified Setup Portal:** Single-click exam creation where instructors provide the Exam Title, strict JSON Grading Rubrics, and a bulk `.zip` folder of student PDFs all at once.
* **Ghost-Space Sanitizer:** Automatic backend filename normalization that strips leading/trailing whitespace from student submissions to eliminate system-breaking URL mismatches.
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
│   │       ├── exams.py        # Core Unified pipelines, CROPS, & analytics routes
│   │       └── team.py         # Instructor team activity & TA throughput metrics
│   ├── core/
│   │   ├── database.py         # Async Motor-MongoDB connection client
│   │   └── security.py         # Password hashing & JWT generation
│   ├── ml_pipeline/
│   │   ├── vision/             # PDF coordinates mapping and extraction engine
│   │   └── grading/            # AI Agent grading & similarity models
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
    │   │   ├── SetupPortal.jsx      # Ingestion gateway & Dual-Path Rubric Synthesizer
    │   │   ├── ReviewDashboard.jsx  # TA Workbench & Cropping tool
    │   │   ├── RosterDashboard.jsx  # Ledger matrix & CSV exporter
    │   │   └── InsightsDashboard.jsx# Core Bell-curve analytics component
    │   └── App.jsx                  # Main client-side router & authentication state provider
```

---

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
GEMINI_API_KEY=your_gemini_api_key
GROQ_API_KEY=your_groq_api_key
```

### 4. Start the development server

```bash
uvicorn main:app --reload --port 8001
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

$$
\text{Request}
\longrightarrow
\text{Axios Interceptor}
\overset{\text{Injects Token}}{\longrightarrow}
\text{Authorization: Bearer JWT}
\longrightarrow
\text{FastAPI Dependency (get\_current\_user)}
$$

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

---

## ⚡ Automated Grading Architecture & Evolutionary Improvements

GradeOps evaluates handwritten, open-ended engineering assessments by validating multi-step mathematical derivations and conceptual physics laws. Evaluating handwritten student work at scale introduces complex trade-offs between semantic rigor, API quotas, compute cost, and throughput latency.

### 1. Baseline Architecture: Decoupled Multi-Pass Pipeline

The initial pipeline decoupled document transcription, semantic evaluation, and plagiarism detection into discrete, isolated processes:

```text
[Student PDF] ──> PyMuPDF Slicer ──> Question Image Crop
                                           │
                                           ▼
[Pass 1: Vision OCR] ───────────────> gemini-2.5-flash ──> Transcribed LaTeX/Text
                                                                 │
                                                                 ▼
[Pass 2: NLI Reasoner] ─────────────> gemini-2.5-flash + JSON Rubric ──> Step-wise Points & Justification
```

1. **Vision Transcription (`extractor.py`):** Sliced image crops were dispatched to `gemini-2.5-flash` to transcribe handwritten text, equations, and diagrams into Markdown/LaTeX.
2. **Natural Language Inference (NLI) Reasoning (`engine.py`):** The extracted text was evaluated against the professor's master JSON rubric criteria using deep multi-head cross-attention.
3. **Plagiarism Engine (`similarity.py`):** A standalone bi-encoder embedding model (`text-embedding-004`) computed student-to-student pairwise cosine similarities to flag collusion.

---

### 2. Core Architectural Drawbacks

#### A. Semantic Blindness of Pure Vector Similarity
Using vector embeddings and cosine similarity to grade student answers against a reference key introduces critical vulnerabilities:
* **The Negation Blind Spot:** An answer stating *"Energy can be created and destroyed"* shares ~95% lexical overlap with the First Law of Thermodynamics. Bi-encoders project both into almost identical vector directions ($\text{cosine similarity} > 0.88$), erroneously awarding high marks to scientifically invalid claims.
* **Sign & Variable Polarity Inversion:** Swapping a thermodynamic sign ($\Delta H = +45\text{ kJ}$ vs. $\Delta H = -45\text{ kJ}$) produces negligible vector distance shifts despite representing physically opposite phenomena (endothermic vs. exothermic).
* **Keyword-Stuffed Salad:** Incoherent sequences of technical jargon yield artificially high centroid alignments despite lacking logical reasoning.

#### B. High API Overhead in Decoupled Pipelines
Decoupling OCR transcription from LLM reasoning created an unsustainable API request load:
$$\text{Total API Hits} = 2 \times N_{\text{students}} \times Q_{\text{questions}}$$
* A batch of 60 students answering a 5-question exam triggers **600 external API requests**.
* On standard developer tiers (15 RPM), sequential processing triggers rate-limit errors (HTTP `429 Too Many Requests`).
* Evaluating blank or irrelevant answers wastes reasoning tokens and adds $1.5\text{s} - 3.0\text{s}$ queue latency per blank question.

---

### 3. Improvement 1: Two-Stage Hybrid Evaluation Pipeline

To retain NLI semantic precision while eliminating wasted token overhead, we implemented a **Two-Stage Hybrid Pipeline**. This architecture introduces an upstream vector gatekeeper before triggering LLM inference:

```text
              [Transcribed Student Answer]
                           │
                           ▼
    [Stage 1: Coarse Vector Gatekeeper (Bi-Encoder)]
   Cosine Similarity vs. Professor Key (text-embedding-004)
                           │
        ┌──────────────────┴──────────────────┐
        ▼                                     ▼
 Similarity < 0.40                     Similarity >= 0.40
(Blank / Unrelated / Gibberish)               │
        │                                     ▼
        │                     [Stage 2: Fine Logic Check (NLI)]
        │                     Cross-Attention via gemini-2.5-flash
        │                     Step-by-Step Rubric Reasoning & Signs
        │                                     │
        ▼                                     ▼
Auto-Assign 0/10                     Granular Partial Credit
(Fast Exit: < 40ms, $0)                  Awarded with Justification
```

* **Stage 1 (Coarse Filter):** The transcribed text is converted into a 768-dimensional embedding via `text-embedding-004`. If similarity with the key is $< 0.40$, it is classified as blank or off-topic and instantly assigned 0 points without calling the LLM.
* **Stage 2 (Fine NLI Reasoning):** Submissions passing Stage 1 ($\ge 0.40$) are passed to `gemini-2.5-flash` with the rubric to evaluate derivations, algebraic signs, and partial credit.

---

### 4. Benchmark Validation & Comparative Metrics

We validated the architectures against canonical ASAG (Automated Short Answer Grading) benchmarks across 5 test archetypes: *Exact Match*, *Valid Paraphrase*, *Direct Contradiction/Sign Flip*, *Keyword Salad*, and *Off-Topic/Blank*.

### 📊 Empirical 3-Way ASAG Benchmark Results

| Metric | Approach 1: Pure Cosine Sim (`text-embedding-004`) | Approach 2: Two-Stage Decoupled (`text-embedding-004` + LLM) | Approach 3: Unified Multimodal (`gemini-2.5-flash`) | Engineering Verdict |
| :--- | :---: | :---: | :---: | :--- |
| **Quadratic Weighted Kappa (QWK)** | 0.447 (Weak) | **0.996 (Near-Perfect)** | **0.996 (Near-Perfect)** | Approach 2 & 3 achieve near-human grading consistency |
| **Pearson Correlation ($r$)** | 0.844 | **0.996** | **0.996** | Strict linear score calibration |
| **Mean Absolute Error (MAE / 10)** | $\pm 3.51$ pts | **$\pm 0.30$ pts** | **$\pm 0.30$ pts** | Reduces error by 3.21 points |
| **Contradiction False Positives ($\text{FPR}_{\text{contra}}$)** | 100.0% (Critical Failure) | **0.0% (Robust)** | **0.0% (Robust)** | Completely eliminates false credit on negated physics |
| **API Network Requests per Crop** | 1 call | 2 calls | **1 call** | **50% reduction in external API calls** |

#### Key Conclusions:
1. **Semantic Accuracy Parity:** Both Approach 2 and Approach 3 eliminate the fatal failure mode of pure vector similarity (awarding credit to inverted physical laws and sign flips), scoring an identical **0.996 QWK** and **0.0% false positive rate**.
2. **50% Infrastructure Overhead Reduction:** Approach 3 collapses transcription and grading into a single atomic multimodal pass, halving total external HTTP requests compared to the decoupled two-stage pipeline.

---

### 5. Improvement 2: Multimodal Collapse (Unified Single-Call Ingestion)

To eliminate the $2 \times N \times Q$ API hit bottleneck, we collapsed independent OCR and grading stages into a single multimodal execution pass using `gemini-2.5-flash`.

* **50% Call Reduction:** Drops external network hits from $2 \times N \times Q$ to $1 \times N \times Q$ ($50 \rightarrow 25$ calls for a 5-student, 5-question exam).
* **Rate-Limit Safeguard:** Operating at half the request frequency prevents stalls on developer rate quotas without artificial sleep delays.
* **Context Preservation:** Eliminates transcription loss by allowing the grading engine to evaluate visual equations and diagrams directly in their original format.
