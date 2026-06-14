// frontend/src/pages/InsightsDashboard.jsx
import { useState, useEffect } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { examService } from '../services/api';
import { BarChart2, TrendingUp, Users, Target, ArrowLeft, AlertCircle } from 'lucide-react';

export default function InsightsDashboard() {
    const [searchParams] = useSearchParams();
    const navigate = useNavigate();
    const examId = searchParams.get('exam');

    const [stats, setStats] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');

    useEffect(() => {
        if (!examId) {
            setError("No Exam ID provided in the URL.");
            setLoading(false);
            return;
        }
        fetchAndCalculateStats();
    }, [examId]);

    const fetchAndCalculateStats = async () => {
        try {
            // Fetch all submissions for this exam (the same endpoint your Roster uses)
            const response = await examService.getExamRoster(examId); 
            const submissions = response.data.roster || [];

            if (submissions.length === 0) {
                setError("No submissions found for this exam yet.");
                setLoading(false);
                return;
            }

            // --- CALCULATE ANALYTICS ON THE FLY ---
            let totalScoreSum = 0;
            let maxScore = -Infinity;
            let minScore = Infinity;
            let questionStats = {};

            submissions.forEach(sub => {
                const score = sub.total_score || 0;
                totalScoreSum += score;
                if (score > maxScore) maxScore = score;
                if (score < minScore) minScore = score;

                // Calculate averages per question
                if (sub.grades) {
                    Object.entries(sub.grades).forEach(([qKey, qData]) => {
                        if (!questionStats[qKey]) questionStats[qKey] = { sum: 0, count: 0 };
                        questionStats[qKey].sum += (qData.total_score || 0);
                        questionStats[qKey].count += 1;
                    });
                }
            });

            const avgScore = (totalScoreSum / submissions.length).toFixed(1);

            // Format question stats for the bar chart
            const questionAverages = Object.entries(questionStats).map(([key, data]) => ({
                question: key,
                avg: (data.sum / data.count).toFixed(1)
            })).sort((a, b) => a.question.localeCompare(b.question));

            setStats({
                totalStudents: submissions.length,
                avgScore,
                maxScore: maxScore === -Infinity ? 0 : maxScore,
                minScore: minScore === Infinity ? 0 : minScore,
                questionAverages
            });

        } catch (err) {
            setError("Failed to load analytics data.");
            console.error(err);
        } finally {
            setLoading(false);
        }
    };

    if (loading) return <div style={{ padding: '3rem', textAlign: 'center', fontSize: '1.2rem', color: '#64748b' }}>Crunching the numbers...</div>;

    if (error) return (
        <div style={{ padding: '3rem', textAlign: 'center', color: '#ef4444' }}>
            <AlertCircle size={48} style={{ marginBottom: '1rem', opacity: 0.8 }} />
            <h2>Oops!</h2>
            <p>{error}</p>
            <button onClick={() => navigate('/')} style={{ marginTop: '1rem', padding: '0.5rem 1rem', background: '#0f172a', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer' }}>
                Go Back Home
            </button>
        </div>
    );

    return (
        <div style={{ maxWidth: '1200px', margin: '0 auto', padding: '2rem 1rem' }}>
            {/* Header */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem' }}>
                <div>
                    <h1 style={{ color: '#1e293b', margin: '0 0 0.5rem 0', display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                        <BarChart2 size={28} color="#3b82f6" />
                        Class Insights
                    </h1>
                    <p style={{ margin: 0, color: '#64748b' }}>Exam ID: {examId}</p>
                </div>
                <button onClick={() => navigate('/')} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', background: '#f1f5f9', color: '#334155', border: 'none', padding: '0.75rem 1.25rem', borderRadius: '6px', cursor: 'pointer', fontWeight: 'bold' }}>
                    <ArrowLeft size={18} /> Back to Dashboard
                </button>
            </div>

            {/* Top Stat Cards */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1.5rem', marginBottom: '3rem' }}>
                <StatCard title="Total Submissions" value={stats.totalStudents} icon={<Users size={24} color="#8b5cf6" />} />
                <StatCard title="Class Average" value={`${stats.avgScore} pts`} icon={<TrendingUp size={24} color="#3b82f6" />} />
                <StatCard title="Highest Score" value={`${stats.maxScore} pts`} icon={<Target size={24} color="#10b981" />} />
                <StatCard title="Lowest Score" value={`${stats.minScore} pts`} icon={<AlertCircle size={24} color="#f59e0b" />} />
            </div>

            {/* Question Performance Bar Chart */}
            <div style={{ background: 'white', padding: '2rem', borderRadius: '12px', border: '1px solid #e2e8f0', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.05)' }}>
                <h2 style={{ marginTop: 0, marginBottom: '2rem', color: '#1e293b' }}>Question Performance</h2>
                <p style={{ color: '#64748b', marginBottom: '2rem' }}>Average points scored per question across the entire class.</p>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
                    {stats.questionAverages.map((q, idx) => {
                        // Assuming 10 is the max score for width calculation. 
                        // You can adjust this math if your questions are worth more/less.
                        const maxPossibleForVisual = Math.max(10, ...stats.questionAverages.map(a => parseFloat(a.avg)));
                        const widthPercent = (parseFloat(q.avg) / maxPossibleForVisual) * 100;
                        
                        return (
                            <div key={idx} style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                                <div style={{ width: '60px', fontWeight: 'bold', color: '#475569' }}>Q {q.question}</div>
                                <div style={{ flex: 1, background: '#f1f5f9', height: '24px', borderRadius: '12px', overflow: 'hidden' }}>
                                    <div style={{ 
                                        width: `${widthPercent}%`, 
                                        background: 'linear-gradient(90deg, #3b82f6 0%, #60a5fa 100%)', 
                                        height: '100%', 
                                        transition: 'width 1s ease-in-out' 
                                    }} />
                                </div>
                                <div style={{ width: '50px', textAlign: 'right', fontWeight: 'bold', color: '#1e293b' }}>
                                    {q.avg}
                                </div>
                            </div>
                        );
                    })}
                </div>
            </div>
        </div>
    );
}

// Helper Component for the top boxes
function StatCard({ title, value, icon }) {
    return (
        <div style={{ background: 'white', padding: '1.5rem', borderRadius: '12px', border: '1px solid #e2e8f0', display: 'flex', alignItems: 'center', gap: '1rem', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.05)' }}>
            <div style={{ background: '#f8fafc', padding: '1rem', borderRadius: '50%' }}>
                {icon}
            </div>
            <div>
                <div style={{ color: '#64748b', fontSize: '0.9rem', marginBottom: '0.25rem', fontWeight: '500' }}>{title}</div>
                <div style={{ fontSize: '1.5rem', fontWeight: 'bold', color: '#0f172a' }}>{value}</div>
            </div>
        </div>
    );
}