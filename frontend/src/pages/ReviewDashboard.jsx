// frontend/src/pages/ReviewDashboard.jsx
import { useState, useRef, useEffect } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { examService, API_URL } from '../services/api';
import { CheckCircle, Crop, AlertCircle, Save, Edit3, AlertTriangle, Zap } from 'lucide-react';

export default function ReviewDashboard() {
    const [searchParams] = useSearchParams();
    const navigate = useNavigate();
    
    // Core hidden IDs for the backend
    const [examId, setExamId] = useState(searchParams.get('exam') || '');
    const [studentId, setStudentId] = useState(searchParams.get('student') || '');
    
    // NEW: Search term for what the user actually types (e.g. "PT3")
    const [examSearchTerm, setExamSearchTerm] = useState('');
    
    const [examsList, setExamsList] = useState([]); 
    const [studentData, setStudentData] = useState(null);
    const [pageImage, setPageImage] = useState(null);
    const [activeQuestion, setActiveQuestion] = useState('');
    
    const [roster, setRoster] = useState([]); 
    const [loading, setLoading] = useState(false);
    const [regrading, setRegrading] = useState(false);

    const imageRef = useRef(null);
    const scoreInputRef = useRef(null);
    const [isDrawing, setIsDrawing] = useState(false);
    const [startPos, setStartPos] = useState({ x: 0, y: 0 });
    const [cropBox, setCropBox] = useState(null);

    // 1. Fetch ALL exams to populate the search list
    useEffect(() => {
        const fetchExams = async () => {
            try {
                const res = await examService.getAllExams();
                // FIX: Correctly access the 'exams' array from the backend
                const examsArray = res.data.exams || [];
                setExamsList(examsArray);
                
                // If we came from the Roster link, reverse-lookup the Exam Title for the search box
                const initialExamId = searchParams.get('exam');
                if (initialExamId && examsArray.length > 0) {
                    const matched = examsArray.find(ex => ex._id === initialExamId);
                    if (matched) setExamSearchTerm(matched.title);
                }
            } catch (error) {
                console.error("Failed to fetch exams list.");
            }
        };
        fetchExams();

        const initialExam = searchParams.get('exam');
        const initialStudent = searchParams.get('student');
        if (initialExam && initialStudent) {
            handleLoadStudent(initialExam, initialStudent);
        }
    }, []); 

    // 2. When the user types an exam name (e.g. "PT3"), find its hidden ID
    const handleExamSearchChange = (e) => {
        const typedTitle = e.target.value;
        setExamSearchTerm(typedTitle);
        
        // Check if what they typed matches an exam title exactly
        const matchedExam = examsList.find(ex => ex.title === typedTitle);
        if (matchedExam) {
            setExamId(matchedExam._id); // Found it! Set the hidden ID
            setStudentId(''); // Clear the student box since we changed exams
        } else {
            setExamId(''); // Not a full match yet
        }
    };

    // 3. Fetch the class roster anytime the hidden Exam ID changes
    useEffect(() => {
        if (examId && examId.length > 10) { 
            fetchRoster(examId);
        } else {
            setRoster([]);
        }
    }, [examId]);

    const fetchRoster = async (id) => {
        try {
            const res = await examService.getExamRoster(id);
            setRoster(res.data.roster || []);
        } catch (err) {
            console.log("Waiting for a complete Exam ID...");
        }
    };

    // 4. Load the Student Data
    const handleLoadStudent = async (eId = examId, sId = studentId) => {
        if (!eId || !sId) return alert("Please select an Exam from the list and enter a Student ID.");
        
        setLoading(true);
        try {
            const response = await examService.getSubmissionDetails(eId, sId);
            setStudentData(response.data.data);
            
            const grades = response.data.data.grades;
            if (grades && Object.keys(grades).length > 0) {
                setActiveQuestion(Object.keys(grades)[0]);
            }
            
            const imgRes = await fetch(`${API_URL}/exams/${eId}/submissions/${sId}/pages/0`);
            if (imgRes.ok) {
                const blob = await imgRes.blob();
                setPageImage(URL.createObjectURL(blob));
            }
        } catch (error) {
            alert("Failed to load student data. Please check the IDs.");
        } finally {
            setLoading(false);
        }
    };

    // --- MOUSE DRAWING LOGIC FOR CROPPING ---
    const handleMouseDown = (e) => {
        if (!imageRef.current) return;
        const rect = imageRef.current.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;
        setStartPos({ x, y });
        setCropBox({ x, y, w: 0, h: 0 });
        setIsDrawing(true);
    };

    const handleMouseMove = (e) => {
        if (!isDrawing || !imageRef.current) return;
        const rect = imageRef.current.getBoundingClientRect();
        const currentX = e.clientX - rect.left;
        const currentY = e.clientY - rect.top;
        
        setCropBox({
            x: Math.min(startPos.x, currentX),
            y: Math.min(startPos.y, currentY),
            w: Math.abs(currentX - startPos.x),
            h: Math.abs(currentY - startPos.y)
        });
    };

    const handleMouseUp = () => setIsDrawing(false);

    // --- API CALLS & MANUAL OVERRIDES ---
    const handleRegrade = async () => {
        if (!cropBox || cropBox.w < 10) return alert("Please draw a box over the student's answer first.");
        
        setRegrading(true);
        try {
            const payload = { x: cropBox.x, y: cropBox.y, w: cropBox.w, h: cropBox.h, page: 0 };
            const response = await examService.regradeManualCrop(examId, studentId, activeQuestion, payload);
            
            setStudentData(prev => ({
                ...prev,
                grades: { ...prev.grades, [activeQuestion]: response.data.new_grade }
            }));
            
            setCropBox(null);
        } catch (error) {
            alert("Failed to re-grade. Check console.");
        } finally {
            setRegrading(false);
        }
    };

    const navigateStudent = (direction) => {
        if (!roster || roster.length === 0) return;
        const currentIndex = roster.findIndex(s => s.submission_id === studentId);
        let targetIndex = -1;

        if (direction === 'next') {
            if (currentIndex === -1) {
                targetIndex = 0;
            } else if (currentIndex < roster.length - 1) {
                targetIndex = currentIndex + 1;
            }
        } else if (direction === 'prev') {
            if (currentIndex > 0) {
                targetIndex = currentIndex - 1;
            }
        }

        if (targetIndex !== -1 && targetIndex < roster.length) {
            const targetStudent = roster[targetIndex];
            setStudentId(targetStudent.submission_id);
            setCropBox(null);
            handleLoadStudent(examId, targetStudent.submission_id);
        }
    };

    const navigateQuestion = (direction) => {
        if (!studentData || !studentData.grades) return;
        const questions = Object.keys(studentData.grades);
        if (questions.length === 0) return;

        const currentIndex = questions.indexOf(activeQuestion);
        let targetIndex = -1;

        if (direction === 'prev') {
            if (currentIndex > 0) {
                targetIndex = currentIndex - 1;
            }
        } else if (direction === 'next') {
            if (currentIndex === -1) {
                targetIndex = 0;
            } else if (currentIndex < questions.length - 1) {
                targetIndex = currentIndex + 1;
            }
        }

        if (targetIndex !== -1 && targetIndex < questions.length) {
            setActiveQuestion(questions[targetIndex]);
            setCropBox(null);
        }
    };

    const handleCommitGrade = async (advanceAfter = false) => {
        if (!studentData || !activeQuestion || !studentData.grades?.[activeQuestion]) return;
        try {
            const currentGrade = studentData.grades[activeQuestion];
            const payload = {
                question_key: activeQuestion,
                final_score: currentGrade.total_score,
                justification: currentGrade.justification
            };
            
            await examService.commitGrade(examId, studentId, payload);
            
            setStudentData(prev => ({
                ...prev,
                grades: { ...prev.grades, [activeQuestion]: { ...currentGrade, status: 'human_verified' } }
            }));

            if (advanceAfter) {
                navigateStudent('next');
            }
            
        } catch (error) {
            alert("Failed to lock grade.");
        }
    };

    const handleAcceptAndNext = async () => {
        if (!studentData || !activeQuestion || !studentData.grades?.[activeQuestion]) return;
        const currentGrade = studentData.grades[activeQuestion];
        if (currentGrade.status !== 'human_verified') {
            await handleCommitGrade(true);
        } else {
            navigateStudent('next');
        }
    };

    const handleScoreOverride = (e) => {
        const newScore = e.target.value === '' ? '' : parseInt(e.target.value, 10);
        setStudentData(prev => ({
            ...prev,
            grades: {
                ...prev.grades,
                [activeQuestion]: { ...prev.grades[activeQuestion], total_score: newScore }
            }
        }));
    };

    const handleJustificationOverride = (e) => {
        setStudentData(prev => ({
            ...prev,
            grades: {
                ...prev.grades,
                [activeQuestion]: { ...prev.grades[activeQuestion], justification: e.target.value }
            }
        }));
    };

    const isLocked = activeQuestion && studentData?.grades[activeQuestion]?.status === 'human_verified';

    // --- KEYBOARD SHORTCUTS FOR RAPID TA WORKBENCH ---
    useEffect(() => {
        const handleKeyDown = (e) => {
            const activeElement = document.activeElement;
            const isInputActive =
                activeElement &&
                (activeElement.tagName === 'INPUT' ||
                 activeElement.tagName === 'TEXTAREA' ||
                 activeElement.isContentEditable ||
                 activeElement.getAttribute('contenteditable') === 'true');

            // Critical Guardrail: return early if typing in input, textarea, or contentEditable
            if (isInputActive) {
                return;
            }

            // 1. Enter or A: Approve/accept AI grade and automatically advance to next student
            if (e.key === 'Enter' || e.key === 'a' || e.key === 'A') {
                e.preventDefault();
                handleAcceptAndNext();
            }
            // 2. ArrowRight or J: Next student submission
            else if (e.key === 'ArrowRight' || e.key === 'j' || e.key === 'J') {
                e.preventDefault();
                navigateStudent('next');
            }
            // ArrowLeft or K: Previous student submission
            else if (e.key === 'ArrowLeft' || e.key === 'k' || e.key === 'K') {
                e.preventDefault();
                navigateStudent('prev');
            }
            // 3. ArrowUp or W: Previous question for current student
            else if (e.key === 'ArrowUp' || e.key === 'w' || e.key === 'W') {
                e.preventDefault();
                navigateQuestion('prev');
            }
            // 4. ArrowDown or S: Next question for current student
            else if (e.key === 'ArrowDown' || e.key === 's' || e.key === 'S') {
                e.preventDefault();
                navigateQuestion('next');
            }
            // 5. E: Focus the manual score override input field
            else if (e.key === 'e' || e.key === 'E') {
                e.preventDefault();
                if (scoreInputRef.current && !isLocked) {
                    scoreInputRef.current.focus();
                    scoreInputRef.current.select();
                }
            }
        };

        window.addEventListener('keydown', handleKeyDown);
        return () => {
            window.removeEventListener('keydown', handleKeyDown);
        };
    }, [studentData, activeQuestion, studentId, examId, roster, isLocked]);

    return (
        <div style={{ maxWidth: '1400px', margin: '0 auto' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '1.5rem' }}>
                    <h1 style={{ color: '#1e293b', margin: 0 }}>TA Workbench</h1>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.8rem', color: '#64748b' }}>
                        <span style={{ background: '#f1f5f9', padding: '2px 6px', borderRadius: '4px', border: '1px solid #cbd5e1', fontWeight: 'bold' }}>Enter / A</span> Accept & Next
                        <span style={{ margin: '0 2px' }}>•</span>
                        <span style={{ background: '#f1f5f9', padding: '2px 6px', borderRadius: '4px', border: '1px solid #cbd5e1', fontWeight: 'bold' }}>← / → (J/K)</span> Students
                        <span style={{ margin: '0 2px' }}>•</span>
                        <span style={{ background: '#f1f5f9', padding: '2px 6px', borderRadius: '4px', border: '1px solid #cbd5e1', fontWeight: 'bold' }}>↑ / ↓ (W/S)</span> Questions
                        <span style={{ margin: '0 2px' }}>•</span>
                        <span style={{ background: '#f1f5f9', padding: '2px 6px', borderRadius: '4px', border: '1px solid #cbd5e1', fontWeight: 'bold' }}>E</span> Edit Score
                    </div>
                </div>
                <button onClick={() => navigate(`/roster?exam=${examId}`)} style={{ background: '#f1f5f9', border: 'none', padding: '0.5rem 1rem', borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold' }}>
                    Back to Ledger
                </button>
            </div>

            {/* Top Bar: Searchable Inputs */}
            <div style={{ display: 'flex', gap: '1rem', background: 'white', padding: '1rem', borderRadius: '8px', boxShadow: '0 1px 3px rgba(0,0,0,0.1)', marginBottom: '1.5rem' }}>
                
                {/* Searchable Exam Name Input */}
                <input 
                    list="exam-list"
                    placeholder="Search Exam Name (e.g. PT3)..." 
                    value={examSearchTerm}
                    onChange={handleExamSearchChange}
                    style={{ flex: 1, padding: '0.5rem', borderRadius: '4px', border: '1px solid #cbd5e1', background: 'white' }} 
                />
                <datalist id="exam-list">
                    {examsList.map(ex => (
                        <option key={ex._id} value={ex.title} />
                    ))}
                </datalist>
                
                {/* Searchable Student Dropdown */}
                <input 
                    list="student-roster-list"
                    placeholder="Search Student ID..." 
                    value={studentId} 
                    onChange={e => setStudentId(e.target.value)} 
                    disabled={!examId} // Locked until a valid exam is typed!
                    style={{ flex: 1, padding: '0.5rem', borderRadius: '4px', border: '1px solid #cbd5e1', background: !examId ? '#f8fafc' : 'white' }} 
                />
                <datalist id="student-roster-list">
                    {roster.map(student => (
                        <option key={student.submission_id} value={student.submission_id}>
                            {student.status}
                        </option>
                    ))}
                </datalist>

                <button onClick={() => handleLoadStudent(examId, studentId)} disabled={loading || !examId || !studentId} style={{ background: '#0f172a', color: 'white', border: 'none', padding: '0.5rem 1.5rem', borderRadius: '4px', cursor: (loading || !examId || !studentId) ? 'not-allowed' : 'pointer', fontWeight: 'bold', opacity: (loading || !examId || !studentId) ? 0.7 : 1 }}>
                    {loading ? 'Loading...' : 'Load Submission'}
                </button>
            </div>

            {/* Workspace Area */}
            {studentData ? (
                <div style={{ display: 'flex', gap: '1.5rem', height: '70vh' }}>
                    
                    {/* LEFT SIDE: Visual Crop Tool */}
                    <div style={{ flex: 2, background: 'white', borderRadius: '8px', border: '1px solid #e2e8f0', overflow: 'auto', position: 'relative' }}>
                        <div style={{ position: 'sticky', top: 0, background: '#f8fafc', padding: '0.75rem', borderBottom: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center', zIndex: 10 }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: '#475569', fontWeight: 'bold' }}>
                                <Crop size={18} /> Interactive Crop Tool
                            </div>
                            <span style={{ fontSize: '0.85rem', color: '#64748b' }}>Drag a box over the answer, then click "Re-Evaluate"</span>
                        </div>
                        
                        {pageImage ? (
                            <div 
                                style={{ position: 'relative', cursor: 'crosshair', margin: '1rem' }}
                                onMouseDown={handleMouseDown}
                                onMouseMove={handleMouseMove}
                                onMouseUp={handleMouseUp}
                                onMouseLeave={handleMouseUp}
                            >
                                <img 
                                    ref={imageRef} 
                                    src={pageImage} 
                                    alt="Student Submission" 
                                    style={{ width: '100%', display: 'block', border: '1px solid #cbd5e1' }} 
                                    draggable="false"
                                />
                                {cropBox && (
                                    <div style={{
                                        position: 'absolute', left: cropBox.x, top: cropBox.y, width: cropBox.w, height: cropBox.h,
                                        border: '2px dashed #3b82f6', backgroundColor: 'rgba(59, 130, 246, 0.1)', pointerEvents: 'none'
                                    }} />
                                )}
                            </div>
                        ) : (
                            <div style={{ padding: '2rem', textAlign: 'center', color: '#94a3b8' }}>Loading PDF Scan...</div>
                        )}
                    </div>

                    {/* RIGHT SIDE: Grading Panel */}
                    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '1rem', overflow: 'auto' }}>
                        
                        <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                            {Object.keys(studentData.grades || {}).map(qKey => {
                                const qData = studentData.grades[qKey];
                                const hasSimilarity = qData?.similarity_flag || qData?.plagiarism_flag;
                                return (
                                    <button 
                                        key={qKey} 
                                        onClick={() => { setActiveQuestion(qKey); setCropBox(null); }}
                                        style={{ 
                                            padding: '0.5rem 1rem', borderRadius: '4px', fontWeight: 'bold', 
                                            border: activeQuestion === qKey ? 'none' : '1px solid #cbd5e1',
                                            background: activeQuestion === qKey ? '#3b82f6' : 'white',
                                            color: activeQuestion === qKey ? 'white' : '#475569',
                                            cursor: 'pointer',
                                            display: 'inline-flex',
                                            alignItems: 'center',
                                            gap: '0.35rem'
                                        }}
                                    >
                                        Q {qKey}
                                        {hasSimilarity && (
                                            <span 
                                                style={{ width: '8px', height: '8px', borderRadius: '50%', backgroundColor: '#ef4444', display: 'inline-block' }} 
                                                title="High logic similarity detected" 
                                            />
                                        )}
                                    </button>
                                );
                            })}
                        </div>

                        {activeQuestion && studentData.grades[activeQuestion] && (
                            <div style={{ background: 'white', padding: '1.5rem', borderRadius: '8px', border: '1px solid #e2e8f0', flex: 1, display: 'flex', flexDirection: 'column' }}>
                                
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1rem' }}>
                                    <div>
                                        <h2 style={{ margin: 0, color: '#1e293b', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                            AI Evaluation 
                                            {!isLocked && <Edit3 size={16} color="#94a3b8" title="You can edit these fields" />}
                                        </h2>
                                        {!isLocked && <span style={{ fontSize: '0.8rem', color: '#64748b' }}>TA can manually override</span>}
                                    </div>
                                    
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                        <input 
                                            ref={scoreInputRef}
                                            type="number"
                                            value={studentData.grades[activeQuestion].total_score === '' ? '' : studentData.grades[activeQuestion].total_score}
                                            onChange={handleScoreOverride}
                                            disabled={isLocked}
                                            style={{ 
                                                width: '70px', fontSize: '1.5rem', fontWeight: 'bold', color: '#10b981', 
                                                padding: '0.5rem', borderRadius: '6px', textAlign: 'center',
                                                border: isLocked ? '1px solid transparent' : '2px solid #e2e8f0',
                                                background: isLocked ? 'transparent' : 'white'
                                            }}
                                        />
                                        <span style={{ fontSize: '1.2rem', fontWeight: 'bold', color: '#64748b' }}>pts</span>
                                    </div>
                                </div>
                                
                                {/* Two-Stage Gatekeeper Fast Exit Indicator */}
                                {studentData.grades[activeQuestion]?.status === 'fast_exit' && (
                                    <div style={{
                                        background: '#f8fafc',
                                        border: '1px solid #cbd5e1',
                                        borderRadius: '6px',
                                        padding: '0.65rem 0.85rem',
                                        marginBottom: '1rem',
                                        display: 'flex',
                                        alignItems: 'center',
                                        gap: '8px',
                                        color: '#334155',
                                        fontSize: '0.85rem',
                                        fontWeight: '600'
                                    }}>
                                        <Zap size={16} color="#0284c7" />
                                        <span>⚡ Fast Exit (Blank/Off-Topic) — Coarse vector gatekeeper classified this response with 0 points (0 LLM tokens spent). You can manually override the score above.</span>
                                    </div>
                                )}

                                {/* Plagiarism & Logic Similarity Warning Banner */}
                                {(studentData.grades[activeQuestion]?.similarity_flag || studentData.grades[activeQuestion]?.plagiarism_flag) && (
                                    <div style={{
                                        background: '#fffbeb',
                                        border: '1px solid #fcd34d',
                                        borderRadius: '6px',
                                        padding: '0.85rem 1rem',
                                        marginBottom: '1rem',
                                        display: 'flex',
                                        flexDirection: 'column',
                                        gap: '0.4rem'
                                    }}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: '#b45309', fontWeight: 'bold' }}>
                                            <AlertTriangle size={18} color="#d97706" />
                                            <span>⚠️ High Logic Similarity Detected</span>
                                            {studentData.grades[activeQuestion]?.similarity_score > 0 && (
                                                <span style={{
                                                    fontSize: '0.75rem',
                                                    background: '#fef3c7',
                                                    color: '#92400e',
                                                    padding: '2px 6px',
                                                    borderRadius: '4px',
                                                    marginLeft: 'auto',
                                                    fontWeight: 'bold'
                                                }}>
                                                    {(studentData.grades[activeQuestion].similarity_score * 100).toFixed(1)}% match
                                                </span>
                                            )}
                                        </div>
                                        {Array.isArray(studentData.grades[activeQuestion]?.similarity_matches) && studentData.grades[activeQuestion].similarity_matches.length > 0 && (
                                            <div style={{ fontSize: '0.85rem', color: '#92400e', display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
                                                <span>Matches found with:</span>
                                                {studentData.grades[activeQuestion].similarity_matches.map((matchedId, idx) => (
                                                    <span 
                                                        key={idx}
                                                        onClick={() => {
                                                            setStudentId(matchedId);
                                                            handleLoadStudent(examId, matchedId);
                                                        }}
                                                        title="Click to view this matching student submission"
                                                        style={{
                                                            background: '#fef3c7',
                                                            color: '#78350f',
                                                            padding: '2px 8px',
                                                            borderRadius: '4px',
                                                            fontWeight: '600',
                                                            cursor: 'pointer',
                                                            border: '1px solid #fde68a',
                                                            textDecoration: 'underline'
                                                        }}
                                                    >
                                                        {matchedId}
                                                    </span>
                                                ))}
                                            </div>
                                        )}
                                    </div>
                                )}
                                
                                <textarea 
                                    value={studentData.grades[activeQuestion].justification}
                                    onChange={handleJustificationOverride}
                                    disabled={isLocked}
                                    rows={8}
                                    style={{ 
                                        width: '100%', color: '#334155', lineHeight: '1.6', marginBottom: '1.5rem', 
                                        padding: '1rem', borderRadius: '6px', fontFamily: 'inherit', resize: 'vertical',
                                        border: isLocked ? '1px solid transparent' : '1px solid #cbd5e1',
                                        background: isLocked ? '#f8fafc' : 'white'
                                    }}
                                />

                                <div style={{ marginTop: 'auto', display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                                    {!isLocked && (
                                        <button 
                                            onClick={handleRegrade} 
                                            disabled={!cropBox || regrading}
                                            style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '0.5rem', background: !cropBox ? '#e2e8f0' : '#f59e0b', color: !cropBox ? '#94a3b8' : 'white', padding: '1rem', borderRadius: '6px', border: 'none', fontWeight: 'bold', cursor: !cropBox ? 'not-allowed' : 'pointer', fontSize: '1rem' }}
                                        >
                                            <Crop size={18} /> {regrading ? 'AI is Re-evaluating...' : 'Force AI Re-Evaluation'}
                                        </button>
                                    )}

                                    {isLocked ? (
                                        <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '0.5rem', background: '#dcfce7', color: '#166534', padding: '1rem', borderRadius: '6px', fontWeight: 'bold' }}>
                                            <CheckCircle size={18} /> Grade Locked by TA
                                        </div>
                                    ) : (
                                        <button 
                                            onClick={handleCommitGrade} 
                                            style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '0.5rem', background: '#10b981', color: 'white', padding: '1rem', borderRadius: '6px', border: 'none', fontWeight: 'bold', cursor: 'pointer', fontSize: '1rem' }}
                                        >
                                            <Save size={18} /> Accept & Lock Grade
                                        </button>
                                    )}
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            ) : null}
        </div>
    );
}