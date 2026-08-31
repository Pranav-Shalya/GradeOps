// frontend/src/services/api.js
import axios from 'axios';

const api = axios.create({
    baseURL: 'http://127.0.0.1:8001/api', 
});

// --- BULLETPROOF AXIOS INTERCEPTOR ---
// This safely injects the JWT token even when uploading files!
api.interceptors.request.use((config) => {
    const token = localStorage.getItem('access_token');
    if (token) {
        config.headers = config.headers || {};
        config.headers['Authorization'] = `Bearer ${token}`;
    }
    return config;
}, (error) => {
    return Promise.reject(error);
});

export const authService = {
    login: (username, password) => {
        const formData = new URLSearchParams();
        formData.append('username', username);
        formData.append('password', password);
        
        return api.post('/auth/login', formData, {
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
        });
    },
    register: (userData) => {
        return api.post('/auth/register', userData);
    },
    getMe: () => {
        return api.get('/auth/me');
    }
};

export const teamService = {
    getTeamActivity: () => {
        return api.get('/team/activity');
    }
};

export const examService = {
    // 1. Dashboard: Get all exams
    getAllExams: () => {
        return api.get('/exams');
    },

    // 2. Setup Portal: Unified Exam Creation + ZIP Upload
    initializeExam: (formData) => {
        return api.post('/exams/initialize', formData, {
            headers: { 'Content-Type': 'multipart/form-data' }
        });
    },
    
    // 3. Dashboard: Late student single PDF upload
    singleUpload: (examId, formData) => {
        return api.post(`/exams/${examId}/single-upload`, formData, {
            headers: { 'Content-Type': 'multipart/form-data' }
        });
    },

    // 4. Grade Runner (HITL): Manual TA crop re-evaluation
    regradeManualCrop: (examId, submissionId, questionKey, boxParams) => {
        // boxParams should be: { x: float, y: float, w: float, h: float, page: int }
        return api.post(`/exams/${examId}/submissions/${submissionId}/regrade/${questionKey}`, boxParams);
    },

    // 5. Roster: Get full class list
    getExamRoster: (examId) => {
        return api.get(`/exams/${examId}/roster`);
    },

    // 6. Grade Runner: Get specific student data
    getSubmissionDetails: (examId, submissionId) => {
        return api.get(`/exams/${examId}/submissions/${submissionId}`);
    },

    // 7. Grade Runner: Lock in the final human-verified grade
    commitGrade: (examId, submissionId, payload) => {
        return api.put(`/exams/${examId}/submissions/${submissionId}/commit`, payload);
    },

    // 8. Plagiarism & Similarity: Trigger cross-submission check
    runPlagiarismCheck: (examId) => {
        return api.post(`/exams/${examId}/run-plagiarism-check`);
    },

    // 9. Rubric Agent: Auto-generate JSON rubric from blank exam & answer key
    generateRubric: (formData) => {
        return api.post('/exams/generate-rubric', formData, {
            headers: { 'Content-Type': 'multipart/form-data' }
        });
    },

    // 10. Exam Deletion: Cascading delete of exam and submissions
    deleteExam: (examId) => {
        return api.delete(`/exams/${examId}`);
    }
};

export const attendanceService = {
    getCourses: () => {
        return api.get('/attendance/courses');
    },
    getSummary: (courseId, latePolicy = 'lenient') => {
        return api.get(`/attendance/${courseId}/summary?late_policy=${latePolicy}`);
    },
    getSessions: (courseId) => {
        return api.get(`/attendance/${courseId}/sessions`);
    },
    uploadSheet: (courseId, formData) => {
        return api.post(`/attendance/${courseId}/upload`, formData, {
            headers: { 'Content-Type': 'multipart/form-data' }
        });
    },
    toggleStudent: (courseId, sessionId, studentId, status, latePolicy = 'lenient') => {
        return api.put(`/attendance/${courseId}/sessions/${sessionId}/student/${studentId}`, { status, late_policy: latePolicy });
    },
    exportCSVUrl: (courseId, latePolicy = 'lenient') => {
        return `http://127.0.0.1:8001/api/attendance/${courseId}/export?late_policy=${latePolicy}`;
    }
};

export default api;