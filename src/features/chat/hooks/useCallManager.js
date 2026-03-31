import { useState, useEffect, useRef } from 'react';
import { callService } from '../utils/callService';

export function useCallManager() {
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

  const clearActiveCallListeners = () => {
    const listeners = activeCallListenersRef.current;
    if (!listeners) return;

    listeners.call.removeListener("feeds_changed", listeners.onFeedsChanged);
    listeners.call.removeListener("state", listeners.onStateChanged);
    activeCallListenersRef.current = null;
  };

  const hangupActiveCallForExit = () => {
    const call = activeCallRef.current;
    if (!call) return;

    try {
      if (!call.callHasEnded()) {
        call.hangup("user_hangup", true);
      }
    } catch (e) {
      console.warn("Failed to hang up active call during page exit:", e);
    }
  };

  const syncStreamsFromCall = (call) => {
    if (!call) return;

    const localPrimaryStream =
      (call.isScreensharing && call.isScreensharing() && call.localScreensharingStream) ||
      call.localUsermediaStream ||
      call.localScreensharingStream ||
      null;

    const remotePrimaryStream =
      call.remoteScreensharingStream ||
      call.remoteUsermediaStream ||
      null;

    setLocalStream(localPrimaryStream);
    setRemoteStream(remotePrimaryStream);
    setIsMuted(call.isMicrophoneMuted());
    setIsVideoOff(call.isLocalVideoMuted());
    setIsScreenSharing(Boolean(call.isScreensharing && call.isScreensharing()));
  };

  const bindActiveCallListeners = (call) => {
    clearActiveCallListeners();
    if (!call) return;

    const onFeedsChanged = () => {
      syncStreamsFromCall(call);
    };

    const onStateChanged = (state) => {
      if (state === 'connected' || state === 'connecting') {
        syncStreamsFromCall(call);
      }
    };

    call.on("feeds_changed", onFeedsChanged);
    call.on("state", onStateChanged);
    activeCallListenersRef.current = { call, onFeedsChanged, onStateChanged };
  };

  useEffect(() => {
    activeCallRef.current = activeCall;
  }, [activeCall]);

  useEffect(() => {
    const handlePageExit = () => {
      hangupActiveCallForExit();
    };

    window.addEventListener('pagehide', handlePageExit);
    window.addEventListener('beforeunload', handlePageExit);

    return () => {
      window.removeEventListener('pagehide', handlePageExit);
      window.removeEventListener('beforeunload', handlePageExit);
    };
  }, []);

  useEffect(() => {
    // Listen for incoming calls
    const handleIncoming = (call) => {
      setIncomingCall(call);
      setCallState('ringing');
    };

    // Watch for Matrix readiness to attach listeners
    const checkReady = setInterval(() => {
      import('../utils/matrixClient').then(({ matrixManager }) => {
        if (matrixManager.isReady) {
          callService.initCallListeners(handleIncoming);
          clearInterval(checkReady);
        }
      });
    }, 1000);


    const unsubscribe = callService.subscribe((event) => {
      if (event.type === 'state') {
         setCallState(event.state);
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
      }
    });

    return () => {
      hangupActiveCallForExit();
      callService.disposeCallListeners();
      clearActiveCallListeners();
      unsubscribe();
      clearInterval(checkReady);
    };
  }, []);

  const placeCall = async (roomId, isVideo = true) => {
    try {
      const call = await callService.placeCall(roomId, isVideo);
      setActiveCall(call);
      setCallState('calling');
      bindActiveCallListeners(call);
      syncStreamsFromCall(call);
      return { ok: true, call };
    } catch (e) {
      console.error(e);
      setCallState('idle');
      return { ok: false, error: e };
    }
  };

  const answerCall = async () => {
    if (incomingCall) {
      try {
        // Explicitly answer with video only when the incoming invite includes video.
        await incomingCall.answer(true, incomingCall.hasRemoteUserMediaVideoTrack);
        setActiveCall(incomingCall);
        setIncomingCall(null);
        setCallState('connected');
        bindActiveCallListeners(incomingCall);
        syncStreamsFromCall(incomingCall);
      } catch (e) {
         console.error(e);
      }
    }
  };

  const rejectCall = () => {
    if (incomingCall) {
      incomingCall.reject();
      setIncomingCall(null);
      setCallState('idle');
    }
  };

  const endCall = () => {
    if (activeCall) {
      activeCall.hangup("user_hangup", false);
    }
    clearActiveCallListeners();
    // Force UI reset manually to be safe
    setCallState('idle');
    setActiveCall(null);
    setIncomingCall(null);
    setLocalStream(null);
    setRemoteStream(null);
    setIsMuted(false);
    setIsVideoOff(false);
    setIsScreenSharing(false);
  };


  const toggleMute = async () => {
    if (!activeCall) return;

    try {
      const muted = await activeCall.setMicrophoneMuted(!activeCall.isMicrophoneMuted());
      setIsMuted(muted);
      syncStreamsFromCall(activeCall);
    } catch (e) {
      console.error("Failed to toggle microphone:", e);
    }
  };

  const toggleVideo = async () => {
    if (!activeCall) return;

    try {
      // setLocalVideoMuted(false) performs the SDK upgrade/renegotiation path.
      const muted = await activeCall.setLocalVideoMuted(!activeCall.isLocalVideoMuted());
      setIsVideoOff(muted);
      syncStreamsFromCall(activeCall);
    } catch (e) {
      console.error("Failed to toggle video:", e);
    }
  };

  const toggleScreenShare = async () => {
    if (!activeCall) return;

    try {
      const enabled = await activeCall.setScreensharingEnabled(!activeCall.isScreensharing());
      setIsScreenSharing(enabled);
      syncStreamsFromCall(activeCall);
    } catch (e) {
      console.error("Failed to toggle screen sharing:", e);
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
    toggleScreenShare
  };
}
