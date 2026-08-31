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
    FileSpreadsheet
} from 'lucide-react';

export default function AttendanceLedger() {
    const [searchParams, setSearchParams] = useSearchParams();
    const [courseId, setCourseId] = useState(searchParams.get('course') || 'PHYS101');
    const [coursesList, setCoursesList] = useState(['PHYS101', 'CS101', 'MATH201']);
    
    const [summary, setSummary] = useState(null);
    const [loading, setLoading] = useState(false);
    const [searchTerm, setSearchTerm] = useState('');
    const [filterTab, setFilterTab] = useState('ALL'); // 'ALL' | 'SHORTAGE' | 'SAFE'
    
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

    // Load Attendance Summary on Course Change
    useEffect(() => {
        if (courseId) {
            loadSummary(courseId);
            setSearchParams({ course: courseId });
        }
    }, [courseId]);

    const loadSummary = async (id) => {
        setLoading(true);
        try {
            const res = await attendanceService.getSummary(id);
            setSummary(res.data);
        } catch (err) {
            console.error("Failed to load attendance summary:", err);
        } finally {
            setLoading(false);
        }
    };

    // --- HANDLE FILE UPLOAD ---
    const handleUploadSubmit = async (e) => {
        e.preventDefault();
        if (!uploadFile) return alert("Please select a file (CSV, XLSX, or Scanned Image/PDF).");

        setUploading(true);
        setUploadMessage(null);

        const formData = new FormData();
        formData.append('file', uploadFile);
        formData.append('session_date', sessionDate);
        formData.append('session_type', sessionType);

        try {
            const res = await attendanceService.uploadSheet(courseId, formData);
            setUploadMessage({ type: 'success', text: res.data.message || 'Attendance sheet ingested successfully!' });
            if (res.data.summary) {
                setSummary(res.data.summary);
            } else {
                loadSummary(courseId);
            }
            setTimeout(() => {
                setShowUploadModal(false);
                setUploadFile(null);
                setUploadMessage(null);
            }, 1200);
        } catch (err) {
            setUploadMessage({ 
                type: 'error', 
                text: err.response?.data?.detail || 'Failed to process attendance sheet. Please check file format.' 
            });
        } finally {
            setUploading(false);
        }
    };

    // --- DOWNLOAD SAMPLE CSV ---
    const handleDownloadSampleCSV = () => {
        const sampleContent = "Student ID,Name,Status\nENG202401,Rahul Sharma,Present\nENG202402,Priya Patel,Present\nENG202403,Ankit Verma,Absent\nENG202404,Sneha Gupta,Present\nENG202405,Vikram Singh,Absent\n";
        const blob = new Blob([sampleContent], { type: 'text/csv' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = "sample_attendance_sheet.csv";
        a.click();
        URL.revokeObjectURL(url);
    };

    // --- EXPORT LEDGER CSV ---
    const handleExportLedgerCSV = () => {
        if (!summary || !summary.students || summary.students.length === 0) {
            return alert("No attendance records to export.");
        }

        const headers = ["Roll Number", "Student Name", "Attended Sessions", "Total Sessions", "Attendance %", "Eligibility Status", "Classes Needed for 75%"];
        const rows = [headers.join(",")];

        summary.students.forEach(s => {
            const status = s.is_shortage ? "SHORTAGE (Detained Alert)" : "ELIGIBLE (Safe)";
            rows.push([
                `"${s.student_id}"`,
                `"${s.name || s.student_id}"`,
                s.attended_sessions,
                s.total_sessions,
                `"${s.percentage}%"`,
                `"${status}"`,
                s.classes_needed_for_75
            ].join(","));
        });

        const blob = new Blob([rows.join("\n")], { type: 'text/csv' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${courseId}_Attendance_Ledger.csv`;
        a.click();
        URL.revokeObjectURL(url);
    };

    // --- FILTER & SEARCH LOGIC ---
    const students = summary?.students || [];
    const filteredStudents = students.filter(s => {
        const matchesSearch = s.student_id.toLowerCase().includes(searchTerm.toLowerCase()) || 
                              (s.name && s.name.toLowerCase().includes(searchTerm.toLowerCase()));
        
        if (!matchesSearch) return false;

        if (filterTab === 'SHORTAGE') return s.is_shortage;
        if (filterTab === 'SAFE') return !s.is_shortage;
        return true;
    });

    const totalStudents = summary?.total_students || 0;
    const shortageCount = summary?.shortage_count || 0;
    const safeCount = summary?.safe_count || 0;
    const totalSessions = summary?.total_sessions || 0;
    const classAvg = summary?.class_average_pct || 0;

    return (
        <div style={{ maxWidth: '1280px', margin: '0 auto', paddingBottom: '3rem' }}>
            
            {/* --- TOP HEADER & COURSE SELECTOR --- */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem', flexWrap: 'wrap', gap: '1rem' }}>
                <div>
                    <h1 style={{ color: '#0f172a', margin: '0 0 0.5rem 0', display: 'flex', alignItems: 'center', gap: '0.75rem', fontSize: '1.85rem' }}>
                        <CalendarCheck size={32} color="#2563eb" />
                        Attendance & 75% Shortage Tracker
                    </h1>
                    <p style={{ margin: 0, color: '#64748b' }}>
                        Manage daily lecture sign-ins, auto-calculate cumulative percentages, and track detention risks.
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
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '1.25rem', marginBottom: '2rem' }}>
                
                {/* 1. Total Sessions */}
                <div style={{ background: 'white', padding: '1.25rem', borderRadius: '10px', border: '1px solid #e2e8f0', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', color: '#64748b', marginBottom: '0.5rem' }}>
                        <span style={{ fontSize: '0.9rem', fontWeight: '600' }}>Conducted Sessions</span>
                        <FileText size={20} color="#3b82f6" />
                    </div>
                    <div style={{ fontSize: '2rem', fontWeight: 'bold', color: '#0f172a' }}>{totalSessions}</div>
                    <div style={{ fontSize: '0.8rem', color: '#64748b', marginTop: '0.25rem' }}>Lectures, Tutorials & Labs</div>
                </div>

                {/* 2. Class Average Attendance */}
                <div style={{ background: 'white', padding: '1.25rem', borderRadius: '10px', border: '1px solid #e2e8f0', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', color: '#64748b', marginBottom: '0.5rem' }}>
                        <span style={{ fontSize: '0.9rem', fontWeight: '600' }}>Class Average</span>
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
                    <div style={{ fontSize: '0.8rem', color: '#166534', marginTop: '0.25rem' }}>Safe from attendance shortage</div>
                </div>

                {/* 4. Shortage Students (< 75%) */}
                <div style={{ background: 'white', padding: '1.25rem', borderRadius: '10px', border: '1px solid #fecaca', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', color: '#991b1b', marginBottom: '0.5rem' }}>
                        <span style={{ fontSize: '0.9rem', fontWeight: '600' }}>Shortage Alert (&lt; 75%)</span>
                        <AlertTriangle size={20} color="#dc2626" />
                    </div>
                    <div style={{ fontSize: '2rem', fontWeight: 'bold', color: '#dc2626' }}>{shortageCount}</div>
                    <div style={{ fontSize: '0.8rem', color: '#991b1b', marginTop: '0.25rem' }}>Risk of exam debarment</div>
                </div>
            </div>

            {/* --- ACTION & CONTROLS TOOLBAR --- */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'white', padding: '1rem', borderRadius: '8px', border: '1px solid #e2e8f0', marginBottom: '1.5rem', flexWrap: 'wrap', gap: '1rem' }}>
                
                {/* Left: Filter Tabs & Search */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', flexWrap: 'wrap' }}>
                    <div style={{ display: 'flex', background: '#f1f5f9', padding: '4px', borderRadius: '6px', gap: '4px' }}>
                        <button 
                            onClick={() => setFilterTab('ALL')}
                            style={{ padding: '0.4rem 0.85rem', borderRadius: '4px', border: 'none', background: filterTab === 'ALL' ? 'white' : 'transparent', color: filterTab === 'ALL' ? '#0f172a' : '#64748b', fontWeight: 'bold', cursor: 'pointer', boxShadow: filterTab === 'ALL' ? '0 1px 2px rgba(0,0,0,0.08)' : 'none' }}
                        >
                            All ({totalStudents})
                        </button>
                        <button 
                            onClick={() => setFilterTab('SHORTAGE')}
                            style={{ padding: '0.4rem 0.85rem', borderRadius: '4px', border: 'none', background: filterTab === 'SHORTAGE' ? '#fee2e2' : 'transparent', color: filterTab === 'SHORTAGE' ? '#b91c1c' : '#64748b', fontWeight: 'bold', cursor: 'pointer' }}
                        >
                            ⚠️ Shortage ({shortageCount})
                        </button>
                        <button 
                            onClick={() => setFilterTab('SAFE')}
                            style={{ padding: '0.4rem 0.85rem', borderRadius: '4px', border: 'none', background: filterTab === 'SAFE' ? '#dcfce7' : 'transparent', color: filterTab === 'SAFE' ? '#15803d' : '#64748b', fontWeight: 'bold', cursor: 'pointer' }}
                        >
                            ✓ Eligible ({safeCount})
                        </button>
                    </div>

                    <div style={{ position: 'relative' }}>
                        <Search size={16} color="#94a3b8" style={{ position: 'absolute', left: '10px', top: '10px' }} />
                        <input 
                            type="text"
                            placeholder="Filter by roll number or name..."
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            style={{ padding: '0.5rem 0.75rem 0.5rem 2.2rem', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '0.9rem', width: '240px' }}
                        />
                    </div>
                </div>

                {/* Right: Action Buttons */}
                <div style={{ display: 'flex', gap: '0.75rem' }}>
                    <button 
                        onClick={() => setShowUploadModal(true)}
                        style={{ display: 'inline-flex', alignItems: 'center', gap: '0.5rem', background: '#2563eb', color: 'white', border: 'none', padding: '0.65rem 1.25rem', borderRadius: '6px', fontWeight: 'bold', cursor: 'pointer', boxShadow: '0 2px 4px rgba(37,99,235,0.2)' }}
                    >
                        <Upload size={16} /> Upload Attendance Sheet
                    </button>

                    <button 
                        onClick={handleExportLedgerCSV}
                        style={{ display: 'inline-flex', alignItems: 'center', gap: '0.5rem', background: '#10b981', color: 'white', border: 'none', padding: '0.65rem 1.25rem', borderRadius: '6px', fontWeight: 'bold', cursor: 'pointer' }}
                    >
                        <Download size={16} /> Export CSV
                    </button>
                </div>
            </div>

            {/* --- ATTENDANCE LEDGER TABLE --- */}
            <div style={{ background: 'white', borderRadius: '8px', border: '1px solid #e2e8f0', overflow: 'hidden', boxShadow: '0 2px 4px rgba(0,0,0,0.04)' }}>
                {loading ? (
                    <div style={{ padding: '3rem', textAlign: 'center', color: '#64748b' }}>Loading attendance records...</div>
                ) : filteredStudents.length === 0 ? (
                    <div style={{ padding: '3rem', textAlign: 'center', color: '#64748b' }}>
                        {totalSessions === 0 ? (
                            <div>
                                <p style={{ fontSize: '1.1rem', fontWeight: '600', color: '#1e293b' }}>No attendance sessions recorded yet for {courseId}.</p>
                                <p style={{ color: '#64748b' }}>Click <strong>"Upload Attendance Sheet"</strong> to ingest your first CSV, Excel, or scanned sign-in sheet.</p>
                            </div>
                        ) : "No student records match your filter criteria."}
                    </div>
                ) : (
                    <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
                        <thead style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
                            <tr>
                                <th style={{ padding: '1rem', color: '#475569', fontWeight: 'bold' }}>Roll Number</th>
                                <th style={{ padding: '1rem', color: '#475569', fontWeight: 'bold' }}>Student Name</th>
                                <th style={{ padding: '1rem', color: '#475569', fontWeight: 'bold' }}>Attended / Total</th>
                                <th style={{ padding: '1rem', color: '#475569', fontWeight: 'bold', width: '220px' }}>Attendance %</th>
                                <th style={{ padding: '1rem', color: '#475569', fontWeight: 'bold' }}>Eligibility Status</th>
                                <th style={{ padding: '1rem', color: '#475569', fontWeight: 'bold', textAlign: 'right' }}>Requirement for 75%</th>
                            </tr>
                        </thead>
                        <tbody>
                            {filteredStudents.map((s, idx) => {
                                const pct = s.percentage;
                                const barColor = pct >= 75 ? '#10b981' : pct >= 65 ? '#f59e0b' : '#ef4444';

                                return (
                                    <tr key={s.student_id} style={{ borderBottom: idx === filteredStudents.length - 1 ? 'none' : '1px solid #f1f5f9' }}>
                                        {/* Roll No */}
                                        <td style={{ padding: '1rem', fontWeight: 'bold', color: '#0f172a' }}>{s.student_id}</td>
                                        
                                        {/* Name */}
                                        <td style={{ padding: '1rem', color: '#334155' }}>{s.name || s.student_id}</td>
                                        
                                        {/* Attended / Total */}
                                        <td style={{ padding: '1rem', color: '#64748b', fontWeight: '600' }}>
                                            {s.attended_sessions} / {s.total_sessions}
                                        </td>
                                        
                                        {/* Progress Bar & % */}
                                        <td style={{ padding: '1rem' }}>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                                                <div style={{ flex: 1, background: '#e2e8f0', height: '8px', borderRadius: '4px', overflow: 'hidden' }}>
                                                    <div style={{ width: `${Math.min(pct, 100)}%`, height: '100%', background: barColor, borderRadius: '4px', transition: 'width 0.4s ease' }} />
                                                </div>
                                                <span style={{ fontWeight: 'bold', color: barColor, minWidth: '48px', fontSize: '0.9rem' }}>
                                                    {pct}%
                                                </span>
                                            </div>
                                        </td>

                                        {/* Eligibility Badge */}
                                        <td style={{ padding: '1rem' }}>
                                            {s.is_shortage ? (
                                                <span style={{ display: 'inline-flex', alignItems: 'center', gap: '5px', background: '#fee2e2', color: '#991b1b', padding: '4px 10px', borderRadius: '12px', fontSize: '0.8rem', fontWeight: 'bold' }}>
                                                    <AlertTriangle size={13} color="#dc2626" /> Shortage (&lt;75%)
                                                </span>
                                            ) : (
                                                <span style={{ display: 'inline-flex', alignItems: 'center', gap: '5px', background: '#dcfce7', color: '#166534', padding: '4px 10px', borderRadius: '12px', fontSize: '0.8rem', fontWeight: 'bold' }}>
                                                    <CheckCircle size={13} color="#16a34a" /> Eligible (Safe)
                                                </span>
                                            )}
                                        </td>

                                        {/* Requirement for 75% */}
                                        <td style={{ padding: '1rem', textAlign: 'right' }}>
                                            {s.is_shortage ? (
                                                <span style={{ background: '#fffbeb', border: '1px solid #fde68a', color: '#92400e', padding: '3px 8px', borderRadius: '4px', fontSize: '0.75rem', fontWeight: 'bold' }}>
                                                    Must attend next {s.classes_needed_for_75} classes
                                                </span>
                                            ) : (
                                                <span style={{ color: '#10b981', fontSize: '0.85rem', fontWeight: '600' }}>
                                                    ✓ Criteria Met
                                                </span>
                                            )}
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                )}
            </div>

            {/* --- UPLOAD ATTENDANCE MODAL --- */}
            {showUploadModal && (
                <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(15,23,42,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: '1rem' }}>
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
                                    <label style={{ display: 'block', fontWeight: 'bold', color: '#334155', marginBottom: '0.35rem', fontSize: '0.85rem' }}>Session Date</label>
                                    <input 
                                        type="date"
                                        value={sessionDate}
                                        onChange={(e) => setSessionDate(e.target.value)}
                                        required
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
                                    Attendance File (CSV, XLSX, or Scanned Image/PDF)
                                </label>
                                <div style={{ border: '2px dashed #cbd5e1', borderRadius: '8px', padding: '1.5rem', textAlign: 'center', background: '#f8fafc', cursor: 'pointer' }}>
                                    <input 
                                        type="file"
                                        accept=".csv,.xlsx,.xls,.png,.jpg,.jpeg,.pdf"
                                        onChange={(e) => setUploadFile(e.target.files[0])}
                                        style={{ width: '100%' }}
                                    />
                                    <p style={{ margin: '0.5rem 0 0 0', fontSize: '0.8rem', color: '#64748b' }}>
                                        Supported: Tabular files (.csv, .xlsx) or physical sign-in scans (PNG/JPG/PDF via Gemini Vision)
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
                                    <FileSpreadsheet size={14} /> Download Sample CSV Template
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
                                    {uploading ? 'Processing AI...' : 'Ingest & Calculate'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
}
