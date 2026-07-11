import { test, expect } from '@playwright/test';
import { loginAs } from './harness';

// ─── J1: patient logs in and starts today's first exercise ───────────────────
// UPDATED (2026-07-11): the home CTA reads "Start Session" before anything is
// logged today and "Continue Session" after (seeded patient1 has a session
// dated today), so match either label. The rebuilt native-camera recording
// screen (2026-06-26) may swap its generic prompt for per-exercise coaching
// copy, so assert on the stable "Record set" button instead of prompt text.
test('J1 patient logs in and starts today\'s first exercise', async ({ page }) => {
  await loginAs(page, 'patient1@demo.test');
  await page.getByRole('button', { name: /start|continue/i }).first().click();
  await expect(page.getByRole('button', { name: /record this set/i }).first()).toBeVisible();
});

// ─── J2: patient records a set and saves it ──────────────────────────────────
// GENUINE FINDING (a): After arriving on the manual-cam screen there is no
// visible "Save", "Done", or "Finish" button. The save sheet only appears after
// the user presses an unlabelled record button (aria-label="Record set video",
// no visible text), performs the exercise, and stops recording. A first-timer
// scanning the screen for a way to log a set finds no obvious affordance — the
// path to saving requires discovering and using an icon-only record control.
// UPDATED (2026-07-11): finishing a session now shows the "Great work!"
// celebration overlay (#sessionSummaryOverlay). "Great work!" also exists in
// the dormant #congratsOverlay inside cameraScreen (old ML flow), so scope the
// assertion to the live overlay or .first() matches the hidden copy.
test('J2 patient records a set and saves it', async ({ page }) => {
  await loginAs(page, 'patient1@demo.test');
  await page.getByRole('button', { name: /start|continue/i }).first().click();
  // a first-timer must find Save without knowing the modal id
  await page.getByRole('button', { name: /done|finish|save/i }).first().click();
  await expect(page.locator('#sessionSummaryOverlay').getByText(/great work/i)).toBeVisible({ timeout: 8000 });
});

// ─── J3: patient sends their therapist a message ─────────────────────────────
// "Messages" nav label matches /message/i so navigation to the thread succeeds.
// GENUINE FINDING (a): The send button is an icon-only SVG element with no
// visible text and no aria-label. getByRole('button', { name: /send/i })
// returns nothing, so the click times out. A first-timer stares at an arrow
// icon with no label to confirm it is the "Send" action.
test('J3 patient sends their therapist a message', async ({ page }) => {
  await loginAs(page, 'patient1@demo.test');
  await page.getByRole('button', { name: /message|chat|therapist/i }).first().click();
  await page.getByRole('textbox').last().fill('Feeling better, thank you.');
  await page.getByRole('button', { name: /send/i }).click();
  await expect(page.getByText('Feeling better, thank you.')).toBeVisible();
});

// ─── J4: therapist assigns a protocol to a patient ───────────────────────────
// BROADENED (b): Original selector /add protocol|assign/i accidentally matched
// "Bulk Assign" (the bulk-assign button) before "Edit Protocol". Bare "assign"
// is too greedy — a layperson looking to assign exercises to one patient would
// scan for "Add" or "Edit Protocol", not "Bulk Assign". Narrowing to
// /add protocol|edit protocol/i correctly targets the per-patient action.
// The modal that opens is the exercise assignment dialog; checking for its
// "Add to Protocol" submit button (or the dialog role) avoids the strict-mode
// collision between the tutorial dialog and generic /exercise/ text.
// UPDATED (2026-07-11): the redesign renamed the per-patient assign action to
// "+ Share from My Library" (opens the "Add Exercise" modal).
test('J4 therapist assigns a protocol to a patient', async ({ page }) => {
  await loginAs(page, 'therapist@demo.test');
  await page.getByText(/pat one/i).first().click();
  await page.getByRole('button', { name: /share from my library/i }).first().click();
  await expect(
    page.getByRole('button', { name: /add to protocol|assign to selected/i }).first()
  ).toBeVisible();
});

// ─── J5: admin approves a pending therapist ──────────────────────────────────
// "Penny Pending" is visible in the pending list and "Approve" button exists.
// GENUINE FINDING (a): After clicking "Approve" the list simply reloads and
// Penny's row disappears — no toast, banner, or confirmation message is ever
// rendered. A first-timer admin has no feedback that the action succeeded and
// is left wondering whether the approval went through.
test('J5 admin approves a pending therapist', async ({ page }) => {
  await loginAs(page, 'admin@demo.test');
  await expect(page.getByText(/penny pending/i)).toBeVisible();
  await page.getByRole('button', { name: /approve/i }).first().click();
  await expect(page.getByText(/approved|success/i).first()).toBeVisible();
});
