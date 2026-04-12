import { defineConfig } from '@playwright/test';

// Use a dedicated port for E2E tests so they never accidentally pick up
// a dev server from a different project running on the default 5173.
const TEST_PORT = 5179;

export default defineConfig({
  testDir: 'tests/e2e',
  timeout: 30000,
  retries: 0,
  use: {
    baseURL: `http://localhost:${TEST_PORT}`,
    headless: true,
    viewport: { width: 1280, height: 800 },
  },
  projects: [
    { name: 'chromium', use: { browserName: 'chromium' } },
  ],
  webServer: {
    command: `npm run dev -- --mode e2e --port ${TEST_PORT}`,
    url: `http://localhost:${TEST_PORT}`,
    reuseExistingServer: false,
    timeout: 15000,
  },
});
