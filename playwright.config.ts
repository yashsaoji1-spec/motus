import { defineConfig, devices } from '@playwright/test';
export default defineConfig({
  testDir: './tests/audit',
  timeout: 30_000,
  use: { baseURL: 'http://localhost:5173', headless: true, viewport: { width: 1280, height: 800 } },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: { command: 'npm run dev:audit', url: 'http://localhost:5173', reuseExistingServer: true },
});
