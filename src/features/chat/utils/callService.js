import { matrixManager } from './matrixClient';
import { roomService } from './roomService';
import * as sdk from 'matrix-js-sdk';

/**
 * callService – Matrix audio/video call signaling layer.
 *
 * Handles placing calls, receiving incoming calls, and broadcasting call-state
 * changes to subscribers (used by useCallManager hook).
 */
class CallService {
  constructor() {
    this.currentCall = null;
    /** @type {Set<function>} */
    this.listeners = new Set();
    this._incomingClient = null;
    this._incomingHandler = null;
  }

  // ─── Incoming call listener ────────────────────────────────────────────────

  /**
   * Attach the Call.incoming listener to the Matrix client.
   * Safe to call multiple times — removes previous handler first.
   *
   * @param {function(call): void} onIncomingCall
   */
  initCallListeners(onIncomingCall) {
    const client = matrixManager.getClient();
    if (!client) {
      console.error('[callService] Matrix client not initialized');
      return;
    }

    // Remove stale listener from a previous mount / re-login
    if (this._incomingClient && this._incomingHandler) {
      this._incomingClient.removeListener('Call.incoming', this._incomingHandler);
    }

    this._incomingClient = client;
    this._incomingHandler = (call) => {
      if (this.currentCall) {
        call.reject();
        return;
      }
      this.currentCall = call;
      this._bindCallEvents(call);
      onIncomingCall(call);
    };

    client.on('Call.incoming', this._incomingHandler);
  }

  /** Remove the incoming-call listener (called on logout / component teardown). */
  disposeCallListeners() {
    if (this._incomingClient && this._incomingHandler) {
      this._incomingClient.removeListener('Call.incoming', this._incomingHandler);
    }
    this._incomingClient = null;
    this._incomingHandler = null;
  }

  // ─── Placing a call ────────────────────────────────────────────────────────

  /**
   * Place an audio or video call to a target.
   *
   * @param {string} targetId – Matrix user ID (@user:server) or room ID (!room:server)
   * @param {boolean} [video=true]
   * @returns {Promise<import('matrix-js-sdk').MatrixCall>}
   */
  async placeCall(targetId, video = true) {
    const client = matrixManager.getClient();
    if (!client) throw new Error('Matrix client not initialized.');

    let roomId = targetId;

    // If targeting a user rather than a room, resolve/create the DM room first.
    if (targetId.startsWith('@')) {
      roomId = await roomService.findOrCreateDMRoom(targetId);
    }

    const call = sdk.createNewMatrixCall(client, roomId);
    if (!call) throw new Error('Failed to create Matrix call object.');

    this.currentCall = call;
    this._bindCallEvents(call);

    try {
      if (video) {
        await call.placeVideoCall();
      } else {
        await call.placeVoiceCall();
      }
    } catch (err) {
      console.error('[callService] Call placement failed:', err);
      this.currentCall = null;
      throw err;
    }

    return call;
  }

  // ─── Call event binding ────────────────────────────────────────────────────

  _bindCallEvents(call) {
    call.on('hangup', () => {
      if (this.currentCall === call) this.currentCall = null;
      this._notify({ type: 'hangup', call });
    });

    call.on('error', (err) => {
      if (this.currentCall === call) this.currentCall = null;
      this._notify({ type: 'error', call, error: err });
    });

    call.on('state', (state) => {
      if (state === 'ended' && this.currentCall === call) {
        this.currentCall = null;
      }
      this._notify({ type: 'state', call, state });
    });
  }

  // ─── Pub / sub ─────────────────────────────────────────────────────────────

  subscribe(listener) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  _notify(event) {
    this.listeners.forEach((l) => {
      try { l(event); } catch (e) { console.error('[callService] listener error:', e); }
    });
  }
}

export const callService = new CallService();
