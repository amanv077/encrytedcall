import React, { useState, useEffect, useRef } from 'react';
import { Provider } from 'react-redux';
import { ConfigProvider, theme, Spin } from 'antd';
import LoginPage from './features/auth/pages/LoginPage/LoginPage';
import ChatLayout from './features/chat/components/ChatLayout/ChatLayout';
import { matrixManager } from './features/chat/utils/matrixClient';
import { storageService } from './features/chat/utils/storageService';
import store from './store/index';
import './shared/styles/global.scss';

function App() {
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [loading, setLoading] = useState(true);
  const authAttempted = useRef(false);

  useEffect(() => {
    if (authAttempted.current) return;
    authAttempted.current = true;

    const checkAuth = async () => {
      try {
        // Init persistent storage before resuming session so that
        // chatService can begin saving events immediately on sync.
        await storageService.init();
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
    // storageService.clearAll() is called inside matrixManager.logout()
    await matrixManager.logout();
    setIsLoggedIn(false);
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
          <LoginPage onLoginSuccess={() => setIsLoggedIn(true)} />
        )}
      </div>
    </ConfigProvider>
    </Provider>
  );
}

export default App;
