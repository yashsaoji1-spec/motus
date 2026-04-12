import { test, expect } from '@playwright/test';
import { waitForScreen, login } from './helpers.js';

const THERAPIST_EMAIL = 'sarah.chen@mayoclinic.org';
const THERAPIST_PASSWORD = 'demo123';

test.describe('Therapist protocol flows', () => {
  test.beforeEach(async ({ page }) => {
    await login(page, THERAPIST_EMAIL, THERAPIST_PASSWORD);
    await waitForScreen(page, 'therapistScreen', 15000);
    // Wait for patient list to finish loading
    await page.locator('.patient-item').first().waitFor({ timeout: 10000 });
  });

  test('patient list loads with at least one patient', async ({ page }) => {
    await expect(page.locator('.patient-item').first()).toBeVisible();
  });

  test('can open Add Protocol modal for a patient', async ({ page }) => {
    // Use the known demo patient email — avoids dataset timing issues with async Firestore load
    const patientEmail = 'james.park@gmail.com';

    await page.evaluate((email) => window.openAddProtocol(email, 'James Park'), patientEmail);
    await expect(page.locator('#addProtocolModal')).toBeVisible({ timeout: 5000 });
    await expect(page.locator('#apmSearch')).toBeVisible();
  });

  test('can select an exercise and save a protocol', async ({ page }) => {
    const patientEmail = 'james.park@gmail.com';

    await page.evaluate((email) => window.openAddProtocol(email, 'James Park'), patientEmail);
    await expect(page.locator('#addProtocolModal')).toBeVisible({ timeout: 5000 });

    // Wait for exercise list to populate (openAddProtocol calls apmInit which is async)
    const firstExercise = page.locator('#apmLibList .apm-lib-item').first();
    await firstExercise.waitFor({ timeout: 10000 });
    await firstExercise.click();

    await page.fill('#protocolReps', '12');
    await page.fill('#protocolSets', '4');
    await page.click('#apmSubmitBtn');

    // Modal should close after save
    await expect(page.locator('#addProtocolModal')).toBeHidden({ timeout: 10000 });
  });

  test('can open Bulk Assign modal', async ({ page }) => {
    await page.evaluate(() => window.openBulkAssign());
    await expect(page.locator('#addProtocolModal')).toBeVisible({ timeout: 5000 });
    await expect(page.locator('#bapPatientSection')).toBeVisible();
  });

  test('can search exercises in the Add Protocol modal', async ({ page }) => {
    const patientEmail = 'james.park@gmail.com';

    await page.evaluate((email) => window.openAddProtocol(email, 'James Park'), patientEmail);
    await expect(page.locator('#addProtocolModal')).toBeVisible({ timeout: 5000 });

    // Wait for list to populate then search
    await page.locator('#apmLibList .apm-lib-item').first().waitFor({ timeout: 10000 });
    await page.fill('#apmSearch', 'fist');
    await page.waitForTimeout(300);
    await expect(page.locator('#apmLibList .apm-lib-item').first()).toBeVisible();
  });

  test('can open Protocol Library modal', async ({ page }) => {
    await page.evaluate(() => window.openProtocolLibrary());
    await expect(page.locator('#protocolLibraryModal')).toBeVisible({ timeout: 5000 });
  });
});
