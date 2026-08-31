# GradeOps — Resume & CV Engineering Project Entries

---

## 1. Executive Project Header

**Project Title:** **GradeOps | Autonomous Human-in-the-Loop Examination & Attendance Platform**  
**Tech Stack:** Python, FastAPI, React (Vite), MongoDB Atlas, Docker, PyMuPDF, Google Gemini 2.5 Flash, text-embedding-004, GitHub Actions CI/CD  
**Links:** `[Live Demo: gradeops.vercel.app]` | `[GitHub: github.com/Pranav-Shalya/GradeOps]` | `[Architecture Docs: ARCHITECTURE.md]`

---

## 2. Track A: Machine Learning & Generative AI Focus (AI/ML / LLM Engineer Roles)

* **Architected Multimodal Single-Call Grading Engine:** Designed an end-to-end evaluation pipeline collapsing independent OCR and text-LLM passes into a single atomic multimodal pass (`gemini-2.5-flash`), cutting API requests by **50%** ($2 \times N \times Q \rightarrow 1 \times N \times Q$) and resolving external rate limits during large batch ingestion.
* **Empirical ASAG Benchmark Superiority:** Benchmarked against canonical Automated Short Answer Grading (ASAG) datasets; achieved **Quadratic Weighted Kappa (QWK = 0.996)**, **Pearson Correlation ($r = 0.996$)**, and reduced Mean Absolute Error to **$\pm 0.30$ / 10 pts** (a 3.21 pt reduction over pure vector similarity) while completely eliminating false credit on physical law contradictions (**$\text{FPR}_{\text{contra}} = 0.0\%$**).
* **Two-Stage Vector Similarity Gatekeeper:** Integrated a high-throughput coarse filter using `text-embedding-004` (768-dim embeddings); triggers **sub-40ms fast exits** for blank or off-topic submissions ($< 0.40$ cosine threshold), eliminating 100% of LLM token costs on unattempted questions.
* **Deterministic Structured JSON & Fallback Resiliency:** Enforced strict Pydantic response schemas (`UnifiedGradingResult`) across LaTeX equation extraction, step criteria scores, and natural language justifications with low temperature ($0.1$) and automated failover to Groq (`meta-llama/llama-4-scout-17b-16e-instruct` / `openai/gpt-oss-120b`).
* **Cross-Student Semantic Plagiarism Detection:** Engineered an on-demand pairwise embedding analysis service computing student-to-student similarity matrices across LaTeX transcriptions, automatically flagging collusion above $0.85$ cosine similarity.

---

## 3. Track B: Full-Stack & Systems Engineering Focus (Software Engineer / Backend Roles)

* **High-Throughput Asynchronous PDF Processing:** Developed an asynchronous background worker in FastAPI using PyMuPDF (`fitz`) for sub-second local headless PDF slicing and bounding-box image serialization, eliminating document transcription latency without third-party vision APIs.
* **Multi-Class Rolling Attendance Engine:** Built a dynamic attendance ingestion system capable of unpivoting 10-day wide-format sheets into atomic MongoDB sessions, accumulating multi-sheet rolling classes without state overwrites, and calculating real-time 75% shortage recovery targets ($k = \max(0, \lceil 3N - 4S \rceil)$).
* **Dual Late-Entry Policy Engine & Slide-Over Drawer:** Implemented runtime policy switching (Lenient $L=1$ vs. Strict $L=0$) recalibrating class averages and debarment alerts instantly, paired with an interactive slide-over history drawer for 3-way status overrides ($P \leftrightarrow L \leftrightarrow A$).
* **Role-Based Access Control (RBAC) & HITL Workbench:** Created a secure JWT auth layer with Professor vs. TA permission boundaries, featuring a real-time Human-in-the-Loop review workbench with live canvas cropping and TA grade overrides.
* **Tier 1 Cloud Containerization & CI/CD:** Containerized the backend with multi-stage Debian Docker images for cloud deployment on Render and Vercel, validated via parallel GitHub Actions CI/CD pipelines testing Docker buildx compilation and Vite SPA production builds.

---

## 4. Formatted LaTeX / Overleaf Snippet (Jake's Resume / Standard Template)

```latex
% ---------------------------------------------------------------------------
% GradeOps - Machine Learning & Generative AI Resume Entry
% ---------------------------------------------------------------------------
\resumeProjectHeading
    {\textbf{GradeOps} $|$ \emph{Python, FastAPI, React, MongoDB Atlas, Docker, Gemini 2.5 Flash, PyMuPDF}}{2026}
    \resumeItemListStart
        \resumeItem{Architected a unified multimodal grading engine using \textbf{Gemini 2.5 Flash}, collapsing OCR and NLI rubric evaluation into a single atomic pass and reducing external API overhead by \textbf{50\%}.}
        \resumeItem{Validated against ASAG benchmarks, achieving near-perfect agreement (\textbf{QWK = 0.996}, \textbf{Pearson $r = 0.996$}, \textbf{MAE = $\pm 0.30$/10 pts}) and \textbf{0.0\% false positive rate} on physical law contradictions.}
        \resumeItem{Engineered a Two-Stage Vector Gatekeeper (\textbf{text-embedding-004}) enabling \textbf{sub-40ms fast-exits} for unattempted submissions, eliminating 100\% of LLM token costs on off-topic crops.}
        \resumeItem{Implemented cross-submission semantic plagiarism analysis via pairwise vector embeddings, detecting logic collusion above a 0.85 cosine similarity threshold.}
        \resumeItem{Containerized full-stack architecture with \textbf{Docker} and \textbf{FastAPI} async workers, establishing automated \textbf{GitHub Actions CI/CD} testing and cloud deployments on Render and Vercel.}
    \resumeItemListEnd

% ---------------------------------------------------------------------------
% GradeOps - Full-Stack & Systems Engineering Resume Entry
% ---------------------------------------------------------------------------
\resumeProjectHeading
    {\textbf{GradeOps} $|$ \emph{FastAPI, React.js, Vite, MongoDB Atlas, Docker, PyMuPDF, Python, GitHub Actions}}{2026}
    \resumeItemListStart
        \resumeItem{Engineered an asynchronous examination grading backend in \textbf{FastAPI} utilizing \textbf{PyMuPDF} for headless local PDF bounding-box slicing and image serialization.}
        \resumeItem{Built a multi-class rolling attendance engine supporting 10-session unpivoting, dual late-entry policies (Strict vs. Lenient), and dynamic shortage recovery algorithms ($k = \max(0, \lceil 3N - 4S \rceil)$).}
        \resumeItem{Developed an interactive Human-in-the-Loop (HITL) audit workbench in \textbf{React (Vite)} with canvas cropping, allowing TAs to regrade and audit AI evaluations with atomic MongoDB persistence.}
        \resumeItem{Designed Role-Based Access Control (\textbf{RBAC}) with secure JWT bearer authentication separating Instructor ownership and TA verification privileges.}
        \resumeItem{Created multi-stage \textbf{Docker} production images and automated parallel \textbf{GitHub Actions CI/CD} pipelines ensuring container compilation and SPA build validation.}
    \resumeItemListEnd
```
