# Last updated: 2026-03-08 (Per-patient angle calibration; therapist onboarding modal; hyperextension sign fix)

# PhalanX — Claude Code Guide

Hand rehabilitation web app using MediaPipe hand tracking.
Authors: Yash Saoji & Oliver Huelsbeck (2025)

## GitHub

Repository: **https://github.com/yashsaoji1-spec/phalanX**

Default branch: `main`. Feature work goes on `feature/functionality`.

## How to Run

### Local dev (recommended)
```
npm install       # first time only
npm run dev
# opens http://localhost:5173 — full HMR, no python server needed
```

### One-off static server (no build)
> **MediaPipe camera access requires a secure context.** The app works on `localhost` or `https://`. Opening via `file://` may block camera access in Chrome.
> ```
> python3 -m http.server 8080
> # then open http://localhost:8080/index.html
> ```

## Demo Credentials

| Role      | Email                        | Password  |
|-----------|------------------------------|-----------|
| Therapist | sarah.chen@mayoclinic.org    | demo123   |
| Patient   | james.park@gmail.com         | demo123   |

Both accounts live in **Firebase Auth** and **Firestore** (`users` collection). Firebase persists sessions across reloads — users go straight to their dashboard without re-logging in.

## File Structure

```
code/
  index.html      — HTML screens only (~680 lines)
  app.js          — All JS as ES module (~3200 lines)
  styles.css      — All CSS (~1800 lines)
vite.config.mjs   — Vite config (outDir: dist)
firestore.rules   — Firestore security rules
public/
  404.html        — Firebase 404 page (copied verbatim to dist/ by Vite)
dist/             — build output (gitignored); deploy this to Firebase Hosting
non_func/         — LICENSE.txt, devlog.html (non-production files)
node_modules/     — npm packages (vite, firebase, chart.js, prompt-sync)
```

## Dependencies

### npm (bundled by Vite)
- **firebase** `^9.23.0` — Firebase compat SDK (auth + firestore)
- **chart.js** `^4.0.0` — therapist progress charts
- **vite** `^5.0.0` (devDependency) — build tool

### CDN (loaded at runtime — kept on CDN due to WASM complexity)
- **MediaPipe Hands** + `camera_utils` + `drawing_utils` — hand tracking
- **Google Fonts** — DM Sans, DM Mono, Space Mono

## Firebase Hosting

Live URL: **https://phalanx-firebase-database.web.app**

Deploy command (run from project root):
```
npm run build
~/.npm-global/bin/firebase deploy --only hosting
```

Vite outputs content-hashed filenames (e.g. `assets/index-CEDTte8E.js`) to `dist/`. Firebase deploys from `dist/`. **No manual version bumping ever needed** — every build is automatically cache-safe.

## Firebase Setup

Firebase project: `phalanx-firebase-database`

Config is set in `FIREBASE_CONFIG` at the top of `app.js` (Section 1).

### Firestore collections

| Collection      | Document ID          | Fields |
|-----------------|----------------------|--------|
| `users`         | `{email}`            | `{ name, role }` |
| `connections`   | `{therapistEmail}`   | `{ patients: [email, …] }` |
| `protocols`     | `{patientEmail}`     | `{ items: [{ id, exerciseType, reps, sets, frequency, assignedBy, notes?, exerciseParams? }, …] }` |
| `sessions`      | auto-id              | `{ patientEmail, date, reps, rom, pain, tam, therapistEmail, exerciseType, protocolId, jointAngles? }` |
| `messages`      | auto-id              | `{ from, to, participants, text, timestamp, read }` |
| `jointTracking` | `{patientEmail}`     | `{ joints: [key, …], updatedBy }` — therapist's selected joints for this patient |
| `calibration`   | `{patientEmail}`     | `{ createdAt, createdBy, joints: { 'index-pip': { points: [{raw, trueVal}, …] }, … } }` — per-patient angle calibration |

**Backward compat:** old `protocols` docs with a flat object (no `items` array) are transparently wrapped by `getProtocols()` as `[{ id: 'legacy', ...data }]`.

**Session tracking:** `exerciseType` and `protocolId` were added later. Old sessions without these fields are excluded from today's completion count — they cannot be attributed to any current protocol.

**Joint tracking:** `jointAngles` is only present if at least one joint was tracked during the session. Format: `{ 'index-pip': 72, 'middle-mcp': 45, … }` — peak angle (degrees) observed for each tracked joint during that set.

### Required Firestore composite indexes

| Collection | Fields |
|------------|--------|
| `sessions` | `patientEmail` ASC, `date` ASC |
| `messages` | `participants` ARRAY + `timestamp` ASC |
| `messages` | `to` ASC, `from` ASC, `read` ASC |

### Firestore security rules

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /{document=**} {
      allow read, write: if request.auth != null;
    }
  }
}
```

### localStorage (remaining)

No localStorage keys remain. All state is in Firestore.

## Screen System

Single-page app. All screens are `<div class="screen">` in `index.html`. Navigation is done by toggling the `.active` class via `showScreen(id)` in `app.js` (Section 2). `showScreen` also stops `mpCamera` whenever leaving `cameraScreen`.

| Screen ID           | Purpose                                                        |
|---------------------|----------------------------------------------------------------|
| `loginScreen`       | Default landing screen (has `.active`)                         |
| `signupScreen`      | New account registration                                       |
| `forgotScreen`      | Password reset (sends Firebase reset email)                    |
| `pendingScreen`     | Shown to therapist_pending users awaiting admin approval       |
| `adminScreen`       | Admin panel — approve/reject pending therapist accounts        |
| `connectScreen`     | Patient↔therapist link by therapist code                       |
| `patientScreen`     | Patient home (today's protocol strip, streak, completion status) |
| `exercisesScreen`   | All assigned protocols; white cards with blue/dark text; per-protocol done/partial/pending badge + Start/Do Again button |
| `cameraScreen`      | Live exercise session (rep counter, pain slider, plain-English rep cue, set tracker) |
| `therapistScreen`   | Therapist dashboard (patient list + collapsible sections: charts, joint monitoring, session history, protocol form, messages) |
| `progressScreen`    | Patient progress history                                       |
| `messagingScreen`   | In-app patient↔therapist messaging thread                      |
| `calibrationScreen`        | Joint angle calibration tool (MediaPipe read-out, therapist-facing) |
| `patientCalibrationScreen` | 3-pose per-patient calibration flow (therapist-initiated from patient panel) |

## Therapist Onboarding

A one-time modal (`#therapistOnboardingModal`) is shown to every therapist on their **first login**. It is dismissed by clicking "Got it — let's go", which sets `onboardingDone: true` on `users/{email}` in Firestore. Subsequent logins skip the modal.

### What the modal tells the therapist

**Step 1 — Share your clinic code**
Your 6-digit clinic code is shown at the top of your sidebar. Give it to your patient — they enter it on their first login to link to you.

**Step 2 — Assign an exercise protocol**
Click a patient's name → open **Add Exercise to Protocol** → choose an exercise type, set reps/sets/frequency, and save. The patient sees it immediately in their home screen.

**Step 3 — Calibrate the patient's hand**
Click **Calibrate Patient** at the top of any patient panel. Walk through 3 poses with the patient (extension → mid-range → full flexion). At each pose, hit **Capture 3s Sample**, then enter the true goniometer reading for each joint in the **True °** column. Hit **Next Pose** twice, then **Save Calibration**. From that point on, all angle readings during sessions are automatically corrected for that patient.

**Step 4 — Track progress over time**
After each session, open the patient panel to view ROM and pain charts, per-joint angle history (Joint Monitoring), and session logs. Use **Joint Monitoring** to select which joints you want tracked each session.

### Implementation notes
- `showTherapistOnboarding()` — called from `loginSuccess()` when `!currentUser.onboardingDone`
- `dismissTherapistOnboarding()` — hides modal, writes `{ onboardingDone: true }` to `users/{email}`
- Modal is an overlay (`display:none` → `display:flex`) sitting above all screens, same z-index pattern as `#logoutModal`
- `users/{email}` now has an optional `onboardingDone: boolean` field (old docs without it are treated as `false`)

## Role Split

**Patient flow:** `loginScreen` → `patientScreen` → `exercisesScreen` (pick protocol) → `cameraScreen` → back to `patientScreen`

**Therapist flow:** `loginScreen` → `therapistScreen` (sidebar patient list + main panel with collapsible sections)

**Therapist pending flow:** `loginScreen` → `pendingScreen` (blocked until admin approves)

**Admin flow:** `loginScreen` → `adminScreen` (approve/reject pending therapists — admin accounts created manually by Yash in Firebase)

### Multi-protocol flow

- Therapist assigns protocols via "Add Exercise to Protocol" form — each assignment **appends** a new item with a unique `id: Date.now().toString()` to `protocols/{patientEmail}.items`.
- Patient with **1 protocol**: "Start a Session" goes directly to `cameraScreen`.
- Patient with **2+ protocols**: "Start a Session" routes to `exercisesScreen` to pick a protocol.
- `selectedProtocol` global holds the chosen protocol for the active session.
- Completion counting uses `protocolId` (stored on each session doc) to match sessions to current protocols. Deleting a protocol and creating a new one gets a fresh ID — old sessions never count toward new protocol requirements.

### Collapsible therapist panel sections

`makeCollapsible(id, title, bodyHTML, open)` wraps any section in a `.tp-colsec` card with a clickable header (title + ▾ arrow). `toggleTpSection(id)` handles show/hide and dispatches `resize` so Chart.js redraws when chart sections are revealed. Default open: ROM chart, Pain chart. Default collapsed: Joint Monitoring, Session History, Add Exercise to Protocol, Messages.

### Joint Monitoring data flow

1. **Therapist opens patient panel** → `ejsInit(patientEmail, sessions)` loads saved joint keys from `jointTracking/{patientEmail}` in Firestore, populates `selectedJoints`, and calls `renderJointCharts()` to show historical data immediately.
2. **Therapist toggles joints** → `ejsOnSelectionChange()` updates the visual UI, re-renders all charts, and schedules a debounced (800 ms) write to `jointTracking/{patientEmail}`.
3. **Patient starts session** → `startSessionWithProtocol` / `startScanSession` loads joint keys into `trackedJoints[]` and resets `jointMaxAngles = {}`.
4. **Each camera frame** → `updateRepCount` records the peak angle for each tracked joint into `jointMaxAngles`.
5. **Set complete / session saved** → `saveSession` / `completeSessionEarly` writes `jointAngles: { ...jointMaxAngles }` to the session document, then resets `jointMaxAngles` for the next set.
6. **Therapist re-opens panel** → `renderJointCharts` plots one Chart.js line chart per tracked joint, color-coded by finger, showing peak ROM per session. Joints with no recorded data show a "no data yet" message.

### `exerciseParams` schema (inside a protocol item)

For angle-metric exercises:
```js
{ metric: 'angle', conditions: [{ finger, joint, flexAt, extendAt }, ...], requireAll: bool }
```
For distance/abduction exercises the defaults are copied directly (`metric`, `tipA`, `tipB`, etc.).
Angle convention: **0° = straight, higher = more bent** — matches the calibration tool.
Old protocols without `exerciseParams` are auto-normalized at runtime via `normalizeExerciseParams()`. Malformed angle objects (missing both `conditions` and `fingers`) are treated as `null`.

## app.js Section Map

The file uses `/* ══ SECTION N: ... ══ */` banners. Jump to these to find logic:

| Section | Topic |
|---------|-------|
| 1   | Auth & State — Firebase init, `onAuthStateChanged` (calls `getIdToken(true)` before Firestore read to fix auth token race condition; calls `auth.signOut()` in catch to clear stale sessions), async Firestore helpers; globals: `selectedProtocol`, `_exercisesProtocols`, `trackedJoints`, `jointMaxAngles` |
| 2   | Navigation — `showScreen()` (also stops `mpCamera` on leave), `screenTitles` map |
| 3   | Login / Signup / Forgot — async Firebase Auth handlers; therapist signup writes `therapist_pending` role |
| 4   | Connect — therapist code linking flow (async Firestore) |
| 5   | Login Success / Logout — role routing |
| 5b  | Admin Panel — `loadAdminScreen()`, `approveTherapist()`, `rejectTherapist()` |
| 6   | Patient Home — `getTodayCompletion` (filters by `protocolId`), `updatePatientHomeScreen`, `showExercisesScreen` (per-protocol completion badges + white card design), `startSessionWithProtocol` (async — loads `trackedJoints`), `startScanSession` |
| 7   | Protocol System — `EXERCISE_DEFAULTS`, `FINGER_LANDMARK_MAP`, `getProtocols`, `getExistingProtocol`, `assignProtocol` (appends), `deleteProtocol` (removes by id), `normalizeExerciseParams`, `loadTrackedJoints`, `saveTrackedJoints` |
| 8   | Therapist Panel — `showTherapistOnboarding` / `dismissTherapistOnboarding` (first-login modal, sets `onboardingDone: true` in Firestore); `makeCollapsible`, `toggleTpSection`, `showRealPatient` (calls `await ejsInit(patient.email, sessions)`), `buildSessionHistory`, `buildProtocolForm`, `updateExerciseParamsUI`, `epAddCondition`, `epRemoveCondition`; `backToPatientList` (mobile back button) |
| 9   | Rep Counter — `checkExerciseState`, `updateRepCount` (per-joint angle tracking into `jointMaxAngles`), `updateRepFeedback` (plain-English cues), `fingerLabel`, `saveSession` (saves `exerciseType`, `protocolId`, `jointAngles`) |
| 10  | Set Tracking — `initSetTracker` (resets all state including `jointMaxAngles`), `renderSetDots`, `advanceSet`, `completeSessionEarly` (saves `exerciseType`, `protocolId`, `jointAngles`) |
| 11  | Patient Session Camera — `startCamera` (desktop: uses MediaPipe `Camera` class; mobile: direct `getUserMedia` + `requestAnimationFrame` loop, canvas dimensions set from video, aspect ratio adjusted dynamically, canvas mirrored only for front camera; **iOS Safari fix**: `hands.send({ image: sessionCanvas })` — canvas not video, required for iOS); MediaPipe options: `modelComplexity:1` always, `minDetectionConfidence:0.75`, `minTrackingConfidence:0.75`; per-landmark EMA smoother (`sessionSmoothLandmarks`, alpha 0.25 tips / 0.45 joints) + `shiftTipsTowardPalm` (10% toward DIP) applied to draw landmarks only — raw landmarks passed to `updateRepCount`, `flipCamera`, `isMobile` |
| 12  | Progress Screen — session history display |
| 13  | Joint Selector — `buildJointSelector`, `ejsInit` (async — loads saved joints from Firestore, renders charts), `ejsOnSelectionChange` (updates UI + charts + debounced Firestore save), `renderJointCharts` (Chart.js line chart per tracked joint from session history), `ejsToggleJoint`, `ejsRefreshUI`, and related helpers |
| 14  | Calibration Screen — `startCalibration`; MediaPipe options: `modelComplexity:1`, `minDetectionConfidence:0.75`, `minTrackingConfidence:0.75`; readout panel is a static HTML table (columns=fingers THB/IDX/MID/RNG/PNK, rows=MCP/PIP/DIP) updated at 500ms throttle via `calibLastDisplayUpdate`; `calibRebuildReadouts` toggles `cat-active`/`cat-inactive` CSS classes on static table cells; `calibSmoothLandmarks` (EMA, alpha 0.25 tips / 0.45 joints) + `shiftTipsTowardPalm` (10% toward DIP) applied to draw landmarks only; **iOS Safari fix**: draws video to canvas first, then `hands.send({ image: calibCanvas })` |
| 15  | Messaging — `sendMessage`, `renderThread`, `buildMessagePanel`, etc. |
| 16  | Patient Calibration — `loadCalibration`, `applyCalibrationCorrection` (piecewise linear interpolation), `startPatientCalibration`, `pcalibCapture` (3s frame buffer → median), `pcalibNextPose`, `pcalibSave` (writes to `calibration/{patientEmail}`), `pcalibBack`, `pcalibStartCamera`, `pcalibOnResults`; globals: `pcalibPatientEmail`, `pcalibPose`, `pcalibData`, `pcalibFrameBuffer`, `pcalibMedianAngles`, `PCALIB_POSES`, `PCALIB_JOINTS` |

## Firestore Role Values

| `role` value | Meaning |
|---|---|
| `patient` | Full patient access |
| `therapist` | Full therapist dashboard access |
| `therapist_pending` | Awaiting admin approval — blocked from dashboard, sees pendingScreen |
| `admin` | Can approve/reject pending therapists — sees adminScreen only |

Admin accounts are created **manually** by Yash:
1. Firebase Auth console → Add user → set email + password
2. Firestore → `users/{email}` → `{ name: "...", role: "admin" }`

## CSS Variables (styles.css `:root`)

```css
--bg           #F4F6F9                  /* page background (light) */
--surface      #FFFFFF                  /* card/panel background */
--border       #D0D7E3                  /* borders and grid lines */
--accent       #005EB8                  /* blue — primary interactive color */
--accent-dim   rgba(0, 94, 184, 0.1)
--accent-glow  rgba(0, 94, 184, 0.3)
--text         #1A2744                  /* primary text */
--muted        #6B7A99                  /* secondary/disabled text */
--danger       #CC2936                  /* error states, pain indicator */
```

## Maintenance Instructions

Whenever the user says anything resembling "update CLAUDE.md" (or equivalent), Claude must:
1. Read the current `CLAUDE.md`
2. Read and audit `app.js`, `index.html`, and `styles.css` for any changes
3. Update ALL stale sections — file line counts, section map, screen list, localStorage keys, CSS variables, file structure, etc.
4. Replace the date on the top line with today's date
5. Only update `/Users/alpanajoshi/PhalanX_the_real_deal/CLAUDE.md` — the user handles pushing to git
6. **Never commit or push to GitHub unless the user explicitly asks**

## Pre-Launch Checklist

### HIPAA / PHI Compliance — BLOCKING. Do not onboard real patients until all of these are done.

- [ ] **CRITICAL: Set up Google Workspace + Google Cloud Organization** — The Firebase project is currently on a personal Google account. Google will NOT sign a HIPAA Business Associate Agreement (BAA) for personal accounts. You MUST migrate to a Google Cloud Organization (requires Google Workspace, ~$6/user/month) before handling any real patient data. Without a BAA, storing PHI in Firestore is a HIPAA violation regardless of security rules. Steps: (1) Create a Google Workspace account for your org. (2) Move or recreate the Firebase project under that org. (3) Accept the Google Cloud BAA at console.cloud.google.com → IAM & Admin → Settings.
- [ ] **Sign the Google Cloud BAA** — Once on a Cloud Organization, accept the BAA in GCP Console. This is a legal contract with Google; without it no technical safeguard is sufficient for HIPAA.
- [ ] **Tighten Firestore security rules** — Reverted to simple permissive rules (`allow read, write: if request.auth != null`) after the tightened rules caused a login breakage (Firestore permission errors on `users/{email}` read — root cause unresolved). Must be re-investigated and re-deployed before going to production.
- [x] **Add audit logging** — Implemented. `logAudit()` writes to `auditLog` collection on: session save, early session end, protocol assign/delete, patient record viewed, message sent, consent accepted. Append-only; only admins can read via Firestore rules.
- [x] **Add patient consent screen** — Implemented. `consentScreen` shown to patients on first login. Acceptance writes `consentGiven: true` + `consentTimestamp` to `users/{email}`. Stored in Firestore, logged to `auditLog`.
- [x] **Add session timeout** — Implemented. 15-minute inactivity timer via `startInactivityTimer()` / `stopInactivityTimer()`. Resets on click, keypress, mousemove, touchstart, scroll. Timer starts on login, clears on logout.
- [ ] **Enable MFA** — Turn on multi-factor authentication in Firebase Auth Console for all users.
- [ ] **Notice of Privacy Practices** — Legal document explaining PHI use. Must be drafted by a healthcare attorney and shown to every patient.
- [ ] **Breach notification procedure** — Written plan for responding to data exposure (72-hour HHS notification requirement). Must be documented.
- [ ] **Delete demo accounts** — Remove `sarah.chen@mayoclinic.org` and `james.park@gmail.com` from Firebase Auth and Firestore before any real users are onboarded.

### General

- [ ] **Create first real admin account** — follow the manual steps in the Firestore Role Values section above.
- [x] **Test on HTTPS / mobile** — tested via ngrok + VS Code port forwarding on iOS Safari and Chrome. Mobile uses direct `getUserMedia` path (not MediaPipe `Camera` class). `startCamera()` must be called before any `await` in session-start functions to preserve iOS gesture context. iOS Safari requires `hands.send({ image: canvas })` — passing the video element directly does not work; video must be drawn to a canvas first.
- [ ] **Review Firebase Auth settings** — disable any sign-in providers you're not using.

## Key Constraints

- **Vite build step** — run `npm run dev` for local dev; `npm run build` before deploy. No other bundler/compiler.
- **No linter or formatter** — no enforced style rules
- **No test framework** — manual browser testing only
- **MediaPipe stays on CDN** — WASM model files make bundling fragile; accessed via `window.Hands`, `window.Camera`, etc. directly at call sites (not at module init — avoids CDN timing race on mobile)
- **Firebase + Chart.js via npm** — imported at top of `app.js` using `firebase/compat` API (zero refactor needed)
- **Window exports block** — app.js ends with `Object.assign(window, {...})` exposing all functions called from HTML `onclick` attrs (required because app.js is an ES module)
- **Firebase backend** — all user data in Firestore; no localStorage keys remain
- **Single file per layer** — keep all HTML in `index.html`, all JS in `app.js`, all CSS in `styles.css`
