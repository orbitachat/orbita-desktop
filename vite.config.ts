// vite.config.ts
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import electron from 'vite-plugin-electron'

export default defineConfig({
  base: './',
  plugins: [
    react(),
    tailwindcss(),
    electron([
      {
        entry: 'electron/main.ts',
        vite: {
          build: {
            outDir: 'dist-electron',
            rollupOptions: {
              external: [
                'electron', 'fs', 'path', 'os', 'child_process', 'crypto',
                'http', 'https', 'url', 'net', 'tls', 'stream', 'zlib', 'util',
                'events', 'assert', 'buffer', 'querystring', 'string_decoder',
                'timers', 'console', 'dns', 'domain', 'constants', 'punycode',
                'readline', 'repl', 'tty', 'vm', 'worker_threads', 'perf_hooks',
                'async_hooks', 'diagnostics_channel', 'cluster', 'dgram',
                'module', 'process', 'inspector', 'v8', 'wasi',
                'sqlite3',
                'electron-updater',
                'music-metadata',
                'jsmediatags',
              ],
              output: {
                format: 'cjs',
                entryFileNames: '[name].cjs',
              },
            },
            commonjsOptions: {
              include: [],
              ignoreDynamicRequires: true, // игнорируем динамические require
            },
          },
        },
      },
      {
        entry: 'electron/preload.ts',
        onstart(options) {
          options.reload()
        },
        vite: {
          build: {
            outDir: 'dist-electron',
            rollupOptions: {
              external: ['electron', 'fs', 'path', 'os', 'child_process', 'crypto', 'sqlite3'],
              output: {
                format: 'cjs',
                entryFileNames: '[name].cjs',
              },
            },
          },
        },
      },
    ]),
  ],
  esbuild: {
    drop: process.env.NODE_ENV === 'production' ? ['console', 'debugger'] : [],
  },
  build: {
    chunkSizeWarningLimit: 800,
    rollupOptions: {
      input: {
        main: 'index.html',
        call: 'call.html',
      },
      output: {
        manualChunks: {
          'vendor-react': ['react', 'react-dom', 'zustand', 'framer-motion'],
          'vendor-ui': ['lucide-react', 'i18next', 'react-i18next'],
          'vendor-network': ['@supabase/supabase-js', 'ably', 'pusher-js', 'livekit-client'],
          'vendor-crypto': ['@stablelib/x25519', '@stablelib/sha256', '@stablelib/hkdf', 'crypto-js'],
          'vendor-emoji': ['@emoji-mart/data'],
        },
      },
    },
  },
  server: {
    host: '127.0.0.1',
    port: 5173,
    strictPort: true,
  },
})