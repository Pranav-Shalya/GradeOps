// // frontend/src/pages/SetupPortal.jsx
// import { useState } from 'react';
// import { useNavigate } from 'react-router-dom'; // <-- Added for redirection
// import { examService } from '../services/api';
// import { UploadCloud, CheckCircle, AlertCircle } from 'lucide-react';

// export default function SetupPortal() {
//     const [title, setTitle] = useState('');
//     const [file, setFile] = useState(null);
//     const [rubricText, setRubricText] = useState('[\n  {\n    "question_number": "1a",\n    "max_score": 10,\n    "criteria_steps": {\n      "step_1": { "points": 10, "description": "Condition text here" }\n    }\n  }\n]');
    
//     const [status, setStatus] = useState('idle'); 
//     const [errorMessage, setErrorMessage] = useState('');
//     const navigate = useNavigate(); // <-- Initialize navigation

//     const handleSubmit = async (e) => {
//         e.preventDefault();
//         setStatus('loading');
//         setErrorMessage('');

//         if (!file || !title) {
//             setErrorMessage('Please provide both an exam title and a PDF file.');
//             setStatus('error');
//             return;
//         }

//         try {
//             // 1. Ensure the Rubric is valid JSON before sending to backend
//             const parsedRubric = JSON.parse(rubricText);

//             // 2. Prepare the File Data
//             const formData = new FormData();
//             formData.append('title', title);
//             // NOTE: We deleted the created_by line here! The backend token handles it now.
//             formData.append('file', file);

//             // 3. Upload the blank PDF template
//             const uploadRes = await examService.uploadExam(formData);
//             const newExamId = uploadRes.data.exam_id;

//             // 4. Attach the Rubric to the new Exam ID
//             await examService.attachRubric(newExamId, parsedRubric);

//             setStatus('success');
            
//             // Send them straight to the command center to upload their students!
//             setTimeout(() => {
//                 navigate('/'); 
//             }, 1000); // 1 second delay so they can read the green success message

//         } catch (error) {
//             console.error(error);
//             setStatus('error');
//             if (error instanceof SyntaxError) {
//                 setErrorMessage('Invalid JSON format in the rubric. Please check your brackets and quotes.');
//             } else {
//                 setErrorMessage(error.response?.data?.detail || 'An error occurred while connecting to the server.');
//             }
//         }
//     };

//     return (
//         <div style={{ maxWidth: '800px', margin: '0 auto', background: '#f8fafc', padding: '2rem', borderRadius: '8px', boxShadow: '0 4px 6px rgba(0,0,0,0.05)' }}>
//             <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '1.5rem' }}>
//                 <UploadCloud size={32} color="#3b82f6" />
//                 <h1 style={{ margin: 0, color: '#1e293b' }}>Exam Setup Portal</h1>
//             </div>
//             <p style={{ color: '#64748b', marginBottom: '2rem' }}>Define the baseline template and strict grading logic for the AI agent.</p>

//             <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
                
//                 <div style={{ display: 'flex', gap: '1rem' }}>
//                     <div style={{ flex: 1 }}>
//                         <label style={{ display: 'block', fontWeight: 'bold', marginBottom: '0.5rem' }}>Exam Title</label>
//                         <input 
//                             type="text" 
//                             value={title}
//                             onChange={(e) => setTitle(e.target.value)}
//                             placeholder="e.g., Midterm 1: Thermodynamics"
//                             style={{ width: '100%', padding: '0.75rem', borderRadius: '4px', border: '1px solid #cbd5e1' }}
//                         />
//                     </div>
//                     <div style={{ flex: 1 }}>
//                         {/* NOTE: Updated Label to fix the UX mental model! */}
//                         <label style={{ display: 'block', fontWeight: 'bold', marginBottom: '0.5rem' }}>Blank Exam Template (PDF)</label>
//                         <input 
//                             type="file" 
//                             accept="application/pdf"
//                             onChange={(e) => setFile(e.target.files[0])}
//                             style={{ width: '100%', padding: '0.65rem', borderRadius: '4px', border: '1px solid #cbd5e1', background: 'white' }}
//                         />
//                     </div>
//                 </div>

//                 <div>
//                     <label style={{ display: 'block', fontWeight: 'bold', marginBottom: '0.5rem' }}>JSON Grading Rubric</label>
//                     <textarea 
//                         rows={12}
//                         value={rubricText}
//                         onChange={(e) => setRubricText(e.target.value)}
//                         style={{ width: '100%', padding: '0.75rem', borderRadius: '4px', border: '1px solid #cbd5e1', fontFamily: 'monospace', resize: 'vertical' }}
//                     />
//                 </div>

//                 {status === 'error' && (
//                     <div style={{ padding: '1rem', background: '#fee2e2', color: '#991b1b', borderRadius: '4px', display: 'flex', alignItems: 'center', gap: '8px' }}>
//                         <AlertCircle size={20} /> {errorMessage}
//                     </div>
//                 )}
//                 {status === 'success' && (
//                     <div style={{ padding: '1rem', background: '#dcfce7', color: '#166534', borderRadius: '4px', display: 'flex', alignItems: 'center', gap: '8px' }}>
//                         <CheckCircle size={20} /> Exam initialized! Routing to Dashboard...
//                     </div>
//                 )}

//                 <button 
//                     type="submit" 
//                     disabled={status === 'loading'}
//                     style={{ 
//                         padding: '1rem', 
//                         background: status === 'loading' ? '#94a3b8' : '#2563eb', 
//                         color: 'white', 
//                         border: 'none', 
//                         borderRadius: '4px', 
//                         fontWeight: 'bold', 
//                         cursor: status === 'loading' ? 'not-allowed' : 'pointer',
//                         fontSize: '1rem'
//                     }}
//                 >
//                     {status === 'loading' ? 'Processing & Initializing...' : 'Initialize Exam Pipeline'}
//                 </button>

//             </form>
//         </div>
//     );
// }
// frontend/src/pages/SetupPortal.jsx
// frontend/src/pages/SetupPortal.jsx
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { examService } from '../services/api';
import { UploadCloud, CheckCircle, AlertCircle, FileArchive } from 'lucide-react';

export default function SetupPortal() {
    const [title, setTitle] = useState('');
    const [file, setFile] = useState(null);
    const [rubricText, setRubricText] = useState('[\n  {\n    "question_number": "1a",\n    "max_score": 10,\n    "criteria_steps": {\n      "step_1": { "points": 10, "description": "Student applied the correct physics formulas." }\n    }\n  }\n]');
    
    const [status, setStatus] = useState('idle'); 
    const [errorMessage, setErrorMessage] = useState('');
    const navigate = useNavigate();

    const handleSubmit = async (e) => {
        e.preventDefault();
        setStatus('loading');
        setErrorMessage('');

        if (!file || !title) {
            setErrorMessage('Please provide both an exam title and the class .zip file.');
            setStatus('error');
            return;
        }

        // UX validation: Ensure they are actually uploading a ZIP
        if (!file.name.toLowerCase().endsWith('.zip')) {
            setErrorMessage('Please upload a .zip file containing the student PDFs.');
            setStatus('error');
            return;
        }

        try {
            // 1. Validate JSON first so we don't send garbage to the backend
            JSON.parse(rubricText);

            // 2. Prepare the Form Data for the unified endpoint
            const formData = new FormData();
            formData.append('title', title);
            formData.append('rubric_json', rubricText); // We send the raw string; FastAPI parses it
            formData.append('file', file); // The ZIP file

            // 3. Hit the new unified /initialize endpoint
            const response = await examService.initializeExam(formData);
            const newExamId = response.data.exam_id;

            setStatus('success');
            
            // 4. Teleport them straight to the Roster to watch the grading happen live!
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
        <div style={{ maxWidth: '800px', margin: '0 auto', background: '#f8fafc', padding: '2rem', borderRadius: '8px', boxShadow: '0 4px 6px rgba(0,0,0,0.05)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '1.5rem' }}>
                <UploadCloud size={32} color="#3b82f6" />
                <h1 style={{ margin: 0, color: '#1e293b' }}>Exam Ingestion Portal</h1>
            </div>
            <p style={{ color: '#64748b', marginBottom: '2rem' }}>Define your grading logic and drop in the class submissions. The AI will immediately begin processing the queue.</p>

            <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
                
                <div style={{ display: 'flex', gap: '1rem' }}>
                    <div style={{ flex: 1 }}>
                        <label style={{ display: 'block', fontWeight: 'bold', marginBottom: '0.5rem' }}>Exam Title</label>
                        <input 
                            type="text" 
                            value={title}
                            onChange={(e) => setTitle(e.target.value)}
                            placeholder="e.g., Midterm 1: Thermodynamics"
                            style={{ width: '100%', padding: '0.75rem', borderRadius: '4px', border: '1px solid #cbd5e1' }}
                        />
                    </div>
                    <div style={{ flex: 1 }}>
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

                <div>
                    <label style={{ display: 'block', fontWeight: 'bold', marginBottom: '0.5rem' }}>JSON Grading Rubric</label>
                    <textarea 
                        rows={12}
                        value={rubricText}
                        onChange={(e) => setRubricText(e.target.value)}
                        style={{ width: '100%', padding: '0.75rem', borderRadius: '4px', border: '1px solid #cbd5e1', fontFamily: 'monospace', resize: 'vertical' }}
                    />
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