import React, { useEffect, useRef } from 'react';
import { Mic, MicOff, Video, VideoOff, PhoneOff } from 'lucide-react';

export default function CallUI({
  localStream,
  remoteStream,
  isMuted,
  isVideoOff,
  callState,
  toggleMute,
  toggleVideo,
  endCall,
}) {
  const localVideoRef = useRef(null);
  const remoteVideoRef = useRef(null);

  useEffect(() => {
    if (localVideoRef.current && localStream) {
      localVideoRef.current.srcObject = localStream;
    }
  }, [localStream]);

  useEffect(() => {
    if (remoteVideoRef.current && remoteStream) {
      remoteVideoRef.current.srcObject = remoteStream;
    }
  }, [remoteStream]);

  return (
    <div className="call-ui-container">
      {/* Remote Video (Full Screen) */}
      <div className="remote-video-wrapper">
        <video
          ref={remoteVideoRef}
          className="remote-video"
          autoPlay
          playsInline
        />
        {(!remoteStream && callState === 'calling') && (
            <div className="call-status-overlay">Calling...</div>
        )}
      </div>

      {/* Local Video (Picture-in-Picture) */}
      <div className="local-video-wrapper">
        <video
          ref={localVideoRef}
          className="local-video"
          autoPlay
          playsInline
          muted
        />
      </div>

      {/* Call Controls Overlay */}
      <div className="controls-overlay">
        <button 
          onClick={toggleMute} 
          className={`control-btn ${isMuted ? 'muted' : ''}`}
        >
          {isMuted ? <MicOff size={24} /> : <Mic size={24} />}
        </button>

        <button 
          onClick={toggleVideo} 
          className={`control-btn ${isVideoOff ? 'muted' : ''}`}
        >
          {isVideoOff ? <VideoOff size={24} /> : <Video size={24} />}
        </button>

        <button className="control-btn hangup-btn" onClick={endCall}>
          <PhoneOff size={24} />
        </button>
      </div>
    </div>
  );
}
