import { matrixManager } from './matrixClient';
import * as sdk from 'matrix-js-sdk';


class CallService {
  constructor() {
    this.currentCall = null;
    this.listeners = new Set();
    this.incomingClient = null;
    this.incomingHandler = null;
  }

  // Initialize Matrix event listener for incoming calls
  initCallListeners(onIncomingCall) {
    const client = matrixManager.getClient();
    if (!client) {
        console.error("Matrix client not initialized");
        return;
    }

    // Avoid duplicate listeners across remounts/re-logins.
    if (this.incomingClient && this.incomingHandler) {
      this.incomingClient.removeListener("Call.incoming", this.incomingHandler);
    }

    this.incomingClient = client;
    this.incomingHandler = (call) => {
      console.log("Incoming call:", call);
      // We only handle one call at a time for now
      if (this.currentCall) {
        call.reject();
        return;
      }
      this.currentCall = call;
      this._bindCallEvents(call);
      onIncomingCall(call);
    };

    client.on("Call.incoming", this.incomingHandler);
  }

  async placeCall(targetId, video = true) {
    const client = matrixManager.getClient();
    if (!client) throw new Error("Matrix client not initialized.");
    
    let roomId = targetId;

    // If targetId is a User ID (starts with @), we need to ensure a room exists
    if (targetId.startsWith('@')) {
        console.log("Target is a User ID, finding/creating DM room...");
        // Look for existing 1:1-ish room that includes the target.
        const rooms = client.getRooms();
        const existingRoom = rooms.find(r => {
            if (r.getMyMembership && r.getMyMembership() !== 'join') return false;
            const joinedCount = r.getJoinedMembers().length;
            if (joinedCount > 2) return false;
            return Boolean(r.getMember(targetId));
        });

        if (existingRoom) {
            roomId = existingRoom.roomId;
            const targetMembership = existingRoom.getMember(targetId)?.membership;
            if (targetMembership !== 'join') {
              throw new Error("Invite sent. Ask the user to accept the room invite before calling.");
            }
        } else {
            // Create new DM room
            const createRes = await client.createRoom({
                invite: [targetId],
                is_direct: true,
                preset: 'trusted_private_chat',
                visibility: 'private',
            });
            roomId = createRes.room_id;
            console.log("Created new DM room:", roomId);
            // The invited user must join the room before they can receive room-based call signaling.
            throw new Error("Invite sent. Ask the user to accept the room invite before calling.");
        }
    }

    // matrix-js-sdk createCall logic
    const call = sdk.createNewMatrixCall(client, roomId);
    if (!call) throw new Error("Failed to create call.");

    
    this.currentCall = call;
    this._bindCallEvents(call);

    try {
      if (video) {
        await call.placeVideoCall();
      } else {
        await call.placeVoiceCall();
      }
    } catch (e) {
      console.error("Call failed:", e);
      this.currentCall = null;
      throw e;
    }


    return call;
  }

  _bindCallEvents(call) {
    call.on("hangup", () => {
      if (this.currentCall === call) this.currentCall = null;
      this._notifyListeners({ type: "hangup", call });
    });
    call.on("error", (err) => {
      if (this.currentCall === call) this.currentCall = null;
      this._notifyListeners({ type: "error", call, error: err });
    });
    call.on("state", (state) => {
      if (state === 'ended') {
          if (this.currentCall === call) this.currentCall = null;
      }
      this._notifyListeners({ type: "state", call, state });
    });

  }

  disposeCallListeners() {
    if (this.incomingClient && this.incomingHandler) {
      this.incomingClient.removeListener("Call.incoming", this.incomingHandler);
    }
    this.incomingClient = null;
    this.incomingHandler = null;
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
