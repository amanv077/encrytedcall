import React, { useState, useEffect, useRef } from 'react';
import LoginPage from './pages/LoginPage';
import CallPage from './pages/CallPage';
import { matrixManager } from './services/matrixClient';
import './index.css';

function App() {
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [loading, setLoading] = useState(true);
  const authAttempted = useRef(false);

  useEffect(() => {
    if (authAttempted.current) return;
    authAttempted.current = true;

    const checkAuth = async () => {
      try {
        const client = await matrixManager.resumeSession();
        if (client) {
          setIsLoggedIn(true);
        }
      } catch (e) {
        console.error("Auto-auth failed", e);
      } finally {
        setLoading(false);
      }
    };
    checkAuth();
  }, []);

  const handleLogout = async () => {
    await matrixManager.logout();
    setIsLoggedIn(false);
  };

  if (loading) {
    return (
      <div className="page-center">
        <div className="loader">Initializing Secure Session...</div>
      </div>
    );
  }

  return (
    <div className="app-container">
      {isLoggedIn ? (
        <CallPage onLogout={handleLogout} />
      ) : (
        <LoginPage onLoginSuccess={() => setIsLoggedIn(true)} />
      )}
    </div>
  );
}

export default App;
