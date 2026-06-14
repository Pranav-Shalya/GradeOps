// frontend/src/pages/Dashboard.jsx
import { useState, useEffect } from 'react';
import { useNavigate} from 'react-router-dom';
import { examService } from '../services/api';
import { BookOpen, UploadCloud, Users, BarChart2 } from 'lucide-react';

export default function Dashboard() {
    const [exams, setExams] = useState([]);
    const [loading, setLoading] = useState(true);
    const navigate = useNavigate();

    useEffect(() => {
        fetchExams();
    }, []);

    const fetchExams = async () => {
        try {
            const response = await examService.getAllExams();
            setExams(response.data.exams);
        } catch (error) {
            console.error("Failed to load exams", error);
        } finally {
            setLoading(false);
        }
    };

    const handleZipUpload = async (examId, e) => {
        const file = e.target.files[0];
        if (!file || !file.name.endsWith('.zip')) {
            alert('Please upload a valid .zip file.');
            return;
        }

        const formData = new FormData();
        formData.append('file', file);

        try {
            alert('Uploading batch... The AI is starting its grading process in the background!');
            await examService.batchUpload(examId, formData);
            // Navigate straight to the roster so they can watch the grades roll in!
            navigate(`/roster?exam=${examId}`); 
        } catch (error) {
            alert('Failed to upload batch.');
        }
    };

    if (loading) return <div style={{ textAlign: 'center', marginTop: '4rem' }}>Loading Command Center...</div>;

    return (
        <div style={{ maxWidth: '1000px', margin: '0 auto' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem' }}>
                <h1 style={{ color: '#1e293b' }}>My Classrooms</h1>
                <button onClick={() => navigate('/setup')} style={{ background: '#2563eb', color: 'white', border: 'none', padding: '0.75rem 1.5rem', borderRadius: '6px', fontWeight: 'bold', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <BookOpen size={18} /> New Exam Template
                </button>
            </div>

            {exams.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '4rem', background: '#f8fafc', borderRadius: '8px', border: '2px dashed #cbd5e1' }}>
                    <h3 style={{ color: '#64748b' }}>No exams found. Click "New Exam Template" to get started!</h3>
                </div>
            ) : (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: '1.5rem' }}>
                    {exams.map((exam) => (
                        <div key={exam._id} style={{ background: 'white', padding: '1.5rem', borderRadius: '8px', boxShadow: '0 4px 6px rgba(0,0,0,0.05)', border: '1px solid #e2e8f0' }}>
                            <h3 style={{ marginTop: '0', color: '#0f172a', marginBottom: '1rem' }}>{exam.title}</h3>
                            <div style={{ fontSize: '0.85rem', color: '#64748b', marginBottom: '1.5rem' }}>ID: {exam._id}</div>
                            
                           {/* Update this section inside the exams.map in Dashboard.jsx */}
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                                
                                {/* Option 1: The Bulk ZIP Upload */}
                                <label style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '0.5rem', background: '#f1f5f9', color: '#334155', padding: '0.75rem', borderRadius: '6px', cursor: 'pointer', fontWeight: '500', border: '1px dashed #cbd5e1' }}>
                                    <UploadCloud size={18} color="#2563eb" /> Upload Class ZIP
                                    <input type="file" accept=".zip" style={{ display: 'none' }} onChange={(e) => handleZipUpload(exam._id, e)} />
                                </label>

                                {/* Option 2: The New Single PDF Upload */}
                                <label style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '0.5rem', background: '#f1f5f9', color: '#334155', padding: '0.75rem', borderRadius: '6px', cursor: 'pointer', fontWeight: '500', border: '1px dashed #cbd5e1' }}>
                                    <UploadCloud size={18} color="#10b981" /> Upload Late Student (PDF)
                                    <input type="file" accept=".pdf" style={{ display: 'none' }} onChange={async (e) => {
                                        const file = e.target.files[0];
                                        if (!file) return;
                                        const formData = new FormData();
                                        formData.append('file', file);
                                        try {
                                            alert(`Uploading ${file.name}... The AI is grading it in the background!`);
                                            await examService.singleUpload(exam._id, formData);
                                            navigate(`/roster?exam=${exam._id}`);
                                        } catch (err) {
                                            alert('Failed to upload single submission.');
                                        }
                                    }} />
                                </label>

                                <div style={{ display: 'flex', gap: '0.75rem' }}>
                                    <button onClick={() => navigate(`/roster?exam=${exam._id}`)} style={{ flex: 1, display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '0.5rem', background: '#0f172a', color: 'white', border: 'none', padding: '0.75rem', borderRadius: '6px', cursor: 'pointer', fontWeight: 'bold' }}>
                                        <Users size={18} /> Roster
                                    </button>
                                    <button onClick={() => navigate(`/insights?exam=${exam._id}`)} style={{ flex: 1, display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '0.5rem', background: '#8b5cf6', color: 'white', border: 'none', padding: '0.75rem', borderRadius: '6px', cursor: 'pointer', fontWeight: 'bold' }}>
                                        <BarChart2 size={18} /> Insights
                                    </button>
                                </div>
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}