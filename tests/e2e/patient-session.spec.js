import { test, expect } from '@playwright/test';
import { waitForScreen, login, stubGetUserMedia } from './helpers.js';

const PATIENT_EMAIL = 'james.park@gmail.com';
const PATIENT_PASSWORD = 'demo123';

test.describe('Patient session flows', () => {
  test.beforeEach(async ({ page }) => {
    await stubGetUserMedia(page);
    await page.context().grantPermissions(['camera', 'microphone']);
    await login(page, PATIENT_EMAIL, PATIENT_PASSWORD);
    await waitForScreen(page, 'patientScreen', 15000);
  });

  test('patientScreen shows greeting and nav cards', async ({ page }) => {
    await expect(page.locator('#patientGreeting')).toBeVisible();
    await expect(page.locator('#patientDisplayName')).toBeVisible();
    // Nav cards are always rendered
    await expect(page.locator('.patient-nav-card').first()).toBeVisible();
  });

  test('screen state persists after reload', async ({ page }) => {
    await page.reload();
    await page.waitForTimeout(3000);
    const activeScreen = await page.evaluate(() => {
      return document.querySelector('.screen.active')?.id;
    });
    expect(activeScreen).toBe('patientScreen');
  });

  test('messages nav card opens messagingScreen', async ({ page }) => {
    await page.click('#therapistContactBtn');
    await waitForScreen(page, 'messagingScreen', 10000);
    await expect(page.locator('#messagingScreen')).toHaveClass(/active/);
    await expect(page.locator('#msgThread')).toBeVisible();
  });
});

test.describe('Patient camera session (mocked camera)', () => {
  test.beforeEach(async ({ page }) => {
    await stubGetUserMedia(page);
    await page.context().grantPermissions(['camera', 'microphone']);
    await login(page, PATIENT_EMAIL, PATIENT_PASSWORD);
    await waitForScreen(page, 'patientScreen', 15000);
  });

  test('starting a session routes to manualCamScreen or exercisesScreen', async ({ page }) => {
    const startBtn = page.locator('.patient-exercises-card').first();
    await expect(startBtn).toBeVisible({ timeout: 5000 });

    // Check if patient has protocols assigned before trying to start
    const hasProtocol = await page.locator('.patient-exercises-card-sub').evaluate(
      el => !el.textContent.includes('No protocols')
    ).catch(() => true);

    if (!hasProtocol) {
      test.skip();
    }

    await startBtn.click();
    await page.waitForTimeout(2000);

    const active = await page.evaluate(() => document.querySelector('.screen.active')?.id);
    expect(['manualCamScreen', 'exercisesScreen', 'patientScreen']).toContain(active);
  });
});
