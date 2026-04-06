import * as sdk from 'matrix-js-sdk';
import { decodeRecoveryKey } from 'matrix-js-sdk/lib/crypto-api/recovery-key.js';
import { storageService } from './storageService';
import { chatService } from './chatService';
import store from '../../../store/index';
import {
  setCryptoReady,
  setNeedsRecoveryKey,
  setRecoveryKeyForDisplay,
  clearRecoveryKeyForDisplay,
  setVerificationStatus,
  resetCryptoSessionState,
} from '../../../store/chatSlice';

/** Idle timeout before automatic session purge (30 minutes). */
const IDLE_TIMEOUT_MS = 30 * 60 * 1000;

/** Matrix to-device event type that triggers a remote wipe. */
const REMOTE_WIPE_EVENT = 'com.synapp.remote_wipe';

/** DOM events that reset the idle timer. */
const ACTIVITY_EVENTS = ['mousemove', 'mousedown', 'keydown', 'touchstart', 'scroll', 'click'];
const PENDING_EVENT_ORDERING = 'detached';

/** Rust crypto IndexedDB names (see matrix-js-sdk clearStores). Legacy Olm DB included. */
const MATRIX_CRYPTO_IDB_NAMES = [
  'matrix-js-sdk::matrix-sdk-crypto',
  'matrix-js-sdk::matrix-sdk-crypto-meta',
  'matrix-js-sdk:crypto',
];

/** @returns {Promise<void>} */
async function deleteMatrixCryptoIndexedDatabases() {
  await Promise.all(
    MATRIX_CRYPTO_IDB_NAMES.map(
      (name) =>
        new Promise((resolve) => {
          const req = indexedDB.deleteDatabase(name);
          req.onsuccess = () => resolve();
          req.onerror = () => resolve();
          req.onblocked = () => resolve();
        }),
    ),
  );
}

// ── Exported crypto helpers (Layer 1 — Matrix E2EE) ─────────────────────────

/**
 * After calling this, the client's crypto store is ready (Rust backend).
 * If IndexedDB still holds another user's Olm store, wipe it once and retry.
 * @param {import('matrix-js-sdk').MatrixClient} client
 */
export async function initMatrixCrypto(client) {
  const doInit = async () => {
    if (client.initRustCrypto) {
      await client.initRustCrypto();
    } else if (client.initCrypto) {
      await client.initCrypto();
    }
  };

  try {
    await doInit();
  } catch (e) {
    const msg = e?.message || String(e);
    if (!msg.includes('account in the store')) {
      throw e;
    }
    console.warn('[MatrixClient] Crypto IndexedDB user mismatch — wiping Rust crypto stores and retrying init');
    await deleteMatrixCryptoIndexedDatabases();
    try {
      await storageService.init();
    } catch {
      /* ignore */
    }
    try {
      await storageService.purge();
    } catch {
      /* ignore */
    }
    await doInit();
  }
}

/**
 * True when this browser session must unlock SSSS (recovery key) before decrypting history —
 * e.g. site data cleared but cross-signing private keys still exist on the homeserver.
 * @param {import('matrix-js-sdk').MatrixClient} client
 */
export async function isNewDevice(client) {
  try {
    const crypto = client.getCrypto();
    if (!crypto) return true;
    const status = await crypto.getCrossSigningStatus();
    const keysCachedLocally =
      status.privateKeysCachedLocally.masterKey &&
      status.privateKeysCachedLocally.selfSigningKey &&
      status.privateKeysCachedLocally.userSigningKey;
    if (status.privateKeysInSecretStorage && !keysCachedLocally) return true;
    return false;
  } catch {
    return true;
  }
}

/**
 * Call only on register. Returns the recovery key string for the UI.
 * @param {import('matrix-js-sdk').MatrixClient} client
 */
export async function setupCryptoForNewAccount(client) {
  const crypto = client.getCrypto();
  if (!crypto) throw new Error('Crypto not initialised');

  await crypto.bootstrapCrossSigning({
    authUploadDeviceSigningKeys: async (makeRequest) => {
      try {
        await makeRequest({});
      } catch (e) {
        console.warn('[SynApp] Cross-signing UIA required:', e);
        throw e;
      }
    },
  });

  let recoveryKey = null;
  await crypto.bootstrapSecretStorage({
    createSecretStorageKey: async () => {
      const result = await crypto.createRecoveryKeyFromPassphrase();
      recoveryKey = result.encodedPrivateKey;
      return result;
    },
    setupNewSecretStorage: true,
    setupNewKeyBackup: true,
  });

  await crypto.checkKeyBackupAndEnable(true);
  return recoveryKey;
}

/**
 * Unlock SSSS with the recovery key, load megolm backup key, restore room keys.
 * Caller must set `client.cryptoCallbacks.getSecretStorageKey` first.
 * @param {import('matrix-js-sdk').MatrixClient} client
 */
export async function restoreKeysFromBackup(client) {
  const crypto = client.getCrypto();
  if (!crypto) return { success: false, error: 'Crypto not initialised' };

  try {
    await crypto.bootstrapCrossSigning({});
    try {
      await crypto.loadSessionBackupPrivateKeyFromSecretStorage();
    } catch (e) {
      console.warn('[SynApp] No megolm backup key in SSSS (skipping):', e?.message || e);
    }
    try {
      await crypto.restoreKeyBackup({});
    } catch (e) {
      console.warn('[SynApp] restoreKeyBackup:', e?.message || e);
    }
    await crypto.checkKeyBackupAndEnable(true);
    return { success: true };
  } catch (e) {
    console.error('[SynApp] Key restore failed:', e?.message || e);
    return { success: false, error: e?.message || String(e) };
  }
}

/**
 * @param {import('matrix-js-sdk').MatrixClient} client
 */
export async function getVerificationStatus(client) {
  try {
    const crypto = client.getCrypto();
    if (!crypto) return { ready: false };
    const status = await crypto.getCrossSigningStatus();
    const backupInfo = await crypto.getKeyBackupInfo();
    return {
      crossSigningReady: status.publicKeysOnDevice,
      secretStorageReady: status.privateKeysInSecretStorage,
      keyBackupEnabled: !!backupInfo?.version,
      ready: status.publicKeysOnDevice && status.privateKeysInSecretStorage,
    };
  } catch {
    return { ready: false };
  }
}

class MatrixClientManager {
  constructor() {
    this.client = null;
    this.isReady = false;
    this.isLoggingIn = false;
    this._usingRustCrypto = false;
    this._idleTimer = null;
    this._idleResetBound = this._resetIdleTimer.bind(this);
    this._lastMarkedReadByRoom = new Map();
    /** Passed to createClient — same object reference so we can inject getSecretStorageKey later. */
    this._cryptoCallbacks = {};
    /** When false, chatService must not persist timeline events to SQLite. */
    this.cryptoReadyForSync = false;
    /** Holds recovery key string only while unlock callback is active. */
    this._pendingRecoveryKeyString = null;
    /** Cached 4S key material during register bootstrap (same session). */
    this._cached4sKey = null;
  }

  /** Whether timeline events may be written to encrypted local storage. */
  isCryptoReadyForTimelinePersistence() {
    return this.cryptoReadyForSync;
  }

  _dispatchCryptoReset() {
    store.dispatch(resetCryptoSessionState());
  }

  /**
   * If the last logged-in Matrix user/device differs from this login response, wipe crypto + local DB.
   */
  async _resetStoresIfSessionIdentityChanged(savedUserId, savedDeviceId, loginRes) {
    const userChanged = Boolean(savedUserId && loginRes.user_id !== savedUserId);
    const deviceChanged = Boolean(
      savedUserId &&
        loginRes.user_id === savedUserId &&
        savedDeviceId &&
        loginRes.device_id !== savedDeviceId,
    );
    if (!userChanged && !deviceChanged) return;

    await deleteMatrixCryptoIndexedDatabases();
    try {
      await storageService.init();
    } catch {
      /* ignore */
    }
    try {
      await storageService.purge();
    } catch {
      /* ignore */
    }
  }

  _createAuthedClient(session) {
    this.client = sdk.createClient({
      baseUrl: session.baseUrl,
      accessToken: session.accessToken,
      userId: session.userId,
      deviceId: session.deviceId,
      pendingEventOrdering: PENDING_EVENT_ORDERING,
      cryptoCallbacks: this._cryptoCallbacks,
    });
  }

  /**
   * Rust `importCrossSigningKeys` needs cross-signing *public* keys from the homeserver first.
   * Those arrive via `/sync` into the Olm machine — so we must run at least one sync before SSSS unlock.
   */
  async _waitForSyncPrepared() {
    const client = this.client;
    if (!client) return;
    const st = client.getSyncState?.();
    if (st === 'PREPARED' || st === 'SYNCING') return;

    await new Promise((resolve) => {
      const timeout = setTimeout(() => {
        client.removeListener('sync', onSync);
        console.warn(
          '[MatrixClient] Timed out waiting for PREPARED sync — recovery may still fail until sync completes',
        );
        resolve();
      }, 45000);
      const onSync = (state) => {
        if (state === 'PREPARED') {
          clearTimeout(timeout);
          client.removeListener('sync', onSync);
          resolve();
        }
      };
      client.on('sync', onSync);
    });
  }

  /** After startClient: set isReady when PREPARED, or immediately if already syncing. */
  async _resolveWhenSyncPrepared() {
    const client = this.client;
    if (!client) return;
    const st = client.getSyncState?.();
    if (st === 'PREPARED' || st === 'SYNCING') {
      this.isReady = true;
      return;
    }

    await new Promise((resolve) => {
      const timeout = setTimeout(() => {
        client.removeListener('sync', onSync);
        console.warn('[MatrixClient] Sync timed out — proceeding anyway');
        this.isReady = true;
        resolve();
      }, 15000);
      const onSync = (state) => {
        if (state === 'PREPARED') {
          clearTimeout(timeout);
          this.isReady = true;
          client.removeListener('sync', onSync);
          resolve();
        }
      };
      client.on('sync', onSync);
    });
  }

  async _initRustIfAvailable() {
    this._usingRustCrypto = false;
    if (this.client.initRustCrypto) {
      await this.client.initRustCrypto();
      this._usingRustCrypto = true;
    } else if (this.client.initCrypto) {
      await this.client.initCrypto();
    }
  }

  /**
   * @returns {Promise<{ needsRecoveryKey: boolean }>}
   */
  async _afterCryptoLogin(session) {
    await initMatrixCrypto(this.client);
    const needsRecoveryKey = await isNewDevice(this.client);
    if (needsRecoveryKey) {
      this.cryptoReadyForSync = false;
      store.dispatch(setNeedsRecoveryKey(true));
      store.dispatch(setCryptoReady(false));
      // Critical: initial sync loads cross-signing public keys; without them,
      // bootstrapCrossSigning → importCrossSigningKeys throws after SSSS unlock.
      await this.client.startClient({ initialSyncLimit: 50, lazyLoadMembers: true });
      await this._waitForSyncPrepared();
      return { needsRecoveryKey: true };
    }
    await this._startSyncAndListeners(session);
    return { needsRecoveryKey: false };
  }

  /**
   * User entered recovery key after login or resume.
   * @param {string} recoveryKey
   */
  async completeRecoveryWithKey(recoveryKey) {
    if (!this.client) throw new Error('No Matrix client');
    const trimmed = recoveryKey?.trim();
    if (!trimmed) throw new Error('Recovery key required');

    try {
      decodeRecoveryKey(trimmed);
    } catch {
      return { success: false, error: 'Invalid recovery key format.' };
    }

    this._pendingRecoveryKeyString = trimmed;
    const client = this.client;

    await this._waitForSyncPrepared();

    this._cryptoCallbacks.getSecretStorageKey = async (opts) => {
      const keys = opts.keys || {};
      const defaultKeyId = await client.secretStorage.getDefaultKeyId();
      const keyId =
        defaultKeyId && keys[defaultKeyId]
          ? defaultKeyId
          : Object.keys(keys)[0];
      if (!keyId) return null;
      const pk = decodeRecoveryKey(this._pendingRecoveryKeyString.trim());
      return [keyId, pk];
    };

    try {
      const result = await restoreKeysFromBackup(client);
      if (!result.success) {
        return result;
      }
    } finally {
      delete this._cryptoCallbacks.getSecretStorageKey;
      this._pendingRecoveryKeyString = null;
    }

    const session = this._loadSession();
    if (!session) throw new Error('Session lost');
    await this._startSyncAndListeners(session);
    store.dispatch(setNeedsRecoveryKey(false));
    return { success: true };
  }

  /** Continue without restoring SSSS (history may stay UTD). */
  async skipRecoveryAndStart() {
    delete this._cryptoCallbacks.getSecretStorageKey;
    this._pendingRecoveryKeyString = null;
    const session = this._loadSession();
    if (!this.client || !session) throw new Error('No session');
    await this._startSyncAndListeners(session);
    store.dispatch(setNeedsRecoveryKey(false));
  }

  /**
   * @param {{ baseUrl: string, userId: string, accessToken: string, deviceId?: string }} session
   */
  async _startSyncAndListeners(session) {
    await storageService.init();
    await storageService.ensureUserIdentity(session.userId);

    this.cryptoReadyForSync = true;
    store.dispatch(setCryptoReady(true));
    const verification = await getVerificationStatus(this.client);
    store.dispatch(setVerificationStatus(verification));

    await this.client.startClient({ initialSyncLimit: 50, lazyLoadMembers: true });
    chatService.initTimelineListeners();

    this.client.on('toDeviceEvent', (event) => {
      if (event.getType() === REMOTE_WIPE_EVENT) {
        console.warn('[MatrixClient] Remote wipe received — purging local store');
        this.purgeAndLogout();
      }
    });

    this.client.on('sync', (state, _prev, data) => {
      if (state === 'PREPARED' || state === 'SYNCING') {
        const token = data?.nextSyncToken ?? this.client.getSyncToken?.();
        if (token) storageService.saveNextBatch(token);
      }
    });

    await this._enableKeyBackup(this.client);
    this._startIdleTimer();

    await this._resolveWhenSyncPrepared();

    this.client.on('error', (err) => console.error('[MatrixClient] Client error:', err));
  }

  // ── Login / session ─────────────────────────────────────────────────────

  async login(baseUrl, userId, password) {
    if (this.isLoggingIn) return { needsRecoveryKey: false };
    this.isLoggingIn = true;

    try {
      if (this.client) this.client.stopClient();

      const tempClient = sdk.createClient({
        baseUrl,
        pendingEventOrdering: PENDING_EVENT_ORDERING,
      });

      const savedUserId = localStorage.getItem('matrix_user_id');
      const savedDeviceId = localStorage.getItem('matrix_device_id');
      const reuseDeviceId =
        savedUserId === userId && savedDeviceId ? savedDeviceId : undefined;

      const loginRes = await tempClient.login('m.login.password', {
        user: userId,
        password,
        initial_device_display_name: 'Healthcare Web Portal',
        ...(reuseDeviceId ? { device_id: reuseDeviceId } : {}),
      });

      const session = {
        baseUrl,
        userId: loginRes.user_id,
        accessToken: loginRes.access_token,
        deviceId: loginRes.device_id,
      };

      await this._resetStoresIfSessionIdentityChanged(savedUserId, savedDeviceId, loginRes);

      this._saveSession(session);
      this._clear4sCallbacks();
      this._createAuthedClient(session);
      return await this._afterCryptoLogin(session);
    } catch (error) {
      console.error('[MatrixClient] Login failed:', error);
      throw error;
    } finally {
      this.isLoggingIn = false;
    }
  }

  /**
   * Register a new account (homeserver must allow m.login.dummy).
   * Does not start sync — caller shows recovery key, then {@link acknowledgeRegisterCryptoAndStart}.
   */
  async registerAccount(baseUrl, username, password) {
    if (this.isLoggingIn) return null;
    this.isLoggingIn = true;
    try {
      if (this.client) this.client.stopClient();

      const regClient = sdk.createClient({
        baseUrl,
        pendingEventOrdering: PENDING_EVENT_ORDERING,
      });

      const auth = { type: 'm.login.dummy' };
      const prevUserId = localStorage.getItem('matrix_user_id');
      const prevDeviceId = localStorage.getItem('matrix_device_id');
      const res = await regClient.register(username, password, null, auth);

      const session = {
        baseUrl,
        userId: res.user_id,
        accessToken: res.access_token,
        deviceId: res.device_id,
      };

      await this._resetStoresIfSessionIdentityChanged(prevUserId, prevDeviceId, {
        user_id: res.user_id,
        device_id: res.device_id,
      });

      this._saveSession(session);

      this._setupRegister4sCallbacks();
      this._createAuthedClient(session);
      await initMatrixCrypto(this.client);

      const recoveryKey = await setupCryptoForNewAccount(this.client);
      store.dispatch(setRecoveryKeyForDisplay(recoveryKey));
      store.dispatch(setNeedsRecoveryKey(false));
      store.dispatch(setCryptoReady(false));
      this.cryptoReadyForSync = false;

      return { recoveryKey };
    } catch (e) {
      console.error('[MatrixClient] Register failed:', e);
      throw e;
    } finally {
      this.isLoggingIn = false;
    }
  }

  /** After user acknowledges recovery key on register. */
  async acknowledgeRegisterCryptoAndStart() {
    const session = this._loadSession();
    if (!this.client || !session) throw new Error('No session');
    store.dispatch(clearRecoveryKeyForDisplay());
    await this._startSyncAndListeners(session);
  }

  _clear4sCallbacks() {
    this._cached4sKey = null;
    delete this._cryptoCallbacks.cacheSecretStorageKey;
    delete this._cryptoCallbacks.getSecretStorageKey;
  }

  _setupRegister4sCallbacks() {
    this._cached4sKey = null;
    this._cryptoCallbacks.cacheSecretStorageKey = (keyId, _keyInfo, key) => {
      this._cached4sKey = { keyId, key: new Uint8Array(key) };
    };
    this._cryptoCallbacks.getSecretStorageKey = async ({ keys }) => {
      if (!this._cached4sKey) return null;
      if (!keys[this._cached4sKey.keyId]) return null;
      return [this._cached4sKey.keyId, this._cached4sKey.key];
    };
  }

  async resumeSession() {
    const session = this._loadSession();
    if (!session) return null;

    if (this.isReady || this.isLoggingIn) return { needsRecoveryKey: false, client: this.client };
    this.isLoggingIn = true;

    try {
      this.isReady = false;
      this._clear4sCallbacks();
      this._createAuthedClient(session);
      return await this._afterCryptoLogin(session);
    } catch (error) {
      const msg = error?.message || String(error);
      console.error('[MatrixClient] Session resume failed:', error);
      // Do NOT use a broad /match/ regex — "doesn't match" would false-positive and skip crypto wipe.
      if (msg.includes('account in the store') && msg.toLowerCase().includes('match')) {
        console.warn('[MatrixClient] Crypto store vs session user mismatch — clearing crypto + session token');
        await deleteMatrixCryptoIndexedDatabases();
        try {
          await storageService.init();
        } catch {
          /* ignore */
        }
        try {
          await storageService.purge();
        } catch {
          /* ignore */
        }
        localStorage.removeItem('matrix_access_token');
        localStorage.removeItem('matrix_base_url');
      }
      return null;
    } finally {
      this.isLoggingIn = false;
    }
  }

  // ── Key backup ───────────────────────────────────────────────────────────

  async _enableKeyBackup(client) {
    try {
      if (this._usingRustCrypto) {
        const cryptoApi = client.getCrypto?.();
        if (cryptoApi?.checkKeyBackupAndEnable) {
          let result = await cryptoApi.checkKeyBackupAndEnable(true);

          if (result) {
            console.log('[KeyBackup] Connected to backup v' + (result.backupInfo?.version ?? '?'));
          } else if (cryptoApi.resetKeyBackup) {
            console.warn('[KeyBackup] No usable backup — creating new one');
            await cryptoApi.resetKeyBackup();
            result = await cryptoApi.checkKeyBackupAndEnable(true);
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
    } catch (err) {
      console.warn('[KeyBackup] Setup error:', err.message ?? err);
    }
    // chatService persists decrypted bodies; here we only nudge key requests on failure.
    client.removeListener('Event.decrypted', this._keyBackupDecryptedStub);
    client.on('Event.decrypted', this._keyBackupDecryptedStub);
  }

  _keyBackupDecryptedStub = (event) => {
    if (event.isDecryptionFailure()) {
      try {
        this.client?.cancelAndResendEventRoomKeyRequest(event, true);
      } catch {
        /* ignore */
      }
    }
  };

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

  async purgeAndLogout() {
    this._clearIdleTimer();
    await this.logout({ fullWipe: true });
  }

  /**
   * Normal logout: revoke credential, wipe local SQLite rows (GDPR), keep Matrix IndexedDB + device_id
   * so the same browser can log back in without entering the recovery key.
   * fullWipe (idle / remote wipe): also delete crypto store and device identity from localStorage.
   */
  async logout({ fullWipe = false } = {}) {
    const client = this.client;
    this.isReady = false;
    this.cryptoReadyForSync = false;
    this._clearIdleTimer();
    this._dispatchCryptoReset();

    localStorage.removeItem('matrix_access_token');
    localStorage.removeItem('matrix_base_url');
    if (fullWipe) {
      localStorage.removeItem('matrix_user_id');
      localStorage.removeItem('matrix_device_id');
    }

    chatService.disposeListeners();

    if (client) {
      try {
        client.stopClient();
      } catch {
        /* ignore */
      }
      try {
        await client.logout();
      } catch {
        /* ignore */
      }
      if (fullWipe) {
        try {
          await client.clearStores();
        } catch (e) {
          console.warn('[MatrixClient] clearStores:', e?.message || e);
        }
      }
      this.client = null;
    }
    this._lastMarkedReadByRoom.clear();
    this._cached4sKey = null;
    delete this._cryptoCallbacks.getSecretStorageKey;
    delete this._cryptoCallbacks.cacheSecretStorageKey;

    try {
      if (fullWipe) {
        await storageService.purge();
      } else {
        await storageService.clearAll();
      }
    } catch {
      /* ignore */
    }

    if (fullWipe) {
      try {
        await deleteMatrixCryptoIndexedDatabases();
      } catch {
        /* ignore */
      }
    }
  }

  // ── Session persistence (access token only — NOT message data) ──────────

  _saveSession(session) {
    localStorage.setItem('matrix_base_url', session.baseUrl);
    localStorage.setItem('matrix_user_id', session.userId);
    localStorage.setItem('matrix_access_token', session.accessToken);
    localStorage.setItem('matrix_device_id', session.deviceId);
  }

  _loadSession() {
    const baseUrl = localStorage.getItem('matrix_base_url');
    const userId = localStorage.getItem('matrix_user_id');
    const accessToken = localStorage.getItem('matrix_access_token');
    const deviceId = localStorage.getItem('matrix_device_id');
    return baseUrl && userId && accessToken
      ? { baseUrl, userId, accessToken, deviceId }
      : null;
  }

  async markRoomAsRead(roomId) {
    const client = this.client;
    if (!client || !roomId) return;
    const room = client.getRoom(roomId);
    if (!room) return;

    const events = room.getLiveTimeline?.()?.getEvents?.() || [];
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
        await client.setRoomReadMarkers(roomId, latestId, latestId);
      }
      this._lastMarkedReadByRoom.set(roomId, latestId);
    } catch (err) {
      console.warn('[MatrixClient] markRoomAsRead failed:', err?.message || err);
    }
  }

  getClient() {
    return this.client;
  }

  async ensureDetachedPendingEvents() {
    const current = this.client;
    if (!current) return null;

    const ordering = current.getOpts?.()?.pendingEventOrdering;
    if (ordering === 'detached') return current;

    const session = this._loadSession();
    if (!session) return current;

    try {
      chatService.disposeListeners();
      current.stopClient();
    } catch {
      /* ignore */
    }

    this.client = null;
    this.isReady = false;
    this.cryptoReadyForSync = false;
    this._clear4sCallbacks();
    this._createAuthedClient(session);
    await initMatrixCrypto(this.client);
    const needs = await isNewDevice(this.client);
    if (needs) {
      store.dispatch(setNeedsRecoveryKey(true));
      return this.client;
    }
    await this._startSyncAndListeners(session);
    return this.client;
  }
}

export const matrixManager = new MatrixClientManager();
