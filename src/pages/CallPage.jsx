import React, { useState, useEffect } from 'react';
import { matrixManager } from '../services/matrixClient';
import { useCall } from '../hooks/useCall';
import IncomingCallModal from '../components/IncomingCallModal';
import CallUI from '../components/CallUI';
import { Phone, Video, LogOut } from 'lucide-react';

export default function CallPage({ onLogout }) {
  const [isReady, setIsReady] = useState(matrixManager.isReady);
  const [roomIdInput, setRoomIdInput] = useState('');
  
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

  const handleCall = (video = true) => {
    if (!roomIdInput.trim()) {
      alert("Please enter a valid User ID or Room ID");
      return;
    }
    placeCall(roomIdInput, video);
  };

  return (
    <div className="call-page">
      <div className="top-bar">
        <div className="status-badge-inline">
          {isReady ? (
            <span className="connected">🟢 Secure Line Active</span>
          ) : (
            <span className="connecting">🟡 Establishing Connection...</span>
          )}
        </div>
        <button className="logout-btn" onClick={onLogout} title="Logout">
          <LogOut size={20} />
        </button>
      </div>

      {/* Dialer UI */}
      {callState === 'idle' ? (
        <div className="dialer-container">
          <h2>Secure Healthcare Communications</h2>
          <p>E2EE Audio/Video Call Module</p>
          
          <div className="dialer-box">
             <input 
               type="text" 
               placeholder="Enter Matrix User ID (@user:server.org)"
               value={roomIdInput}
               onChange={(e) => setRoomIdInput(e.target.value)}
             />
             
             <div className="call-actions">
               <button 
                 className="btn-call audio" 
                 onClick={() => handleCall(false)}
                 disabled={!isReady}
               >
                 <Phone size={20} />
                 <span>Audio Call</span>
               </button>
               
               <button 
                 className="btn-call video" 
                 onClick={() => handleCall(true)}
                 disabled={!isReady}
               >
                 <Video size={20} />
                 <span>Video Call</span>
               </button>
             </div>
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
