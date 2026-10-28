import { defineConfig } from 'vitest/config';

export default defineConfig(() => ({
  root: import.meta.dirname,
  cacheDir: '../../node_modules/.vite/apps/server',
  test: {
    name: 'server',
    watch: false,
    globals: true,
    environment: 'node',
    // Each test file starts a cold PGlite (WASM initdb) in its first hook; on a
    // busy CI runner that alone can pass Vitest's 10s default.
    hookTimeout: 30_000,
    include: ['{src,tests}/**/*.{test,spec}.{js,mjs,cjs,ts,mts,cts,jsx,tsx}'],
    reporters: ['default'],
    coverage: {
      reportsDirectory: './test-output/vitest/coverage',
      provider: 'v8' as const,
    },
  },
}));
