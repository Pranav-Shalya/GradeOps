// frontend/src/pages/Login.jsx
import { useState } from 'react';
import { useNavigate,Link } from 'react-router-dom';
import { authService } from '../services/api';
import { Lock } from 'lucide-react';

export default function Login({ setAuthStatus }) {
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [error, setError] = useState('');
    const navigate = useNavigate();

    const handleLogin = async (e) => {
        e.preventDefault();
        setError('');
        
        try {
            const response = await authService.login(email, password);
            // Save the secure token to the browser's local storage
            localStorage.setItem('access_token', response.data.access_token);
            setAuthStatus(true);
            navigate('/'); // Send them to the dashboard!
        } catch (err) {
            setError('Invalid email or password.');
        }
    };

    return (
        <div style={{ maxWidth: '400px', margin: '4rem auto', padding: '2rem', background: 'white', borderRadius: '8px', boxShadow: '0 4px 6px rgba(0,0,0,0.1)', textAlign: 'center' }}>
            <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '1rem' }}>
                <div style={{ background: '#f1f5f9', padding: '1rem', borderRadius: '50%' }}>
                    <Lock size={32} color="#0f172a" />
                </div>
            </div>
            <h2 style={{ marginBottom: '1.5rem', color: '#1e293b' }}>GRADEOPS Login</h2>
            
            {error && <div style={{ color: '#ef4444', background: '#fee2e2', padding: '0.75rem', borderRadius: '4px', marginBottom: '1rem', fontSize: '0.9rem' }}>{error}</div>}

            <form onSubmit={handleLogin} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                <input 
                    type="email" 
                    placeholder="University Email" 
                    value={email} 
                    onChange={(e) => setEmail(e.target.value)}
                    required
                    style={{ padding: '0.75rem', borderRadius: '4px', border: '1px solid #cbd5e1' }}
                />
                <input 
                    type="password" 
                    placeholder="Password" 
                    value={password} 
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    style={{ padding: '0.75rem', borderRadius: '4px', border: '1px solid #cbd5e1' }}
                />
                <button type="submit" style={{ padding: '0.75rem', background: '#0f172a', color: 'white', border: 'none', borderRadius: '4px', fontWeight: 'bold', cursor: 'pointer', marginTop: '0.5rem' }}>
                    Sign In
                </button>
            </form>
            {/* Add this right below the </form> tag in Login.jsx */}
            <div style={{ marginTop: '1.5rem', fontSize: '0.9rem', color: '#64748b' }}>
                Don't have an account? <Link to="/register" style={{ color: '#2563eb', textDecoration: 'none', fontWeight: 'bold' }}>Sign Up</Link>
            </div>
        </div>
    );
}