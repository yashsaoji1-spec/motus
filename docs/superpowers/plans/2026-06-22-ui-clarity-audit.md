# Motus UI Clarity Audit & Polish — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a repeatable audit harness that can reach and exercise every Motus screen, produce a triaged register of every clarity/friction/ambiguity defect, and remediate the known and high-severity findings until the app is usable by a non-technical first-time user with zero instruction.

**Architecture:** Three execution phases. **Phase 0** stands up a Firebase-emulator + seeded-persona + Playwright rig so all 19 screens become reachable and every interaction is scriptable and re-runnable as a regression gate. **Phase 1** walks every screen/interaction against a fixed heuristic rubric and the installed design skills, emitting a single findings register. **Phase 2** fixes the issues that are already known from the codebase (no audit needed). **Phase 3** (audit-driven remediation) is split into separate per-domain plans authored *after* the register exists — because exact fix code cannot be written before the audit identifies the defects.

**Tech Stack:** Vanilla single-file app (`code/index.html` / `code/app.js` / `code/styles.css`), Vite dev server (port 5173), Firebase compat SDK (Auth + Firestore) with emulators (auth :9099, firestore :8181), `@playwright/test` + `@axe-core/playwright` for the audit rig, `firebase-admin` for emulator seeding (both already installed). i18n via `data-i18n` / `data-i18n-ph` attribute keys backed by `en`/`es` dictionaries in `app.js`.

## Adaptation note (read before starting)

This is UI-clarity work, not algorithmic code, so the TDD red→green cycle is adapted — **the "failing test" is a defined acceptance check that currently fails**: a Playwright journey that dead-ends, an axe violation, a contrast measurement below threshold, an i18n key missing from one language, or a reading-level score above grade 6. The discipline is preserved exactly: write the check, run it to confirm it fails, make the minimal fix, run it to confirm it passes, commit. Do not skip the "confirm it fails" step — a green check that was never red proves nothing.

## Global Constraints

- **Single file per layer (D-1):** all HTML in `code/index.html`, all JS in `code/app.js`, all CSS in `code/styles.css`. NEVER split UI into components or new source files. (Test/tooling files under `tests/`, `scripts/`, `docs/` are allowed — they are not app source.)
- **Window exports (D-8):** every function called from an HTML `onclick` MUST be added to the `Object.assign(window, {…})` block at the end of `app.js` (re-grep its location — it is past line 7000, not the stale-map line 6280).
- **Tokens only:** never hardcode colors. Patient screens use `--accent`/`--bg`/`--border` and `--pt-*`; therapist/clinic screens use `--th-*`. The scope class (`.patient-scope` / `.therapist-scope`) MUST stay on the outermost screen `div` — nested patient UI inside a therapist screen inherits cobalt tokens incorrectly.
- **i18n parity:** every user-visible string MUST have a `data-i18n` (text) or `data-i18n-ph` (placeholder) key present in BOTH the `en` and `es` dictionaries (`app.js` `en:`≈line 61, `es:`≈line 202). No hardcoded user-facing English in markup or JS template strings.
- **PHI gate (DEPLOYMENT Phase C):** do NOT add new Firestore collections or store new patient data during UI work. Visual/interaction changes only.
- **Preserve dormant code:** `cameraScreen`, `mlTrainerScreen`, and `app.js` Sections 9–11 & 17 are dormant (`ANGLE_TRACKING_ENABLED = false`). Do NOT delete, ship, or audit them for production. Out of scope.
- **Stale line numbers:** the wiki maps (`~/Documents/Obsidian Vault/wiki/motus/app/*-map.md`) were written pre-merge (Apr 13–14); the merge moved everything. Locate elements by the map's **section name + a `grep -n`**, never by trusting a stale line number.
- **Branch off the merged tip** `fb18dc5`; frequent atomic commits; never force-push.

## The Acceptance Bar ("zero-instruction usability"), operationalized

The vision ("a person with virtually no technological experience could use it without instruction") is measured by these re-runnable gates. The effort is done when all pass on every non-dormant screen:

1. **Journey completion:** every core journey (Task 0.7) is completable by a Playwright script that selects elements ONLY by visible text or ARIA role (never by `#id`), with no dead-ends and no step that requires foreknowledge.
2. **WCAG 2.2 AA (axe):** zero violations of `wcag2a wcag2aa wcag22aa` tags — covers text contrast ≥ 4.5:1, accessible names on all controls, image alt text, visible focus, and target size ≥ 24×24 (aim 44×44).
3. **i18n parity:** `en` and `es` key sets are identical; zero hardcoded user-facing strings (Task 0.6).
4. **Reading level:** every English UI string scores ≤ grade 6 on Flesch–Kincaid (Task 0.6).
5. **State coverage:** every async action renders loading, success, empty, and error states (audited in Task 1.5; fixed in Phase 3).

---

## File Structure

**App source touched by fixes (Phases 2–3 only):**
- `code/index.html` — all screen markup, `data-i18n` keys, control labels
- `code/app.js` — i18n dictionaries, render functions, state handling, window exports
- `code/styles.css` — tokens, contrast, focus, spacing, target sizes

**New audit/tooling infrastructure (created in Phase 0 — not app source):**
- `.env.local` — `VITE_FIREBASE_PROJECT_ID=demo-motus` so app + seed agree on the emulator project
- `tests/seed.mjs` — seeds Auth + Firestore emulators with five personas and their data
- `playwright.config.ts` — Playwright runner config (baseURL 5173, emulator env)
- `tests/audit/harness.ts` — `loginAs(page, persona)`, `gotoScreen(page, id)`, `snapshotAll(page)` helpers + the screen/persona inventory
- `tests/audit/gates.spec.ts` — axe WCAG gate across every screen at 3 viewports
- `tests/audit/journeys.spec.ts` — naive-user core-journey suite
- `scripts/check-i18n-parity.mjs` — `en`/`es` key-set diff + hardcoded-string scan
- `scripts/reading-level.mjs` — Flesch–Kincaid grade over English UI strings
- `docs/superpowers/audits/2026-ui-clarity-register.md` — the findings register (Phase 1 output)

---

## PHASE 0 — Reachability & Audit Harness

*Deliverable: every screen reachable headlessly as any persona, and all five acceptance gates runnable from the CLI.*

### Task 0.1: Feature branch + confirm emulators boot

**Files:** none (environment only)

- [ ] **Step 1: Branch off the merged tip**

```bash
cd /Users/mini/phalanX
git checkout oliver && git checkout -b feature/ui-clarity-audit
git rev-parse --short HEAD   # expect fb18dc5
```

- [ ] **Step 2: Confirm emulators start and ports match firebase.json**

Run: `firebase emulators:start --only auth,firestore` (leave running in a second terminal)
Expected: log shows `Authentication … 127.0.0.1:9099` and `Firestore … 127.0.0.1:8181`. Ctrl-C after confirming, or leave up for later tasks.

- [ ] **Step 3: Commit the branch marker (empty tree is fine — no changes yet, skip if nothing to commit)**

No commit needed yet; proceed.

### Task 0.2: Emulator-connect shim (explicit audit flag — must NOT hijack normal dev)

The app never connects to the emulators, so seeded data is invisible. Add a shim gated on an **explicit `VITE_USE_EMULATORS` flag**, NOT on `import.meta.env.DEV`. Rationale: gating on `DEV` would redirect *every* `npm run dev` (including a developer's real-backend workflow) to the emulators and would require squatting demo values on `.env.local` — which is a real developer's private file (it already held `motus-staging1` credentials and was clobbered once). The audit must be self-contained: a committed `.env.audit` mode file carries the flag, and a dedicated `dev:audit` script runs it. `.env.local` is never touched.

**Files:**
- Modify: `code/app.js` (immediately after the `firebase.initializeApp(...)` call — `grep -n "initializeApp" code/app.js` to locate)
- Create: `.env.audit` (committed — demo values are non-secret)
- Modify: `package.json` (add `dev:audit` script)

**Interfaces:**
- Produces: when `import.meta.env.VITE_USE_EMULATORS === 'true'`, app connects Auth→`127.0.0.1:9099`, Firestore→`127.0.0.1:8181`, using project `demo-motus`. `npm run dev:audit` runs `vite --mode audit` (loads `.env.audit`, which sets the flag); plain `npm run dev` is unaffected.

- [ ] **Step 1: Create committed `.env.audit`** (mode file; `vite --mode audit` overrides `.env.local` for these keys)

```
VITE_FIREBASE_PROJECT_ID=demo-motus
VITE_FIREBASE_API_KEY=demo-key
VITE_FIREBASE_AUTH_DOMAIN=demo-motus.firebaseapp.com
VITE_USE_EMULATORS=true
```

- [ ] **Step 2: Add the `dev:audit` script to `package.json`**

```json
"dev:audit": "vite --mode audit",
```

- [ ] **Step 3: Add the shim after `initializeApp`** (place exactly after the init call returned by the grep)

```javascript
if (import.meta.env.VITE_USE_EMULATORS === 'true') {
  firebase.auth().useEmulator('http://127.0.0.1:9099', { disableWarnings: true });
  firebase.firestore().useEmulator('127.0.0.1', 8181);
  console.info('[motus] Connected to Firebase emulators (audit)');
}
```

- [ ] **Step 4: Verify the app boots against emulators in audit mode** (emulators already running from Task 0.1)

Run: `npm run dev:audit`, then a throwaway Playwright script loads `http://localhost:5173` and captures console.
Expected: `[motus] Connected to Firebase emulators (audit)` appears, login screen renders, no HTTP 400. Then verify **isolation**: confirm `grep -q VITE_USE_EMULATORS .env.local` is FALSE (the flag lives only in `.env.audit`, so plain `npm run dev` will NOT hit emulators).

- [ ] **Step 5: Commit**

```bash
git add code/app.js .env.audit package.json
git commit -m "test: add audit-mode emulator shim gated on VITE_USE_EMULATORS"
```

### Task 0.3: Seed script — five personas + their data

**Files:**
- Create: `tests/seed.mjs`

**Interfaces:**
- Produces personas (password `Demo1234!` for all): `patient1@demo.test` (1 protocol), `patient2@demo.test` (2 protocols → triggers `exercisesScreen`), `therapist@demo.test` (connected to both patients, owns a clinic), `admin@demo.test` (role admin), `pending@demo.test` (role `therapist_pending`).

- [ ] **Step 1: Write the seed script** (schema mirrors `overview.md` Firestore Collections table)

```javascript
import admin from 'firebase-admin';

process.env.FIRESTORE_EMULATOR_HOST ||= '127.0.0.1:8181';
process.env.FIREBASE_AUTH_EMULATOR_HOST ||= '127.0.0.1:9099';
admin.initializeApp({ projectId: 'demo-motus' });
const auth = admin.auth();
const db = admin.firestore();

const PASS = 'Demo1234!';
const personas = [
  { email: 'patient1@demo.test', name: 'Pat One',  role: 'patient' },
  { email: 'patient2@demo.test', name: 'Pat Two',  role: 'patient' },
  { email: 'therapist@demo.test', name: 'Dr. Ther', role: 'therapist' },
  { email: 'admin@demo.test',    name: 'Adam Admin', role: 'admin' },
  { email: 'pending@demo.test',  name: 'Penny Pending', role: 'therapist_pending' },
];

async function run() {
  for (const p of personas) {
    await auth.createUser({ email: p.email, password: PASS }).catch(() => {});
    await db.doc(`users/${p.email}`).set({
      name: p.name, role: p.role, consentGiven: true,
      consentTimestamp: admin.firestore.FieldValue.serverTimestamp(),
    });
  }

  // therapist ↔ both patients
  await db.doc('connections/therapist@demo.test').set({
    patients: ['patient1@demo.test', 'patient2@demo.test'],
  });

  // patient1: one protocol item → single-protocol home
  await db.doc('protocols/patient1@demo.test').set({
    items: [{ id: 'p1a', exerciseType: 'fistMake', reps: 10, sets: 3,
      frequency: 'daily', assignedBy: 'therapist@demo.test', notes: 'Slow and steady.' }],
    demoWatched: [],
  });
  // patient2: two protocol items → exercisesScreen
  await db.doc('protocols/patient2@demo.test').set({
    items: [
      { id: 'p2a', exerciseType: 'fistMake', reps: 10, sets: 3, frequency: 'daily', assignedBy: 'therapist@demo.test' },
      { id: 'p2b', exerciseType: 'wristFlex', reps: 12, sets: 2, frequency: 'twice daily', assignedBy: 'therapist@demo.test' },
    ],
    demoWatched: [],
  });

  // a couple of sessions so progress + history screens have data
  for (const s of [
    { patientEmail: 'patient1@demo.test', reps: 30, pain: 2, exerciseType: 'fistMake' },
    { patientEmail: 'patient2@demo.test', reps: 24, pain: 4, exerciseType: 'wristFlex' },
  ]) {
    await db.collection('sessions').add({
      ...s, date: new Date().toISOString(), protocolId: 'p1a',
      therapistEmail: 'therapist@demo.test',
    });
  }

  // one message thread so messaging renders populated
  await db.collection('messages').add({
    from: 'therapist@demo.test', to: 'patient1@demo.test',
    participants: ['therapist@demo.test', 'patient1@demo.test'],
    text: 'How is the hand feeling today?', read: false,
    timestamp: admin.firestore.FieldValue.serverTimestamp(),
  });

  // therapistLibrary (custom exercise) so My Exercises is non-empty
  await db.doc('therapistLibrary/therapist@demo.test').set({
    customExercises: [], hiddenIds: [], editedBuiltIns: {},
  });

  console.log('Seed complete.');
  process.exit(0);
}
run().catch(e => { console.error(e); process.exit(1); });
```

- [ ] **Step 2: Seed the clinic doc by mirroring the app's own writes**

Read `app.js` Section 5c (`grep -n "function createClinic" code/app.js`) and copy the exact field shape it writes for a clinic into a `db.doc('clinics/...').set({...})` call appended inside `run()`. Do NOT invent fields — mirror `createClinic` so `clinicScreen` / `clinicLibraryScreen` render with real data. (The clinic collection is not in the overview schema table, so the function is the source of truth.)

- [ ] **Step 3: Run the seed against a running emulator**

Run: emulators up, then `node tests/seed.mjs`
Expected: `Seed complete.` and the Emulator UI (`http://127.0.0.1:4000`) shows 5 auth users and the `users`/`connections`/`protocols`/`sessions`/`messages` docs.

- [ ] **Step 4: Verify login now works end-to-end**

Run: `npm run dev`, log in as `patient1@demo.test` / `Demo1234!`.
Expected: lands on `patientScreen` (today's plan visible), no 400.

- [ ] **Step 5: Commit**

```bash
git add tests/seed.mjs
git commit -m "test: seed emulator with five personas and representative data"
```

### Task 0.4: Playwright config + audit harness

**Files:**
- Create: `playwright.config.ts`, `tests/audit/harness.ts`

**Interfaces:**
- Produces: `loginAs(page, email)`, `gotoScreen(page, screenId)`, `snapshotAll(page, label)`, and exported `SCREENS` (id→persona) + `VIEWPORTS` arrays consumed by Tasks 0.5–1.x.

- [ ] **Step 1: Install the runner browsers (if not already) and axe**

```bash
npx playwright install chromium
npm install -D @axe-core/playwright axe-core
```

- [ ] **Step 2: Write `playwright.config.ts`**

```typescript
import { defineConfig, devices } from '@playwright/test';
export default defineConfig({
  testDir: './tests/audit',
  timeout: 30_000,
  use: { baseURL: 'http://localhost:5173', headless: true, viewport: { width: 1280, height: 800 } },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: { command: 'npm run dev:audit', url: 'http://localhost:5173', reuseExistingServer: true },
});
```

- [ ] **Step 3: Write `tests/audit/harness.ts`** (the screen inventory comes from `index-html-map.md`; dormant screens excluded)

```typescript
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
  if (!email) return; // auth screens need no login
  await page.fill('#loginEmail', email);
  await page.fill('#loginPassword', PASS);
  await page.click('text=Sign In');
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
```

- [ ] **Step 4: Smoke-test the harness**

Create a temporary `tests/audit/smoke.spec.ts` that logs in as `patient1@demo.test` and asserts `patientScreen` is visible; run `npx playwright test smoke`. Expected: 1 passed. Delete the smoke file afterward.

- [ ] **Step 5: Commit**

```bash
git add playwright.config.ts tests/audit/harness.ts package.json package-lock.json
echo "tests/audit/shots/" >> .gitignore
git add .gitignore
git commit -m "test: add Playwright audit harness (login/gotoScreen/snapshot helpers)"
```

### Task 0.5: Automated WCAG gate across all screens

**Files:**
- Create: `tests/audit/gates.spec.ts`

**Interfaces:**
- Consumes: `SCREENS`, `VIEWPORTS`, `loginAs`, `gotoScreen` from `harness.ts`.

- [ ] **Step 1: Write the gate spec (this is the "failing check" — it will surface real violations on first run)**

```typescript
import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { SCREENS, VIEWPORTS, loginAs, gotoScreen } from './harness';

for (const screen of SCREENS) {
  test(`a11y: ${screen.id}`, async ({ page }) => {
    await loginAs(page, screen.persona);
    await gotoScreen(page, screen.id);
    const allViolations: string[] = [];
    for (const vp of VIEWPORTS) {
      await page.setViewportSize({ width: vp.width, height: vp.height });
      const results = await new AxeBuilder({ page })
        .withTags(['wcag2a', 'wcag2aa', 'wcag22aa'])
        .include(`#${screen.id}`)
        .analyze();
      for (const v of results.violations) allViolations.push(`${screen.id} @ ${vp.name}: ${v.id}`);
    }
    // accumulate across ALL viewports before asserting, so the baseline is complete
    // (asserting inside the loop would short-circuit at the first failing viewport)
    expect(allViolations, allViolations.join('\n')).toEqual([]);
  });
}
```

- [ ] **Step 2: Run the gate to capture the baseline**

Run: `npx playwright test gates --reporter=list 2>&1 | tee tests/audit/gates-baseline.txt`
Expected: FAILURES — this is the baseline defect set. Record the count; it feeds the register (Task 1.5). Do NOT fix here.

- [ ] **Step 3: Commit the spec only (not the baseline txt)**

```bash
git add tests/audit/gates.spec.ts
git commit -m "test: add axe WCAG 2.2 AA gate for every screen at 3 viewports"
```

### Task 0.6: i18n parity + reading-level scripts

**Files:**
- Create: `scripts/check-i18n-parity.mjs`, `scripts/reading-level.mjs`

- [ ] **Step 1: Write the i18n parity + hardcoded-string scanner**

```javascript
import { readFileSync } from 'node:fs';
const src = readFileSync('code/app.js', 'utf8');

function keysIn(langMarker) {
  // slice from `  en: {` / `  es: {` to the line that closes that top-level block.
  const start = src.indexOf(`\n  ${langMarker}: {`);
  if (start === -1) throw new Error(`marker ${langMarker} not found`);
  const slice = src.slice(start, src.indexOf('\n  },', start));
  return new Set([...slice.matchAll(/^\s*['"]([\w.]+)['"]\s*:/gm)].map(m => m[1]));
}

const en = keysIn('en'), es = keysIn('es');
const missingEs = [...en].filter(k => !es.has(k));
const missingEn = [...es].filter(k => !en.has(k));

const html = readFileSync('code/index.html', 'utf8');
// crude hardcoded-text scan: text nodes >2 chars in elements lacking data-i18n
const hardcoded = [...html.matchAll(/>([A-Za-z][A-Za-z ,.'!?]{2,})</g)]
  .map(m => m[1].trim())
  .filter(t => !/^(px|rem|http)/.test(t));

console.log('Missing in es:', missingEs);
console.log('Missing in en:', missingEn);
console.log('Possible hardcoded HTML strings (review):', [...new Set(hardcoded)].slice(0, 50));
process.exit(missingEs.length || missingEn.length ? 1 : 0);
```

- [ ] **Step 2: Run it to capture baseline parity gaps**

Run: `node scripts/check-i18n-parity.mjs | tee tests/audit/i18n-baseline.txt`
Expected: prints any keys missing from `es`/`en` and a hardcoded-string candidate list. Record for the register.

- [ ] **Step 3: Write the reading-level script (Flesch–Kincaid over English UI strings)**

```javascript
import { readFileSync } from 'node:fs';
const src = readFileSync('code/app.js', 'utf8');
const start = src.indexOf('\n  en: {');
if (start === -1) throw new Error('en marker not found'); // guard: avoid silent exit-0 false-negative
const slice = src.slice(start, src.indexOf('\n  },', start));
const strings = [...slice.matchAll(/:\s*['"]([^'"]{8,})['"]/g)].map(m => m[1]);

const syll = w => (w.toLowerCase().match(/[aeiouy]+/g) || []).length || 1;
function fk(text) {
  const words = text.split(/\s+/).filter(Boolean);
  const sentences = (text.match(/[.!?]+/g) || ['.']).length;
  const syllables = words.reduce((s, w) => s + syll(w), 0);
  return 0.39 * (words.length / sentences) + 11.8 * (syllables / words.length) - 15.59;
}
const flagged = strings.map(s => ({ s, g: +fk(s).toFixed(1) }))
  .filter(x => x.g > 6).sort((a, b) => b.g - a.g);
console.log(`Strings above grade 6 (${flagged.length}):`);
flagged.slice(0, 40).forEach(x => console.log(`  [${x.g}] ${x.s}`));
process.exit(flagged.length ? 1 : 0);
```

- [ ] **Step 4: Run it to capture baseline**

Run: `node scripts/reading-level.mjs | tee tests/audit/reading-baseline.txt`
Expected: lists strings above grade 6. Record for the register.

- [ ] **Step 5: Commit**

```bash
git add scripts/check-i18n-parity.mjs scripts/reading-level.mjs
git commit -m "test: add i18n-parity and reading-level audit scripts"
```

### Task 0.7: Naive-user core-journey suite (the zero-instruction bar)

**Files:**
- Create: `tests/audit/journeys.spec.ts`

**Interfaces:**
- Consumes: `loginAs` from `harness.ts`. **Rule:** selectors use visible text or ARIA role ONLY — never `#id` — because a first-time user navigates by what they can see, not by element IDs.

- [ ] **Step 1: Write the journey suite** (each journey encodes one thing a real user must accomplish unaided)

```typescript
import { test, expect } from '@playwright/test';
import { loginAs } from './harness';

test('J1 patient logs in and starts today\'s first exercise', async ({ page }) => {
  await loginAs(page, 'patient1@demo.test');
  await page.getByRole('button', { name: /start/i }).first().click();
  await expect(page.getByText(/record|set|reps/i).first()).toBeVisible();
});

test('J2 patient records a set and saves it', async ({ page }) => {
  await loginAs(page, 'patient1@demo.test');
  await page.getByRole('button', { name: /start/i }).first().click();
  // a first-timer must find Save without knowing the modal id
  await page.getByRole('button', { name: /done|finish|save/i }).first().click();
  await expect(page.getByText(/saved|great|done/i).first()).toBeVisible({ timeout: 8000 });
});

test('J3 patient sends their therapist a message', async ({ page }) => {
  await loginAs(page, 'patient1@demo.test');
  await page.getByRole('button', { name: /message|chat|therapist/i }).first().click();
  await page.getByRole('textbox').last().fill('Feeling better, thank you.');
  await page.getByRole('button', { name: /send/i }).click();
  await expect(page.getByText('Feeling better, thank you.')).toBeVisible();
});

test('J4 therapist assigns a protocol to a patient', async ({ page }) => {
  await loginAs(page, 'therapist@demo.test');
  await page.getByText(/pat one/i).first().click();
  await page.getByRole('button', { name: /add protocol|assign/i }).first().click();
  await expect(page.getByRole('dialog').or(page.getByText(/exercise/i).first())).toBeVisible();
});

test('J5 admin approves a pending therapist', async ({ page }) => {
  await loginAs(page, 'admin@demo.test');
  await expect(page.getByText(/penny pending/i)).toBeVisible();
  await page.getByRole('button', { name: /approve/i }).first().click();
  await expect(page.getByText(/approved|success/i).first()).toBeVisible();
});
```

- [ ] **Step 2: Run the suite to capture which journeys dead-end**

Run: `npx playwright test journeys --reporter=list 2>&1 | tee tests/audit/journeys-baseline.txt`
Expected: some FAIL (ambiguous/missing affordances). Each failure is a top-severity register entry. Do NOT fix here — failures define the work.

- [ ] **Step 3: Commit**

```bash
git add tests/audit/journeys.spec.ts
git commit -m "test: add naive-user core-journey suite (visible-affordance only)"
```

---

## PHASE 1 — Systematic Audit → Findings Register

*Deliverable: `docs/superpowers/audits/2026-ui-clarity-register.md` — every defect catalogued, triaged, and mapped to a fix owner.*

### Task 1.0: Register schema + severity rubric

**Files:**
- Create: `docs/superpowers/audits/2026-ui-clarity-register.md`

- [ ] **Step 1: Create the register with this exact header and one worked example row**

```markdown
# Motus UI Clarity Findings Register

Severity: **S1** blocks a journey / data loss · **S2** likely to confuse a non-technical user · **S3** polish/inconsistency.
Source: `gates` (axe) · `journey` · `i18n` · `reading` · `heuristic` (manual review).

| ID | Screen | Interaction | Finding | Heuristic | Severity | Evidence | Proposed fix | Status |
|----|--------|-------------|---------|-----------|----------|----------|--------------|--------|
| F-001 | therapistScreen | icon sidebar | Nav icons have no text label or accessible name; a first-timer cannot tell Patients from Clinic from Calibration | Recognition over recall (N6) | S2 | gates: button-name | Add `aria-label` + visible text/tooltip per icon | open |
```

- [ ] **Step 2: Commit**

```bash
git add docs/superpowers/audits/2026-ui-clarity-register.md
git commit -m "docs: add UI clarity findings register schema"
```

### Task 1.1 – 1.4: Per-domain screen audits

Each of these four tasks is identical in *method*, differs only in *scope*. Method per task:

1. For each screen in scope, `loginAs` the persona and `gotoScreen`, then `snapshotAll` at the 3 viewports.
2. Invoke the installed skills against the captured screenshots + live DOM, in this order: **`ux-review`** (Nielsen heuristic pass), **`wcag-audit-patterns`** (a11y patterns), **`web-design-guidelines`** + **`interface-design`** (visual/affordance clarity). Use `ui-ux-pro-max` for a second opinion on contested findings.
3. Walk EVERY interactive element on the screen (enumerate via `await page.$$eval('[onclick],button,a,input,select,textarea', els => …)`) and ask the three grandmother questions: *Where am I? What can I do here? What happens if I tap this?* Any element that fails becomes a finding.
4. Append one register row per finding with a concrete proposed fix and an evidence screenshot path. Do NOT fix anything yet.

- [ ] **Task 1.1 — Auth & onboarding** (S persona/screens): `loginScreen`, `signupScreen`, `forgotScreen`, `consentScreen`, `pendingScreen`, `connectScreen`, plus the `tutorialOverlay` onboarding flow (`grep -n "showTutorialStep" code/app.js`). Commit register additions: `git commit -am "audit: auth + onboarding findings"`.
- [ ] **Task 1.2 — Patient flow:** `patientScreen`, `exercisesScreen`, `manualCamScreen` (+ `setInputModal`, `sessionSummaryOverlay`, `demoVideoOverlay`, `compressionOverlay`), `progressScreen` (+ `videoModal`, `setNotesModal`), `messagingScreen`. Commit: `git commit -am "audit: patient flow findings"`.
- [ ] **Task 1.3 — Therapist & admin:** `therapistScreen` (+ `addProtocolModal`, `protocolLibraryModal`, `manualSessionModal`, `logoutModal`), `adminScreen`. Commit: `git commit -am "audit: therapist + admin findings"`.
- [ ] **Task 1.4 — Clinic:** `clinicScreen`, `createClinicScreen`, `joinClinicScreen`, `clinicLibraryScreen` (+ `shareExerciseModal`). Commit: `git commit -am "audit: clinic flow findings"`.

### Task 1.5: Consolidate automated gates + triage

**Files:**
- Modify: `docs/superpowers/audits/2026-ui-clarity-register.md`

- [ ] **Step 1: Fold the Phase-0 baselines into the register**

Convert every line of `gates-baseline.txt`, `i18n-baseline.txt`, `reading-baseline.txt`, and `journeys-baseline.txt` into register rows (source tagged `gates`/`i18n`/`reading`/`journey`). Journey failures are S1; axe contrast/name failures are S2.

- [ ] **Step 2: Audit state coverage explicitly**

For each async action (enumerate from `app.js`: `login`, `signup`, `loadPatientHome`, `saveProtocol`, `bulkAssignProtocol`, `uploadVideoToStorage`, `finishManualSession`, `sendMessage`, `loadClinicScreen`, `approveTherapist`), confirm it renders loading + success + empty + error. Each missing state = one S2 row.

- [ ] **Step 3: Sort the register by severity; write a one-paragraph summary (counts per severity per domain) at the top.**

- [ ] **Step 4: Commit**

```bash
git commit -am "audit: consolidate gates/i18n/reading/journeys + state-coverage; triage register"
```

**>>> Phase 1 gate:** the register is now the authoritative backlog. Phase 3 plans are authored from it.

---

## PHASE 2 — Known-Issue Remediation (audit-independent)

*These defects are already known from the codebase/wiki; fix them now. Each task: write the failing check, confirm fail, fix, confirm pass, commit.*

### Task 2.1: Clinic token consistency

Wiki history notes clinic classes still use `var(--border)` / `var(--surface)` instead of therapist tokens.

**Files:** Modify `code/styles.css` (Clinic screens block — `grep -n "clinic-invites-section\|clinic-lib-row\|clinic-share-modal" code/styles.css`)

- [ ] **Step 1: Failing check** — `grep -nE "var\(--(border|surface)\)" code/styles.css | grep -i clinic` → expect matches (the defect).
- [ ] **Step 2: Replace** `var(--border)`→`var(--th-border)` and `var(--surface)`→`var(--th-surface)` within clinic-scoped rules only (do not touch patient rules).
- [ ] **Step 3: Verify** the grep from Step 1 now returns nothing AND `npx playwright test gates -g clinic` has no new contrast violations.
- [ ] **Step 4: Commit** `git commit -am "fix: migrate clinic styles to therapist tokens"`

### Task 2.2: Icon-only therapist sidebar — accessible names + labels

**Files:** Modify `code/index.html` (`therapistScreen` sidebar — `grep -n "therapistScreen" code/index.html`), `code/app.js` (en/es dicts), and window exports if any new handler is added.

- [ ] **Step 1: Failing check** — `npx playwright test gates -g therapistScreen` → expect `button-name` violations on sidebar icons.
- [ ] **Step 2: Add `aria-label` (i18n-keyed) + a visible text label or tooltip to each sidebar icon button.** Add the `data-i18n` keys to BOTH `en` and `es` dicts.
- [ ] **Step 3: Verify** the gate from Step 1 passes AND `node scripts/check-i18n-parity.mjs` exits 0.
- [ ] **Step 4: Commit** `git commit -am "fix: label therapist sidebar icons for recognition + a11y"`

### Task 2.3: Destructive-action confirmation parity

`logout` has a confirm modal; `deleteProtocol` and disconnect do not.

**Files:** Modify `code/app.js` (`grep -n "function deleteProtocol\|function disconnect" code/app.js`), reuse the existing `logoutModal` confirm pattern.

- [ ] **Step 1: Failing check** — write `tests/audit/journeys.spec.ts` case `J6`: as therapist, click delete on a protocol and assert a confirmation dialog appears before deletion. Run → FAIL.
- [ ] **Step 2: Wrap `deleteProtocol` and disconnect in a confirm step** mirroring `logoutModal` (i18n-keyed copy, both langs).
- [ ] **Step 3: Verify** J6 passes.
- [ ] **Step 4: Commit** `git commit -am "fix: require confirmation for destructive protocol/disconnect actions"`

### Task 2.4: i18n parity + reading-level sweep

**Files:** Modify `code/app.js` (dicts), `code/index.html` (missing `data-i18n` keys).

- [ ] **Step 1: Failing check** — `node scripts/check-i18n-parity.mjs` (expect missing keys) and `node scripts/reading-level.mjs` (expect strings > grade 6).
- [ ] **Step 2: Add every missing `es`/`en` key; rewrite each flagged string in plainer language** (shorter sentences, common words), keeping meaning. Mirror edits across both languages.
- [ ] **Step 3: Verify** both scripts exit 0.
- [ ] **Step 4: Commit** `git commit -am "fix: close i18n parity gaps and simplify copy to <= grade 6"`

---

## PHASE 3 — Audit-Driven Remediation (separate per-domain plans)

**Scope decision (per writing-plans Scope Check):** the audit-driven fixes span four independent subsystems (auth, patient, therapist, clinic) and cannot be written as exact code until the Phase 1 register exists. Therefore, after Phase 1, author one focused plan per domain:

- `docs/superpowers/plans/<date>-ui-fix-auth.md`
- `docs/superpowers/plans/<date>-ui-fix-patient.md`
- `docs/superpowers/plans/<date>-ui-fix-therapist.md`
- `docs/superpowers/plans/<date>-ui-fix-clinic.md`

Each consumes that domain's register rows and uses this **per-finding task template** (already concrete — instantiate one per row):

````markdown
### Fix F-NNN: <one-line finding>

**Files:** Modify `code/<file>` (locate via wiki map section + `grep -n "<anchor>"`)

- [ ] **Step 1: Failing check** — add/extend the Playwright assertion (gate or journey) that encodes the desired end state; run it; confirm it FAILS for the reason in the register.
- [ ] **Step 2: Apply the minimal fix** — markup/label/token/copy/state change. If a new onclick handler is introduced, add it to the `Object.assign(window,{…})` block. If user-facing text is added, add `data-i18n` keys to BOTH dictionaries.
- [ ] **Step 3: Verify** — the Step-1 check passes; `npx playwright test gates -g <screen>` shows no regressions; `node scripts/check-i18n-parity.mjs` exits 0.
- [ ] **Step 4: Commit** — `git commit -am "fix(<screen>): F-NNN <summary>"`
````

**Done definition for the whole effort:** every acceptance gate (Journeys, axe WCAG, i18n parity, reading level, state coverage) passes green across all non-dormant screens, and the register has zero `open` S1/S2 rows.

---

## Self-Review

**Spec coverage:** "examine every possible user interaction" → Tasks 1.1–1.4 enumerate every interactive element on all 17 non-dormant screens + modals. "Eliminate friction/ambiguity/complexity" → journey suite (0.7), heuristic audit (1.1–1.4), destructive-action confirms (2.3), redundant-step review (1.x heuristic). "Usable with zero instruction by a non-technical person" → operationalized as the five acceptance gates; journeys use visible-affordance-only selectors. "Self-explanatory" → recognition-over-recall fixes (2.2 sidebar labels), plain-language copy (2.4 reading level), onboarding audit (1.1). Coverage complete.

**Placeholder scan:** Phase 0 and Phase 2 contain complete runnable code. Phase 1 audit tasks are procedures, not code — their deliverable is register rows, and the procedure (which skills, which elements, which questions, which output schema) is fully specified. Phase 3 is explicitly deferred to per-domain plans with a fully-worked task template — this is the honest structure because exact fix code for unknown findings would itself be a placeholder.

**Type/name consistency:** `loginAs`/`gotoScreen`/`snapshotAll`/`SCREENS`/`VIEWPORTS`/`PASS` defined in `harness.ts` (0.4) and consumed unchanged in 0.5, 0.7, 1.x. Persona emails and password (`Demo1234!`) consistent between `seed.mjs` (0.3) and `harness.ts` (0.4). Register ID format `F-NNN` consistent between 1.0, 1.5, and the Phase 3 template.

---

## Execution Handoff

(see prompt below)
