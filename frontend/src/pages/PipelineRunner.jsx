// frontend/src/pages/PipelineRunner.jsx
import { useState, useRef } from 'react';
import { examService } from '../services/api';
import { Target, Play, Image as ImageIcon } from 'lucide-react';

export default function PipelineRunner() {
    const [examId, setExamId] = useState('');
    const [submissionId, setSubmissionId] = useState('');
    const [questionKey, setQuestionKey] = useState('1a');
    const [pageNum, setPageNum] = useState(0); // 0-indexed
    
    const [status, setStatus] = useState('idle'); // idle, grading, success, error
    
    // Cropper State
    const [isDrawing, setIsDrawing] = useState(false);
    const [startPos, setStartPos] = useState({ x: 0, y: 0 });
    const [currentPos, setCurrentPos] = useState({ x: 0, y: 0 });
    const [finalBox, setFinalBox] = useState(null); // The final [x0, y0, x1, y1, page] array
    
    const imageRef = useRef(null);

    // --- Mouse Event Handlers for Drawing ---
    const handleMouseDown = (e) => {
        const rect = imageRef.current.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;
        setStartPos({ x, y });
        setCurrentPos({ x, y });
        setIsDrawing(true);
        setFinalBox(null);
    };

    const handleMouseMove = (e) => {
        if (!isDrawing) return;
        const rect = imageRef.current.getBoundingClientRect();
        setCurrentPos({
            x: Math.max(0, Math.min(e.clientX - rect.left, rect.width)),
            y: Math.max(0, Math.min(e.clientY - rect.top, rect.height))
        });
    };

    const handleMouseUp = () => {
        if (!isDrawing) return;
        setIsDrawing(false);
        
        // Calculate the box relative to the actual, unscaled image dimensions
        const img = imageRef.current;
        const scaleX = img.naturalWidth / img.clientWidth;
        const scaleY = img.naturalHeight / img.clientHeight;

        const x0 = Math.min(startPos.x, currentPos.x) * scaleX;
        const x1 = Math.max(startPos.x, currentPos.x) * scaleX;
        const y0 = Math.min(startPos.y, currentPos.y) * scaleY;
        const y1 = Math.max(startPos.y, currentPos.y) * scaleY;

        // Ensure the box isn't just a tiny accidental click
        if (x1 - x0 > 10 && y1 - y0 > 10) {
            setFinalBox([Math.round(x0), Math.round(y0), Math.round(x1), Math.round(y1), parseInt(pageNum)]);
        }
    };

    // --- Execute the Pipeline ---
    const handleRunPipeline = async () => {
        if (!examId || !submissionId || !finalBox) {
            alert("Please provide an Exam ID, Submission ID, and draw a box on the image.");
            return;
        }

        setStatus('grading');
        try {
            // Send the exact dictionary format your backend expects
            const boundingBoxes = { [questionKey]: finalBox };
            await examService.gradeSubmission(examId, submissionId, boundingBoxes);
            setStatus('success');
        } catch (error) {
            console.error(error);
            setStatus('error');
            alert("Pipeline failed. Check backend console.");
        }
    };

    return (
        <div style={{ maxWidth: '1000px', margin: '0 auto', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <Target size={32} color="#8b5cf6" />
                <h2 style={{ margin: 0, color: '#1e293b' }}>AI Grading Trigger</h2>
            </div>
            
            {/* Control Panel */}
            <div style={{ display: 'flex', gap: '1rem', background: '#f8fafc', padding: '1rem', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
                <input type="text" placeholder="Exam ID" value={examId} onChange={(e) => setExamId(e.target.value.trim())} style={{ padding: '0.5rem', borderRadius: '4px', border: '1px solid #cbd5e1', flex: 2 }} />
                <input type="text" placeholder="Student Roll No." value={submissionId} onChange={(e) => setSubmissionId(e.target.value.trim())} style={{ padding: '0.5rem', borderRadius: '4px', border: '1px solid #cbd5e1', flex: 1 }} />
                <input type="text" placeholder="Q Key (e.g., 1a)" value={questionKey} onChange={(e) => setQuestionKey(e.target.value.trim())} style={{ padding: '0.5rem', borderRadius: '4px', border: '1px solid #cbd5e1', width: '120px' }} />
                <input type="number" placeholder="Page (0=first)" value={pageNum} onChange={(e) => setPageNum(e.target.value)} style={{ padding: '0.5rem', borderRadius: '4px', border: '1px solid #cbd5e1', width: '120px' }} />
            </div>

            {/* Interactive Cropping Workspace */}
            <div style={{ display: 'flex', gap: '1.5rem', alignItems: 'flex-start' }}>
                
                {/* PDF Image Canvas */}
                <div style={{ flex: 1, background: '#e2e8f0', borderRadius: '8px', border: '2px dashed #cbd5e1', display: 'flex', justifyContent: 'center', overflow: 'hidden' }}>
                    {examId ? (
                        <div 
                            style={{ position: 'relative', cursor: 'crosshair', display: 'inline-block' }}
                            onMouseDown={handleMouseDown}
                            onMouseMove={handleMouseMove}
                            onMouseUp={handleMouseUp}
                            onMouseLeave={handleMouseUp}
                        >
                            {/* The Backend Page Image */}
                            <img 
                                ref={imageRef}
                                src={`http://127.0.0.1:8000/api/exams/${examId}/pages/${pageNum}`} 
                                alt={`Page ${pageNum}`} 
                                style={{ display: 'block', maxWidth: '100%', userSelect: 'none' }}
                                draggable={false}
                            />
                            
                            {/* The Drawn Box Overlay */}
                            {(isDrawing || finalBox) && (
                                <div style={{
                                    position: 'absolute',
                                    border: '2px dashed #2563eb',
                                    backgroundColor: 'rgba(37, 99, 235, 0.1)',
                                    pointerEvents: 'none', // Prevents the box from interfering with mouse moves
                                    left: isDrawing ? Math.min(startPos.x, currentPos.x) : (finalBox[0] / (imageRef.current?.naturalWidth || 1)) * imageRef.current?.clientWidth,
                                    top: isDrawing ? Math.min(startPos.y, currentPos.y) : (finalBox[1] / (imageRef.current?.naturalHeight || 1)) * imageRef.current?.clientHeight,
                                    width: isDrawing ? Math.abs(currentPos.x - startPos.x) : ((finalBox[2] - finalBox[0]) / (imageRef.current?.naturalWidth || 1)) * imageRef.current?.clientWidth,
                                    height: isDrawing ? Math.abs(currentPos.y - startPos.y) : ((finalBox[3] - finalBox[1]) / (imageRef.current?.naturalHeight || 1)) * imageRef.current?.clientHeight,
                                }} />
                            )}
                        </div>
                    ) : (
                        <div style={{ padding: '4rem', color: '#64748b', textAlign: 'center' }}>
                            <ImageIcon size={48} style={{ opacity: 0.5, marginBottom: '1rem' }} />
                            <p>Enter an Exam ID above to load the document.</p>
                        </div>
                    )}
                </div>

                {/* Execution Side Panel */}
                <div style={{ width: '300px', background: 'white', padding: '1.5rem', borderRadius: '8px', border: '1px solid #e2e8f0', display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
                    <div>
                        <h4 style={{ margin: '0 0 0.5rem 0' }}>BBox Coordinates</h4>
                        <div style={{ background: '#f8fafc', padding: '1rem', borderRadius: '4px', fontFamily: 'monospace', color: finalBox ? '#1e293b' : '#94a3b8' }}>
                            {finalBox ? JSON.stringify(finalBox) : "[ Draw a box on the PDF ]"}
                        </div>
                    </div>

                    <button 
                        onClick={handleRunPipeline}
                        disabled={!finalBox || status === 'grading'}
                        style={{ padding: '1rem', background: (!finalBox || status === 'grading') ? '#94a3b8' : '#8b5cf6', color: 'white', border: 'none', borderRadius: '6px', fontWeight: 'bold', cursor: (!finalBox || status === 'grading') ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}
                    >
                        <Play size={18} />
                        {status === 'grading' ? 'AI is Grading...' : 'Run Grading Pipeline'}
                    </button>

                    {status === 'success' && (
                        <p style={{ color: '#16a34a', fontWeight: 'bold', margin: 0, textAlign: 'center' }}>Grading complete! You can now view it in the Review Dashboard.</p>
                    )}
                </div>
            </div>
        </div>
    );
}