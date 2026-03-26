import { useState, useEffect, useRef } from 'react';
import { callService } from '../services/callService';

export function useCall() {
  const [incomingCall, setIncomingCall] = useState(null);
  const [activeCall, setActiveCall] = useState(null);
  const [callState, setCallState] = useState('idle');
  const [localStream, setLocalStream] = useState(null);
  const [remoteStream, setRemoteStream] = useState(null);
  const [isMuted, setIsMuted] = useState(false);
  const [isVideoOff, setIsVideoOff] = useState(false);

  useEffect(() => {
    // Listen for incoming calls
    const handleIncoming = (call) => {
      setIncomingCall(call);
      setCallState('ringing');
    };

    // Watch for Matrix readiness to attach listeners
    const checkReady = setInterval(() => {
      import('../services/matrixClient').then(({ matrixManager }) => {
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
         setCallState('idle');
         setActiveCall(null);
         setIncomingCall(null);
         setLocalStream(null);
         setRemoteStream(null);
      }
    });

    return () => {
      unsubscribe();
      clearInterval(checkReady);
    };
  }, []);

  const placeCall = async (roomId, isVideo = true) => {
    try {
      const call = await callService.placeCall(roomId, isVideo);
      setActiveCall(call);
      setCallState('calling');
      // Setup streams
      if (call.localUsermediaStream) setLocalStream(call.localUsermediaStream);
      if (call.remoteUsermediaStream) setRemoteStream(call.remoteUsermediaStream);
    } catch (e) {
      console.error(e);
      setCallState('idle');
    }
  };

  const answerCall = async () => {
    if (incomingCall) {
      try {
        await incomingCall.answer();
        setActiveCall(incomingCall);
        setIncomingCall(null);
        setCallState('connected');
        if (incomingCall.localUsermediaStream) setLocalStream(incomingCall.localUsermediaStream);
        if (incomingCall.remoteUsermediaStream) setRemoteStream(incomingCall.remoteUsermediaStream);
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
    // Force UI reset manually to be safe
    setCallState('idle');
    setActiveCall(null);
    setIncomingCall(null);
    setLocalStream(null);
    setRemoteStream(null);
  };


  const toggleMute = () => {
    if (activeCall && localStream) {
      const audioTracks = localStream.getAudioTracks();
      if (audioTracks.length > 0) {
        audioTracks[0].enabled = !audioTracks[0].enabled;
        setIsMuted(!audioTracks[0].enabled);
      }
    }
  };

  const toggleVideo = async () => {
    if (!activeCall) return;

    const videoTracks = localStream ? localStream.getVideoTracks() : [];
    
    if (videoTracks.length > 0) {
      // Toggle existing track
      const newState = !videoTracks[0].enabled;
      videoTracks[0].enabled = newState;
      setIsVideoOff(!newState);
    } else {
      // No video track - try to add one (Upgrade from Audio to Video)
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ video: true });
        const newTrack = stream.getVideoTracks()[0];
        
        if (localStream) {
          localStream.addTrack(newTrack);
          setLocalStream(new MediaStream(localStream.getTracks()));
        }
        
        setIsVideoOff(false);

        // Note: Full Matrix call upgrade (re-negotiation) might be needed for some servers
        // but adding the track to the stream often works for 1:1.
      } catch (e) {
        console.error("Failed to get video track:", e);
      }
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
    placeCall,
    answerCall,
    rejectCall,
    endCall,
    toggleMute,
    toggleVideo
  };
}
