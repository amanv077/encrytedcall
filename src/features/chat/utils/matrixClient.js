import * as sdk from 'matrix-js-sdk';
import { storageService } from './storageService';
import { chatService } from './chatService';

/** Idle timeout before automatic session purge (30 minutes). */
const IDLE_TIMEOUT_MS = 30 * 60 * 1000;

/** Matrix to-device event type that triggers a remote wipe. */
const REMOTE_WIPE_EVENT = 'com.synapp.remote_wipe';

/** DOM events that reset the idle timer. */
const ACTIVITY_EVENTS = ['mousemove', 'mousedown', 'keydown', 'touchstart', 'scroll', 'click'];

class MatrixClientManager {
  constructor() {
    this.client         = null;
    this.isReady        = false;
    this.isLoggingIn    = false;
    this._usingRustCrypto = false;
    this._idleTimer     = null;
    this._idleResetBound = this._resetIdleTimer.bind(this);
    this._lastMarkedReadByRoom = new Map();
  }

  // ── Login / session ─────────────────────────────────────────────────────

  async login(baseUrl, userId, password) {
    if (this.isLoggingIn) return;
    this.isLoggingIn = true;

    try {
      if (this.client) this.client.stopClient();

      const tempClient = sdk.createClient({ baseUrl });

      // Reuse the saved device_id when the same user logs back in so the
      // homeserver re-registers the same device and the Rust crypto store
      // (IndexedDB) — which is preserved across normal logouts — still holds
      // the correct Olm/Megolm session keys for that device.
      const savedUserId   = localStorage.getItem('matrix_user_id');
      const savedDeviceId = localStorage.getItem('matrix_device_id');
      const reuseDeviceId =
        savedUserId === userId && savedDeviceId ? savedDeviceId : undefined;

      const loginRes = await tempClient.login('m.login.password', {
        user:                        userId,
        password:                    password,
        // user:                        "@rajhanani04:matrix.org",
        // password:                    "12345678",
        initial_device_display_name: 'Healthcare Web Portal',
        ...(reuseDeviceId ? { device_id: reuseDeviceId } : {}),
      });

      const session = {
        baseUrl,
        userId:      loginRes.user_id,
        accessToken: loginRes.access_token,
        deviceId:    loginRes.device_id,
      };

      this._saveSession(session);
      return await this._startClient(session);
    } catch (error) {
      console.error('[MatrixClient] Login failed:', error);
      throw error;
    } finally {
      this.isLoggingIn = false;
    }
  }

  async resumeSession() {
    const session = this._loadSession();
    if (!session) return null;

    if (this.isReady || this.isLoggingIn) return this.client;
    this.isLoggingIn = true;

    try {
      this.isReady = false;
      return await this._startClient(session);
    } catch (error) {
      console.error('[MatrixClient] Session resume failed:', error);
      if (error.message?.match(/match|Device/)) {
        console.warn('[MatrixClient] Device mismatch — clearing session');
        await this.logout();
      }
      return null;
    } finally {
      this.isLoggingIn = false;
    }
  }

  // ── Internal client bootstrap ────────────────────────────────────────────

  async _startClient({ baseUrl, userId, accessToken, deviceId }) {
    this.client = sdk.createClient({ baseUrl, accessToken, userId, deviceId });

    // Enable E2EE (Rust SDK preferred)
    this._usingRustCrypto = false;
    if (this.client.initRustCrypto) {
      await this.client.initRustCrypto();
      this._usingRustCrypto = true;
    } else if (this.client.initCrypto) {
      await this.client.initCrypto();
    }

    await this.client.startClient({ initialSyncLimit: 10 });
    chatService.initTimelineListeners();

    // Listen for remote wipe signal
    this.client.on('toDeviceEvent', (event) => {
      if (event.getType() === REMOTE_WIPE_EVENT) {
        console.warn('[MatrixClient] Remote wipe received — purging local store');
        this.purgeAndLogout();
      }
    });

    // Persist next_batch after every sync so sync state lives in the DB,
    // not in localStorage. The Matrix SDK also tracks it internally.
    this.client.on('sync', (state, _prev, data) => {
      if (state === 'PREPARED' || state === 'SYNCING') {
        const token = data?.nextSyncToken ?? this.client.getSyncToken?.();
        if (token) storageService.saveNextBatch(token);
      }
    });

    return new Promise((resolve) => {
      const timeout = setTimeout(() => {
        if (!this.isReady) {
          console.warn('[MatrixClient] Sync timed out — proceeding anyway');
          this.isReady = true;
          resolve(this.client);
        }
      }, 15000);

      this.client.once('sync', async (state) => {
        if (state === 'PREPARED') {
          clearTimeout(timeout);
          this.isReady = true;
          await this._enableKeyBackup(this.client);
          this._startIdleTimer();
          resolve(this.client);
        }
      });

      this.client.on('error', (err) => console.error('[MatrixClient] Client error:', err));
    });
  }

  // ── Key backup ───────────────────────────────────────────────────────────

  async _enableKeyBackup(client) {
    try {
      if (this._usingRustCrypto) {
        const cryptoApi = client.getCrypto?.();
        if (!cryptoApi) return;

        if (cryptoApi.checkKeyBackupAndEnable) {
          let result = await cryptoApi.checkKeyBackupAndEnable();

          if (result) {
            console.log('[KeyBackup] Connected to backup v' + (result.backupInfo?.version ?? '?'));
          } else if (cryptoApi.resetKeyBackup) {
            console.warn('[KeyBackup] No usable backup — creating new one');
            await cryptoApi.resetKeyBackup();
            result = await cryptoApi.checkKeyBackupAndEnable();
            if (result) {
              console.log('[KeyBackup] New backup enabled v' + (result.backupInfo?.version ?? '?'));
            }
          }
        }
      } else {
        const info = await client.getKeyBackupVersion();
        if (info && !client.getKeyBackupEnabled()) {
          await client.enableKeyBackup(info);
        }
      }

      // Re-request keys for any failed decryptions via key gossiping
      client.on('Event.decrypted', (event) => {
        if (event.isDecryptionFailure()) {
          try { client.cancelAndResendEventRoomKeyRequest(event, true); } catch (_) {}
        }
      });
    } catch (err) {
      console.warn('[KeyBackup] Setup error:', err.message ?? err);
    }
  }

  // ── Idle timeout (30 min) ────────────────────────────────────────────────

  _startIdleTimer() {
    this._clearIdleTimer();
    ACTIVITY_EVENTS.forEach((ev) =>
      window.addEventListener(ev, this._idleResetBound, { passive: true }),
    );
    this._idleTimer = setTimeout(() => {
      console.warn('[MatrixClient] Session idle — purging local store');
      this.purgeAndLogout();
    }, IDLE_TIMEOUT_MS);
  }

  _resetIdleTimer() {
    clearTimeout(this._idleTimer);
    this._idleTimer = setTimeout(() => {
      console.warn('[MatrixClient] Session idle — purging local store');
      this.purgeAndLogout();
    }, IDLE_TIMEOUT_MS);
  }

  _clearIdleTimer() {
    clearTimeout(this._idleTimer);
    this._idleTimer = null;
    ACTIVITY_EVENTS.forEach((ev) =>
      window.removeEventListener(ev, this._idleResetBound),
    );
  }

  // ── Purge + logout ───────────────────────────────────────────────────────

  /**
   * Full GDPR purge then logout.
   * Called by: idle timeout, remote wipe signal.
   * Destroys EVERYTHING — crypto keys, message history, session.
   */
  async purgeAndLogout() {
    this._clearIdleTimer();
    // 1. Destroy session key + delete OPFS file
    await storageService.purge();
    // 2. Standard session tear-down
    await this.logout({ fullWipe: true });
  }

  /**
   * Normal logout.
   *
   * What is preserved across a normal logout (needed for re-login):
   *  • matrix_user_id   — so login form can pre-fill / reuse device_id check
   *  • matrix_device_id — passed to the next login() to re-register the same
   *                       device on the homeserver
   *  • IndexedDB crypto store — contains Olm/Megolm session keys; preserving
   *    it means re-login with the same device_id can still decrypt old messages
   *
   * What is always cleared:
   *  • matrix_access_token  — credential no longer valid
   *  • matrix_base_url      — (re-set on next login)
   *  • OPFS message history — GDPR: no plaintext persists after logout
   *
   * @param {{ fullWipe?: boolean }} [opts]
   *   fullWipe = true: also deletes crypto IndexedDB and clears all localStorage
   *   (used by purgeAndLogout only)
   */
  async logout({ fullWipe = false } = {}) {
    const client = this.client;
    this.isReady = false;
    this._clearIdleTimer();

    // Always revoke the access token credential
    localStorage.removeItem('matrix_access_token');
    localStorage.removeItem('matrix_base_url');

    // Full wipe (idle timeout / remote wipe): remove device identity too
    if (fullWipe) {
      localStorage.removeItem('matrix_user_id');
      localStorage.removeItem('matrix_device_id');
    }

    chatService.disposeListeners();

    if (client) {
      try { await client.logout(); } catch (_) {}
      client.stopClient();
      this.client = null;
    }
    this._lastMarkedReadByRoom.clear();

    // Wipe OPFS message history (GDPR — no plaintext on disk after logout)
    try { await storageService.clearAll(); } catch (_) {}

    if (fullWipe) {
      // Full purge: also wipe the Rust crypto store (Olm/Megolm keys gone)
      try { window.indexedDB.deleteDatabase('matrix-js-sdk:crypto'); } catch (_) {}
    }
    // Normal logout intentionally keeps the IndexedDB so that the next
    // login with the same device_id can still decrypt historical messages.
  }

  // ── Session persistence (access token only — NOT message data) ──────────

  _saveSession(session) {
    localStorage.setItem('matrix_base_url',    session.baseUrl);
    localStorage.setItem('matrix_user_id',     session.userId);
    localStorage.setItem('matrix_access_token', session.accessToken);
    localStorage.setItem('matrix_device_id',   session.deviceId);
  }

  _loadSession() {
    const baseUrl      = localStorage.getItem('matrix_base_url');
    const userId       = localStorage.getItem('matrix_user_id');
    const accessToken  = localStorage.getItem('matrix_access_token');
    const deviceId     = localStorage.getItem('matrix_device_id');
    return baseUrl && userId && accessToken
      ? { baseUrl, userId, accessToken, deviceId }
      : null;
  }

  /**
   * Mark a room as read immediately (used when the user opens the chat).
   * Sends both a read receipt and read markers so unread counters update fast.
   */
  async markRoomAsRead(roomId) {
    const client = this.client;
    if (!client || !roomId) return;
    const room = client.getRoom(roomId);
    if (!room) return;

    const events = room.getLiveTimeline?.()?.getEvents?.() || [];
    // Pick latest visible timeline event
    const latest = [...events].reverse().find((evt) => !!evt.getId?.());
    if (!latest) return;

    const latestId = latest.getId();
    if (!latestId) return;
    if (this._lastMarkedReadByRoom.get(roomId) === latestId) return;

    try {
      if (client.sendReadReceipt) {
        await client.sendReadReceipt(latest);
      }
      if (client.setRoomReadMarkers) {
        // fullyReadEvent and readReceiptEvent both set to latest event
        await client.setRoomReadMarkers(roomId, latestId, latestId);
      }
      this._lastMarkedReadByRoom.set(roomId, latestId);
    } catch (err) {
      console.warn('[MatrixClient] markRoomAsRead failed:', err?.message || err);
    }
  }

  getClient() { return this.client; }
}

export const matrixManager = new MatrixClientManager();
