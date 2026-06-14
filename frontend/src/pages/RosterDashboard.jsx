// frontend/src/pages/RosterDashboard.jsx
import { useState, useEffect } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { examService } from '../services/api';
import { Users, Download, ArrowRight, CheckCircle, Clock, AlertCircle } from 'lucide-react';

export default function RosterDashboard() {
    const [searchParams] = useSearchParams();
    const navigate = useNavigate();

    // Core hidden ID
    const [examId, setExamId] = useState(searchParams.get('exam') || '');
    
    // Searchable UI state
    const [examSearchTerm, setExamSearchTerm] = useState('');
    const [examsList, setExamsList] = useState([]);
    
    const [roster, setRoster] = useState([]);
    const [loading, setLoading] = useState(false);

    // 1. Fetch ALL exams to populate the search list on load
    useEffect(() => {
        const fetchExams = async () => {
            try {
                const res = await examService.getAllExams();
                const examsArray = res.data.exams || [];
                setExamsList(examsArray);

                // Reverse-lookup: If we loaded the page with an ID in the URL, find its Name
                const initialExamId = searchParams.get('exam');
                if (initialExamId && examsArray.length > 0) {
                    const matched = examsArray.find(ex => ex._id === initialExamId);
                    if (matched) setExamSearchTerm(matched.title || matched.exam_name || `Exam ID: ${initialExamId}`);
                }
            } catch (error) {
                console.error("Failed to fetch exams list.");
            }
        };
        fetchExams();
    }, [searchParams]);

    // 2. Fetch the class roster anytime the hidden Exam ID changes
    useEffect(() => {
        if (examId && examId.length > 10) {
            fetchRoster(examId);
        } else {
            setRoster([]);
        }
    }, [examId]);

    const fetchRoster = async (id) => {
        setLoading(true);
        try {
            const res = await examService.getExamRoster(id);
            setRoster(res.data.roster || []);
        } catch (err) {
            console.error("Failed to load roster.");
        } finally {
            setLoading(false);
        }
    };

    // 3. When the user types an exam name, find its hidden ID
    const handleExamSearchChange = (e) => {
        const typedTitle = e.target.value;
        setExamSearchTerm(typedTitle);

        // Check if what they typed matches an exam title exactly
        const matchedExam = examsList.find(ex => (ex.title || ex.exam_name) === typedTitle);
        if (matchedExam) {
            setExamId(matchedExam._id); // Found it! Update the hidden state
            navigate(`/roster?exam=${matchedExam._id}`, { replace: true }); // Update URL cleanly
        } else {
            setExamId(''); // Not a full match yet
        }
    };

    // --- ONE-CLICK CSV EXPORT ---
    const handleExportCSV = () => {
        if (roster.length === 0) return alert("No data to export.");

        const headers = ["Student ID", "Status", "Total Score", "Questions Graded"];
        const csvRows = [headers.join(",")];

        roster.forEach(student => {
            const row = [
                student.submission_id,
                student.status,
                student.total_score || 0,
                student.questions_graded || 0
            ];
            csvRows.push(row.join(","));
        });

        const csvString = csvRows.join("\n");
        const blob = new Blob([csvString], { type: "text/csv" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        
        a.setAttribute("href", url);
        a.setAttribute("download", `${examSearchTerm || 'Class'}_Roster.csv`);
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
    };

    const getStatusBadge = (status) => {
        if (status === 'Human Verified') return <span style={{ display: 'flex', alignItems: 'center', gap: '4px', color: '#166534', background: '#dcfce7', padding: '4px 8px', borderRadius: '12px', fontSize: '0.85rem', fontWeight: 'bold' }}><CheckCircle size={14} /> Verified</span>;
        if (status === 'AI Graded') return <span style={{ display: 'flex', alignItems: 'center', gap: '4px', color: '#1d4ed8', background: '#dbeafe', padding: '4px 8px', borderRadius: '12px', fontSize: '0.85rem', fontWeight: 'bold' }}><CheckCircle size={14} /> AI Graded</span>;
        if (status === 'Failed') return <span style={{ display: 'flex', alignItems: 'center', gap: '4px', color: '#991b1b', background: '#fee2e2', padding: '4px 8px', borderRadius: '12px', fontSize: '0.85rem', fontWeight: 'bold' }}><AlertCircle size={14} /> Failed</span>;
        return <span style={{ display: 'flex', alignItems: 'center', gap: '4px', color: '#b45309', background: '#fef3c7', padding: '4px 8px', borderRadius: '12px', fontSize: '0.85rem', fontWeight: 'bold' }}><Clock size={14} /> Pending</span>;
    };

    return (
        <div style={{ maxWidth: '1200px', margin: '0 auto', padding: '2rem 1rem' }}>
            
            {/* Header */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem' }}>
                <div>
                    <h1 style={{ color: '#1e293b', margin: '0 0 0.5rem 0', display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                        <Users size={28} color="#3b82f6" />
                        Class Ledger
                    </h1>
                    <p style={{ margin: 0, color: '#64748b' }}>Overview of all student submissions and grading statuses.</p>
                </div>
            </div>

            {/* Controls Bar: Searchable Input & Export Button */}
            <div style={{ display: 'flex', gap: '1rem', background: 'white', padding: '1rem', borderRadius: '8px', boxShadow: '0 1px 3px rgba(0,0,0,0.1)', marginBottom: '1.5rem', alignItems: 'center' }}>
                
                <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: '1rem' }}>
                    <span style={{ fontWeight: 'bold', color: '#475569', whiteSpace: 'nowrap' }}>Select Exam:</span>
                    
                    {/* The Searchable Datalist */}
                    <input 
                        list="exam-roster-list"
                        placeholder="Search Exam Name (e.g. PT3)..." 
                        value={examSearchTerm}
                        onChange={handleExamSearchChange}
                        style={{ flex: 1, maxWidth: '400px', padding: '0.5rem', borderRadius: '4px', border: '1px solid #cbd5e1' }} 
                    />
                    <datalist id="exam-roster-list">
                        {examsList.map(ex => (
                            <option key={ex._id} value={ex.title || ex.exam_name} />
                        ))}
                    </datalist>
                </div>

                <button 
                    onClick={handleExportCSV} 
                    disabled={roster.length === 0}
                    style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', background: roster.length === 0 ? '#cbd5e1' : '#10b981', color: 'white', border: 'none', padding: '0.65rem 1.25rem', borderRadius: '6px', cursor: roster.length === 0 ? 'not-allowed' : 'pointer', fontWeight: 'bold', transition: 'background 0.2s' }}
                >
                    <Download size={18} /> Export CSV
                </button>
            </div>

            {/* The Ledger Table */}
            <div style={{ background: 'white', borderRadius: '8px', border: '1px solid #e2e8f0', overflow: 'hidden', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.05)' }}>
                {loading ? (
                    <div style={{ padding: '3rem', textAlign: 'center', color: '#64748b' }}>Loading Class Roster...</div>
                ) : roster.length === 0 ? (
                    <div style={{ padding: '3rem', textAlign: 'center', color: '#64748b' }}>
                        {examSearchTerm ? "No submissions found for this exam yet." : "Please select an exam above to view the roster."}
                    </div>
                ) : (
                    <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
                        <thead style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
                            <tr>
                                <th style={{ padding: '1rem', color: '#475569', fontWeight: 'bold' }}>Student ID</th>
                                <th style={{ padding: '1rem', color: '#475569', fontWeight: 'bold' }}>Status</th>
                                <th style={{ padding: '1rem', color: '#475569', fontWeight: 'bold' }}>Questions Graded</th>
                                <th style={{ padding: '1rem', color: '#475569', fontWeight: 'bold' }}>Total Score</th>
                                <th style={{ padding: '1rem', color: '#475569', fontWeight: 'bold', textAlign: 'right' }}>Actions</th>
                            </tr>
                        </thead>
                        <tbody>
                            {roster.map((student, idx) => (
                                <tr key={student.submission_id} style={{ borderBottom: idx === roster.length - 1 ? 'none' : '1px solid #e2e8f0', transition: 'background 0.1s' }}>
                                    <td style={{ padding: '1rem', fontWeight: '500', color: '#0f172a' }}>{student.submission_id}</td>
                                    <td style={{ padding: '1rem' }}>{getStatusBadge(student.status)}</td>
                                    <td style={{ padding: '1rem', color: '#64748b' }}>{student.questions_graded || 0}</td>
                                    <td style={{ padding: '1rem', fontWeight: 'bold', color: '#0f172a' }}>{student.total_score || 0} pts</td>
                                    <td style={{ padding: '1rem', textAlign: 'right' }}>
                                        <button 
                                            onClick={() => navigate(`/runner?exam=${examId}&student=${student.submission_id}`)}
                                            style={{ display: 'inline-flex', alignItems: 'center', gap: '0.25rem', background: '#f1f5f9', color: '#3b82f6', border: 'none', padding: '0.5rem 0.75rem', borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold', fontSize: '0.85rem' }}
                                        >
                                            Review <ArrowRight size={14} />
                                        </button>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                )}
            </div>
        </div>
    );
}