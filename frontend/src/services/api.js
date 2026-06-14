// frontend/src/services/api.js
import axios from 'axios';

const api = axios.create({
    baseURL: 'http://127.0.0.1:8000/api', 
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
    }
};

export default api;