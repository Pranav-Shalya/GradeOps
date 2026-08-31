// frontend/src/pages/Register.jsx
import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { authService } from '../services/api';
import { UserPlus, Shield, Users } from 'lucide-react';

export default function Register() {
    const [formData, setFormData] = useState({
        full_name: '',
        email: '',
        password: '',
        role: 'INSTRUCTOR', // Default to INSTRUCTOR
        access_code: ''
    });
    const [error, setError] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const navigate = useNavigate();

    const handleChange = (e) => {
        const val = e.target.name === 'access_code' ? e.target.value.toUpperCase() : e.target.value;
        setFormData({ ...formData, [e.target.name]: val });
    };

    const handleRegister = async (e) => {
        e.preventDefault();
        setError('');
        setIsLoading(true);
        
        try {
            const payload = {
                full_name: formData.full_name,
                email: formData.email,
                password: formData.password,
                role: formData.role,
                access_code: formData.role === 'TA' ? formData.access_code.trim() : undefined
            };

            const res = await authService.register(payload);
            
            if (formData.role === 'INSTRUCTOR' && res.data?.access_code) {
                alert(`Account created successfully! Your Instructor Access Code is: ${res.data.access_code}\nPlease log in to start.`);
            } else {
                alert('Account created successfully! Please log in.');
            }
            
            navigate('/login');
        } catch (err) {
            if (err.response && err.response.data && err.response.data.detail) {
                setError(err.response.data.detail);
            } else {
                setError('Registration failed. Please verify your details and try again.');
            }
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <div style={{ maxWidth: '440px', margin: '3rem auto', padding: '2rem', background: 'white', borderRadius: '8px', boxShadow: '0 4px 6px rgba(0,0,0,0.1)', textAlign: 'center' }}>
            <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '1rem' }}>
                <div style={{ background: '#f1f5f9', padding: '1rem', borderRadius: '50%' }}>
                    <UserPlus size={32} color="#0f172a" />
                </div>
            </div>
            <h2 style={{ marginBottom: '0.5rem', color: '#1e293b' }}>Create Account</h2>
            <p style={{ color: '#64748b', fontSize: '0.9rem', marginBottom: '1.5rem' }}>Join your university's automated grading workspace</p>
            
            {error && <div style={{ color: '#ef4444', background: '#fee2e2', padding: '0.75rem', borderRadius: '4px', marginBottom: '1rem', fontSize: '0.85rem', textAlign: 'left' }}>{error}</div>}

            <form onSubmit={handleRegister} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                
                {/* Role Selector Toggle */}
                <div>
                    <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 'bold', color: '#475569', textAlign: 'left', marginBottom: '0.35rem' }}>
                        Account Role
                    </label>
                    <div style={{ display: 'flex', gap: '0.5rem' }}>
                        <button
                            type="button"
                            onClick={() => setFormData({ ...formData, role: 'INSTRUCTOR', access_code: '' })}
                            style={{
                                flex: 1,
                                padding: '0.65rem 0.5rem',
                                borderRadius: '6px',
                                border: formData.role === 'INSTRUCTOR' ? '2px solid #2563eb' : '1px solid #cbd5e1',
                                background: formData.role === 'INSTRUCTOR' ? '#eff6ff' : '#f8fafc',
                                color: formData.role === 'INSTRUCTOR' ? '#1d4ed8' : '#64748b',
                                fontWeight: 'bold',
                                fontSize: '0.85rem',
                                cursor: 'pointer',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                gap: '6px'
                            }}
                        >
                            <Shield size={16} /> Instructor
                        </button>
                        <button
                            type="button"
                            onClick={() => setFormData({ ...formData, role: 'TA' })}
                            style={{
                                flex: 1,
                                padding: '0.65rem 0.5rem',
                                borderRadius: '6px',
                                border: formData.role === 'TA' ? '2px solid #2563eb' : '1px solid #cbd5e1',
                                background: formData.role === 'TA' ? '#eff6ff' : '#f8fafc',
                                color: formData.role === 'TA' ? '#1d4ed8' : '#64748b',
                                fontWeight: 'bold',
                                fontSize: '0.85rem',
                                cursor: 'pointer',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                gap: '6px'
                            }}
                        >
                            <Users size={16} /> Teaching Assistant
                        </button>
                    </div>
                </div>

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

                {/* TA Specific Field: Instructor Access Code */}
                {formData.role === 'TA' ? (
                    <div style={{ textAlign: 'left' }}>
                        <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 'bold', color: '#475569', marginBottom: '0.25rem' }}>
                            Instructor Access Code *
                        </label>
                        <input 
                            type="text" 
                            name="access_code"
                            placeholder="e.g. X7B9P2" 
                            value={formData.access_code} 
                            onChange={handleChange}
                            required
                            maxLength={6}
                            style={{ 
                                width: '100%', 
                                padding: '0.75rem', 
                                borderRadius: '4px', 
                                border: '1px solid #cbd5e1',
                                textTransform: 'uppercase',
                                letterSpacing: '2px',
                                fontWeight: 'bold',
                                fontSize: '1rem'
                            }}
                        />
                        <span style={{ fontSize: '0.75rem', color: '#64748b', display: 'block', marginTop: '4px' }}>
                            Ask your supervising professor for their 6-character team invite code.
                        </span>
                    </div>
                ) : (
                    <div style={{ padding: '0.65rem', background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: '4px', fontSize: '0.8rem', color: '#166534', textAlign: 'left' }}>
                        ✓ A unique 6-character invite code will be generated for your TAs upon signup.
                    </div>
                )}

                <button 
                    type="submit" 
                    disabled={isLoading} 
                    style={{ 
                        padding: '0.75rem', 
                        background: '#0f172a', 
                        color: 'white', 
                        border: 'none', 
                        borderRadius: '4px', 
                        fontWeight: 'bold', 
                        cursor: isLoading ? 'not-allowed' : 'pointer', 
                        marginTop: '0.5rem',
                        fontSize: '0.95rem'
                    }}
                >
                    {isLoading ? 'Creating Account...' : `Sign Up as ${formData.role === 'INSTRUCTOR' ? 'Instructor' : 'TA'}`}
                </button>
            </form>

            <div style={{ marginTop: '1.5rem', fontSize: '0.9rem', color: '#64748b' }}>
                Already have an account? <Link to="/login" style={{ color: '#2563eb', textDecoration: 'none', fontWeight: 'bold' }}>Sign In</Link>
            </div>
        </div>
    );
}