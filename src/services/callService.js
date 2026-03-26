import { matrixManager } from './matrixClient';
import * as sdk from 'matrix-js-sdk';


class CallService {
  constructor() {
    this.currentCall = null;
    this.listeners = new Set();
  }

  // Initialize Matrix event listener for incoming calls
  initCallListeners(onIncomingCall) {
    const client = matrixManager.getClient();
    if (!client) {
        console.error("Matrix client not initialized");
        return;
    }

    client.on("Call.incoming", (call) => {
      console.log("Incoming call:", call);
      // We only handle one call at a time for now
      if (this.currentCall) {
        call.reject();
        return;
      }
      this.currentCall = call;
      this._bindCallEvents(call);
      onIncomingCall(call);
    });
  }

  async placeCall(roomId, video = true) {
    const client = matrixManager.getClient();
    if (!client) throw new Error("Matrix client not initialized.");
    
    // matrix-js-sdk createCall logic
    const call = sdk.createNewMatrixCall(client, roomId);
    if (!call) throw new Error("Failed to create call.");
    
    this.currentCall = call;
    this._bindCallEvents(call);

    try {
      await call.placeVideoCall(
        // You can fetch remote video element reference inside the UI hook or pass here
      );
      // Actually placeVideoCall does not take args in newer sdk directly, it uses setLocalVideoElement / setRemoteVideoElement
      // We will handle attachments in the hook.
    } catch (e) {
      console.error("Call failed:", e);
      this.currentCall = null;
      throw e;
    }

    return call;
  }

  _bindCallEvents(call) {
    call.on("state", (state) => {
      this._notifyListeners({ type: "state", call, state });
    });
    call.on("hangup", () => {
      this.currentCall = null;
      this._notifyListeners({ type: "hangup", call });
    });
    call.on("error", (err) => {
      this.currentCall = null;
      this._notifyListeners({ type: "error", call, error: err });
    });
  }

  subscribe(listener) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  _notifyListeners(event) {
    this.listeners.forEach(l => l(event));
  }
}

export const callService = new CallService();
