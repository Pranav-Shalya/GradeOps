// frontend/src/pages/SetupPortal.jsx
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { examService } from '../services/api';
import { UploadCloud, CheckCircle, AlertCircle, FileArchive, Sparkles, FileText, Loader2, Code } from 'lucide-react';

export default function SetupPortal() {
    const [title, setTitle] = useState('');
    const [file, setFile] = useState(null);
    const [rubricText, setRubricText] = useState('[\n  {\n    "question_number": "1a",\n    "max_score": 10,\n    "criteria_steps": {\n      "step_1": { "points": 10, "description": "Student applied the correct physics formulas." }\n    }\n  }\n]');
    
    // Dual-Path Rubric Tab State: 'upload' | 'generate'
    const [rubricTab, setRubricTab] = useState('upload');
    
    // Auto-Generate Rubric state
    const [examText, setExamText] = useState('');
    const [answerKeyText, setAnswerKeyText] = useState('');
    const [examFile, setExamFile] = useState(null);
    const [answerKeyFile, setAnswerKeyFile] = useState(null);
    const [isGeneratingRubric, setIsGeneratingRubric] = useState(false);
    const [rubricGenSuccess, setRubricGenSuccess] = useState('');
    const [rubricGenError, setRubricGenError] = useState('');

    const [status, setStatus] = useState('idle'); 
    const [errorMessage, setErrorMessage] = useState('');
    const navigate = useNavigate();

    // AI Rubric Generation Handler
    const handleGenerateRubric = async () => {
        setIsGeneratingRubric(true);
        setRubricGenError('');
        setRubricGenSuccess('');

        if (!answerKeyText.trim() && !answerKeyFile) {
            setRubricGenError('Please provide the Reference Answer Key (paste text or upload a PDF/text file).');
            setIsGeneratingRubric(false);
            return;
        }

        try {
            const formData = new FormData();
            const eText = examText.trim() || answerKeyText.trim();
            formData.append('exam_text', eText);
            if (examFile) formData.append('exam_file', examFile);
            
            if (answerKeyText.trim()) formData.append('answer_key_text', answerKeyText.trim());
            if (answerKeyFile) formData.append('answer_key_file', answerKeyFile);

            const response = await examService.generateRubric(formData);
            const generatedRubric = response.data.rubric;

            // Formatted JSON populated into the main textarea
            setRubricText(JSON.stringify(generatedRubric, null, 2));
            setRubricGenSuccess('✨ Rubric generated and populated into the JSON editor! Review and adjust the criteria below.');
            setRubricGenError('');

            // Automatically switch back to the 'upload' (JSON editor) tab for review
            setRubricTab('upload');
        } catch (error) {
            console.error('Rubric Generation Error:', error);
            setRubricGenError(error.response?.data?.detail || 'Failed to auto-generate rubric. Please check inputs and try again.');
        } finally {
            setIsGeneratingRubric(false);
        }
    };

    // Main Exam & Submissions Initialization Handler
    const handleSubmit = async (e) => {
        e.preventDefault();
        setStatus('loading');
        setErrorMessage('');

        if (!file || !title) {
            setErrorMessage('Please provide both an exam title and the class .zip file.');
            setStatus('error');
            return;
        }

        if (!file.name.toLowerCase().endsWith('.zip')) {
            setErrorMessage('Please upload a .zip file containing the student PDFs.');
            setStatus('error');
            return;
        }

        try {
            // Validate JSON format
            JSON.parse(rubricText);

            const formData = new FormData();
            formData.append('title', title);
            formData.append('rubric_json', rubricText);
            formData.append('file', file);

            const response = await examService.initializeExam(formData);
            const newExamId = response.data.exam_id;

            setStatus('success');
            
            setTimeout(() => {
                navigate(`/roster?exam=${newExamId}`); 
            }, 1500);

        } catch (error) {
            console.error(error);
            setStatus('error');
            if (error instanceof SyntaxError) {
                setErrorMessage('Invalid JSON format in the rubric. Please check your brackets and quotes.');
            } else {
                setErrorMessage(error.response?.data?.detail || 'An error occurred while connecting to the server.');
            }
        }
    };

    return (
        <div style={{ maxWidth: '880px', margin: '0 auto', background: '#f8fafc', padding: '2rem', borderRadius: '8px', boxShadow: '0 4px 6px rgba(0,0,0,0.05)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '1.5rem' }}>
                <UploadCloud size={32} color="#3b82f6" />
                <h1 style={{ margin: 0, color: '#1e293b' }}>Exam Ingestion Portal</h1>
            </div>
            <p style={{ color: '#64748b', marginBottom: '2rem' }}>Define your grading logic and drop in the class submissions. The AI will immediately begin processing the queue.</p>

            <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1.75rem' }}>
                
                {/* 1. Exam Title & ZIP Upload */}
                <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap' }}>
                    <div style={{ flex: 1, minWidth: '280px' }}>
                        <label style={{ display: 'block', fontWeight: 'bold', marginBottom: '0.5rem' }}>Exam Title</label>
                        <input 
                            type="text" 
                            value={title}
                            onChange={(e) => setTitle(e.target.value)}
                            placeholder="e.g., Midterm 1: Thermodynamics"
                            style={{ width: '100%', padding: '0.75rem', borderRadius: '4px', border: '1px solid #cbd5e1' }}
                        />
                    </div>
                    <div style={{ flex: 1, minWidth: '280px' }}>
                        <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontWeight: 'bold', marginBottom: '0.5rem' }}>
                            <FileArchive size={16} color="#475569" /> Class Submissions (.zip)
                        </label>
                        <input 
                            type="file" 
                            accept=".zip"
                            onChange={(e) => setFile(e.target.files[0])}
                            style={{ width: '100%', padding: '0.65rem', borderRadius: '4px', border: '1px solid #cbd5e1', background: 'white' }}
                        />
                    </div>
                </div>

                {/* 2. DUAL-PATH RUBRIC CREATOR */}
                <div style={{ background: 'white', padding: '1.5rem', borderRadius: '8px', border: '1px solid #e2e8f0', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                    
                    {/* Tab Switcher */}
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.5rem', borderBottom: '2px solid #f1f5f9', paddingBottom: '0.75rem' }}>
                        <div>
                            <label style={{ fontWeight: 'bold', color: '#1e293b', fontSize: '1rem' }}>Grading Rubric Setup</label>
                            <p style={{ margin: 0, fontSize: '0.8rem', color: '#64748b' }}>Choose how you want to configure your grading criteria</p>
                        </div>

                        <div style={{ display: 'flex', gap: '0.5rem', background: '#f1f5f9', padding: '3px', borderRadius: '6px' }}>
                            <button
                                type="button"
                                onClick={() => setRubricTab('upload')}
                                style={{
                                    padding: '0.45rem 0.9rem',
                                    borderRadius: '4px',
                                    border: 'none',
                                    cursor: 'pointer',
                                    fontWeight: 'bold',
                                    fontSize: '0.85rem',
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '6px',
                                    background: rubricTab === 'upload' ? '#2563eb' : 'transparent',
                                    color: rubricTab === 'upload' ? 'white' : '#64748b',
                                    transition: 'all 0.15s ease-in-out'
                                }}
                            >
                                <Code size={15} /> Upload JSON Rubric
                            </button>

                            <button
                                type="button"
                                onClick={() => setRubricTab('generate')}
                                style={{
                                    padding: '0.45rem 0.9rem',
                                    borderRadius: '4px',
                                    border: 'none',
                                    cursor: 'pointer',
                                    fontWeight: 'bold',
                                    fontSize: '0.85rem',
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '6px',
                                    background: rubricTab === 'generate' ? '#0284c7' : 'transparent',
                                    color: rubricTab === 'generate' ? 'white' : '#64748b',
                                    transition: 'all 0.15s ease-in-out'
                                }}
                            >
                                <Sparkles size={15} /> Generate from Answer Key
                            </button>
                        </div>
                    </div>

                    {rubricGenSuccess && (
                        <div style={{ padding: '0.75rem', background: '#dcfce7', color: '#166534', borderRadius: '4px', fontSize: '0.85rem', display: 'flex', alignItems: 'center', gap: '6px' }}>
                            <CheckCircle size={16} /> {rubricGenSuccess}
                        </div>
                    )}

                    {/* OPTION 1: Upload / Edit JSON Rubric Tab */}
                    {rubricTab === 'upload' && (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                <span style={{ fontSize: '0.85rem', color: '#64748b' }}>
                                    Paste or fine-tune the JSON criteria steps and point allocations:
                                </span>
                            </div>
                            <textarea 
                                rows={12}
                                value={rubricText}
                                onChange={(e) => setRubricText(e.target.value)}
                                style={{ 
                                    width: '100%', 
                                    padding: '0.75rem', 
                                    borderRadius: '4px', 
                                    border: '1px solid #cbd5e1', 
                                    fontFamily: 'monospace', 
                                    resize: 'vertical', 
                                    fontSize: '0.875rem', 
                                    lineHeight: '1.5',
                                    background: '#fcfcfc'
                                }}
                            />
                        </div>
                    )}

                    {/* OPTION 2: Generate from Answer Key Tab */}
                    {rubricTab === 'generate' && (
                        <div style={{ 
                            background: '#f0f9ff', 
                            border: '1px solid #bae6fd', 
                            borderRadius: '6px', 
                            padding: '1.25rem',
                            display: 'flex',
                            flexDirection: 'column',
                            gap: '1rem'
                        }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#0369a1' }}>
                                <Sparkles size={18} color="#0284c7" />
                                <h4 style={{ margin: 0, fontSize: '0.95rem', fontWeight: 'bold' }}>AI Rubric Synthesizer</h4>
                            </div>
                            <p style={{ margin: 0, fontSize: '0.85rem', color: '#0369a1' }}>
                                Paste your official reference solution or answer key. Gemini will map the grading logic into granular, partial-credit steps and return you to the JSON editor.
                            </p>

                            <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap' }}>
                                {/* Blank Exam Optional Prompt */}
                                <div style={{ flex: 1, minWidth: '260px', display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                                    <label style={{ fontSize: '0.85rem', fontWeight: 'bold', color: '#334155' }}>
                                        Blank Exam Questions (Optional)
                                    </label>
                                    <textarea 
                                        rows={5}
                                        value={examText}
                                        onChange={(e) => setExamText(e.target.value)}
                                        placeholder="Paste questions here (optional if included in answer key)..."
                                        style={{ width: '100%', padding: '0.6rem', borderRadius: '4px', border: '1px solid #cbd5e1', fontSize: '0.85rem' }}
                                    />
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.8rem', color: '#64748b' }}>
                                        <FileText size={13} />
                                        <span>Or Exam PDF:</span>
                                        <input 
                                            type="file" 
                                            accept=".pdf,.txt"
                                            onChange={(e) => setExamFile(e.target.files[0])}
                                            style={{ fontSize: '0.75rem' }}
                                        />
                                    </div>
                                </div>

                                {/* Reference Answer Key */}
                                <div style={{ flex: 1, minWidth: '260px', display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                                    <label style={{ fontSize: '0.85rem', fontWeight: 'bold', color: '#334155' }}>
                                        Paste Reference Answer Key *
                                    </label>
                                    <textarea 
                                        rows={5}
                                        value={answerKeyText}
                                        onChange={(e) => setAnswerKeyText(e.target.value)}
                                        placeholder="Paste official solutions, derivations, equations, and target points here..."
                                        style={{ width: '100%', padding: '0.6rem', borderRadius: '4px', border: '1px solid #cbd5e1', fontSize: '0.85rem' }}
                                    />
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.8rem', color: '#64748b' }}>
                                        <FileText size={13} />
                                        <span>Or Solution PDF:</span>
                                        <input 
                                            type="file" 
                                            accept=".pdf,.txt"
                                            onChange={(e) => setAnswerKeyFile(e.target.files[0])}
                                            style={{ fontSize: '0.75rem' }}
                                        />
                                    </div>
                                </div>
                            </div>

                            {rubricGenError && (
                                <div style={{ padding: '0.75rem', background: '#fee2e2', color: '#991b1b', borderRadius: '4px', fontSize: '0.85rem', display: 'flex', alignItems: 'center', gap: '6px' }}>
                                    <AlertCircle size={16} /> {rubricGenError}
                                </div>
                            )}

                            <div>
                                <button 
                                    type="button" 
                                    onClick={handleGenerateRubric}
                                    disabled={isGeneratingRubric}
                                    style={{ 
                                        padding: '0.65rem 1.25rem', 
                                        background: isGeneratingRubric ? '#94a3b8' : '#0284c7', 
                                        color: 'white', 
                                        border: 'none', 
                                        borderRadius: '4px', 
                                        fontWeight: 'bold', 
                                        cursor: isGeneratingRubric ? 'not-allowed' : 'pointer',
                                        fontSize: '0.9rem',
                                        display: 'inline-flex',
                                        alignItems: 'center',
                                        gap: '8px'
                                    }}
                                >
                                    {isGeneratingRubric ? (
                                        <>
                                            <Loader2 size={16} className="animate-spin" /> Auto-Generating Rubric...
                                        </>
                                    ) : (
                                        <>
                                            <Sparkles size={16} /> Auto-Generate Rubric
                                        </>
                                    )}
                                </button>
                            </div>
                        </div>
                    )}
                </div>

                {status === 'error' && (
                    <div style={{ padding: '1rem', background: '#fee2e2', color: '#991b1b', borderRadius: '4px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <AlertCircle size={20} /> {errorMessage}
                    </div>
                )}
                {status === 'success' && (
                    <div style={{ padding: '1rem', background: '#dcfce7', color: '#166534', borderRadius: '4px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <CheckCircle size={20} /> Exam created and ZIP unpacking! Teleporting to Ledger...
                    </div>
                )}

                <button 
                    type="submit" 
                    disabled={status === 'loading'}
                    style={{ 
                        padding: '1rem', 
                        background: status === 'loading' ? '#94a3b8' : '#2563eb', 
                        color: 'white', 
                        border: 'none', 
                        borderRadius: '4px', 
                        fontWeight: 'bold', 
                        cursor: status === 'loading' ? 'not-allowed' : 'pointer',
                        fontSize: '1rem',
                        display: 'flex',
                        justifyContent: 'center',
                        alignItems: 'center',
                        gap: '8px'
                    }}
                >
                    {status === 'loading' ? 'Processing Upload (Do not close)...' : 'Initialize & Auto-Grade'}
                </button>
            </form>
        </div>
    );
}