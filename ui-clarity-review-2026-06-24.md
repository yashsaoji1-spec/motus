# Code Review — `feature/ui-clarity-audit-on-main` (actionable)

Reviewed line-by-line vs `origin/main` (HEAD `3216aac`). **Verdict: merge-worthy after the MUST-FIX
items below, then smoke-test on staging before prod.** No security, data-integrity, or flow-breaking
blockers. Locations are given by symbol/selector (line numbers are approximate — search by name).

> Context for the agent: the emulator shim, the new `confirmModal`, error-handling, i18n wiring, and
> backend-constraint compliance were all reviewed and are CORRECT — do **not** change them (see
> "Verified safe" at the bottom). Fix the items below only.

---

## MUST FIX before merge

### 1. [MAJOR] Undefined CSS variable `var(--font)` → serif fallback
- **File:** `code/styles.css`
- **Where:** the 4 new rules added on this branch — `.admin-approval-banner`, `.apm-assign-error`, and
  the grouped `.clinic-loading-msg, .clinic-load-error` block.
- **Problem:** they use `var(--font)`, which is **not defined** in the project (tokens are `--th-font`
  and `--pt-font`). These elements render in the browser serif default (Times), not the app font.
- **Fix:** replace `var(--font)` → `var(--th-font)` in all 4 rules (therapist/admin/clinic scope).
- **Acceptance:** `grep -n "var(--font)" code/styles.css` returns nothing; banners render in the app sans-serif.

### 2. [MAJOR] WCAG AA contrast pass is incomplete (or the claim is overstated)
- **File:** `code/styles.css`
- **Problem:** the new tokens that WERE applied all pass AA (verified: `#0369A1` on `#F0F9FF` = 5.57:1).
  But many failing text usages were **not** migrated:
  - `color: var(--pt-primary)` (#0EA5E9 ≈ 2.6:1) still on real text: `.pt-btn-outline`, an icon button,
    `.pt-field-label`, a button rule, `.m-kicker` (patient scope).
  - Only ~5 of ~26 `color: var(--th-muted)` (#94A3B8 ≈ 2.56:1) text usages migrated; ~21 still fail
    (e.g. several therapist labels, `.m-kicker` therapist scope).
- **Fix (choose one):** (a) finish the sweep — change the remaining `color: var(--pt-primary)` and
  `color: var(--th-muted)` *text* usages to the darker `-text` tokens; OR (b) if a full pass isn't
  intended yet, update the audit register / PR description to say "partial AA pass" so it isn't overstated.
- **Acceptance:** either no `color: var(--pt-primary)`/`var(--th-muted)` remains on text elements, or the
  register explicitly scopes the coverage.

---

## SHOULD FIX (minor, non-blocking)

### 3. [MINOR] `assignProtocol` button label wrong after a failed demo upload
- **File:** `code/app.js` — function `assignProtocol`.
- **Problem:** `origSubmitText` is captured **after** the demo-upload block sets the button to
  "Uploading demo...", so on the error-retry path (modal stays open) the button restores to
  "Uploading demo..." instead of "Add to Protocol"/"Save Changes".
- **Fix:** capture `origSubmitText` **before** the demo-upload block (or reset the label right after upload).
- **Acceptance:** force a protocol save with a demo video where the Firestore write fails → the button
  shows its normal label, not "Uploading demo...".

### 4. [MINOR] `bulkAssignProtocol` doesn't restore button text
- **File:** `code/app.js` — `bulkAssignProtocol` `finally`.
- **Fix:** restore the submit button text in `finally` (it currently only closes the modal). Low impact
  (resets on reopen), but make it consistent.

### 5. [MINOR] Destructive-confirm migration is partial (3 of 11)
- The branch migrated 3 native `confirm()` calls to `confirmModal` (deleteProtocol, disconnectFromTherapist,
  rejectTherapist). For consistency with the stated goal, migrate the remaining native `confirm()` sites:
  clinic regen/remove/disband/leave, clinic-library removal, session-save retry, demo-video removal,
  **account deletion**, and disconnectPatient. i18n the new strings (en + es). Optional but completes the goal.

### 6. [MINOR] Intentionally-failing journey tests will redden CI
- **File:** `tests/audit/journeys.spec.ts` (J2, J3, J5).
- **Problem:** these assert the *original* findings, so they fail by design — they'd break a green-build CI
  gate (we want to wire CI soon).
- **Fix:** now that F-001/F-002/F-003 are fixed, update J2/J3/J5 to assert the **fix** (should pass), or
  mark `test.fail()` / move to a non-gating project.
- **Acceptance:** `npx playwright test` is green, or the expected-fail tests are explicitly isolated.

### 7. [MINOR] Pin new devDependency versions
- **File:** `package.json` — drop the `^` on the 4 new devDeps (`firebase-tools`, `@playwright/test`,
  `axe-core`, `@axe-core/playwright`) for reproducible CI installs.

### 8. [MINOR] Defense-in-depth guard in `tests/seed.mjs`
- Before the destructive `DELETE .../documents` reset, assert `FIRESTORE_EMULATOR_HOST` starts with
  `127.0.0.1`/`localhost`, so it can never run against a real host even if env vars are overridden.

### 9. [NIT] Confirm `.gitignore` intent
- The `.gitignore` change now tracks `docs/superpowers/` and all `scripts/*.mjs`. Confirm that's intended.

---

## Verified safe — do NOT change
- **Emulator shim (`VITE_USE_EMULATORS`):** provably cannot leak to prod — statically tree-shaken from
  `vite build`, `.env.audit` is never loaded by a prod build, App Check enforcement untouched, CSP blocks
  emulator connections. Correct as-is.
- **`confirmModal`:** fails closed (Cancel = no action), focus + Escape handled, cannot double-fire,
  callback errors surfaced. More accessible than the existing `logoutModal`.
- **Error paths** consistently re-enable buttons/inputs; the message draft is preserved on send failure.
- **All new element IDs resolve** against the HTML — no broken JS references.
- **Backend constraints respected:** session docs use `date` (not `timestamp`); consent gate, audit
  `actorId == auth.uid`, and App Check enforcement are all untouched.
- **No dead angle-tracking code touched.**

## Note: two seeders coexist (not a conflict)
`tests/seed.mjs` = emulator/test seeding (5 personas). Root `seed.js` = PROD demo data via a
service-account key. Keep both — different purposes. Don't merge them.
