import { Page } from '@playwright/test';

export const PASS = 'Demo1234!';
export const VIEWPORTS = [
  { name: 'mobile',  width: 375,  height: 812 },
  { name: 'tablet',  width: 768,  height: 1024 },
  { name: 'desktop', width: 1280, height: 800 },
];

// screenId -> persona that can reach it. Dormant (cameraScreen, mlTrainerScreen) excluded.
export const SCREENS: { id: string; persona: string }[] = [
  { id: 'loginScreen',         persona: '' },
  { id: 'signupScreen',        persona: '' },
  { id: 'forgotScreen',        persona: '' },
  { id: 'consentScreen',       persona: 'patient1@demo.test' },
  { id: 'pendingScreen',       persona: 'pending@demo.test' },
  { id: 'connectScreen',       persona: 'patient1@demo.test' },
  { id: 'patientScreen',       persona: 'patient1@demo.test' },
  { id: 'exercisesScreen',     persona: 'patient2@demo.test' },
  { id: 'manualCamScreen',     persona: 'patient1@demo.test' },
  { id: 'progressScreen',      persona: 'patient1@demo.test' },
  { id: 'messagingScreen',     persona: 'patient1@demo.test' },
  { id: 'therapistScreen',     persona: 'therapist@demo.test' },
  { id: 'adminScreen',         persona: 'admin@demo.test' },
  { id: 'clinicScreen',        persona: 'therapist@demo.test' },
  { id: 'createClinicScreen',  persona: 'therapist@demo.test' },
  { id: 'joinClinicScreen',    persona: 'therapist@demo.test' },
  { id: 'clinicLibraryScreen', persona: 'therapist@demo.test' },
];

export async function loginAs(page: Page, email: string) {
  await page.goto('/');
  if (!email) { await page.waitForFunction(() => typeof (window as any).showScreen === 'function'); return; }
  await page.fill('#loginEmail', email);
  await page.fill('#loginPassword', PASS);
  await page.getByRole('button', { name: 'Sign In', exact: true }).click();
  await page.waitForFunction(() => !document.getElementById('loginScreen')?.offsetParent, { timeout: 10_000 });
}

export async function gotoScreen(page: Page, id: string) {
  // showScreen is a window export (D-8); driving it directly is the reliable way to reach any screen.
  await page.evaluate((sid) => (window as any).showScreen(sid), id);
  await page.waitForTimeout(400); // allow render/transition
}

export async function snapshotAll(page: Page, label: string) {
  for (const vp of VIEWPORTS) {
    await page.setViewportSize({ width: vp.width, height: vp.height });
    await page.waitForTimeout(250);
    await page.screenshot({ path: `tests/audit/shots/${label}-${vp.name}.png`, fullPage: true });
  }
}
