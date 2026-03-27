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
        let directRoomIds = [];
        const mDirect = client.getAccountData?.("m.direct");
        if (mDirect?.getContent) {
          const content = mDirect.getContent() || {};
          directRoomIds = Array.isArray(content[targetId]) ? content[targetId] : [];
        }

        const rooms = client.getRooms();
        const candidateRooms = rooms
          .filter((room) => {
            if (room.getMyMembership && room.getMyMembership() !== 'join') return false;

            const targetMember = room.getMember(targetId);
            if (targetMember) return true;

            // Room state can be partial; if this room is in m.direct mapping for target,
            // still consider it a valid call room candidate.
            if (directRoomIds.includes(room.roomId)) return true;

            return false;
          })
          .map((room) => {
            const targetMember = room.getMember(targetId);
            const membership = targetMember?.membership || (directRoomIds.includes(room.roomId) ? 'unknown' : 'leave');
            return { room, membership };
          });

        const sortByRecency = (a, b) => {
          const aTs = a.room.getLastActiveTimestamp ? a.room.getLastActiveTimestamp() : 0;
          const bTs = b.room.getLastActiveTimestamp ? b.room.getLastActiveTimestamp() : 0;
          return bTs - aTs;
        };

        const joinedCandidates = candidateRooms.filter((c) => c.membership === 'join');
        const inviteCandidates = candidateRooms.filter((c) => c.membership === 'invite');
        const unknownCandidates = candidateRooms.filter((c) => c.membership === 'unknown');
        const otherCandidates = candidateRooms.filter((c) => c.membership !== 'join' && c.membership !== 'invite' && c.membership !== 'unknown');

        const directJoined = joinedCandidates
          .filter((c) => directRoomIds.includes(c.room.roomId))
          .sort(sortByRecency);
        const fallbackJoined = joinedCandidates
          .filter((c) => !directRoomIds.includes(c.room.roomId))
          .sort(sortByRecency);
        const directInvites = inviteCandidates
          .filter((c) => directRoomIds.includes(c.room.roomId))
          .sort(sortByRecency);
        const fallbackInvites = inviteCandidates
          .filter((c) => !directRoomIds.includes(c.room.roomId))
          .sort(sortByRecency);
        const directUnknown = unknownCandidates
          .filter((c) => directRoomIds.includes(c.room.roomId))
          .sort(sortByRecency);
        const fallbackUnknown = unknownCandidates
          .filter((c) => !directRoomIds.includes(c.room.roomId))
          .sort(sortByRecency);
        const fallbackOthers = otherCandidates
          .sort(sortByRecency);
        const selected =
          directJoined[0] ||
          fallbackJoined[0] ||
          directUnknown[0] ||
          fallbackUnknown[0] ||
          directInvites[0] ||
          fallbackInvites[0] ||
          fallbackOthers[0] ||
          null;
        const existingRoom = selected?.room || null;
        const targetMembership = selected?.membership;

        if (existingRoom) {
            roomId = existingRoom.roomId;
            if (targetMembership !== 'join' && targetMembership !== 'unknown') {
              // Ensure a fresh invite exists when room was stale (e.g. user left previously).
              if (targetMembership !== 'invite') {
                try {
                  await client.invite(roomId, targetId);
                } catch (inviteErr) {
                  console.warn("Failed to send fresh invite in existing room:", inviteErr);
                }
              }
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
