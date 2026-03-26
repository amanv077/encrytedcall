import React, { useState, useEffect, useRef } from 'react';
import { matrixManager } from '../services/matrixClient';
import { useCall } from '../hooks/useCall';
import IncomingCallModal from '../components/IncomingCallModal';
import CallUI from '../components/CallUI';

export default function CallPage() {
  const [isReady, setIsReady] = useState(false);
  const [roomIdInput, setRoomIdInput] = useState('');
  const [errorMsg, setErrorMsg] = useState('');
  const initAttempted = useRef(false);
  
  const {
    incomingCall,
    activeCall,
    callState,
    localStream,
    remoteStream,
    isMuted,
    isVideoOff,
    placeCall,
    answerCall,
    rejectCall,
    endCall,
    toggleMute,
    toggleVideo
  } = useCall();

  useEffect(() => {
    if (initAttempted.current) return;
    initAttempted.current = true;

    // Initialize Matrix when the page mounts
    matrixManager.initAndLogin()

      .then((client) => {
        if (client) setIsReady(true);
        else setErrorMsg('Matrix configuration missing or invalid in .env variables.');
      })
      .catch((err) => {
        setErrorMsg('Failed to login. Ensure credentials are correct and Matrix server is reachable.');
        console.error(err);
      });
  }, []);

  const handleCall = () => {
    if (!roomIdInput.trim()) {
      alert("Please enter a valid User ID or Room ID");
      return;
    }
    placeCall(roomIdInput);
  };

  return (
    <div className="call-page">
      <div className="status-badge">
        {!isReady && !errorMsg && <span className="connecting">🟡 Connecting to Matrix...</span>}
        {isReady && <span className="connected">🟢 Matrix Connected</span>}
        {errorMsg && <span className="error">🔴 {errorMsg}</span>}
      </div>

      {/* If entirely idle or just connecting, show the dialer */}
      {callState === 'idle' ? (
        <div className="dialer-container">
          <h2>Secure Healthcare Communications</h2>
          <p>End-to-end encrypted Audio/Video module</p>
          <div className="dialer-box">
             <input 
               type="text" 
               placeholder="Enter Matrix User ID or Room ID (e.g. @user:matrix.org)"
               value={roomIdInput}
               onChange={(e) => setRoomIdInput(e.target.value)}
               disabled={!isReady}
             />
             <button 
               className="btn-primary" 
               onClick={handleCall}
               disabled={!isReady}
               style={{ opacity: !isReady ? 0.5 : 1, cursor: !isReady ? 'not-allowed' : 'pointer' }}
             >
               Start Video Call
             </button>
          </div>
        </div>
      ) : (
        <CallUI 
          localStream={localStream}
          remoteStream={remoteStream}
          isMuted={isMuted}
          isVideoOff={isVideoOff}
          callState={callState}
          toggleMute={toggleMute}
          toggleVideo={toggleVideo}
          endCall={endCall}
        />
      )}

      {/* Incoming Call Modal overlay */}
      <IncomingCallModal 
        call={incomingCall} 
        onAccept={answerCall} 
        onReject={rejectCall} 
      />
    </div>
  );
}
