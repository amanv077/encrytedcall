import React, { useState, useEffect } from 'react';
import { Layout, Typography, Button, Space } from 'antd';
import { PhoneOutlined, VideoCameraOutlined, MessageOutlined } from '@ant-design/icons';
import { matrixManager } from '../../utils/matrixClient';
import { useCallManager } from '../../hooks/useCallManager';
import CallOverlay from '../CallOverlay/CallOverlay';
import ActiveCall from '../ActiveCall/ActiveCall';
import Sidebar from '../Sidebar/Sidebar';
import styles from './ChatLayout.module.scss';

const { Content } = Layout;
const { Title, Text } = Typography;

export default function ChatLayout({ onLogout }) {
  const [isReady, setIsReady] = useState(matrixManager.isReady);
  const [selectedTarget, setSelectedTarget] = useState(null);
  const [dialerNotice, setDialerNotice] = useState('');
  
  const handleSelectTarget = (id) => {
    setSelectedTarget(id);
    setDialerNotice('');
  };

  const {
    incomingCall,
    activeCall,
    callState,
    localStream,
    remoteStream,
    isMuted,
    isVideoOff,
    isScreenSharing,
    placeCall,
    answerCall,
    rejectCall,
    endCall,
    toggleMute,
    toggleVideo,
    toggleScreenShare
  } = useCallManager();

  useEffect(() => {
    // Poll for ready state if not already ready
    if (!isReady) {
      const interval = setInterval(() => {
        if (matrixManager.isReady) {
          setIsReady(true);
          clearInterval(interval);
        }
      }, 500);
      return () => clearInterval(interval);
    }
  }, [isReady]);

  const handleCall = async (video = true) => {
    if (!selectedTarget) {
      alert("Please select a valid User ID or Room ID from the sidebar.");
      return;
    }
    const result = await placeCall(selectedTarget, video);
    if (!result?.ok) {
      setDialerNotice(result?.error?.message || "Unable to place call.");
    } else {
      setDialerNotice('');
    }
  };

  return (
    <div className={styles.mainLayout}>
      <Sidebar 
        onSelectTarget={handleSelectTarget} 
        onLogout={onLogout}
        selectedTarget={selectedTarget}
      />
      
      <Content className={styles.chatArea}>
        {callState === 'idle' ? (
          !selectedTarget ? (
            <div className={styles.welcomePlaceholder}>
              <MessageOutlined style={{ fontSize: 80, color: '#8696a0', opacity: 0.5, marginBottom: 20 }} />
              <Title level={3} style={{ color: '#e9edef', fontWeight: 300, margin: 0 }}>WhatsApp Web for Matrix</Title>
              <Text style={{ color: '#8696a0', textAlign: 'center', marginTop: 10 }}>
                Select a user or room from the sidebar to start a chat or call.<br />
                End-to-end encrypted calls and messages.
              </Text>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
              <div className={styles.chatHeader}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <div style={{ width: 40, height: 40, borderRadius: '50%', background: '#8696a0', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <MessageOutlined style={{ color: '#fff' }} />
                  </div>
                  <div>
                    <div style={{ color: '#e9edef', fontSize: 16 }}>{selectedTarget}</div>
                    <div style={{ color: '#8696a0', fontSize: 13 }}>Click audio or video icon to call</div>
                  </div>
                </div>
                <Space>
                  <Button 
                    type="text" 
                    icon={<PhoneOutlined />} 
                    onClick={() => handleCall(false)}
                    disabled={!isReady}
                    style={{ color: '#aebac1' }} 
                  />
                  <Button 
                    type="text" 
                    icon={<VideoCameraOutlined />} 
                    onClick={() => handleCall(true)}
                    disabled={!isReady}
                    style={{ color: '#aebac1' }} 
                  />
                </Space>
              </div>

              <div className={styles.chatBodyPlaceholder}>
                <div style={{ background: '#202c33', padding: '6px 12px', borderRadius: 8, color: '#e9edef', width: 'fit-content', margin: '0 auto', fontSize: 12, boxShadow: '0 1px 0.5px rgba(11,20,26,.13)' }}>
                  Chat features are coming soon. For now, you can place secure calls.
                </div>
                {dialerNotice && (
                  <div style={{ background: '#f5222d', padding: '6px 12px', borderRadius: 8, color: '#fff', width: 'fit-content', margin: '10px auto', fontSize: 13 }}>
                    {dialerNotice}
                  </div>
                )}
              </div>

              <div style={{ padding: '10px 16px', background: '#202c33', display: 'flex', alignItems: 'center' }}>
                <div style={{ flex: 1, background: '#2a3942', borderRadius: 8, padding: '9px 12px', color: '#8696a0' }}>
                  Type a message (Coming soon)
                </div>
              </div>
            </div>
          )
        ) : (
          <ActiveCall 
            localStream={localStream}
            remoteStream={remoteStream}
            isMuted={isMuted}
            isVideoOff={isVideoOff}
            isScreenSharing={isScreenSharing}
            callState={callState}
            toggleMute={toggleMute}
            toggleVideo={toggleVideo}
            toggleScreenShare={toggleScreenShare}
            endCall={endCall}
          />
        )}
      </Content>

      <CallOverlay 
        call={incomingCall} 
        onAccept={answerCall} 
        onReject={rejectCall} 
      />
    </div>
  );
}
