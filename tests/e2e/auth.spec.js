import { test, expect } from '@playwright/test';
import { waitForScreen, login, signup } from './helpers.js';

// Demo credentials — must exist in the Firebase project under test
const PATIENT_EMAIL = 'james.park@gmail.com';
const PATIENT_PASSWORD = 'demo123';
const THERAPIST_EMAIL = 'sarah.chen@mayoclinic.org';
const THERAPIST_PASSWORD = 'demo123';

test.describe('Login flows', () => {
  test('login screen is shown on first load', async ({ page }) => {
    await page.goto('/');
    await waitForScreen(page, 'loginScreen');
    await expect(page.locator('#loginEmail')).toBeVisible();
    await expect(page.locator('#loginPassword')).toBeVisible();
  });

  test('existing patient can log in and lands on patientScreen', async ({ page }) => {
    await login(page, PATIENT_EMAIL, PATIENT_PASSWORD);
    await waitForScreen(page, 'patientScreen', 15000);
    await expect(page.locator('#patientScreen')).toHaveClass(/active/);
  });

  test('existing therapist can log in and lands on therapistScreen', async ({ page }) => {
    await login(page, THERAPIST_EMAIL, THERAPIST_PASSWORD);
    await waitForScreen(page, 'therapistScreen', 15000);
    await expect(page.locator('#therapistScreen')).toHaveClass(/active/);
  });

  test('wrong password shows login error', async ({ page }) => {
    await login(page, PATIENT_EMAIL, 'wrongpassword');
    await page.waitForTimeout(3000);
    await expect(page.locator('#loginScreen')).toHaveClass(/active/);
    await expect(page.locator('#loginError')).toBeVisible();
  });

  test('forgot password link shows forgotScreen', async ({ page }) => {
    await page.goto('/');
    await waitForScreen(page, 'loginScreen');
    await page.click('text=Forgot password?');
    await waitForScreen(page, 'forgotScreen');
    await expect(page.locator('#forgotScreen')).toHaveClass(/active/);
  });
});

// Signup tests create new Firebase Auth accounts.
// Run via `npm run test:e2e` (with Firebase emulator) for clean, repeatable results.
// Running against a real Firebase project works but leaves behind test accounts.
const USE_EMULATOR = !!process.env.FIREBASE_EMULATOR_HUB;

test.describe('Signup flows', () => {
  test.beforeEach(() => {
    test.skip(!USE_EMULATOR, 'Signup tests require Firebase emulator — run via npm run test:e2e');
  });

  test('new patient signup shows consentScreen', async ({ page }) => {
    const unique = `patient+${Date.now()}@test.com`;
    await signup(page, { name: 'Test Patient', email: unique, password: 'password123', role: 'patient' });
    // Give Firebase time to create the account and navigate
    await waitForScreen(page, 'consentScreen', 20000);
    await expect(page.locator('#consentScreen')).toHaveClass(/active/);
  });

  test('accepting consent shows connectScreen', async ({ page }) => {
    const unique = `patient+${Date.now()}@test.com`;
    await signup(page, { name: 'Test Patient', email: unique, password: 'password123', role: 'patient' });
    await waitForScreen(page, 'consentScreen', 20000);
    await page.check('#consentCheckbox');
    await page.click('#consentScreen button.auth-btn');
    await waitForScreen(page, 'connectScreen', 10000);
    await expect(page.locator('#connectScreen')).toHaveClass(/active/);
  });

  test('new therapist signup shows pendingScreen', async ({ page }) => {
    const unique = `therapist+${Date.now()}@test.com`;
    await signup(page, { name: 'Test Therapist', email: unique, password: 'password123', role: 'therapist' });
    await waitForScreen(page, 'pendingScreen', 20000);
    await expect(page.locator('#pendingScreen')).toHaveClass(/active/);
  });
});
