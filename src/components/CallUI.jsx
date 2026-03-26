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
  const hasRemoteVideo = Boolean(remoteStream?.getVideoTracks().some((track) => track.readyState === 'live'));
  const hasLocalVideo = Boolean(localStream?.getVideoTracks().some((track) => track.readyState === 'live'));

  useEffect(() => {
    if (!localVideoRef.current) return;

    localVideoRef.current.srcObject = localStream || null;
    if (localStream) {
      localVideoRef.current.play().catch(() => {});
      const onTrackAdded = () => localVideoRef.current?.play().catch(() => {});
      localStream.addEventListener('addtrack', onTrackAdded);
      return () => localStream.removeEventListener('addtrack', onTrackAdded);
    }
  }, [localStream]);

  useEffect(() => {
    if (!remoteVideoRef.current) return;

    remoteVideoRef.current.srcObject = remoteStream || null;
    if (remoteStream) {
      remoteVideoRef.current.play().catch(() => {});
      const onTrackAdded = () => remoteVideoRef.current?.play().catch(() => {});
      remoteStream.addEventListener('addtrack', onTrackAdded);
      return () => remoteStream.removeEventListener('addtrack', onTrackAdded);
    }
  }, [remoteStream]);

  return (
    <div className="call-ui-container">
      {/* Remote Video (Full Screen) */}
      <div className={`remote-video-wrapper ${hasRemoteVideo ? 'has-video' : 'no-video'}`}>
        <video
          ref={remoteVideoRef}
          className="remote-video"
          autoPlay
          playsInline
        />
        {!hasRemoteVideo && (
          <div className="call-status-overlay">
            {callState === 'calling' ? 'Calling...' : 'Remote camera is off'}
          </div>
        )}
      </div>

      {/* Local Video (Picture-in-Picture) */}
      <div className={`local-video-wrapper ${hasLocalVideo ? 'has-video' : 'no-video'}`}>
        <video
          ref={localVideoRef}
          className="local-video"
          autoPlay
          playsInline
          muted
        />
        {!hasLocalVideo && (
          <div className="local-video-placeholder">Camera Off</div>
        )}
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
