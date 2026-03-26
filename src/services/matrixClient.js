import * as sdk from 'matrix-js-sdk';

class MatrixClientManager {
  constructor() {
    this.client = null;
    this.isReady = false;
    this.isLoggingIn = false;
  }

  async initAndLogin() {
    if (this.isReady || this.isLoggingIn) return this.client;
    this.isLoggingIn = true;
    
    const baseUrl = import.meta.env.VITE_MATRIX_BASE_URL;
    const userId = import.meta.env.VITE_MATRIX_USER_ID;
    const password = import.meta.env.VITE_MATRIX_PASSWORD;


    if (!baseUrl || !userId || !password) {
      console.warn("Matrix credentials not fully configured in environment variables.");
      return null;
    }

    this.client = sdk.createClient({ baseUrl });
    
    try {
      const loginRes = await this.client.login("m.login.password", {
        user: userId,
        password: password,
      });

      // Re-create client with access token
      this.client = sdk.createClient({
        baseUrl,
        accessToken: loginRes.access_token,
        userId: loginRes.user_id,
        deviceId: loginRes.device_id,
      });

      // Enable E2EE crypto
      await this.client.initCrypto();

      // Start syncing
      await this.client.startClient({ initialSyncLimit: 10 });
      this.isReady = true;

      return this.client;
    } catch (error) {
      console.error("Failed to login to Matrix:", error);
      throw error;
    } finally {
      this.isLoggingIn = false;
    }
  }

  getClient() {
    return this.client;
  }

  async logout() {
    if (this.client) {
      await this.client.logout();
      this.client.stopClient();
      this.client = null;
      this.isReady = false;
    }
  }
}

export const matrixManager = new MatrixClientManager();
