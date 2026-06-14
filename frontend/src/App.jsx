// frontend/src/App.jsx
import { useState, useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route, Link, Navigate } from 'react-router-dom';
import SetupPortal from './pages/SetupPortal';
import ReviewDashboard from './pages/ReviewDashboard';
import RosterDashboard from './pages/RosterDashboard';
import Login from './pages/Login';
import Register from './pages/Register';
import Dashboard from './pages/Dashboard';
import InsightsDashboard from './pages/InsightsDashboard';

export default function App() {
    // Check if the user already has a token in their browser
    const [isAuthenticated, setIsAuthenticated] = useState(!!localStorage.getItem('access_token'));

    const handleLogout = () => {
        localStorage.removeItem('access_token');
        setIsAuthenticated(false);
    };

    return (
        <Router>
            {/* Only show the Navbar if the user is logged in */}
            {isAuthenticated && (
                <nav style={{ padding: '1rem', background: '#0f172a', color: 'white', display: 'flex', justifyContent: 'space-between' }}>
                    <div style={{ fontWeight: 'bold', letterSpacing: '1px' }}>GRADEOPS</div>
                    <div style={{ display: 'flex', gap: '1.5rem' }}>
                          <Link to="/" style={{ color: 'white', textDecoration: 'none' }}>Dashboard</Link>
                          <Link to="/setup" style={{ color: 'white', textDecoration: 'none' }}>Setup Exam</Link>
                          <Link to="/runner" style={{ color: 'white', textDecoration: 'none' }}>Grade Runner</Link>
                          <Link to="/roster" style={{ color: 'white', textDecoration: 'none' }}>Class Roster</Link>
                          <button onClick={handleLogout} style={{ background: 'transparent', border: 'none', color: '#ef4444', cursor: 'pointer', fontWeight: 'bold' }}>Logout</button>
                    </div>
                </nav>
            )}

            <div style={{ padding: '2rem' }}>
                <Routes>
                    {/* The Login Route */}
                    <Route path="/login" element={
                        isAuthenticated ? <Navigate to="/" /> : <Login setAuthStatus={setIsAuthenticated} />
                    } />
                    <Route path="/register" element={
                        isAuthenticated ? <Navigate to="/" /> : <Register />
                    } />

                    {/* The Protected Routes */}
                    <Route path="/" element={
                          isAuthenticated ? <Dashboard /> : <Navigate to="/login" />
                    } />
                    <Route path="/setup" element={
                          isAuthenticated ? <SetupPortal /> : <Navigate to="/login" />
                    } />
                    <Route path="/runner" element={
                        isAuthenticated ? <ReviewDashboard /> : <Navigate to="/login" />
                    } />
                    <Route path="/roster" element={
                        isAuthenticated ? <RosterDashboard /> : <Navigate to="/login" />
                    } />
                    <Route path="/insights" element={<InsightsDashboard />} />
                </Routes>
            </div>
        </Router>
    );
}