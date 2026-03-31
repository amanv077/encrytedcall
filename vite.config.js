import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],

  // SQLite WASM requires the module to be served directly (not pre-bundled)
  // and needs SharedArrayBuffer-enabling headers in dev.
  optimizeDeps: {
    exclude: ['@sqlite.org/sqlite-wasm'],
  },

  // Ensure WASM workers use ES module format
  worker: {
    format: 'es',
  },

  server: {
    headers: {
      // Required for SharedArrayBuffer (used by SQLite WASM OPFS)
      'Cross-Origin-Opener-Policy': 'same-origin',
      'Cross-Origin-Embedder-Policy': 'require-corp',
    },
  },
});
