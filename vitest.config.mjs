import { defineConfig } from 'vitest/config';

// Dedicated test config so vitest does not inherit `root: 'code'` from
// vite.config.mjs (which hides the repo-root tests/ directory). Rules tests run
// from the repo root so readFileSync('firestore.rules') resolves correctly.
export default defineConfig({
  test: {
    root: '.',
    include: ['tests/**/*.test.js'],
    environment: 'node',
    testTimeout: 15000,
    hookTimeout: 30000,
  },
});
