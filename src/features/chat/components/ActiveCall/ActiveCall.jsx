import React, { useEffect, useRef, useState } from 'react';
import { Button, Tooltip, Typography } from 'antd';
import {
  AudioOutlined,
  AudioMutedOutlined,
  VideoCameraOutlined,
  StopOutlined,
  DesktopOutlined,
  PhoneOutlined,
  ExpandOutlined,
  CompressOutlined,
} from '@ant-design/icons';
import { useDispatch } from 'react-redux';
import { setCallMode } from '../../../../store/uiSlice';
import styles from './ActiveCall.module.scss';

const { Text } = Typography;

/**
 * ActiveCall – renders the ongoing call UI.
 *
 * mode:
 *  'fullscreen' – fills the content area (existing behaviour)
 *  'pip'        – compact overlay in the bottom-right corner of the chat area
 *
 * @param {{
 *   localStream: MediaStream|null,
 *   remoteStream: MediaStream|null,
 *   isMuted: boolean,
 *   isVideoOff: boolean,
 *   isScreenSharing: boolean,
 *   callState: string,
 *   mode: 'fullscreen'|'pip',
 *   toggleMute: () => void,
 *   toggleVideo: () => void,
 *   toggleScreenShare: () => void,
 *   endCall: () => void,
 * }} props
 */
export default function ActiveCall({
  localStream,
  remoteStream,
  isMuted,
  isVideoOff,
  isScreenSharing,
  callState,
  mode = 'fullscreen',
  toggleMute,
  toggleVideo,
  toggleScreenShare,
  endCall,
}) {
  const dispatch = useDispatch();
  const localVideoRef = useRef(null);
  const remoteVideoRef = useRef(null);
  const [hasRemoteVideo, setHasRemoteVideo] = useState(false);
  const [hasLocalVideo, setHasLocalVideo] = useState(false);

  const isPip = mode === 'pip';

  // ── Helpers ───────────────────────────────────────────────────────────────

  const hasActiveVideo = (stream) =>
    Boolean(
      stream?.getVideoTracks().some(
        (track) => track.readyState === 'live' && !track.muted,
      ),
    );

  const trackVideoState = (stream, setState) => {
    if (!stream) { setState(false); return () => {}; }

    const cleanupFns = [];
    const refresh = () => setState(hasActiveVideo(stream));

    const attachTrackListeners = (track) => {
      if (track.kind !== 'video') return;
      const handler = () => refresh();
      track.addEventListener('mute', handler);
      track.addEventListener('unmute', handler);
      track.addEventListener('ended', handler);
      cleanupFns.push(() => {
        track.removeEventListener('mute', handler);
        track.removeEventListener('unmute', handler);
        track.removeEventListener('ended', handler);
      });
    };

    stream.getVideoTracks().forEach(attachTrackListeners);

    const onTrackAdded = (evt) => { attachTrackListeners(evt.track); refresh(); };
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

  useEffect(() => {
    if (!localVideoRef.current) return;
    localVideoRef.current.srcObject = localStream || null;
    if (localStream) {
      localVideoRef.current.play().catch(() => {});
      const handler = () => localVideoRef.current?.play().catch(() => {});
      localStream.addEventListener('addtrack', handler);
      return () => localStream.removeEventListener('addtrack', handler);
    }
  }, [localStream]);

  useEffect(() => {
    if (!remoteVideoRef.current) return;
    remoteVideoRef.current.srcObject = remoteStream || null;
    if (remoteStream) {
      remoteVideoRef.current.play().catch(() => {});
      const handler = () => remoteVideoRef.current?.play().catch(() => {});
      remoteStream.addEventListener('addtrack', handler);
      return () => remoteStream.removeEventListener('addtrack', handler);
    }
  }, [remoteStream]);

  const showRemoteCameraStatus = !hasRemoteVideo && !isVideoOff;
  const isAudioMode = isVideoOff && !hasLocalVideo && !hasRemoteVideo && !isScreenSharing;

  // ── PiP render ────────────────────────────────────────────────────────────

  if (isPip) {
    return (
      <div className={styles.pip}>
        {/* Remote video */}
        <video
          ref={remoteVideoRef}
          className={styles.pipRemoteVideo}
          autoPlay
          playsInline
        />

        {/* State overlay */}
        {(isAudioMode || showRemoteCameraStatus) && (
          <div className={styles.pipOverlay}>
            <AudioOutlined style={{ fontSize: 18, color: '#fff' }} />
            <Text className={styles.pipStateText}>
              {callState === 'calling' ? 'Calling…' : 'Voice call'}
            </Text>
          </div>
        )}

        {/* Controls */}
        <div className={styles.pipControls}>
          <Tooltip title={isMuted ? 'Unmute' : 'Mute'}>
            <Button
              shape="circle"
              size="small"
              icon={isMuted ? <AudioMutedOutlined /> : <AudioOutlined />}
              onClick={toggleMute}
              className={`${styles.pipBtn} ${isMuted ? styles.pipBtnActive : ''}`}
            />
          </Tooltip>

          <Tooltip title="End call">
            <Button
              shape="circle"
              size="small"
              danger
              icon={<PhoneOutlined style={{ transform: 'rotate(135deg)' }} />}
              onClick={endCall}
              className={styles.pipBtnEnd}
            />
          </Tooltip>

          <Tooltip title="Expand">
            <Button
              shape="circle"
              size="small"
              icon={<ExpandOutlined />}
              onClick={() => dispatch(setCallMode('fullscreen'))}
              className={styles.pipBtn}
            />
          </Tooltip>
        </div>

        {/* Local video thumbnail */}
        {hasLocalVideo && (
          <video
            ref={localVideoRef}
            className={styles.pipLocalVideo}
            autoPlay
            playsInline
            muted
          />
        )}
      </div>
    );
  }

  // ── Full-screen render ────────────────────────────────────────────────────

  return (
    <div className={styles.callContainer}>

      {/* Remote video (full screen) */}
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
              <Text style={{ color: '#8696a0' }}>
                {callState === 'calling' ? 'Connecting…' : 'Voice channel active'}
              </Text>
            </div>
          </div>
        )}

        {showRemoteCameraStatus && (
          <div className={styles.statusOverlay}>
            {callState === 'calling' ? 'Calling…' : 'Remote camera is off'}
          </div>
        )}
      </div>

      {/* Local video (picture-in-picture within fullscreen) */}
      <div
        className={styles.localVideoWrapper}
        style={{ display: hasLocalVideo ? 'block' : 'flex' }}
      >
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

      {/* Controls overlay */}
      <div className={styles.controlsOverlay}>
        {/* Compress back to PiP */}
        <Tooltip title="Minimise">
          <Button
            shape="circle"
            size="large"
            icon={<CompressOutlined />}
            onClick={() => dispatch(setCallMode('pip'))}
            style={{
              width: 56, height: 56, fontSize: 24,
              background: 'rgba(255,255,255,0.1)',
              color: '#fff', border: 'none',
            }}
          />
        </Tooltip>

        <Tooltip title={isMuted ? 'Unmute' : 'Mute'}>
          <Button
            shape="circle"
            size="large"
            icon={isMuted ? <AudioMutedOutlined /> : <AudioOutlined />}
            onClick={toggleMute}
            style={{
              width: 56, height: 56, fontSize: 24,
              background: isMuted ? '#fff' : 'rgba(255,255,255,0.1)',
              color: isMuted ? '#111b21' : '#fff', border: 'none',
            }}
          />
        </Tooltip>

        <Tooltip title={isVideoOff ? 'Turn on camera' : 'Turn off camera'}>
          <Button
            shape="circle"
            size="large"
            icon={isVideoOff ? <StopOutlined /> : <VideoCameraOutlined />}
            onClick={toggleVideo}
            style={{
              width: 56, height: 56, fontSize: 24,
              background: isVideoOff ? '#fff' : 'rgba(255,255,255,0.1)',
              color: isVideoOff ? '#111b21' : '#fff', border: 'none',
            }}
          />
        </Tooltip>

        <Tooltip title={isScreenSharing ? 'Stop screen share' : 'Share screen'}>
          <Button
            shape="circle"
            size="large"
            icon={<DesktopOutlined />}
            onClick={toggleScreenShare}
            style={{
              width: 56, height: 56, fontSize: 24,
              background: isScreenSharing ? '#00a884' : 'rgba(255,255,255,0.1)',
              color: '#fff', border: 'none',
            }}
          />
        </Tooltip>

        <Tooltip title="End Call">
          <Button
            shape="circle"
            size="large"
            danger
            icon={<PhoneOutlined style={{ transform: 'rotate(135deg)' }} />}
            onClick={endCall}
            style={{
              width: 56, height: 56, fontSize: 24,
              background: '#f5222d', color: '#fff', border: 'none',
            }}
          />
        </Tooltip>
      </div>
    </div>
  );
}
