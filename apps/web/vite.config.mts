/// <reference types='vitest' />
import { nxReadySignal } from '@nx/vite/plugins/nx-ready-signal.plugin';
import react from '@vitejs/plugin-react';
import { defaultClientConditions, defineConfig } from 'vite';

/** Paths the server owns (see `apps/server/src/static.ts`); the dev server forwards them. */
const serverPrefixes = ['/api', '/auth', '/mcp', '/.well-known'];

export default defineConfig(() => ({
  root: import.meta.dirname,
  cacheDir: '../../node_modules/.vite/apps/web',
  resolve: {
    // Read workspace libraries from source, like the server's `--conditions=simmery`.
    conditions: ['simmery', ...defaultClientConditions],
  },
  server: {
    port: 4200,
    host: 'localhost',
    proxy: Object.fromEntries(
      serverPrefixes.map((prefix) => [prefix, { target: 'http://localhost:3000' }]),
    ),
  },
  preview: {
    port: 4300,
    host: 'localhost',
  },
  plugins: [react(), nxReadySignal()],
  build: {
    outDir: './dist',
    emptyOutDir: true,
    reportCompressedSize: true,
  },
  test: {
    name: 'web',
    watch: false,
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    include: ['src/**/*.test.{ts,tsx}'],
    reporters: ['default'],
    coverage: {
      reportsDirectory: './test-output/vitest/coverage',
      provider: 'v8' as const,
    },
  },
}));
