# Last updated: 2026-03-15 (video bitrate 400 kbps, 30-day soft expiry, download button in session history + video modal)

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
  index.html      — all HTML screens
  app.js          — all JS logic (16 sections + Section 5b + window exports block)
  styles.css      — all styles
vite.config.mjs   — Vite config (root: code/, outDir: ../dist)
firestore.rules   — Firestore security rules
.gitignore        — ignores dist/, node_modules/, .vscode/
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

### External APIs (no SDK — plain fetch)
- **Cloudinary** — session video storage; unsigned uploads via `phalanx-videos` preset to cloud `dslbugsdg`; free tier 25 GB. Constants `CLOUDINARY_CLOUD` / `CLOUDINARY_PRESET` at top of Section 1. Bitrate: **400 kbps** (~3 MB/min). At typical 5-min sessions (~15 MB each), the 25 GB free tier holds ~1,600 sessions.

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
| `sessions`      | auto-id              | `{ patientEmail, date, reps, rom, pain, tam, therapistEmail, exerciseType, protocolId, jointAngles?, videoUrl? }` |
| `calibration`   | `{patientEmail}`     | `{ joints: { [key]: { points: [{ raw, trueVal }, …] } } }` — per-joint piecewise correction from 3-pose calibration |
| `messages`      | auto-id              | `{ from, to, participants, text, timestamp, read }` |
| `jointTracking` | `{patientEmail}`     | `{ joints: [key, …], updatedBy }` — therapist's selected joints for this patient |

**Backward compat:** old `protocols` docs with a flat object (no `items` array) are transparently wrapped by `getProtocols()` as `[{ id: 'legacy', ...data }]`.

**Session tracking:** `exerciseType` and `protocolId` were added later. Old sessions without these fields are excluded from today's completion count — they cannot be attributed to any current protocol.

**Joint tracking:** `jointAngles` is only present if at least one joint was tracked during the session. Format: `{ 'index-pip': 72, 'middle-mcp': 45, … }` — peak angle (degrees) observed for each tracked joint during that set.

**Video recording:** `videoUrl` is only present if the session was recorded and successfully uploaded. Points to a Cloudinary `https://res.cloudinary.com/…` URL. Sessions recorded on unsupported browsers (iOS Safari) or before the feature was added have no `videoUrl` field — shown as "No video" in session history. After 30 days the UI shows "Expired" and removes access — the Cloudinary file still exists but is inaccessible through the app. See Pre-Launch Checklist for actual server-side deletion setup.

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

| Screen ID                  | Purpose                                                        |
|----------------------------|----------------------------------------------------------------|
| `loginScreen`              | Default landing screen (has `.active`)                         |
| `signupScreen`             | New account registration                                       |
| `forgotScreen`             | Password reset (sends Firebase reset email)                    |
| `consentScreen`            | First-time patient consent (data collection disclosure + checkbox) |
| `pendingScreen`            | Shown to therapist_pending users awaiting admin approval       |
| `adminScreen`              | Admin panel — approve/reject pending therapist accounts        |
| `connectScreen`            | Patient↔therapist link by therapist code                       |
| `patientScreen`            | Patient home (today's protocol strip, streak, completion status) |
| `exercisesScreen`          | All assigned protocols; white cards with blue/dark text; per-protocol done/partial/pending badge + Start/Do Again button |
| `cameraScreen`             | Live exercise session (rep counter, pain slider, plain-English rep cue, set tracker, REC indicator while recording) |
| `therapistScreen`          | Therapist dashboard (patient list + collapsible sections: charts, joint monitoring, session history, protocol form, messages) |
| `progressScreen`           | Patient progress history                                       |
| `messagingScreen`          | In-app patient↔therapist messaging thread                      |
| `calibrationScreen`        | Joint angle calibration — therapist-facing MediaPipe read-out  |
| `patientCalibrationScreen` | 3-pose patient calibration flow (Extension → Mid-Range → Full Flexion); therapist-initiated; stores correction data in `calibration/{patientEmail}` |

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
| 1   | Auth & State — Firebase init, `onAuthStateChanged`, async Firestore helpers; globals: `selectedProtocol`, `_exercisesProtocols`, `trackedJoints`, `jointMaxAngles`, `editingProtocolId`, `editingPatientEmail`, `currentCalibration`, `mediaRecorder`, `recordedChunks`, `recordingSupported`, `_pendingSessionDocId`; Cloudinary constants `CLOUDINARY_CLOUD`, `CLOUDINARY_PRESET` |
| 2   | Navigation — `showScreen()` (also stops `mpCamera` on leave), `screenTitles` map |
| 3   | Login / Signup / Forgot — async Firebase Auth handlers; therapist signup writes `therapist_pending` role; `acceptConsent()` for consent screen |
| 4   | Connect — therapist code linking flow (async Firestore) |
| 5   | Login Success / Logout — role routing; `requestLogout`, `closeLogoutModal`, `confirmLogout` |
| 5b  | Admin Panel — `loadAdminScreen()`, `approveTherapist()`, `rejectTherapist()` |
| 6   | Patient Home — `getTodayCompletion` (filters by `protocolId`), `updatePatientHomeScreen`, `showExercisesScreen` (per-protocol completion badges + white card design), `startSessionWithProtocol` (async — loads `trackedJoints`), `startScanSession`, `sendMessageFromPatient` |
| 7   | Protocol System — `EXERCISE_DEFAULTS`, `FINGER_LANDMARK_MAP`, `getProtocols`, `getExistingProtocol`, `assignProtocol` (appends), `deleteProtocol` (removes by id), `editProtocol`, `cancelEditProtocol`, `normalizeExerciseParams`, `loadTrackedJoints`, `saveTrackedJoints` |
| 8   | Therapist Panel — `makeCollapsible`, `toggleTpSection`, `showRealPatient` (calls `await ejsInit(patient.email, sessions)`), `buildSessionHistory(sessions, patientName)` (session cards: date/exercise top-left, "▶ Watch" + "↓" buttons top-right, stats row below; videos >30 days old show "Expired"; download filename includes patient name), `buildProtocolForm`, `updateExerciseParamsUI`, `epAddCondition`, `epRemoveCondition`; `backToPatientList` (mobile back button); `showTherapistOnboarding`, `dismissTherapistOnboarding` |
| 9   | Rep Counter — `checkExerciseState`, `updateRepCount` (per-joint angle tracking into `jointMaxAngles`; applies `applyCalibrationCorrection()`), `updateRepFeedback` (plain-English cues), `fingerLabel`, `saveSession` (saves `exerciseType`, `protocolId`, `jointAngles`; two-step: Firestore first, then Cloudinary upload in background, then `update({videoUrl})`); `toggleSound`, `skipRest`, `dismissSummary` |
| 10  | Set Tracking — `initSetTracker` (resets all state including `jointMaxAngles`), `renderSetDots`, `advanceSet`, `completeSessionEarly` (saves `exerciseType`, `protocolId`, `jointAngles`; same two-step video pattern as `saveSession`) |
| 11  | Patient Session Camera — `startCamera` (desktop: uses MediaPipe `Camera` class; mobile: direct `getUserMedia` + `requestAnimationFrame` loop, canvas dimensions set from video, aspect ratio adjusted dynamically, canvas mirrored only for front camera; **iOS Safari fix**: `hands.send({ image: sessionCanvas })` — canvas not video, required for iOS); calls `startRecording(sessionCanvas)` after camera starts; `flipCamera` discards pre-flip footage and restarts recording; `isMobile`; recording utilities: `getRecordingMimeType`, `startRecording` (**400 kbps** via `videoBitsPerSecond: 400_000`), `stopRecording`, `uploadSessionVideo` (Cloudinary fetch), `showRecordingIndicator`, `hideRecordingIndicator`, `openVideoModal(videoUrl, sessionDate, patientName)` (wires modal download button), `closeVideoModal`, `downloadSessionVideo(url, date, patientName)` (fetches blob → triggers download as `phalanx-session-{PatientName}-{YYYY-MM-DD}.{ext}`; falls back to `window.open` if fetch blocked by CORS) |
| 12  | Progress Screen — session history display |
| 13  | Joint Selector (Enhanced) — `buildJointSelector`, `ejsInit` (async — loads saved joints from Firestore, renders charts), `ejsOnSelectionChange` (updates UI + charts + debounced Firestore save), `renderJointCharts` (Chart.js line chart per tracked joint from session history), `ejsToggleJoint`, `ejsRefreshUI`, `ejsDotClick`, `ejsSelectCard`, `ejsToggleFromInfo`, `ejsRemoveChip`, `ejsQuickSelectFinger`, `ejsSelectAll`, `ejsClearAll` |
| 14  | Calibration Screen — `startCalibration` uses same desktop/mobile split as `startCamera`: desktop uses MediaPipe `Camera` class; mobile uses direct `getUserMedia` + `requestAnimationFrame`, sets `.calib-camera-wrap` aspect ratio from video dimensions to prevent distortion; **iOS Safari fix**: draws video to canvas first, then `hands.send({ image: calibCanvas })`; `calibBack` |
| 15  | Messaging — `sendMessage`, `renderThread`, `buildMessagePanel`, etc. |
| 16  | Patient Calibration — therapist-initiated 3-pose calibration (`PCALIB_POSES`: Extension, Mid-Range, Full Flexion); `startPatientCalibration`, `pcalibCapture`, `pcalibNextPose`, `pcalibSave`, `pcalibBack`; `loadCalibration` (reads `calibration/{patientEmail}` from Firestore); `applyCalibrationCorrection` (piecewise linear interpolation applied to raw joint angles during session) |

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
--bg             #F0F7F4                    /* page background (light green-tinted) */
--surface        #FFFFFF                    /* card/panel background */
--border         #C8D8D4                    /* borders and grid lines */
--accent         #0B6CB0                    /* blue — primary interactive color */
--accent-dim     rgba(11, 108, 176, 0.08)
--accent-glow    rgba(11, 108, 176, 0.25)
--text           #1A2744                    /* primary text */
--muted          #6B7A99                    /* secondary/disabled text */
--danger         #CC2936                    /* error states, pain indicator */
--green          #10B981                    /* success / positive states */
--green-dark     #059669
--green-dim      rgba(16, 185, 129, 0.08)
--green-glow     rgba(16, 185, 129, 0.25)
--gold           #F59E0B                    /* streaks / achievement highlights */
--gold-dim       rgba(245, 158, 11, 0.1)
--gradient-cta          linear-gradient(135deg, #0B6CB0, #10B981)
--gradient-cta-hover    linear-gradient(135deg, #0960A0, #059669)
--gradient-hero         linear-gradient(135deg, #0B6CB0 0%, #0A5DA0 40%, #10B981 100%)
--gradient-surface      linear-gradient(180deg, #E8F4FD, #F0F7F4)
```

## Maintenance Instructions

Whenever the user says anything resembling "update claude-functionality.md" (or equivalent), Claude must:
1. Read the current `claude-functionality.md`
2. Read and audit `app.js`, `index.html`, and `styles.css` for any changes
3. Update ALL stale sections — file line counts, section map, screen list, localStorage keys, CSS variables, file structure, etc.
4. Replace the date on the top line with today's date
5. Only update `/Users/alpanajoshi/Documents/Yash - Projects/phalanX-feature-functionality/claude-functionality.md` — the user handles pushing to git
6. **Never commit or push to GitHub unless the user explicitly asks**

## Pre-Launch Checklist

- [ ] **Tighten Firestore security rules** — current rules allow any authenticated user to read/write everything. Before launch, scope rules so patients can only read/write their own data, therapists can only access their connected patients, and admins can only access the `users` collection.
- [ ] **Delete demo accounts** — remove `sarah.chen@mayoclinic.org` and `james.park@gmail.com` from Firebase Auth and Firestore, or change their passwords.
- [ ] **Create first real admin account** — follow the manual steps in the Firestore Role Values section above.
- [x] **Test on HTTPS / mobile** — tested via ngrok + VS Code port forwarding on iOS Safari and Chrome. Mobile uses direct `getUserMedia` path (not MediaPipe `Camera` class). `startCamera()` must be called before any `await` in session-start functions to preserve iOS gesture context. iOS Safari requires `hands.send({ image: canvas })` — passing the video element directly does not work; video must be drawn to a canvas first.
- [ ] **Review Firebase Auth settings** — disable any sign-in providers you're not using.
- [ ] **Set up video expiry Cloud Function** — currently the 30-day expiry is UI-only (files remain on Cloudinary but are inaccessible through the app). For actual deletion at launch: (1) upgrade Firebase project `phalanx-firebase-database` to Blaze plan at https://console.firebase.google.com/project/phalanx-firebase-database/usage/details — free in practice, just requires a billing account attached; (2) tell Claude "set up the video expiry Cloud Function" — it will create `functions/index.js` with a daily scheduled job that deletes Cloudinary videos older than 30 days and clears `videoUrl` from Firestore. Cloudinary credentials: cloud `dslbugsdg`, API key `853184729123867`, API secret in Yash's password manager.

## Key Constraints

- **Vite build step** — run `npm run dev` for local dev; `npm run build` before deploy. No other bundler/compiler.
- **No linter or formatter** — no enforced style rules
- **No test framework** — manual browser testing only
- **MediaPipe stays on CDN** — WASM model files make bundling fragile; accessed via `window.Hands`, `window.Camera`, etc. directly at call sites (not at module init — avoids CDN timing race on mobile)
- **Firebase + Chart.js via npm** — imported at top of `app.js` using `firebase/compat` API (zero refactor needed)
- **Cloudinary via plain fetch** — no SDK; `uploadSessionVideo` POSTs a `FormData` blob to `https://api.cloudinary.com/v1_1/{cloud}/video/upload` with an unsigned preset. No auth required. Deletion requires signed API call with secret — done server-side only (Cloud Function).
- **Window exports block** — app.js ends with `Object.assign(window, {...})` exposing all functions called from HTML `onclick` attrs (required because app.js is an ES module)
- **Firebase backend** — all user data in Firestore; no localStorage keys remain
- **Single file per layer** — keep all HTML in `index.html`, all JS in `app.js`, all CSS in `styles.css`
