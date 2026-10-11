import { resolve } from 'node:path'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { nodePolyfills } from 'vite-plugin-node-polyfills'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    // GramJS (MTProto client) relies on Node core modules (buffer, crypto,
    // stream, events, process, util) that don't exist in a browser/extension
    // context — this polyfills them at build time. `vm` is explicitly
    // excluded: GramJS never imports it, and its browser shim uses eval(),
    // which Manifest V3's CSP forbids.
    nodePolyfills({
      exclude: ["vm"],
      globals: { Buffer: true, global: true, process: true },
    }),
    react(),
  ],
  build: {
    rollupOptions: {
      input: {
        // The popup/side-panel UI.
        index: resolve(import.meta.dirname, 'index.html'),
        // The scheduler's background service worker — its own bundle, no
        // HTML page around it, referenced directly by manifest.json's
        // background.service_worker as "background.js".
        background: resolve(import.meta.dirname, 'src/background.ts'),
      },
      output: {
        entryFileNames: (chunk) => (chunk.name === 'background' ? 'background.js' : 'assets/[name]-[hash].js'),
      },
    },
  },
})
