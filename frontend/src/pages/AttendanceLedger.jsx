// frontend/src/pages/AttendanceLedger.jsx
import React, { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { attendanceService } from '../services/api';
import { 
    CalendarCheck, 
    Upload, 
    Download, 
    Search, 
    CheckCircle, 
    AlertTriangle, 
    Users, 
    FileText, 
    TrendingUp, 
    X, 
    Check, 
    Clock, 
    Filter,
    FileSpreadsheet,
    ChevronRight,
    SlidersHorizontal,
    History,
    Sparkles,
    ShieldAlert
} from 'lucide-react';

export default function AttendanceLedger() {
    const [searchParams, setSearchParams] = useSearchParams();
    const [courseId, setCourseId] = useState(searchParams.get('course') || 'PHYS101');
    const [coursesList, setCoursesList] = useState(['PHYS101', 'CS101', 'MATH201', 'ME2024']);
    
    const [summary, setSummary] = useState(null);
    const [loading, setLoading] = useState(false);
    const [searchTerm, setSearchTerm] = useState('');
    const [filterTab, setFilterTab] = useState('ALL'); // 'ALL' | 'SHORTAGE' | 'SAFE' | 'BORDERLINE'
    const [latePolicy, setLatePolicy] = useState('lenient'); // 'lenient' | 'strict'
    
    // Day-by-Day Drawer State
    const [selectedStudent, setSelectedStudent] = useState(null);
    const [updatingSession, setUpdatingSession] = useState(false);

    // Upload Modal State
    const [showUploadModal, setShowUploadModal] = useState(false);
    const [uploadFile, setUploadFile] = useState(null);
    const [sessionDate, setSessionDate] = useState(new Date().toISOString().split('T')[0]);
    const [sessionType, setSessionType] = useState('Lecture');
    const [uploading, setUploading] = useState(false);
    const [uploadMessage, setUploadMessage] = useState(null);

    // Initial Load of Course List
    useEffect(() => {
        const fetchCourses = async () => {
            try {
                const res = await attendanceService.getCourses();
                if (res.data?.courses?.length > 0) {
                    setCoursesList(res.data.courses);
                }
            } catch (err) {
                console.error("Failed to load courses list:", err);
            }
        };
        fetchCourses();
    }, []);

    // Load Attendance Summary on Course or Policy Change
    useEffect(() => {
        if (courseId) {
            loadSummary(courseId, latePolicy);
            setSearchParams({ course: courseId, policy: latePolicy });
        }
    }, [courseId, latePolicy]);

    const loadSummary = async (id, policy) => {
        setLoading(true);
        try {
            const res = await attendanceService.getSummary(id, policy);
            setSummary(res.data);
            
            // If drawer is open, keep active student in sync
            if (selectedStudent) {
                const updated = res.data.students?.find(s => s.student_id === selectedStudent.student_id);
                if (updated) setSelectedStudent(updated);
            }
        } catch (err) {
            console.error("Failed to load attendance summary:", err);
        } finally {
            setLoading(false);
        }
    };

    // --- HANDLE FILE UPLOAD (Single or Multi-Date Rolling Sheet) ---
    const handleUploadSubmit = async (e) => {
        e.preventDefault();
        if (!uploadFile) return alert("Please select a file (CSV, XLSX, or Scanned Image/PDF).");

        setUploading(true);
        setUploadMessage(null);

        const formData = new FormData();
        formData.append('file', uploadFile);
        formData.append('session_date', sessionDate);
        formData.append('session_type', sessionType);
        formData.append('late_policy', latePolicy);

        try {
            const res = await attendanceService.uploadSheet(courseId, formData);
            setUploadMessage({ 
                type: 'success', 
                text: res.data.message || `Ingested ${res.data.sessions_ingested || 1} session(s) successfully!` 
            });
            if (res.data.summary) {
                setSummary(res.data.summary);
            } else {
                loadSummary(courseId, latePolicy);
            }
            setTimeout(() => {
                setShowUploadModal(false);
                setUploadFile(null);
                setUploadMessage(null);
            }, 1400);
        } catch (err) {
            setUploadMessage({ 
                type: 'error', 
                text: err.response?.data?.detail || 'Failed to process attendance sheet. Please check file format.' 
            });
        } finally {
            setUploading(false);
        }
    };

    // --- TOGGLE SESSION STATUS IN DRAWER ---
    const handleToggleSessionStatus = async (sessionId, newStatus) => {
        if (!selectedStudent) return;
        setUpdatingSession(true);

        try {
            const res = await attendanceService.toggleStudent(
                courseId, 
                sessionId, 
                selectedStudent.student_id, 
                newStatus,
                latePolicy
            );
            if (res.data.summary) {
                setSummary(res.data.summary);
            }
            if (res.data.student) {
                setSelectedStudent(res.data.student);
            } else {
                loadSummary(courseId, latePolicy);
            }
        } catch (err) {
            alert(`Failed to update attendance: ${err.response?.data?.detail || err.message}`);
        } finally {
            setUpdatingSession(false);
        }
    };

    // --- DOWNLOAD SAMPLE CSV ---
    const handleDownloadSampleCSV = () => {
        const sampleContent = "Roll No,Student Name,2026-08-10,2026-08-11,2026-08-12,2026-08-13,2026-08-14\n2024ME01,Aarav Sharma,Present,Present,Late,Present,Present\n2024ME02,Diya Patel,Present,Late,Absent,Present,Present\n2024ME03,Rohan Verma,Present,Present,Present,Present,Present\n2024ME04,Ananya Iyer,Absent,Absent,Present,Late,Absent\n2024ME05,Kabir Singh,Present,Present,Present,Present,Present\n";
        const blob = new Blob([sampleContent], { type: 'text/csv' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = "sample_multidate_attendance.csv";
        a.click();
        URL.revokeObjectURL(url);
    };

    // --- EXPORT LEDGER CSV ---
    const handleExportLedgerCSV = () => {
        if (!summary || !summary.students || summary.students.length === 0) {
            return alert("No attendance records to export.");
        }

        const headers = [
            "Roll Number", 
            "Student Name", 
            "Total Sessions", 
            "Present (P)", 
            "Late (L)", 
            "Absent (A)", 
            "Strict % (Late=0)", 
            "Lenient % (Late=1)", 
            `Active Status (${latePolicy.toUpperCase()})`, 
            "Classes Needed for 75%"
        ];
        const rows = [headers.join(",")];

        summary.students.forEach(s => {
            const status = s.is_shortage ? "SHORTAGE (Detained Alert)" : "ELIGIBLE (Safe)";
            rows.push([
                `"${s.student_id}"`,
                `"${s.name || s.student_id}"`,
                s.total_sessions,
                s.present_count,
                s.late_count,
                s.absent_count,
                `"${s.percentage_strict}%"`,
                `"${s.percentage_lenient}%"`,
                `"${status}"`,
                s.classes_needed_for_75
            ].join(","));
        });

        const blob = new Blob([rows.join("\n")], { type: 'text/csv' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${courseId}_Attendance_Ledger_${latePolicy.toUpperCase()}.csv`;
        a.click();
        URL.revokeObjectURL(url);
    };

    // --- FILTER & SEARCH LOGIC ---
    const students = summary?.students || [];
    const filteredStudents = students.filter(s => {
        const matchesSearch = s.student_id.toLowerCase().includes(searchTerm.toLowerCase()) || 
                              (s.name && s.name.toLowerCase().includes(searchTerm.toLowerCase()));
        
        if (!matchesSearch) return false;

        const isBorderline = s.is_shortage_strict && !s.is_shortage_lenient;

        if (filterTab === 'SHORTAGE') return s.is_shortage;
        if (filterTab === 'SAFE') return !s.is_shortage;
        if (filterTab === 'BORDERLINE') return isBorderline;
        return true;
    });

    const totalStudents = summary?.total_students || 0;
    const shortageCount = summary?.shortage_count || 0;
    const safeCount = summary?.safe_count || 0;
    const totalSessions = summary?.total_sessions || 0;
    const classAvg = summary?.class_average_pct || 0;
    const borderlineCount = students.filter(s => s.is_shortage_strict && !s.is_shortage_lenient).length;

    return (
        <div style={{ maxWidth: '1360px', margin: '0 auto', paddingBottom: '4rem', position: 'relative' }}>
            
            {/* --- TOP HEADER & COURSE SELECTOR --- */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem', flexWrap: 'wrap', gap: '1rem' }}>
                <div>
                    <h1 style={{ color: '#0f172a', margin: '0 0 0.5rem 0', display: 'flex', alignItems: 'center', gap: '0.75rem', fontSize: '1.85rem' }}>
                        <CalendarCheck size={32} color="#2563eb" />
                        Multi-Class Attendance & 75% Tracker
                    </h1>
                    <p style={{ margin: 0, color: '#64748b' }}>
                        Supports 10-class rolling sheets, dual late-entry policies, and student sign-in history overrides.
                    </p>
                </div>

                {/* Course Switcher */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', background: 'white', padding: '0.5rem 1rem', borderRadius: '8px', border: '1px solid #e2e8f0', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
                    <span style={{ fontWeight: 'bold', color: '#475569', fontSize: '0.9rem' }}>Course:</span>
                    <input 
                        list="attendance-courses"
                        value={courseId}
                        onChange={(e) => setCourseId(e.target.value.toUpperCase())}
                        placeholder="e.g. PHYS101"
                        style={{ padding: '0.4rem 0.6rem', borderRadius: '4px', border: '1px solid #cbd5e1', fontWeight: 'bold', width: '130px', textTransform: 'uppercase' }}
                    />
                    <datalist id="attendance-courses">
                        {coursesList.map(c => <option key={c} value={c} />)}
                    </datalist>
                </div>
            </div>

            {/* --- METRIC SUMMARY CARDS --- */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(230px, 1fr))', gap: '1.25rem', marginBottom: '1.75rem' }}>
                
                {/* 1. Total Conducted Sessions */}
                <div style={{ background: 'white', padding: '1.25rem', borderRadius: '10px', border: '1px solid #e2e8f0', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', color: '#64748b', marginBottom: '0.5rem' }}>
                        <span style={{ fontSize: '0.9rem', fontWeight: '600' }}>Conducted Sessions</span>
                        <FileText size={20} color="#3b82f6" />
                    </div>
                    <div style={{ fontSize: '2rem', fontWeight: 'bold', color: '#0f172a' }}>{totalSessions}</div>
                    <div style={{ fontSize: '0.8rem', color: '#64748b', marginTop: '0.25rem' }}>Accumulated rolling classes</div>
                </div>

                {/* 2. Class Average Attendance */}
                <div style={{ background: 'white', padding: '1.25rem', borderRadius: '10px', border: '1px solid #e2e8f0', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', color: '#64748b', marginBottom: '0.5rem' }}>
                        <span style={{ fontSize: '0.9rem', fontWeight: '600' }}>Class Average ({latePolicy})</span>
                        <TrendingUp size={20} color="#8b5cf6" />
                    </div>
                    <div style={{ fontSize: '2rem', fontWeight: 'bold', color: classAvg >= 75 ? '#10b981' : '#f59e0b' }}>
                        {classAvg}%
                    </div>
                    <div style={{ fontSize: '0.8rem', color: '#64748b', marginTop: '0.25rem' }}>Across {totalStudents} enrolled students</div>
                </div>

                {/* 3. Eligible Students (>= 75%) */}
                <div style={{ background: 'white', padding: '1.25rem', borderRadius: '10px', border: '1px solid #bbf7d0', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', color: '#166534', marginBottom: '0.5rem' }}>
                        <span style={{ fontSize: '0.9rem', fontWeight: '600' }}>Eligible (≥ 75%)</span>
                        <CheckCircle size={20} color="#16a34a" />
                    </div>
                    <div style={{ fontSize: '2rem', fontWeight: 'bold', color: '#16a34a' }}>{safeCount}</div>
                    <div style={{ fontSize: '0.8rem', color: '#166534', marginTop: '0.25rem' }}>Safe under {latePolicy} policy</div>
                </div>

                {/* 4. Shortage Students (< 75%) */}
                <div style={{ background: 'white', padding: '1.25rem', borderRadius: '10px', border: '1px solid #fecaca', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', color: '#991b1b', marginBottom: '0.5rem' }}>
                        <span style={{ fontSize: '0.9rem', fontWeight: '600' }}>Shortage Alert (&lt; 75%)</span>
                        <AlertTriangle size={20} color="#dc2626" />
                    </div>
                    <div style={{ fontSize: '2rem', fontWeight: 'bold', color: '#dc2626' }}>{shortageCount}</div>
                    <div style={{ fontSize: '0.8rem', color: '#991b1b', marginTop: '0.25rem' }}>Debarment risk under {latePolicy}</div>
                </div>
            </div>

            {/* --- ACTION & CONTROLS TOOLBAR --- */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'white', padding: '1rem', borderRadius: '8px', border: '1px solid #e2e8f0', marginBottom: '1.5rem', flexWrap: 'wrap', gap: '1rem' }}>
                
                {/* Left: Filter Tabs & Search */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', flexWrap: 'wrap' }}>
                    <div style={{ display: 'flex', background: '#f1f5f9', padding: '4px', borderRadius: '6px', gap: '4px' }}>
                        <button 
                            onClick={() => setFilterTab('ALL')}
                            style={{ padding: '0.4rem 0.75rem', borderRadius: '4px', border: 'none', background: filterTab === 'ALL' ? 'white' : 'transparent', color: filterTab === 'ALL' ? '#0f172a' : '#64748b', fontWeight: 'bold', cursor: 'pointer', boxShadow: filterTab === 'ALL' ? '0 1px 2px rgba(0,0,0,0.08)' : 'none', fontSize: '0.85rem' }}
                        >
                            All ({totalStudents})
                        </button>
                        <button 
                            onClick={() => setFilterTab('SHORTAGE')}
                            style={{ padding: '0.4rem 0.75rem', borderRadius: '4px', border: 'none', background: filterTab === 'SHORTAGE' ? '#fee2e2' : 'transparent', color: filterTab === 'SHORTAGE' ? '#b91c1c' : '#64748b', fontWeight: 'bold', cursor: 'pointer', fontSize: '0.85rem' }}
                        >
                            ⚠️ Shortage ({shortageCount})
                        </button>
                        <button 
                            onClick={() => setFilterTab('SAFE')}
                            style={{ padding: '0.4rem 0.75rem', borderRadius: '4px', border: 'none', background: filterTab === 'SAFE' ? '#dcfce7' : 'transparent', color: filterTab === 'SAFE' ? '#15803d' : '#64748b', fontWeight: 'bold', cursor: 'pointer', fontSize: '0.85rem' }}
                        >
                            ✓ Eligible ({safeCount})
                        </button>
                        {borderlineCount > 0 && (
                            <button 
                                onClick={() => setFilterTab('BORDERLINE')}
                                style={{ padding: '0.4rem 0.75rem', borderRadius: '4px', border: 'none', background: filterTab === 'BORDERLINE' ? '#fef3c7' : 'transparent', color: filterTab === 'BORDERLINE' ? '#92400e' : '#64748b', fontWeight: 'bold', cursor: 'pointer', fontSize: '0.85rem' }}
                            >
                                ⚡ Borderline ({borderlineCount})
                            </button>
                        )}
                    </div>

                    <div style={{ position: 'relative' }}>
                        <Search size={16} color="#94a3b8" style={{ position: 'absolute', left: '10px', top: '10px' }} />
                        <input 
                            type="text"
                            placeholder="Filter by roll or name..."
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            style={{ padding: '0.5rem 0.75rem 0.5rem 2.2rem', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '0.85rem', width: '210px' }}
                        />
                    </div>
                </div>

                {/* Center / Right: Policy Toggle & Action Buttons */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', flexWrap: 'wrap' }}>
                    
                    {/* Dual Late-Entry Policy Segmented Control */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', background: '#f8fafc', padding: '4px 8px', borderRadius: '6px', border: '1px solid #e2e8f0' }}>
                        <span style={{ fontSize: '0.8rem', fontWeight: 'bold', color: '#475569' }}>Late Policy:</span>
                        <div style={{ display: 'flex', background: '#e2e8f0', padding: '2px', borderRadius: '4px', gap: '2px' }}>
                            <button 
                                onClick={() => setLatePolicy('lenient')}
                                style={{ padding: '0.25rem 0.65rem', borderRadius: '3px', border: 'none', background: latePolicy === 'lenient' ? '#10b981' : 'transparent', color: latePolicy === 'lenient' ? 'white' : '#475569', fontWeight: 'bold', fontSize: '0.75rem', cursor: 'pointer' }}
                            >
                                Lenient (L = 1)
                            </button>
                            <button 
                                onClick={() => setLatePolicy('strict')}
                                style={{ padding: '0.25rem 0.65rem', borderRadius: '3px', border: 'none', background: latePolicy === 'strict' ? '#ef4444' : 'transparent', color: latePolicy === 'strict' ? 'white' : '#475569', fontWeight: 'bold', fontSize: '0.75rem', cursor: 'pointer' }}
                            >
                                Strict (L = 0)
                            </button>
                        </div>
                    </div>

                    <button 
                        onClick={() => setShowUploadModal(true)}
                        style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem', background: '#2563eb', color: 'white', border: 'none', padding: '0.55rem 1.1rem', borderRadius: '6px', fontWeight: 'bold', cursor: 'pointer', fontSize: '0.85rem', boxShadow: '0 2px 4px rgba(37,99,235,0.2)' }}
                    >
                        <Upload size={15} /> Upload Sheet
                    </button>

                    <button 
                        onClick={handleExportLedgerCSV}
                        style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem', background: '#10b981', color: 'white', border: 'none', padding: '0.55rem 1.1rem', borderRadius: '6px', fontWeight: 'bold', cursor: 'pointer', fontSize: '0.85rem' }}
                    >
                        <Download size={15} /> Export CSV
                    </button>
                </div>
            </div>

            {/* --- ATTENDANCE LEDGER TABLE --- */}
            <div style={{ background: 'white', borderRadius: '8px', border: '1px solid #e2e8f0', overflow: 'hidden', boxShadow: '0 2px 4px rgba(0,0,0,0.04)' }}>
                {loading ? (
                    <div style={{ padding: '3rem', textAlign: 'center', color: '#64748b' }}>Loading multi-class records...</div>
                ) : filteredStudents.length === 0 ? (
                    <div style={{ padding: '3rem', textAlign: 'center', color: '#64748b' }}>
                        {totalSessions === 0 ? (
                            <div>
                                <p style={{ fontSize: '1.1rem', fontWeight: '600', color: '#1e293b' }}>No attendance sessions recorded yet for {courseId}.</p>
                                <p style={{ color: '#64748b' }}>Upload your first 10-day rolling sheet or single lecture sign-in CSV/Excel.</p>
                            </div>
                        ) : "No student records match your filter criteria."}
                    </div>
                ) : (
                    <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
                        <thead style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
                            <tr>
                                <th style={{ padding: '0.85rem 1rem', color: '#475569', fontWeight: 'bold', fontSize: '0.85rem' }}>Roll Number</th>
                                <th style={{ padding: '0.85rem 1rem', color: '#475569', fontWeight: 'bold', fontSize: '0.85rem' }}>Student Name</th>
                                <th style={{ padding: '0.85rem 1rem', color: '#475569', fontWeight: 'bold', fontSize: '0.85rem' }}>Attendance Breakdown</th>
                                <th style={{ padding: '0.85rem 1rem', color: '#475569', fontWeight: 'bold', width: '210px', fontSize: '0.85rem' }}>Attendance % ({latePolicy})</th>
                                <th style={{ padding: '0.85rem 1rem', color: '#475569', fontWeight: 'bold', fontSize: '0.85rem' }}>Eligibility Status</th>
                                <th style={{ padding: '0.85rem 1rem', color: '#475569', fontWeight: 'bold', textAlign: 'right', fontSize: '0.85rem' }}>Action</th>
                            </tr>
                        </thead>
                        <tbody>
                            {filteredStudents.map((s, idx) => {
                                const pct = s.percentage;
                                const barColor = pct >= 75 ? '#10b981' : pct >= 65 ? '#f59e0b' : '#ef4444';
                                const isBorderline = s.is_shortage_strict && !s.is_shortage_lenient;

                                return (
                                    <tr 
                                        key={s.student_id} 
                                        onClick={() => setSelectedStudent(s)}
                                        style={{ borderBottom: idx === filteredStudents.length - 1 ? 'none' : '1px solid #f1f5f9', cursor: 'pointer', background: selectedStudent?.student_id === s.student_id ? '#f0fdf4' : 'transparent', transition: 'background 0.2s' }}
                                    >
                                        {/* Roll No */}
                                        <td style={{ padding: '0.85rem 1rem', fontWeight: 'bold', color: '#0f172a' }}>{s.student_id}</td>
                                        
                                        {/* Name */}
                                        <td style={{ padding: '0.85rem 1rem', color: '#334155' }}>{s.name || s.student_id}</td>
                                        
                                        {/* Breakdown: Attended / Total + (P, L, A) */}
                                        <td style={{ padding: '0.85rem 1rem' }}>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
                                                <span style={{ fontWeight: 'bold', color: '#0f172a' }}>{s.attended_sessions} / {s.total_sessions}</span>
                                                <span style={{ fontSize: '0.75rem', background: '#f1f5f9', padding: '2px 6px', borderRadius: '4px', color: '#475569' }}>
                                                    {s.present_count}P · {s.late_count}L · {s.absent_count}A
                                                </span>
                                            </div>
                                        </td>
                                        
                                        {/* Progress Bar & % */}
                                        <td style={{ padding: '0.85rem 1rem' }}>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                                                <div style={{ flex: 1, background: '#e2e8f0', height: '8px', borderRadius: '4px', overflow: 'hidden' }}>
                                                    <div style={{ width: `${Math.min(pct, 100)}%`, height: '100%', background: barColor, borderRadius: '4px', transition: 'width 0.4s ease' }} />
                                                </div>
                                                <span style={{ fontWeight: 'bold', color: barColor, minWidth: '45px', fontSize: '0.85rem' }}>
                                                    {pct}%
                                                </span>
                                            </div>
                                        </td>

                                        {/* Eligibility & Borderline Badges */}
                                        <td style={{ padding: '0.85rem 1rem' }}>
                                            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                                                {s.is_shortage ? (
                                                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', background: '#fee2e2', color: '#991b1b', padding: '3px 8px', borderRadius: '12px', fontSize: '0.75rem', fontWeight: 'bold', width: 'fit-content' }}>
                                                        <AlertTriangle size={12} color="#dc2626" /> Shortage ({pct}%)
                                                    </span>
                                                ) : (
                                                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', background: '#dcfce7', color: '#166534', padding: '3px 8px', borderRadius: '12px', fontSize: '0.75rem', fontWeight: 'bold', width: 'fit-content' }}>
                                                        <CheckCircle size={12} color="#16a34a" /> Eligible ({pct}%)
                                                    </span>
                                                )}

                                                {/* Borderline Indicator */}
                                                {isBorderline && (
                                                    <span style={{ fontSize: '0.7rem', color: '#92400e', background: '#fffbeb', border: '1px solid #fde68a', padding: '1px 6px', borderRadius: '4px', width: 'fit-content' }}>
                                                        ⚡ Borderline: {s.percentage_lenient}% (Lenient) vs {s.percentage_strict}% (Strict)
                                                    </span>
                                                )}
                                            </div>
                                        </td>

                                        {/* View History Button */}
                                        <td style={{ padding: '0.85rem 1rem', textAlign: 'right' }}>
                                            <button 
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    setSelectedStudent(s);
                                                }}
                                                style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', background: '#f8fafc', border: '1px solid #cbd5e1', padding: '4px 8px', borderRadius: '4px', fontSize: '0.75rem', fontWeight: 'bold', color: '#334155', cursor: 'pointer' }}
                                            >
                                                <History size={13} /> History <ChevronRight size={13} />
                                            </button>
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                )}
            </div>

            {/* --- SLIDE-OVER DAY-BY-DAY SESSION DRAWER --- */}
            {selectedStudent && (
                <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(15,23,42,0.4)', zIndex: 1100, display: 'flex', justifyContent: 'flex-end' }}>
                    <div style={{ background: 'white', width: '100%', maxWidth: '460px', height: '100%', boxShadow: '-4px 0 25px rgba(0,0,0,0.15)', display: 'flex', flexDirection: 'column', animation: 'slideIn 0.25s ease-out' }}>
                        
                        {/* Drawer Header */}
                        <div style={{ padding: '1.25rem', borderBottom: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#f8fafc' }}>
                            <div>
                                <h3 style={{ margin: 0, color: '#0f172a', fontSize: '1.2rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                    <History size={18} color="#2563eb" />
                                    {selectedStudent.name || selectedStudent.student_id}
                                </h3>
                                <p style={{ margin: '0.2rem 0 0 0', color: '#64748b', fontSize: '0.85rem' }}>
                                    Roll Number: <strong>{selectedStudent.student_id}</strong>
                                </p>
                            </div>
                            <button 
                                onClick={() => setSelectedStudent(null)}
                                style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: '#94a3b8' }}
                            >
                                <X size={22} />
                            </button>
                        </div>

                        {/* Drawer Body: Policy Stats Comparison */}
                        <div style={{ padding: '1.25rem', borderBottom: '1px solid #e2e8f0', background: '#ffffff' }}>
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem', marginBottom: '0.75rem' }}>
                                <div style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', padding: '0.75rem', borderRadius: '6px' }}>
                                    <div style={{ fontSize: '0.75rem', color: '#166534', fontWeight: 'bold' }}>Lenient Policy (Late=1)</div>
                                    <div style={{ fontSize: '1.3rem', fontWeight: 'bold', color: '#16a34a' }}>{selectedStudent.percentage_lenient}%</div>
                                    <div style={{ fontSize: '0.7rem', color: '#166534' }}>
                                        {selectedStudent.is_shortage_lenient ? `Must attend ${selectedStudent.needed_lenient} classes` : '✓ Safe'}
                                    </div>
                                </div>
                                <div style={{ background: '#fef2f2', border: '1px solid #fecaca', padding: '0.75rem', borderRadius: '6px' }}>
                                    <div style={{ fontSize: '0.75rem', color: '#991b1b', fontWeight: 'bold' }}>Strict Policy (Late=0)</div>
                                    <div style={{ fontSize: '1.3rem', fontWeight: 'bold', color: '#dc2626' }}>{selectedStudent.percentage_strict}%</div>
                                    <div style={{ fontSize: '0.7rem', color: '#991b1b' }}>
                                        {selectedStudent.is_shortage_strict ? `Must attend ${selectedStudent.needed_strict} classes` : '✓ Safe'}
                                    </div>
                                </div>
                            </div>
                            <div style={{ fontSize: '0.75rem', color: '#64748b' }}>
                                Click any status pill below to override (Present / Late / Absent) for a specific session.
                            </div>
                        </div>

                        {/* Drawer Session List */}
                        <div style={{ flex: 1, overflowY: 'auto', padding: '1.25rem' }}>
                            <h4 style={{ margin: '0 0 1rem 0', fontSize: '0.9rem', color: '#475569', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                                Session Log ({selectedStudent.session_history?.length || 0} classes)
                            </h4>

                            {(!selectedStudent.session_history || selectedStudent.session_history.length === 0) ? (
                                <div style={{ textAlign: 'center', color: '#94a3b8', padding: '2rem' }}>No individual session history recorded.</div>
                            ) : (
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.65rem' }}>
                                    {selectedStudent.session_history.map((sess, sIdx) => {
                                        const currentSt = sess.status;

                                        return (
                                            <div 
                                                key={sess.session_id || sIdx}
                                                style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.65rem 0.85rem', background: '#f8fafc', borderRadius: '6px', border: '1px solid #e2e8f0' }}
                                            >
                                                <div>
                                                    <div style={{ fontWeight: 'bold', fontSize: '0.85rem', color: '#0f172a' }}>
                                                        {sess.session_date || `Session ${sIdx + 1}`}
                                                    </div>
                                                    <div style={{ fontSize: '0.75rem', color: '#64748b' }}>
                                                        {sess.session_type || 'Lecture'}
                                                    </div>
                                                </div>

                                                {/* 3-Way Toggle Pills: Present | Late | Absent */}
                                                <div style={{ display: 'flex', gap: '4px', background: '#e2e8f0', padding: '3px', borderRadius: '6px' }}>
                                                    <button 
                                                        disabled={updatingSession}
                                                        onClick={() => handleToggleSessionStatus(sess.session_id, 'Present')}
                                                        style={{ padding: '3px 8px', borderRadius: '4px', border: 'none', fontSize: '0.75rem', fontWeight: 'bold', cursor: 'pointer', background: currentSt === 'Present' ? '#10b981' : 'transparent', color: currentSt === 'Present' ? 'white' : '#64748b' }}
                                                    >
                                                        P
                                                    </button>
                                                    <button 
                                                        disabled={updatingSession}
                                                        onClick={() => handleToggleSessionStatus(sess.session_id, 'Late')}
                                                        style={{ padding: '3px 8px', borderRadius: '4px', border: 'none', fontSize: '0.75rem', fontWeight: 'bold', cursor: 'pointer', background: currentSt === 'Late' ? '#f59e0b' : 'transparent', color: currentSt === 'Late' ? 'white' : '#64748b' }}
                                                    >
                                                        L
                                                    </button>
                                                    <button 
                                                        disabled={updatingSession}
                                                        onClick={() => handleToggleSessionStatus(sess.session_id, 'Absent')}
                                                        style={{ padding: '3px 8px', borderRadius: '4px', border: 'none', fontSize: '0.75rem', fontWeight: 'bold', cursor: 'pointer', background: currentSt === 'Absent' ? '#ef4444' : 'transparent', color: currentSt === 'Absent' ? 'white' : '#64748b' }}
                                                    >
                                                        A
                                                    </button>
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            )}
                        </div>

                        {/* Drawer Footer */}
                        <div style={{ padding: '1rem', borderTop: '1px solid #e2e8f0', background: '#f8fafc', display: 'flex', justifyContent: 'flex-end' }}>
                            <button 
                                onClick={() => setSelectedStudent(null)}
                                style={{ padding: '0.5rem 1.25rem', borderRadius: '6px', border: '1px solid #cbd5e1', background: 'white', color: '#334155', fontWeight: 'bold', cursor: 'pointer' }}
                            >
                                Close Drawer
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* --- UPLOAD ATTENDANCE MODAL --- */}
            {showUploadModal && (
                <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(15,23,42,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1200, padding: '1rem' }}>
                    <div style={{ background: 'white', borderRadius: '12px', width: '100%', maxWidth: '520px', padding: '2rem', boxShadow: '0 20px 25px -5px rgba(0,0,0,0.2)', position: 'relative' }}>
                        
                        {/* Modal Header */}
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
                            <h3 style={{ margin: 0, color: '#0f172a', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                <Upload size={20} color="#2563eb" />
                                Ingest Attendance Sheet
                            </h3>
                            <button onClick={() => setShowUploadModal(false)} style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: '#94a3b8' }}>
                                <X size={20} />
                            </button>
                        </div>

                        <form onSubmit={handleUploadSubmit}>
                            
                            {/* Course / Subject */}
                            <div style={{ marginBottom: '1rem' }}>
                                <label style={{ display: 'block', fontWeight: 'bold', color: '#334155', marginBottom: '0.35rem', fontSize: '0.85rem' }}>Course Code</label>
                                <input 
                                    type="text" 
                                    value={courseId} 
                                    onChange={(e) => setCourseId(e.target.value.toUpperCase())}
                                    required
                                    style={{ width: '100%', padding: '0.5rem', borderRadius: '6px', border: '1px solid #cbd5e1', fontWeight: 'bold' }}
                                />
                            </div>

                            {/* Session Date & Type Grid */}
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '1rem' }}>
                                <div>
                                    <label style={{ display: 'block', fontWeight: 'bold', color: '#334155', marginBottom: '0.35rem', fontSize: '0.85rem' }}>Session Date (for single sheet)</label>
                                    <input 
                                        type="date"
                                        value={sessionDate}
                                        onChange={(e) => setSessionDate(e.target.value)}
                                        style={{ width: '100%', padding: '0.5rem', borderRadius: '6px', border: '1px solid #cbd5e1' }}
                                    />
                                </div>
                                <div>
                                    <label style={{ display: 'block', fontWeight: 'bold', color: '#334155', marginBottom: '0.35rem', fontSize: '0.85rem' }}>Session Type</label>
                                    <select 
                                        value={sessionType}
                                        onChange={(e) => setSessionType(e.target.value)}
                                        style={{ width: '100%', padding: '0.5rem', borderRadius: '6px', border: '1px solid #cbd5e1' }}
                                    >
                                        <option value="Lecture">Lecture</option>
                                        <option value="Tutorial">Tutorial</option>
                                        <option value="Lab">Lab</option>
                                    </select>
                                </div>
                            </div>

                            {/* File Upload Box */}
                            <div style={{ marginBottom: '1.25rem' }}>
                                <label style={{ display: 'block', fontWeight: 'bold', color: '#334155', marginBottom: '0.35rem', fontSize: '0.85rem' }}>
                                    Attendance File (Single-day or 10-day Rolling Sheet)
                                </label>
                                <div style={{ border: '2px dashed #cbd5e1', borderRadius: '8px', padding: '1.5rem', textAlign: 'center', background: '#f8fafc', cursor: 'pointer' }}>
                                    <input 
                                        type="file"
                                        accept=".csv,.xlsx,.xls,.png,.jpg,.jpeg,.pdf"
                                        onChange={(e) => setUploadFile(e.target.files[0])}
                                        style={{ width: '100%' }}
                                    />
                                    <p style={{ margin: '0.5rem 0 0 0', fontSize: '0.8rem', color: '#64748b' }}>
                                        Auto-detects single lecture sheets OR multi-column 10-day class sheets without overwriting past history.
                                    </p>
                                </div>
                            </div>

                            {/* Helper download link */}
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
                                <button 
                                    type="button"
                                    onClick={handleDownloadSampleCSV}
                                    style={{ background: 'transparent', border: 'none', color: '#2563eb', fontSize: '0.8rem', cursor: 'pointer', textDecoration: 'underline', display: 'flex', alignItems: 'center', gap: '4px' }}
                                >
                                    <FileSpreadsheet size={14} /> Download Sample 10-Day Multi-Date CSV
                                </button>
                            </div>

                            {/* Status Message */}
                            {uploadMessage && (
                                <div style={{ padding: '0.75rem', borderRadius: '6px', marginBottom: '1rem', fontSize: '0.85rem', background: uploadMessage.type === 'success' ? '#dcfce7' : '#fee2e2', color: uploadMessage.type === 'success' ? '#15803d' : '#b91c1c' }}>
                                    {uploadMessage.text}
                                </div>
                            )}

                            {/* Submit Buttons */}
                            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem' }}>
                                <button 
                                    type="button" 
                                    onClick={() => setShowUploadModal(false)}
                                    style={{ padding: '0.65rem 1.25rem', borderRadius: '6px', border: '1px solid #cbd5e1', background: 'white', color: '#475569', cursor: 'pointer', fontWeight: 'bold' }}
                                >
                                    Cancel
                                </button>
                                <button 
                                    type="submit" 
                                    disabled={uploading}
                                    style={{ padding: '0.65rem 1.5rem', borderRadius: '6px', border: 'none', background: uploading ? '#94a3b8' : '#2563eb', color: 'white', cursor: uploading ? 'not-allowed' : 'pointer', fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: '0.5rem' }}
                                >
                                    {uploading ? 'Processing AI...' : 'Ingest & Unpivot'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
}
