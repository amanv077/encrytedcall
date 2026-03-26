import React, { useState } from 'react';
import { matrixManager } from '../services/matrixClient';

export default function LoginPage({ onLoginSuccess }) {
  const [baseUrl, setBaseUrl] = useState(import.meta.env.VITE_MATRIX_BASE_URL || 'https://matrix.org');
  const [userId, setUserId] = useState('');

  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleLogin = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      await matrixManager.login(baseUrl, userId, password);
      onLoginSuccess();
    } catch (err) {
      setError(err.message || 'Login failed. Please check your credentials.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="login-container">
      <div className="login-box">
        <h1>Secure Communication</h1>
        <p>Login to your healthcare portal</p>
        
        <form onSubmit={handleLogin}>
          <div className="input-group">
            <label>Matrix User ID</label>
            <input 
              type="text" 
              value={userId} 
              onChange={(e) => setUserId(e.target.value)} 
              placeholder="@user:server.org"
              required
            />
          </div>

          
          <div className="input-group">
            <label>Password</label>
            <input 
              type="password" 
              value={password} 
              onChange={(e) => setPassword(e.target.value)} 
              required
            />
          </div>

          {error && <div className="error-message">{error}</div>}

          <button type="submit" className="btn-primary" disabled={loading}>
            {loading ? 'Connecting...' : 'Login'}
          </button>
        </form>
      </div>
    </div>
  );
}
