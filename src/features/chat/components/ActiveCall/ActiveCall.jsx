import React, { useEffect, useRef, useState } from 'react';
import { Button, Tooltip, Typography } from 'antd';
import { 
  AudioOutlined, 
  AudioMutedOutlined, 
  VideoCameraOutlined,
  StopOutlined,
  DesktopOutlined,
  PhoneOutlined
} from '@ant-design/icons';
import styles from './ActiveCall.module.scss';

const { Text } = Typography;

export default function ActiveCall({
  localStream,
  remoteStream,
  isMuted,
  isVideoOff,
  isScreenSharing,
  callState,
  toggleMute,
  toggleVideo,
  toggleScreenShare,
  endCall,
}) {
  const localVideoRef = useRef(null);
  const remoteVideoRef = useRef(null);
  const [hasRemoteVideo, setHasRemoteVideo] = useState(false);
  const [hasLocalVideo, setHasLocalVideo] = useState(false);

  const hasActiveVideo = (stream) =>
    Boolean(
      stream?.getVideoTracks().some(
        (track) => track.readyState === 'live' && !track.muted,
      ),
    );

  const trackVideoState = (stream, setState) => {
    if (!stream) {
      setState(false);
      return () => {};
    }
    const cleanupFns = [];
    const refresh = () => setState(hasActiveVideo(stream));

    const attachTrackListeners = (track) => {
      if (track.kind !== 'video') return;
      const onTrackStateChanged = () => refresh();
      track.addEventListener('mute', onTrackStateChanged);
      track.addEventListener('unmute', onTrackStateChanged);
      track.addEventListener('ended', onTrackStateChanged);
      cleanupFns.push(() => {
        track.removeEventListener('mute', onTrackStateChanged);
        track.removeEventListener('unmute', onTrackStateChanged);
        track.removeEventListener('ended', onTrackStateChanged);
      });
    };

    stream.getVideoTracks().forEach(attachTrackListeners);
    const onTrackAdded = (event) => {
      attachTrackListeners(event.track);
      refresh();
    };
    const onTrackRemoved = () => refresh();
    
    stream.addEventListener('addtrack', onTrackAdded);
    stream.addEventListener('removetrack', onTrackRemoved);
    cleanupFns.push(() => {
      stream.removeEventListener('addtrack', onTrackAdded);
      stream.removeEventListener('removetrack', onTrackRemoved);
    });

    refresh();
    return () => cleanupFns.forEach((fn) => fn());
  };

  useEffect(() => trackVideoState(localStream, setHasLocalVideo), [localStream]);
  useEffect(() => trackVideoState(remoteStream, setHasRemoteVideo), [remoteStream]);
  const showRemoteCameraStatus = !hasRemoteVideo && !isVideoOff;
  const isAudioMode = isVideoOff && !hasLocalVideo && !hasRemoteVideo && !isScreenSharing;

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
    <div className={styles.callContainer}>
      
      {/* Remote Video (Full Screen) */}
      <div className={styles.remoteVideoWrapper}>
        <video
          ref={remoteVideoRef}
          className={styles.remoteVideo}
          autoPlay
          playsInline
          style={{ opacity: isAudioMode ? 0 : 1 }}
        />
        
        {isAudioMode && (
          <div className={styles.audioModeOverlay}>
            <div className={styles.audioModeBox}>
              <div className={`${styles.audioIcon} ${isMuted ? styles.muted : ''}`}>
                {isMuted ? <AudioMutedOutlined /> : <AudioOutlined />}
              </div>
              <Text className={styles.audioTitle}>Secure Audio Call</Text>
              <br />
              <Text style={{ color: '#8696a0' }}>{callState === 'calling' ? 'Connecting...' : 'Voice channel active'}</Text>
            </div>
          </div>
        )}
        
        {showRemoteCameraStatus && (
          <div className={styles.statusOverlay}>
            {callState === 'calling' ? 'Calling...' : 'Remote camera is off'}
          </div>
        )}
      </div>

      {/* Local Video (Picture-in-Picture) */}
      <div className={styles.localVideoWrapper} style={{ display: hasLocalVideo ? 'block' : 'flex' }}>
        <video
          ref={localVideoRef}
          className={styles.localVideo}
          autoPlay
          playsInline
          muted
          style={{ display: hasLocalVideo ? 'block' : 'none' }}
        />
        {!hasLocalVideo && isVideoOff && (
          <span style={{ color: '#8696a0' }}>Camera Off</span>
        )}
      </div>

      {/* Call Controls Overlay */}
      <div className={styles.controlsOverlay}>
        <Tooltip title={isMuted ? "Unmute" : "Mute"}>
          <Button 
            shape="circle" 
            size="large" 
            icon={isMuted ? <AudioMutedOutlined /> : <AudioOutlined />} 
            onClick={toggleMute}
            style={{ width: 56, height: 56, fontSize: 24, background: isMuted ? '#fff' : 'rgba(255,255,255,0.1)', color: isMuted ? '#111b21' : '#fff', border: 'none' }}
          />
        </Tooltip>

        <Tooltip title={isVideoOff ? "Turn on camera" : "Turn off camera"}>
          <Button 
            shape="circle" 
            size="large" 
            icon={isVideoOff ? <StopOutlined /> : <VideoCameraOutlined />} 
            onClick={toggleVideo}
            style={{ width: 56, height: 56, fontSize: 24, background: isVideoOff ? '#fff' : 'rgba(255,255,255,0.1)', color: isVideoOff ? '#111b21' : '#fff', border: 'none' }}
          />
        </Tooltip>

        <Tooltip title={isScreenSharing ? "Stop screen share" : "Share screen"}>
          <Button 
            shape="circle" 
            size="large" 
            icon={<DesktopOutlined />} 
            onClick={toggleScreenShare}
            style={{ width: 56, height: 56, fontSize: 24, background: isScreenSharing ? '#00a884' : 'rgba(255,255,255,0.1)', color: '#fff', border: 'none' }}
          />
        </Tooltip>

        <Tooltip title="End Call">
          <Button 
            shape="circle" 
            size="large" 
            danger
            icon={<PhoneOutlined style={{ transform: 'rotate(135deg)' }} />} 
            onClick={endCall}
            style={{ width: 56, height: 56, fontSize: 24, background: '#f5222d', color: '#fff', border: 'none' }}
          />
        </Tooltip>
      </div>
    </div>
  );
}
