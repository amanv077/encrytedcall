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
      // Prevents the "constructor vs store" mismatch by ensuring we use a fresh store if desired
      // but usually reuse is good. The mismatch happens if deviceId changes.
    });

    // Enable E2EE crypto (Rust SDK)
    if (this.client.initRustCrypto) {
        await this.client.initRustCrypto();
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
                this.isReady = true; // Fallback
                resolve(this.client);
            }
        }, 15000);

        this.client.once('sync', (state) => {
            if (state === 'PREPARED') {
                clearTimeout(timeout);
                this.isReady = true;
                resolve(this.client);
            }
        });

        this.client.on('error', (err) => {
            console.error("Client error event:", err);
            // This could be the source of your error
        });
    });
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
