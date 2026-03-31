import { useState, useEffect, useRef } from 'react';
import { useDispatch } from 'react-redux';
import { callService } from '../utils/callService';
import { matrixManager } from '../utils/matrixClient';
import { setCallMode } from '../../../store/uiSlice';

/**
 * useCallManager – manages the full audio/video call lifecycle.
 *
 * Integrates with uiSlice so that the call display mode (pip / fullscreen /
 * hidden) is driven from global Redux state, allowing ChatLayout to keep the
 * chat panel visible alongside an ongoing call.
 */
export function useCallManager() {
  const dispatch = useDispatch();

  const [incomingCall, setIncomingCall] = useState(null);
  const [activeCall, setActiveCall] = useState(null);
  const [callState, setCallState] = useState('idle');
  const [localStream, setLocalStream] = useState(null);
  const [remoteStream, setRemoteStream] = useState(null);
  const [isMuted, setIsMuted] = useState(false);
  const [isVideoOff, setIsVideoOff] = useState(false);
  const [isScreenSharing, setIsScreenSharing] = useState(false);

  const activeCallListenersRef = useRef(null);
  const activeCallRef = useRef(null);

  // ── Helpers ─────────────────────────────────────────────────────────────────

  const clearActiveCallListeners = () => {
    const listeners = activeCallListenersRef.current;
    if (!listeners) return;
    listeners.call.removeListener('feeds_changed', listeners.onFeedsChanged);
    listeners.call.removeListener('state', listeners.onStateChanged);
    activeCallListenersRef.current = null;
  };

  const hangupActiveCallForExit = () => {
    const call = activeCallRef.current;
    if (!call) return;
    try {
      if (!call.callHasEnded()) call.hangup('user_hangup', true);
    } catch (e) {
      console.warn('[useCallManager] Exit hangup failed:', e);
    }
  };

  const syncStreamsFromCall = (call) => {
    if (!call) return;

    const localPrimary =
      (call.isScreensharing?.() && call.localScreensharingStream) ||
      call.localUsermediaStream ||
      call.localScreensharingStream ||
      null;

    const remotePrimary =
      call.remoteScreensharingStream ||
      call.remoteUsermediaStream ||
      null;

    setLocalStream(localPrimary);
    setRemoteStream(remotePrimary);
    setIsMuted(call.isMicrophoneMuted());
    setIsVideoOff(call.isLocalVideoMuted());
    setIsScreenSharing(Boolean(call.isScreensharing?.()));
  };

  const bindActiveCallListeners = (call) => {
    clearActiveCallListeners();
    if (!call) return;

    const onFeedsChanged = () => syncStreamsFromCall(call);
    const onStateChanged = (state) => {
      if (state === 'connected' || state === 'connecting') {
        syncStreamsFromCall(call);
      }
    };

    call.on('feeds_changed', onFeedsChanged);
    call.on('state', onStateChanged);
    activeCallListenersRef.current = { call, onFeedsChanged, onStateChanged };
  };

  // Keep ref in sync for page-exit handler
  useEffect(() => {
    activeCallRef.current = activeCall;
  }, [activeCall]);

  // Hang up on page unload
  useEffect(() => {
    const handler = () => hangupActiveCallForExit();
    window.addEventListener('pagehide', handler);
    window.addEventListener('beforeunload', handler);
    return () => {
      window.removeEventListener('pagehide', handler);
      window.removeEventListener('beforeunload', handler);
    };
  }, []);

  // ── Incoming call listener + call service subscription ────────────────────
  useEffect(() => {
    const handleIncoming = (call) => {
      setIncomingCall(call);
      setCallState('ringing');
      // Show PiP so the user can see the incoming call alongside the chat
      dispatch(setCallMode('pip'));
    };

    // Poll until the Matrix client is ready before attaching the listener
    const checkReady = setInterval(() => {
      if (matrixManager.isReady) {
        callService.initCallListeners(handleIncoming);
        clearInterval(checkReady);
      }
    }, 1000);

    const unsubscribe = callService.subscribe((event) => {
      if (event.type === 'state') {
        setCallState(event.state);
        if (event.state === 'connected') {
          dispatch(setCallMode('pip'));
        }
      }
      if (event.type === 'hangup' || event.type === 'error') {
        clearActiveCallListeners();
        setCallState('idle');
        setActiveCall(null);
        setIncomingCall(null);
        setLocalStream(null);
        setRemoteStream(null);
        setIsMuted(false);
        setIsVideoOff(false);
        setIsScreenSharing(false);
        dispatch(setCallMode('hidden'));
      }
    });

    return () => {
      hangupActiveCallForExit();
      callService.disposeCallListeners();
      clearActiveCallListeners();
      unsubscribe();
      clearInterval(checkReady);
    };
  }, [dispatch]);

  // ── Public actions ─────────────────────────────────────────────────────────

  const placeCall = async (roomId, isVideo = true) => {
    try {
      const call = await callService.placeCall(roomId, isVideo);
      setActiveCall(call);
      setCallState('calling');
      dispatch(setCallMode('pip'));
      bindActiveCallListeners(call);
      syncStreamsFromCall(call);
      return { ok: true, call };
    } catch (e) {
      console.error('[useCallManager] placeCall error:', e);
      setCallState('idle');
      dispatch(setCallMode('hidden'));
      return { ok: false, error: e };
    }
  };

  const answerCall = async () => {
    if (!incomingCall) return;
    const call = incomingCall;

    // Reset all call state so the UI is never left stuck on the overlay.
    const _cleanupFailedAnswer = (reason) => {
      console.error('[useCallManager] answerCall failed:', reason);
      try {
        if (!call.callHasEnded?.()) call.hangup('user_media_failed', true);
      } catch (_) {}
      clearActiveCallListeners();
      setIncomingCall(null);
      setActiveCall(null);
      setCallState('idle');
      setLocalStream(null);
      setRemoteStream(null);
      setIsMuted(false);
      setIsVideoOff(false);
      setIsScreenSharing(false);
      dispatch(setCallMode('hidden'));
    };

    try {
      // ── Pre-flight media probe ────────────────────────────────────────────
      // The Matrix SDK's shouldAnswerWithMediaType() loop cannot be broken by
      // a Promise.race timeout because it runs in synchronous microtasks.
      // Instead we probe getUserMedia BEFORE calling answer() so we know what
      // the browser can actually provide, then patch the call object to match.
      let probeStream = null;
      let canVideo    = false;

      try {
        probeStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
        canVideo    = true;
      } catch {
        // Video unavailable — try audio-only
        try {
          probeStream = await navigator.mediaDevices.getUserMedia({ audio: true });
        } catch {
          throw new Error('No microphone/camera available to answer this call.');
        }
      }

      // Release the probe tracks immediately — the SDK re-acquires them in answer()
      probeStream.getTracks().forEach((t) => t.stop());

      if (!canVideo) {
        // hasRemoteUserMediaVideoTrack is a getter-only property on MatrixCall,
        // so direct assignment throws. Override it on this instance so that
        // shouldAnswerWithMediaType() stops forcing video=true in its retry loop
        // and allows the call to be answered audio-only.
        Object.defineProperty(call, 'hasRemoteUserMediaVideoTrack', {
          get: () => false,
          configurable: true,
        });
      }
      // ─────────────────────────────────────────────────────────────────────

      await call.answer();

      setActiveCall(call);
      setIncomingCall(null);
      setCallState('connected');
      dispatch(setCallMode('pip'));
      bindActiveCallListeners(call);
      syncStreamsFromCall(call);
    } catch (e) {
      _cleanupFailedAnswer(e);
    }
  };

  const rejectCall = () => {
    if (!incomingCall) return;
    incomingCall.reject();
    setIncomingCall(null);
    setCallState('idle');
    dispatch(setCallMode('hidden'));
  };

  const endCall = () => {
    if (activeCall) activeCall.hangup('user_hangup', false);
    clearActiveCallListeners();
    setCallState('idle');
    setActiveCall(null);
    setIncomingCall(null);
    setLocalStream(null);
    setRemoteStream(null);
    setIsMuted(false);
    setIsVideoOff(false);
    setIsScreenSharing(false);
    dispatch(setCallMode('hidden'));
  };

  const toggleMute = async () => {
    if (!activeCall) return;
    try {
      const muted = await activeCall.setMicrophoneMuted(!activeCall.isMicrophoneMuted());
      setIsMuted(muted);
      syncStreamsFromCall(activeCall);
    } catch (e) {
      console.error('[useCallManager] toggleMute error:', e);
    }
  };

  const toggleVideo = async () => {
    if (!activeCall) return;
    try {
      const muted = await activeCall.setLocalVideoMuted(!activeCall.isLocalVideoMuted());
      setIsVideoOff(muted);
      syncStreamsFromCall(activeCall);
    } catch (e) {
      console.error('[useCallManager] toggleVideo error:', e);
    }
  };

  const toggleScreenShare = async () => {
    if (!activeCall) return;
    try {
      const enabled = await activeCall.setScreensharingEnabled(!activeCall.isScreensharing());
      setIsScreenSharing(enabled);
      syncStreamsFromCall(activeCall);
    } catch (e) {
      console.error('[useCallManager] toggleScreenShare error:', e);
    }
  };

  return {
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
    toggleScreenShare,
  };
}
