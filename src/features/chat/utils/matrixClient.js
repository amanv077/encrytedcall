import * as sdk from 'matrix-js-sdk';
import { storageService } from './storageService';
import { chatService } from './chatService';

class MatrixClientManager {
  constructor() {
    this.client = null;
    this.isReady = false;
    this.isLoggingIn = false;
  }

  // Manual login with password
  async login(baseUrl, userId, password) {
    if (this.isLoggingIn) return;
    this.isLoggingIn = true;

    try {
      // 1. If there's an existing client, stop it
      if (this.client) {
        this.client.stopClient();
      }

      const tempClient = sdk.createClient({ baseUrl });
      const loginRes = await tempClient.login("m.login.password", {
        user: userId,
        password: password,
        initial_device_display_name: "Healthcare Web Portal",
      });

      const session = {
        baseUrl,
        userId: loginRes.user_id,
        accessToken: loginRes.access_token,
        deviceId: loginRes.device_id,
      };

      this._saveSession(session);
      return await this._startClient(session);
    } catch (error) {
      console.error("Login failed:", error);
      // If it's a crypto mismatch error, we might need to tell the user to clear data
      // but for now, we just re-throw.
      throw error;
    } finally {
      this.isLoggingIn = false;
    }
  }

  // Resume session from localStorage
  async resumeSession() {
    const session = this._loadSession();
    if (!session) return null;
    
    if (this.isReady || this.isLoggingIn) return this.client;
    this.isLoggingIn = true;

    try {
      this.isReady = false;
      return await this._startClient(session);
    } catch (error) {
      console.error("Session resume failed:", error);
      // We DON'T logout here immediately to avoid wiping the session on temporary errors
      // But if it's a permanent auth error or device mismatch, we should.
      if (error.message && (error.message.includes("match") || error.message.includes("Device"))) {
         console.warn("Device mismatch detected, clearing old session state...");
         await this.logout();
      }
      return null;
    } finally {
      this.isLoggingIn = false;
    }
  }

  async _startClient({ baseUrl, userId, accessToken, deviceId }) {
    this.client = sdk.createClient({
      baseUrl,
      accessToken,
      userId,
      deviceId,
    });

    // Enable E2EE crypto (Rust SDK preferred, legacy JS crypto as fallback)
    this._usingRustCrypto = false;
    if (this.client.initRustCrypto) {
        await this.client.initRustCrypto();
        this._usingRustCrypto = true;
    } else if (this.client.initCrypto) {
        await this.client.initCrypto();
    }

    // Start syncing
    await this.client.startClient({ initialSyncLimit: 10 });

    // Wire up chat timeline listeners so messages are captured from first sync
    chatService.initTimelineListeners();

    return new Promise((resolve, reject) => {
        // Timeout after 15 seconds so UI doesn't hang forever
        const timeout = setTimeout(() => {
            if (!this.isReady) {
                console.warn("Matrix sync timed out, but proceeding...");
                this.isReady = true;
                resolve(this.client);
            }
        }, 15000);

        this.client.once('sync', async (state) => {
            if (state === 'PREPARED') {
                clearTimeout(timeout);
                this.isReady = true;
                // Enable key backup after the first successful sync so the
                // client can upload new session keys and restore backed-up ones.
                await this._enableKeyBackup(this.client);
                resolve(this.client);
            }
        });

        this.client.on('error', (err) => {
            console.error("Client error event:", err);
        });
    });
  }

  /**
   * Ensures the Rust (or legacy JS) key backup is enabled on this device.
   *
   * Flow:
   *  1. Try to connect to the existing server-side backup with
   *     checkKeyBackupAndEnable(). This succeeds only when the device already
   *     holds the backup private key (stored in SSSS on a previous session).
   *  2. If that returns null it means the private key is not on this device
   *     (no SSSS set up, or fresh login). In that case we call resetKeyBackup()
   *     to generate a new key pair, store the private key locally, and create a
   *     new backup version on the server. All Megolm session keys from this
   *     point on will be backed up and restorable on this device.
   *
   * Note: messages encrypted under the old backup version (before this call)
   * are only recoverable if the sender comes back online and re-shares the key
   * via the key-request mechanism below.
   *
   * Non-fatal: failure here does not break E2EE — it only affects key recovery.
   */
  async _enableKeyBackup(client) {
    try {
      if (this._usingRustCrypto) {
        const cryptoApi = client.getCrypto?.();
        if (!cryptoApi) {
          console.warn('[KeyBackup] getCrypto() returned null — skipping backup setup.');
          return;
        }

        if (cryptoApi.checkKeyBackupAndEnable) {
          let result = await cryptoApi.checkKeyBackupAndEnable();

          if (result) {
            console.log(
              '[KeyBackup] Rust crypto: connected to existing backup, version:',
              result.backupInfo?.version ?? '(unknown)',
            );
          } else {
            // The device doesn't have the backup private key — this happens on
            // every fresh login when SSSS is not configured. Reset the backup so
            // this device generates its own key pair and starts a fresh backup
            // version that it can actually use.
            console.warn(
              '[KeyBackup] Rust crypto: could not authenticate existing backup ' +
              '(no private key on this device). Resetting backup...',
            );
            if (cryptoApi.resetKeyBackup) {
              await cryptoApi.resetKeyBackup();
              // Give the server a moment to register the new version
              result = await cryptoApi.checkKeyBackupAndEnable();
              if (result) {
                console.log(
                  '[KeyBackup] Rust crypto: new backup created and enabled, version:',
                  result.backupInfo?.version ?? '(unknown)',
                );
              } else {
                console.warn('[KeyBackup] Rust crypto: backup reset but still could not enable.');
              }
            } else {
              console.warn('[KeyBackup] resetKeyBackup() not available on this SDK version.');
            }
          }
        } else {
          console.warn('[KeyBackup] checkKeyBackupAndEnable() not available on this SDK version.');
        }
      } else {
        // Legacy JS crypto
        const backupInfo = await client.getKeyBackupVersion();
        if (backupInfo && !client.getKeyBackupEnabled()) {
          await client.enableKeyBackup(backupInfo);
          console.log('[KeyBackup] Legacy crypto: backup enabled, version:', backupInfo.version);
        }
      }

      // For any event that still fails to decrypt after backup setup, ask the
      // sender's other online devices to re-share the room key (key gossiping).
      client.on('Event.decrypted', (event) => {
        if (event.isDecryptionFailure()) {
          try {
            client.cancelAndResendEventRoomKeyRequest(event, true);
          } catch (_) {
            // Not available on all SDK versions — safe to ignore
          }
        }
      });
    } catch (err) {
      console.warn('[KeyBackup] Could not enable key backup:', err.message ?? err);
    }
  }

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

    if (baseUrl && userId && accessToken) {
      return { baseUrl, userId, accessToken, deviceId };
    }
    return null;
  }

  getClient() {
    return this.client;
  }

  async logout() {
    const client = this.client;
    this.isReady = false;
    localStorage.clear();

    // Tear down chat listeners before stopping the client
    chatService.disposeListeners();

    if (client) {
      try { await client.logout(); } catch(e) {}
      client.stopClient();
      this.client = null;
    }

    // GDPR: wipe all locally stored messages
    storageService.clearAll();

    // Clear IndexedDB to prevent crypto mismatches next time
    try {
      window.indexedDB.deleteDatabase('matrix-js-sdk:crypto');
    } catch(e) {}
  }
}

export const matrixManager = new MatrixClientManager();
