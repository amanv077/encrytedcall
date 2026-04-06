import React, { useState, useEffect, useRef } from 'react';
import { Provider } from 'react-redux';
import { ConfigProvider, theme, Spin } from 'antd';
import LoginPage from './features/auth/pages/LoginPage/LoginPage.jsx';
import ChatLayout from './features/chat/components/ChatLayout/ChatLayout';
import { matrixManager } from './features/chat/utils/matrixClient';
import { storageService } from './features/chat/utils/storageService';
import store from './store/index';
import './shared/styles/global.scss';

function App() {
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [loading, setLoading] = useState(true);
  const [sessionAwaitingRecovery, setSessionAwaitingRecovery] = useState(false);
  const authAttempted = useRef(false);

  useEffect(() => {
    if (authAttempted.current) return;
    authAttempted.current = true;

    const checkAuth = async () => {
      try {
        await storageService.init();
        const result = await matrixManager.resumeSession();
        if (result?.needsRecoveryKey) {
          setSessionAwaitingRecovery(true);
        } else if (matrixManager.getClient() && matrixManager.isReady) {
          setIsLoggedIn(true);
        }
      } catch (e) {
        console.error('Auto-auth failed', e);
      } finally {
        setLoading(false);
      }
    };
    checkAuth();
  }, []);

  const handleLogout = async () => {
    await matrixManager.logout();
    setIsLoggedIn(false);
    setSessionAwaitingRecovery(false);
  };

  const handleLoginSuccess = () => {
    setSessionAwaitingRecovery(false);
    setIsLoggedIn(true);
  };

  const antdThemeConfig = {
    algorithm: theme.defaultAlgorithm,
    token: {
      colorPrimary: '#006d6a',
      colorBgBase: '#ffffff',
      colorBgElevated: '#ffffff',
      colorTextBase: '#1a1f2e',
      borderRadius: 8,
      fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
    },
  };

  return (
    <Provider store={store}>
    <ConfigProvider theme={antdThemeConfig}>
      <div style={{ height: '100vh', width: '100vw', display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
        {loading ? (
          <Spin size="large" tip="Initializing Secure Session..." style={{ color: '#006d6a' }}/>
        ) : isLoggedIn ? (
          <ChatLayout onLogout={handleLogout} />
        ) : (
          <LoginPage
            sessionAwaitingRecovery={sessionAwaitingRecovery}
            onLoginSuccess={handleLoginSuccess}
          />
        )}
      </div>
    </ConfigProvider>
    </Provider>
  );
}

export default App;
