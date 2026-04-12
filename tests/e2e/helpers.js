/**
 * Shared helpers for Motus E2E tests.
 * All tests run against the Firebase emulator (Auth + Firestore).
 */

export const EMULATOR_AUTH_URL = 'http://127.0.0.1:9099';
export const EMULATOR_FIRESTORE_URL = 'http://127.0.0.1:8181';

/**
 * Wait for a specific screen to become the active one.
 * Polls until the element has class 'active' or times out.
 */
export async function waitForScreen(page, screenId, timeout = 10000) {
  await page.waitForFunction(
    (id) => document.getElementById(id)?.classList.contains('active'),
    screenId,
    { timeout }
  );
}

/**
 * Log in with email + password via the login form.
 * If the demo patient account has no linked therapist, Motus routes to
 * connectScreen — call window.skipConnect() to bypass it client-side.
 */
export async function login(page, email, password) {
  await page.goto('/');
  await waitForScreen(page, 'loginScreen');
  await page.fill('#loginEmail', email);
  await page.fill('#loginPassword', password);
  await page.click('button.auth-btn');
  // Wait for ANY screen transition away from login
  await page.waitForFunction(
    () => !document.getElementById('loginScreen')?.classList.contains('active'),
    null,
    { timeout: 15000 }
  ).catch(() => {});
  // If demo patient landed on connectScreen, connect to demo therapist.
  // handleConnect() updates Firestore so subsequent runs skip this branch.
  const active = await page.evaluate(() => document.querySelector('.screen.active')?.id);
  if (active === 'connectScreen') {
    await page.fill('#clinicCodeInput', '746167');
    await page.evaluate(() => window.handleConnect());
    await page.waitForFunction(
      (id) => document.getElementById(id)?.classList.contains('active'),
      'patientScreen',
      { timeout: 10000 }
    );
  }
}

/**
 * Sign up a new account via the signup form.
 * role: 'patient' | 'therapist'
 */
export async function signup(page, { name, email, password, role = 'patient' }) {
  await page.goto('/');
  await waitForScreen(page, 'loginScreen');
  await page.click('text=Create one');
  await waitForScreen(page, 'signupScreen');
  await page.fill('#signupName', name);
  await page.fill('#signupEmail', email);
  await page.fill('#signupPassword', password);
  if (role === 'therapist') {
    await page.click('#roleTherapistBtn');
  }
  await page.click('#signupScreen button.auth-btn');
}

/**
 * Stub getUserMedia so camera tests don't require a real device.
 * Returns a silent canvas stream.
 */
export async function stubGetUserMedia(page) {
  await page.addInitScript(() => {
    const canvas = document.createElement('canvas');
    canvas.width = 640;
    canvas.height = 480;
    const stream = canvas.captureStream(30);
    navigator.mediaDevices.getUserMedia = async () => stream;
  });
}
