import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],

  // SQLite WASM must be served as-is (not pre-bundled) so its internal
  // locateFile() can resolve the .wasm binary at runtime.
  optimizeDeps: {
    exclude: ['@sqlite.org/sqlite-wasm'],
  },

  // Workers are ES modules; Comlink requires this.
  worker: {
    format: 'es',
  },

  // Include WASM assets in the build graph
  assetsInclude: ['**/*.wasm'],

  build: {
    rollupOptions: {
      output: {
        // Ensure worker chunks are not mangled in a way that breaks WASM loading
        manualChunks: undefined,
      },
    },
  },

  server: {
    headers: {
      // Required for SharedArrayBuffer (used by SQLite WASM OPFS sync access)
      'Cross-Origin-Opener-Policy':   'same-origin',
      'Cross-Origin-Embedder-Policy': 'require-corp',
    },
  },
});
