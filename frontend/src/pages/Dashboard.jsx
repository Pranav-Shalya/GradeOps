// frontend/src/pages/Dashboard.jsx
import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { examService, authService, teamService } from '../services/api';
import { BookOpen, UploadCloud, Users, BarChart2, Key, Copy, Check, Shield, Activity, UserCheck, Trash2 } from 'lucide-react';

export default function Dashboard() {
    const [exams, setExams] = useState([]);
    const [userProfile, setUserProfile] = useState(null);
    const [teamData, setTeamData] = useState(null);
    const [loading, setLoading] = useState(true);
    const [copied, setCopied] = useState(false);
    const navigate = useNavigate();

    useEffect(() => {
        loadDashboardData();
    }, []);

    const loadDashboardData = async () => {
        setLoading(true);
        try {
            // 1. Fetch User Profile
            const profileRes = await authService.getMe();
            const profile = profileRes.data;
            setUserProfile(profile);

            // 2. Fetch Exams for this role / tenant
            const examsRes = await examService.getAllExams();
            setExams(examsRes.data.exams || []);

            // 3. If Instructor, fetch TA Activity
            if (profile.role === 'INSTRUCTOR') {
                try {
                    const teamRes = await teamService.getTeamActivity();
                    setTeamData(teamRes.data);
                } catch (teamErr) {
                    console.warn("Could not load team analytics", teamErr);
                }
            }
        } catch (error) {
            console.error("Failed to load dashboard data", error);
        } finally {
            setLoading(false);
        }
    };

    const handleCopyCode = () => {
        const code = userProfile?.access_code || teamData?.access_code;
        if (code) {
            navigator.clipboard.writeText(code);
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
        }
    };

    const handleDeleteExam = async (examId, examTitle) => {
        const confirmMsg = `Are you sure you want to delete "${examTitle || 'this exam'}" and all its student submissions?\n\nThis action is permanent and cannot be undone.`;
        if (!window.confirm(confirmMsg)) {
            return;
        }

        try {
            await examService.deleteExam(examId);
            // Immediately update local state to remove the deleted exam
            setExams(prev => prev.filter(exam => exam._id !== examId));
            
            // Refresh team analytics stats if instructor
            if (userProfile?.role === 'INSTRUCTOR') {
                try {
                    const teamRes = await teamService.getTeamActivity();
                    setTeamData(teamRes.data);
                } catch (e) {
                    console.warn("Failed to refresh team data after deletion", e);
                }
            }
        } catch (error) {
            console.error("Failed to delete exam", error);
            alert(error.response?.data?.detail || "Failed to delete exam. Please try again.");
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
            navigate(`/roster?exam=${examId}`); 
        } catch (error) {
            alert('Failed to upload batch.');
        }
    };

    if (loading) {
        return (
            <div style={{ textAlign: 'center', marginTop: '4rem', color: '#64748b' }}>
                Loading Command Center & Team Workspace...
            </div>
        );
    }

    const isInstructor = userProfile?.role === 'INSTRUCTOR';
    const accessCode = userProfile?.access_code || teamData?.access_code;

    return (
        <div style={{ maxWidth: '1100px', margin: '0 auto', display: 'flex', flexDirection: 'column', gap: '2rem' }}>
            
            {/* Top Bar: Header & Actions */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
                <div>
                    <h1 style={{ color: '#1e293b', margin: 0, display: 'flex', alignItems: 'center', gap: '8px' }}>
                        {isInstructor ? 'Professor Command Center' : 'TA Grading Workspace'}
                    </h1>
                    <p style={{ margin: '4px 0 0 0', color: '#64748b', fontSize: '0.9rem' }}>
                        {isInstructor 
                            ? 'Manage your courses, auto-grading rubrics, and TA grading assignments' 
                            : 'Connected to instructor workspace. Review student submissions and audit AI scores'}
                    </p>
                </div>

                {isInstructor && (
                    <button 
                        onClick={() => navigate('/setup')} 
                        style={{ 
                            background: '#2563eb', 
                            color: 'white', 
                            border: 'none', 
                            padding: '0.75rem 1.5rem', 
                            borderRadius: '6px', 
                            fontWeight: 'bold', 
                            cursor: 'pointer', 
                            display: 'flex', 
                            alignItems: 'center', 
                            gap: '0.5rem',
                            fontSize: '0.95rem',
                            boxShadow: '0 2px 4px rgba(37,99,235,0.2)'
                        }}
                    >
                        <BookOpen size={18} /> New Exam Template
                    </button>
                )}
            </div>

            {/* 1. INSTRUCTOR ACCESS CODE BANNER (Only for INSTRUCTOR) */}
            {isInstructor && accessCode && (
                <div style={{ 
                    background: 'linear-gradient(135deg, #1e293b 0%, #0f172a 100%)', 
                    color: 'white', 
                    padding: '1.25rem 1.75rem', 
                    borderRadius: '8px', 
                    display: 'flex', 
                    justifyContent: 'space-between', 
                    alignItems: 'center',
                    flexWrap: 'wrap',
                    gap: '1rem',
                    boxShadow: '0 4px 12px rgba(15,23,42,0.15)'
                }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                        <div style={{ background: 'rgba(255,255,255,0.1)', padding: '0.75rem', borderRadius: '8px' }}>
                            <Key size={24} color="#38bdf8" />
                        </div>
                        <div>
                            <div style={{ fontSize: '0.8rem', color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '1px', fontWeight: 'bold' }}>
                                TA Invite Access Code
                            </div>
                            <div style={{ fontSize: '1.4rem', fontWeight: 'bold', letterSpacing: '3px', color: '#38bdf8', fontFamily: 'monospace' }}>
                                {accessCode}
                            </div>
                        </div>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                        <span style={{ fontSize: '0.85rem', color: '#cbd5e1' }}>
                            Share this code with your TAs during registration
                        </span>
                        <button 
                            onClick={handleCopyCode}
                            style={{ 
                                background: copied ? '#10b981' : '#334155', 
                                color: 'white', 
                                border: 'none', 
                                padding: '0.5rem 1rem', 
                                borderRadius: '6px', 
                                cursor: 'pointer',
                                display: 'flex',
                                alignItems: 'center',
                                gap: '6px',
                                fontWeight: 'bold',
                                fontSize: '0.85rem',
                                transition: 'all 0.15s ease'
                            }}
                        >
                            {copied ? <Check size={16} /> : <Copy size={16} />}
                            {copied ? 'Copied!' : 'Copy Code'}
                        </button>
                    </div>
                </div>
            )}

            {/* 2. TA LINKED WORKSPACE BADGE (Only for TA) */}
            {!isInstructor && (
                <div style={{ 
                    background: '#eff6ff', 
                    border: '1px solid #bfdbfe', 
                    padding: '1rem 1.5rem', 
                    borderRadius: '8px', 
                    display: 'flex', 
                    alignItems: 'center', 
                    gap: '12px' 
                }}>
                    <Shield size={20} color="#2563eb" />
                    <div>
                        <div style={{ fontWeight: 'bold', color: '#1e40af', fontSize: '0.95rem' }}>
                            Teaching Assistant Workspace
                        </div>
                        <div style={{ fontSize: '0.85rem', color: '#3b82f6' }}>
                            You are linked to your supervising professor's exams and review queues.
                        </div>
                    </div>
                </div>
            )}

            {/* 3. ACTIVE EXAMS SECTION */}
            <div>
                <h2 style={{ color: '#1e293b', fontSize: '1.25rem', marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <BookOpen size={20} color="#2563eb" /> Active Exams ({exams.length})
                </h2>

                {exams.length === 0 ? (
                    <div style={{ textAlign: 'center', padding: '3.5rem', background: '#f8fafc', borderRadius: '8px', border: '2px dashed #cbd5e1' }}>
                        <h3 style={{ color: '#64748b', margin: 0 }}>
                            {isInstructor 
                                ? 'No exams created yet. Click "New Exam Template" to get started!' 
                                : 'No exams found from your supervising professor.'}
                        </h3>
                    </div>
                ) : (
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: '1.5rem' }}>
                        {exams.map((exam) => (
                            <div key={exam._id} style={{ background: 'white', padding: '1.5rem', borderRadius: '8px', boxShadow: '0 2px 4px rgba(0,0,0,0.05)', border: '1px solid #e2e8f0', display: 'flex', flexDirection: 'column', position: 'relative' }}>
                                
                                {/* Card Header with Exam Title and Delete Button */}
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '0.5rem' }}>
                                    <h3 style={{ margin: 0, color: '#0f172a', fontSize: '1.1rem', wordBreak: 'break-word', flex: 1, paddingRight: '8px' }}>
                                        {exam.title}
                                    </h3>
                                    {isInstructor && (
                                        <button
                                            title="Delete Exam and Submissions"
                                            onClick={() => handleDeleteExam(exam._id, exam.title)}
                                            style={{
                                                background: 'transparent',
                                                border: 'none',
                                                color: '#94a3b8',
                                                cursor: 'pointer',
                                                padding: '4px',
                                                borderRadius: '4px',
                                                display: 'flex',
                                                alignItems: 'center',
                                                justifyContent: 'center',
                                                transition: 'all 0.15s ease'
                                            }}
                                            onMouseEnter={(e) => { e.currentTarget.style.color = '#ef4444'; e.currentTarget.style.background = '#fee2e2'; }}
                                            onMouseLeave={(e) => { e.currentTarget.style.color = '#94a3b8'; e.currentTarget.style.background = 'transparent'; }}
                                        >
                                            <Trash2 size={18} />
                                        </button>
                                    )}
                                </div>

                                <div style={{ fontSize: '0.8rem', color: '#64748b', marginBottom: '1.25rem', fontFamily: 'monospace' }}>Exam ID: {exam._id}</div>
                                
                                <div style={{ marginTop: 'auto', display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                                    {isInstructor && (
                                        <label style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '0.5rem', background: '#f8fafc', color: '#334155', padding: '0.65rem', borderRadius: '6px', cursor: 'pointer', fontWeight: '500', border: '1px dashed #cbd5e1', fontSize: '0.85rem' }}>
                                            <UploadCloud size={16} color="#10b981" /> Upload Late Student (PDF)
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
                                    )}

                                    <div style={{ display: 'flex', gap: '0.75rem' }}>
                                        <button onClick={() => navigate(`/roster?exam=${exam._id}`)} style={{ flex: 1, display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '0.5rem', background: '#0f172a', color: 'white', border: 'none', padding: '0.65rem', borderRadius: '6px', cursor: 'pointer', fontWeight: 'bold', fontSize: '0.85rem' }}>
                                            <Users size={16} /> Roster & Ledger
                                        </button>
                                        <button onClick={() => navigate(`/insights?exam=${exam._id}`)} style={{ flex: 1, display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '0.5rem', background: '#8b5cf6', color: 'white', border: 'none', padding: '0.65rem', borderRadius: '6px', cursor: 'pointer', fontWeight: 'bold', fontSize: '0.85rem' }}>
                                            <BarChart2 size={16} /> Insights
                                        </button>
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>

            {/* 4. INSTRUCTOR TEAM ANALYTICS & TA ACTIVITY TABLE (Only for INSTRUCTOR) */}
            {isInstructor && (
                <div style={{ background: 'white', padding: '1.75rem', borderRadius: '8px', border: '1px solid #e2e8f0', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem' }}>
                        <div>
                            <h2 style={{ margin: 0, color: '#1e293b', fontSize: '1.2rem', display: 'flex', alignItems: 'center', gap: '8px' }}>
                                <Activity size={20} color="#0284c7" /> Teaching Assistant Team Activity
                            </h2>
                            <p style={{ margin: '4px 0 0 0', color: '#64748b', fontSize: '0.85rem' }}>
                                Real-time audit throughput of linked Teaching Assistants
                            </p>
                        </div>
                        <span style={{ fontSize: '0.85rem', background: '#f1f5f9', color: '#475569', padding: '4px 10px', borderRadius: '20px', fontWeight: 'bold' }}>
                            {teamData?.total_tas || 0} TAs Linked • {teamData?.total_reviews_completed || 0} Questions Audited
                        </span>
                    </div>

                    {(!teamData || !teamData.team_members || teamData.team_members.length === 0) ? (
                        <div style={{ padding: '2rem', textAlign: 'center', background: '#f8fafc', borderRadius: '6px', border: '1px dashed #cbd5e1', color: '#64748b' }}>
                            <UserCheck size={32} color="#94a3b8" style={{ margin: '0 auto 0.5rem auto' }} />
                            <div>No Teaching Assistants have registered with your access code yet.</div>
                            <div style={{ fontSize: '0.85rem', marginTop: '4px' }}>
                                Share code <strong style={{ color: '#0284c7' }}>{accessCode}</strong> with your TAs to onboard them to your dashboard.
                            </div>
                        </div>
                    ) : (
                        <div style={{ overflowX: 'auto' }}>
                            <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.9rem' }}>
                                <thead>
                                    <tr style={{ background: '#f8fafc', borderBottom: '2px solid #e2e8f0', color: '#475569' }}>
                                        <th style={{ padding: '0.75rem 1rem' }}>TA Name</th>
                                        <th style={{ padding: '0.75rem 1rem' }}>Email</th>
                                        <th style={{ padding: '0.75rem 1rem', textAlign: 'center' }}>Submissions Verified</th>
                                        <th style={{ padding: '0.75rem 1rem', textAlign: 'center' }}>Questions Reviewed</th>
                                        <th style={{ padding: '0.75rem 1rem', textAlign: 'center' }}>Status</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {teamData.team_members.map((ta) => (
                                        <tr key={ta.ta_id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                                            <td style={{ padding: '0.85rem 1rem', fontWeight: '600', color: '#1e293b' }}>
                                                {ta.full_name}
                                            </td>
                                            <td style={{ padding: '0.85rem 1rem', color: '#64748b' }}>
                                                {ta.email}
                                            </td>
                                            <td style={{ padding: '0.85rem 1rem', textAlign: 'center', fontWeight: 'bold', color: '#0f172a' }}>
                                                {ta.submissions_verified}
                                            </td>
                                            <td style={{ padding: '0.85rem 1rem', textAlign: 'center', fontWeight: 'bold', color: '#2563eb' }}>
                                                {ta.reviews_completed}
                                            </td>
                                            <td style={{ padding: '0.85rem 1rem', textAlign: 'center' }}>
                                                <span style={{ 
                                                    padding: '3px 8px', 
                                                    borderRadius: '12px', 
                                                    fontSize: '0.75rem', 
                                                    fontWeight: 'bold',
                                                    background: ta.reviews_completed > 0 ? '#dcfce7' : '#f1f5f9',
                                                    color: ta.reviews_completed > 0 ? '#166534' : '#64748b'
                                                }}>
                                                    {ta.status}
                                                </span>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}