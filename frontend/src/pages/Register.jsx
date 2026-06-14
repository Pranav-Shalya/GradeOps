// frontend/src/pages/Register.jsx
import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { authService } from '../services/api';
import { UserPlus } from 'lucide-react';

export default function Register() {
    const [formData, setFormData] = useState({
        full_name: '',
        email: '',
        password: '',
        role: 'ta' // Default to TA
    });
    const [error, setError] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const navigate = useNavigate();

    const handleChange = (e) => {
        setFormData({ ...formData, [e.target.name]: e.target.value });
    };

    const handleRegister = async (e) => {
        e.preventDefault();
        setError('');
        setIsLoading(true);
        
        try {
            await authService.register(formData);
            // On success, redirect them to the login page so they can sign in
            alert('Account created successfully! Please log in.');
            navigate('/login');
        } catch (err) {
            // Check if the backend sent a specific error (like "Email already registered")
            if (err.response && err.response.data && err.response.data.detail) {
                setError(err.response.data.detail);
            } else {
                setError('Registration failed. Please try again.');
            }
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <div style={{ maxWidth: '400px', margin: '4rem auto', padding: '2rem', background: 'white', borderRadius: '8px', boxShadow: '0 4px 6px rgba(0,0,0,0.1)', textAlign: 'center' }}>
            <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '1rem' }}>
                <div style={{ background: '#f1f5f9', padding: '1rem', borderRadius: '50%' }}>
                    <UserPlus size={32} color="#0f172a" />
                </div>
            </div>
            <h2 style={{ marginBottom: '1.5rem', color: '#1e293b' }}>Create Account</h2>
            
            {error && <div style={{ color: '#ef4444', background: '#fee2e2', padding: '0.75rem', borderRadius: '4px', marginBottom: '1rem', fontSize: '0.9rem' }}>{error}</div>}

            <form onSubmit={handleRegister} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                <input 
                    type="text" 
                    name="full_name"
                    placeholder="Full Name" 
                    value={formData.full_name} 
                    onChange={handleChange}
                    required
                    style={{ padding: '0.75rem', borderRadius: '4px', border: '1px solid #cbd5e1' }}
                />
                <input 
                    type="email" 
                    name="email"
                    placeholder="University Email" 
                    value={formData.email} 
                    onChange={handleChange}
                    required
                    style={{ padding: '0.75rem', borderRadius: '4px', border: '1px solid #cbd5e1' }}
                />
                <input 
                    type="password" 
                    name="password"
                    placeholder="Password" 
                    value={formData.password} 
                    onChange={handleChange}
                    required
                    style={{ padding: '0.75rem', borderRadius: '4px', border: '1px solid #cbd5e1' }}
                />
                
                <select 
                    name="role" 
                    value={formData.role} 
                    onChange={handleChange}
                    style={{ padding: '0.75rem', borderRadius: '4px', border: '1px solid #cbd5e1', backgroundColor: 'white' }}
                >
                    <option value="ta">Teaching Assistant</option>
                    <option value="professor">Professor</option>
                </select>

                <button type="submit" disabled={isLoading} style={{ padding: '0.75rem', background: '#0f172a', color: 'white', border: 'none', borderRadius: '4px', fontWeight: 'bold', cursor: isLoading ? 'not-allowed' : 'pointer', marginTop: '0.5rem' }}>
                    {isLoading ? 'Creating...' : 'Sign Up'}
                </button>
            </form>

            <div style={{ marginTop: '1.5rem', fontSize: '0.9rem', color: '#64748b' }}>
                Already have an account? <Link to="/login" style={{ color: '#2563eb', textDecoration: 'none', fontWeight: 'bold' }}>Sign In</Link>
            </div>
        </div>
    );
}