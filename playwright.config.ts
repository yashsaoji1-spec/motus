import { defineConfig, devices } from '@playwright/test';
export default defineConfig({
  testDir: './tests/audit',
  timeout: 30_000,
  use: {
    baseURL: 'http://localhost:5173', headless: true, viewport: { width: 1280, height: 800 },
    // Sandboxes with a system chromium (no downloaded PW browsers) set this
    // to the browser binary, e.g. PLAYWRIGHT_CHROMIUM_PATH=/opt/pw-browsers/chromium
    ...(process.env.PLAYWRIGHT_CHROMIUM_PATH
      ? { launchOptions: { executablePath: process.env.PLAYWRIGHT_CHROMIUM_PATH } }
      : {}),
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: { command: 'npm run dev:audit', url: 'http://localhost:5173', reuseExistingServer: true },
});
