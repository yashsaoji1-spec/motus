# Last updated: 2026-03-23 (Section 17: ML Angle Trainer added — per-hand per-joint model training, MobileNet visual features, angle coverage histogram, session notes, finger config panel, collapsible stats/models UI; screen persistence via sessionStorage; handedness inversion fix)

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
  app.js          — all JS logic (17 sections + Section 5b + window exports block)
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
- **TensorFlow.js** (`@tensorflow/tfjs@4.x`) + **`@tensorflow-models/mobilenet@2.1.0`** — ML model training and inference; MobileNetV1 α=0.25 (~1MB) used as frozen feature extractor for hybrid angle models
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
| `calibration`   | `{patientEmail}`     | `{ joints: { [key]: { angle, metricVal } }, recordedAt, recordedBy }` — best angle per joint from sweep calibration; `metricVal` is the 0–1 orientation metric value at time of recording (whichever metric was specified in `SWEEP_JOINT_RULES[key].metric`) |
| `messages`      | auto-id              | `{ from, to, participants, text, timestamp, read }` |
| `jointTracking`   | `{patientEmail}`           | `{ joints: [key, …], updatedBy }` — therapist's selected joints for this patient |
| `trainingChunks`  | auto-id                    | `{ joint, samples: [{ landmarks, trueAngle, imageFeatures?, notes?, fingerConfig?, recordedAt, recordedBy }], chunkIndex, createdAt }` — 30 samples/chunk; `imageFeatures` is 256 floats from MobileNet (absent on old samples); `notes` is free-text session context; `fingerConfig` is `{ thumb, index, middle, ring, pinky }` booleans |
| `trainingMeta`    | `{joint-hand}` e.g. `index-mcp-left` | `{ totalSamples, chunkCount, lastUpdated, histogram: { b0…b17: count } }` — `b0` = 0–9°, `b17` = 170–179°; histogram updated via `FieldValue.increment` at submit time |
| `mlModels`        | `{joint-hand}` e.g. `index-mcp-right` | `{ type: 'hybrid'\|'landmarks', topology, weights, sampleCount, trainedAt, trainedBy }` — `type` absent on old docs = treated as `'landmarks'`; `topology` = `JSON.stringify(model.toJSON())`; `weights` = array of flat float arrays |

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

### localStorage

| Key | Value | Purpose |
|-----|-------|---------|
| `ml_session_notes` | string | ML Trainer session notes textarea — persists across page refreshes; not synced to Firestore |

### sessionStorage

| Key | Value | Purpose |
|-----|-------|---------|
| `phalanx_screen` | screen ID string | Last active non-auth screen — restored on page refresh via `restoreScreen()` in `loginSuccess()` |

Auth screens excluded from persistence: `loginScreen`, `signupScreen`, `forgotScreen`, `consentScreen`, `pendingScreen`, `adminScreen`.

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
| `calibrationScreen`        | Therapist-facing live joint angle diagnostic (Section 14); in HTML/JS but not accessible from UI currently |
| `sweepCalibrationScreen`   | Sweep calibration — therapist sweeps rear camera around patient's stationary hand (Section 16); wired to UI via "Sweep Calibration" button in `showRealPatient()`; records joint angles only when **Start Capture** is pressed AND camera orientation satisfies per-joint rules in `SWEEP_JOINT_RULES`; 13 of 14 joints have empirically-derived rules (ring-dip left null — MediaPipe landmarks unreliable for that joint); clicking a dot resets that joint with a 3s cooldown |
| `mlTrainerScreen`          | ML Angle Trainer — therapist trains per-joint per-hand angle regression models (Section 17); left/right hand auto-detected from MediaPipe; angle set via slider + submit; shows coverage histogram with suggested angle; collapsible sample counts + trained models panels; session notes textarea |

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
| 1   | Auth & State — Firebase init, `onAuthStateChanged`, async Firestore helpers; globals: `selectedProtocol`, `_exercisesProtocols`, `trackedJoints`, `jointMaxAngles`, `editingProtocolId`, `editingPatientEmail`, `mediaRecorder`, `recordedChunks`, `recordingSupported`, `_pendingSessionDocId`; Cloudinary constants `CLOUDINARY_CLOUD`, `CLOUDINARY_PRESET` |
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
| 16  | Sweep Calibration — full rules-based hand tracking system; see expanded section below |
| 17  | ML Angle Trainer — `loadMLModels`, `loadMLFeatureExtractor`, `extractVisualFeatures`, `submitMLSample`, `trainMLModel`, `getTrainedAngle`, `mlOnResults`, `mlRefreshSampleCounts`, `mlRenderCoverage`, `mlUseSuggested`, `mlToggleStats`, `mlToggleModels`, `mlSaveNotes`, `mlToggleFinger`, `mlSetFingerPreset`; globals: `_mlModels` (Map), `_mlCurrentHand`, `_mlFeatureExtractor`, `_currentFrameFeatures`, `_currentHandLabel`, `_mlFingerConfig`, `_mlSuggestedAngle` |

## Section 16: Sweep Calibration — Full Hand Tracking Code Reference

Every line that touches hand tracking in Section 16, in execution order.

---

### Constants

```js
const SWEEP_DEBUG           = true;   // shows METRICS panel + debug log; set false before production wiring
const SWEEP_REQUIRED_FRAMES = 5;      // how many consecutive in-rule frames must pass before an angle is recorded — anti-noise
```

### Per-Joint Orientation Rules

Each entry is an **array** of `{ metric, min, max }` — OR logic, any one passing = joint is valid for recording. `null` = joint will never be recorded.

```js
const SWEEP_JOINT_RULES = {
  'thumb-mcp':  [{ metric: 'palmNormalZ',    min: 0.70, max: 1.0 }],
  'thumb-pip':  [{ metric: 'palmNormalZ',    min: 0.70, max: 1.0 }],
  'index-mcp':  [{ metric: 'fingerZ_index',  min: 0.25, max: 1.0 }],
  'index-pip':  [{ metric: 'fingerZ_index',  min: 0.25, max: 1.0 }],
  'index-dip':  [{ metric: 'fingerZ_index',  min: 0.25, max: 1.0 }],
  'middle-mcp': [{ metric: 'fingerZ_middle', min: 0.55, max: 1.0 }],
  'middle-pip': [{ metric: 'lateralZ',       min: 0.70, max: 1.0 }],
  'middle-dip': [{ metric: 'lateralZ',       min: 0.70, max: 1.0 }],
  'ring-mcp':   [{ metric: 'fingerZ_ring',   min: 0.35, max: 1.0 }],
  'ring-pip':   [{ metric: 'fingerZ_ring',   min: 0.25, max: 1.0 }],
  'ring-dip':   null,  // MediaPipe landmarks unreliably skewed — no trustworthy pose found
  'pinky-mcp':  [{ metric: 'fingerZ_pinky',  min: 0.25, max: 1.0 }],
  'pinky-pip':  [{ metric: 'lateralZ',       min: 0.70, max: 1.0 }],
  'pinky-dip':  [{ metric: 'palmNormalZ',    min: 0.20, max: 1.0 }],
};
```

Rules were derived empirically: for each joint, held at max flexion and swept camera until reading was accurate, then logged the DEBUG METRICS panel values. The `min` threshold is set ~0.05–0.15 below the lowest observed accurate value as a buffer.

**OR-logic check:** `rules.some(r => metrics[r.metric] >= r.min && metrics[r.metric] <= r.max)`

**All metrics use `Math.abs()`** — rules are symmetric for left and right hand.

**Multiple windows:** joints can have multiple rules if they're accurate in different orientations. `middle-mcp` currently has one window (`fingerZ_middle >= 0.55`) but may get a second (`lateralZ >= 0.70`) once confirmed.

---

### One Euro Filter (landmark smoothing)

Applied to every landmark's x/y/z every frame, **before** any metric computation, angle computation, or drawing. This eliminates jitter from MediaPipe's raw output.

```js
const SWEEP_ONE_EURO_MINCUTOFF = 1.0;   // base smoothing strength (higher = more smoothing at rest)
const SWEEP_ONE_EURO_BETA      = 0.1;   // speed-adaptive coefficient (higher = less lag when moving)
const SWEEP_ONE_EURO_DCUTOFF   = 1.0;   // derivative filter cutoff
const _sweepFilterStates = {};           // per-landmark-per-axis filter state, keyed as '${i}-x/y/z'

function sweepOneEuroFilter(id, rawValue, timestamp) {
  // First call for this id: bootstrap state, return raw value unchanged
  if (!_sweepFilterStates[id]) {
    _sweepFilterStates[id] = { prevValue: rawValue, prevDeriv: 0, prevTime: timestamp };
    return rawValue;
  }
  const state   = _sweepFilterStates[id];
  const dt      = (timestamp - state.prevTime) || (1 / 60);   // seconds since last frame; floor at 60fps
  const alpha_d = calibAlphaFor(SWEEP_ONE_EURO_DCUTOFF, dt);  // derivative smoothing factor (from Section 14)
  const deriv   = alpha_d * ((rawValue - state.prevValue) / dt) + (1 - alpha_d) * state.prevDeriv; // smoothed velocity
  const cutoff  = SWEEP_ONE_EURO_MINCUTOFF + SWEEP_ONE_EURO_BETA * Math.abs(deriv); // adaptive cutoff: faster motion = less smoothing
  const alpha   = calibAlphaFor(cutoff, dt);                  // position smoothing factor
  const value   = alpha * rawValue + (1 - alpha) * state.prevValue; // exponential moving average
  state.prevValue = value;
  state.prevDeriv = deriv;
  state.prevTime  = timestamp;
  return value;   // NOTE: no Math.round — landmark coords are normalized floats (0.0–1.0)
}
```

**Reuses `calibAlphaFor(cutoff, dt)` from Section 14 (line ~2482):**
```js
function calibAlphaFor(cutoff, dt) {
  const r = 2 * Math.PI * cutoff * dt;
  return r / (r + 1);   // standard first-order IIR smoothing alpha
}
```

---

### Joint Definitions (from Section 14)

```js
// CALIB_FINGERS (Section 14, line ~2438) — reused by SWEEP_JOINTS
// Each joint definition: { a, b, c } = landmark indices for angle calculation (a-b-c)
// angle = angle at vertex b, between rays b→a and b→c
const CALIB_FINGERS = {
  thumb:  { mcp: { a:0, b:2,  c:3  }, pip: { a:2,  b:3,  c:4  }, dip: null },
  index:  { mcp: { a:0, b:5,  c:6  }, pip: { a:5,  b:6,  c:7  }, dip: { a:6,  b:7,  c:8  } },
  middle: { mcp: { a:0, b:9,  c:10 }, pip: { a:9,  b:10, c:11 }, dip: { a:10, b:11, c:12 } },
  ring:   { mcp: { a:0, b:13, c:14 }, pip: { a:13, b:14, c:15 }, dip: { a:14, b:15, c:16 } },
  pinky:  { mcp: { a:0, b:17, c:18 }, pip: { a:17, b:18, c:19 }, dip: { a:18, b:19, c:20 } },
};

// SWEEP_JOINTS: flat array derived from CALIB_FINGERS at module load; thumb-dip excluded (null)
// Each entry: { key: 'finger-joint', finger, joint, def: { a, b, c } }
const SWEEP_JOINTS = (() => {
  const out = [];
  for (const [finger, joints] of Object.entries(CALIB_FINGERS)) {
    for (const [joint, def] of Object.entries(joints)) {
      if (!def) continue;
      out.push({ key: `${finger}-${joint}`, finger, joint, def });
    }
  }
  return out;
})();
// Results in 14 entries: thumb-mcp, thumb-pip, index-mcp, index-pip, index-dip,
// middle-mcp, middle-pip, middle-dip, ring-mcp, ring-pip, ring-dip,
// pinky-mcp, pinky-pip, pinky-dip
```

---

### Angle Calculation (from Section 14)

```js
// calibGetAngle(a, b, c) — Section 14, line ~2503
// Returns angle in degrees at vertex b, between landmark vectors b→a and b→c
// 0° = fully straight, higher = more bent. Uses full 3D (x, y, z).
function calibGetAngle(a, b, c) {
  const ba = { x: a.x-b.x, y: a.y-b.y, z: (a.z||0)-(b.z||0) };
  const bc = { x: c.x-b.x, y: c.y-b.y, z: (c.z||0)-(b.z||0) };
  const dotVal = ba.x*bc.x + ba.y*bc.y + ba.z*bc.z;
  const magBA  = Math.sqrt(ba.x**2 + ba.y**2 + ba.z**2);
  const magBC  = Math.sqrt(bc.x**2 + bc.y**2 + bc.z**2);
  if (magBA === 0 || magBC === 0) return 0;
  const cos = Math.max(-1, Math.min(1, dotVal / (magBA * magBC)));  // clamp to [-1,1] for numerical safety
  return Math.round(180 - Math.acos(cos) * (180 / Math.PI));
}
```

---

### Orientation Metrics

Computed every frame from smoothed landmarks. All values 0–1. Yash uses these to write `SWEEP_JOINT_RULES` after goniometer testing.

```js
function sweepComputeMetrics(landmarks) {
  const lateralZ    = Math.abs(normZ(landmarks[5], landmarks[17]));  // z-component of MCP1→MCP5 axis; how "side-on" the camera is to the whole hand
  const palmNormalZ = Math.abs(sweepPalmNormalZ(landmarks));          // z-component of palm normal; how face-on vs edge-on the camera sees the palm
  return {
    lateralZ,
    palmNormalZ,
    fingerZ_thumb:  Math.abs(normZ(landmarks[2],  landmarks[3])),   // z-component of thumb proximal bone direction
    fingerZ_index:  Math.abs(normZ(landmarks[5],  landmarks[6])),   // z-component of index proximal bone direction
    fingerZ_middle: Math.abs(normZ(landmarks[9],  landmarks[10])),  // z-component of middle proximal bone direction
    fingerZ_ring:   Math.abs(normZ(landmarks[13], landmarks[14])),  // z-component of ring proximal bone direction
    fingerZ_pinky:  Math.abs(normZ(landmarks[17], landmarks[18])),  // z-component of pinky proximal bone direction
  };
}

// z-component of the normalized direction vector from landmark a to landmark b
function normZ(a, b) {
  const dx = b.x - a.x, dy = b.y - a.y, dz = (b.z || 0) - (a.z || 0);
  const mag = Math.sqrt(dx * dx + dy * dy + dz * dz);
  return mag === 0 ? 0 : dz / mag;
}

// z-component of the palm normal vector (cross product of two palm edge vectors from wrist)
// positive when palm faces camera, negative when palm faces away
function sweepPalmNormalZ(landmarks) {
  const w = landmarks[0], p1 = landmarks[5], p5 = landmarks[17];  // wrist, index MCP, pinky MCP
  const ax = p5.x - w.x, ay = p5.y - w.y, az = (p5.z || 0) - (w.z || 0);  // wrist→pinky MCP
  const bx = p1.x - w.x, by = p1.y - w.y, bz = (p1.z || 0) - (w.z || 0);  // wrist→index MCP
  const cz = ax * by - ay * bx;  // z-component of cross product a×b
  const mag = Math.sqrt((ay * bz - az * by) ** 2 + (az * bx - ax * bz) ** 2 + cz ** 2);
  return mag === 0 ? 0 : cz / mag;
}
```

---

### False-Positive Rejection

Run on **raw** (unsmoothed) landmarks before filtering, to catch garbage detections fast.

```js
function sweepIsRealHand(landmarks) {
  // For each of 4 fingers: MCP→PIP segment (d1) must be proportionally longer than PIP→DIP (d2)
  // This matches real hand anatomy; faces/objects produce random proportions and fail
  const fingers = [
    [5, 6, 7],    // index:  MCP, PIP, DIP
    [9, 10, 11],  // middle: MCP, PIP, DIP
    [13, 14, 15], // ring:   MCP, PIP, DIP
    [17, 18, 19], // pinky:  MCP, PIP, DIP
  ];
  let passes = 0;
  for (const [a, b, c] of fingers) {
    const d1 = Math.hypot(landmarks[b].x - landmarks[a].x, landmarks[b].y - landmarks[a].y); // MCP→PIP length
    const d2 = Math.hypot(landmarks[c].x - landmarks[b].x, landmarks[c].y - landmarks[b].y); // PIP→DIP length
    // d1 must be meaningful (>0.01), d2 must be meaningful (>0.005),
    // d1 must be at least half of d2, d2 must be at least a quarter of d1
    if (d1 > 0.01 && d2 > 0.005 && d1 >= d2 * 0.5 && d2 >= d1 * 0.25) passes++;
  }
  return passes >= 3;  // at least 3 of 4 fingers must pass — robust to one partially-occluded finger
}
```

---

### Distance Indicator

Informational only — does NOT block recording. Uses wrist (0) → middle MCP (9) normalized span.

```js
function sweepDistanceStatus(landmarks) {
  const w = landmarks[0], m = landmarks[9];
  const d = Math.sqrt((w.x - m.x) ** 2 + (w.y - m.y) ** 2);
  if (d < 0.12) return 'too_far';    // hand very small in frame
  if (d > 0.38) return 'too_close';  // hand very large in frame
  return 'good';
}
```

---

### MediaPipe Configuration (`startSweepCalibration`)

```js
// MediaPipe Hands loaded from CDN at runtime (not bundled — WASM files too large)
const hands = new window.Hands({
  locateFile: file => `https://cdn.jsdelivr.net/npm/@mediapipe/hands/${file}`,
});
hands.setOptions({
  maxNumHands: 1,          // only track one hand at a time
  modelComplexity: 1,      // 1 = full model (more accurate, slightly slower than 0)
  minDetectionConfidence: 0.85,   // threshold to start tracking a new hand detection
  minTrackingConfidence: 0.75,    // threshold to keep tracking an existing hand
});
hands.onResults(sweepOnResults);  // sweepOnResults is called every frame
_sweepMpHands = hands;

sweepStartCamera();  // camera startup delegated to sweepStartCamera (handles mobile/desktop split)
```

---

### Camera Startup and Flip (`sweepStartCamera` / `sweepFlipCamera`)

Camera startup is extracted into `sweepStartCamera()` and called by both `startSweepCalibration` and `sweepFlipCamera`. Uses the same mobile/desktop split as the patient-side camera (Section 11).

**Mobile path** (iOS Safari fix — same as Section 11):
```js
// window.Camera doesn't reliably handle camera switching on mobile.
// Use requestAnimationFrame loop + direct getUserMedia instead.
let active = true;
_sweepMpCamera = { stop: () => { active = false; } };  // stub so caller can stop before stream arrives

navigator.mediaDevices.getUserMedia({ video: { facingMode: _sweepFacingMode }, audio: false })
  .then(stream => {
    video.srcObject = stream;
    const offCanvas = document.createElement('canvas');  // offscreen canvas — iOS Safari fix
    const offCtx    = offCanvas.getContext('2d');         // hands.send needs canvas on iOS, not video

    const processFrame = async () => {
      if (!active) return;
      if (video.readyState >= 2) {
        offCanvas.width  = video.videoWidth;   // match video dimensions each frame
        offCanvas.height = video.videoHeight;
        offCtx.drawImage(video, 0, 0, offCanvas.width, offCanvas.height);
        try { await _sweepMpHands.send({ image: offCanvas }); } catch(e) {}
      }
      if (active) requestAnimationFrame(processFrame);  // next frame
    };

    video.onloadedmetadata = () => {
      // Apply mirror based on facing mode: front camera mirrored, rear camera not
      const mirror = _sweepFacingMode === 'user' ? 'scaleX(-1)' : 'none';
      video.style.transform = mirror;
      document.getElementById('sweepCanvas').style.transform = mirror;
      video.play();
      if (overlay)    overlay.classList.add('hidden');
      video.classList.add('ready');
      processFrame();
    };

    _sweepMpCamera = {
      stop: () => {
        active = false;
        stream.getTracks().forEach(t => t.stop());  // release hardware camera
        video.srcObject = null;
        video.classList.remove('ready');
      }
    };
  });
```

**Desktop path**: uses `window.Camera` class (reliable on desktop, not on mobile).

**Flip**:
```js
function sweepFlipCamera() {
  _sweepFacingMode = _sweepFacingMode === 'environment' ? 'user' : 'environment';
  if (_sweepMpCamera) { _sweepMpCamera.stop(); _sweepMpCamera = null; }
  Object.keys(_sweepFilterStates).forEach(k => delete _sweepFilterStates[k]);  // clear filter history — camera angle changed
  sweepStartCamera();  // restarts with new facing mode
}
```

**Default facing mode**: `_sweepFacingMode = 'environment'` (rear camera) — set in `startSweepCalibration` on entry. Mirror (`scaleX(-1)`) is applied to both `#sweepVideo` and `#sweepCanvas` only when facing is `'user'`; removed from CSS so it can be toggled correctly on flip.

---

### Per-Frame Tracking Pipeline (`sweepOnResults`)

Called by MediaPipe every frame. Full execution order:

**1. Center-crop canvas to square** (matches CSS `object-fit: cover` on the video element)
```js
const srcW = results.image.width, srcH = results.image.height;
const size = Math.min(srcW, srcH);
const cropX = (srcW - size) / 2, cropY = (srcH - size) / 2;
canvas.width = size; canvas.height = size;
ctx.drawImage(results.image, cropX, cropY, size, size, 0, 0, size, size);
```

**2. Early exit if no hand detected**
```js
if (results.multiHandLandmarks.length === 0) { /* clear UI, return */ }
```

**3. False-positive check on raw landmarks**
```js
const rawLandmarks = results.multiHandLandmarks[0];
if (!sweepIsRealHand(rawLandmarks)) { /* clear UI, reset frame counts, return */ }
```

**4. Smooth all 21 landmarks with One Euro Filter**
```js
const t = performance.now() / 1000;  // timestamp in seconds
const landmarks = rawLandmarks.map((lm, i) => ({
  ...lm,
  x: sweepOneEuroFilter(`${i}-x`, lm.x, t),
  y: sweepOneEuroFilter(`${i}-y`, lm.y, t),
  z: sweepOneEuroFilter(`${i}-z`, lm.z || 0, t),
}));
// All further computation uses smoothed landmarks
```

**5. Draw skeleton on canvas** (reuses Section 14's `calibDrawLandmarks`)
```js
// Remap to cropped-square coords first (drawing only — computation uses normalized coords)
const drawLandmarks = landmarks.map(lm => ({
  ...lm,
  x: (lm.x * srcW - cropX) / size,
  y: (lm.y * srcH - cropY) / size,
}));
calibDrawLandmarks(ctx, drawLandmarks);
// calibDrawLandmarks: draws HAND_CONNECTIONS lines + circles at each landmark
// Fingertips (landmarks 4,8,12,16,20 = CALIB_TIP_INDICES) drawn larger (r=7) with glow
// Other landmarks drawn smaller (r=4) at rgba(0,229,192,0.7)
```

**6. Distance indicator** (informational only)
```js
sweepUpdateDistance(sweepDistanceStatus(landmarks));
```

**7. Compute orientation metrics**
```js
const metrics = sweepComputeMetrics(landmarks);
sweepUpdateMetrics(metrics);  // renders to METRICS panel if SWEEP_DEBUG
```

**8. Update live angle display** (every frame regardless of rules)
```js
sweepUpdateLiveAngles(landmarks);
// For each of the 14 joints: calibGetAngle(landmarks[def.a], landmarks[def.b], landmarks[def.c])
```

**9. Per-joint recording loop** (only runs after therapist presses "Start Capture")
```js
for (const { key, joint, def } of SWEEP_JOINTS) {
  const rules = SWEEP_JOINT_RULES[key];
  if (!rules || !_sweepCapturing) { _sweepFrameCount[key] = 0; continue; }
  if (_sweepCooldowns[key] && performance.now() < _sweepCooldowns[key]) { _sweepFrameCount[key] = 0; continue; }

  // OR logic: any rule passing = orientation is valid
  const passing = rules.find(r => metrics[r.metric] >= r.min && metrics[r.metric] <= r.max);

  if (passing) {
    const val   = metrics[passing.metric];
    const angle = Math.round(calibGetAngle(landmarks[def.a], landmarks[def.b], landmarks[def.c]));
    const [minA, maxA] = SWEEP_ANGLE_LIMITS[joint] || SWEEP_ANGLE_LIMITS.pip;
    if (angle < minA || angle > maxA) { _sweepFrameCount[key] = 0; continue; }  // anatomically impossible — bad frame
    _sweepFrameCount[key] = (_sweepFrameCount[key] || 0) + 1;
    if (_sweepFrameCount[key] >= SWEEP_REQUIRED_FRAMES) {
      if (_sweepJointState[key].bestAngle === null || val > _sweepJointState[key].bestMetricVal) {
        _sweepJointState[key].bestMetricVal = val;
        _sweepJointState[key].bestAngle     = angle;
      }
    }
  } else {
    _sweepFrameCount[key] = 0;
  }
}
```

**10. Update grid UI** (three-state: untuned gray / in-range yellow / captured green)
```js
sweepUpdateGrid(metrics);
```

**11. Debug logging** (if `SWEEP_DEBUG`)
```js
// Each frame entry: { t, lateralZ, palmNormalZ, fingerZ_*, angles: { 'finger-joint': degrees, ... } }
// Last 60 frames kept. COPY button exports full JSON for Yash to analyze against goniometer.
```

---

### Drawing Utilities (from Section 14)

```js
// calibDrawLandmarks — Section 14, line ~2624
// Uses window.drawConnectors (MediaPipe drawing_utils CDN) for bones
// CALIB_TIP_INDICES = new Set([4, 8, 12, 16, 20]) — fingertip landmark indices
function calibDrawLandmarks(ctx, landmarks) {
  window.drawConnectors(ctx, landmarks, window.HAND_CONNECTIONS, {
    color: 'rgba(0, 229, 192, 0.45)', lineWidth: 2,
  });
  landmarks.forEach((lm, i) => {
    const x = lm.x * ctx.canvas.width;
    const y = lm.y * ctx.canvas.height;
    ctx.beginPath();
    ctx.arc(x, y, CALIB_TIP_INDICES.has(i) ? 7 : 4, 0, Math.PI * 2);
    ctx.fillStyle   = CALIB_TIP_INDICES.has(i) ? '#00e5c0' : 'rgba(0,229,192,0.7)';
    ctx.shadowBlur  = CALIB_TIP_INDICES.has(i) ? 14 : 5;
    ctx.shadowColor = '#00e5c0';
    ctx.fill();
    ctx.shadowBlur  = 0;
  });
}
```

---

### State Management

```js
const _sweepJointState = {};   // { [key]: { bestMetricVal: 0, bestAngle: null } }
const _sweepFrameCount = {};   // { [key]: number } — consecutive in-rule frame counter
const _sweepCooldowns  = {};   // { [key]: ms timestamp } — when per-joint cooldown expires
const _sweepFilterStates = {}; // One Euro Filter state per landmark-axis
let   _sweepCapturing  = false; // true only after therapist presses "Start Capture"

function sweepResetState() {
  for (const { key } of SWEEP_JOINTS) {
    _sweepJointState[key] = { bestMetricVal: 0, bestAngle: null };
    _sweepFrameCount[key] = 0;
    delete _sweepCooldowns[key];
  }
  Object.keys(_sweepFilterStates).forEach(k => delete _sweepFilterStates[k]);
  _sweepCapturing = false;
  // hides Save button, shows Start Capture button
}

// Called when therapist clicks "Start Capture"
function sweepStartCapture() {
  _sweepCapturing = true;
  // swaps Start Capture button for Save button
}

// Called when therapist clicks a joint dot — resets that joint + 3s cooldown
function sweepResetJoint(key) {
  _sweepJointState[key] = { bestMetricVal: 0, bestAngle: null };
  _sweepFrameCount[key] = 0;
  _sweepCooldowns[key]  = performance.now() + 3000;
  // dot shows pulsing gray during cooldown
}
```

**Dot states:** untuned (gray, no rule) / in-range (yellow, rule passing) / captured (green, angle recorded) / cooldown (pulsing gray, 3s after click-reset). Dots are clickable to reset individual joints.

---

### How to Tune `SWEEP_JOINT_RULES`

Rules are fully populated for 13/14 joints (ring-dip is null). To refine or add orientation windows:

1. `SWEEP_DEBUG = true` (already true) — shows METRICS panel live
2. Hold a joint at a known angle, press "Start Capture"
3. Watch METRICS panel; when the live reading looks accurate, note which metric is high
4. `min = lowest_observed_accurate_value − 0.05` (buffer), `max = 1.0`
5. Add `{ metric: 'chosen_metric', min, max }` to the joint's array in `SWEEP_JOINT_RULES`

Available metric keys: `lateralZ`, `palmNormalZ`, `fingerZ_thumb`, `fingerZ_index`, `fingerZ_middle`, `fingerZ_ring`, `fingerZ_pinky`

To add a second orientation window for a joint: just push a second object to its array — OR logic means either window can trigger a capture.

---

## Screen Persistence (sessionStorage)

`showScreen(id)` saves the screen ID to `sessionStorage('phalanx_screen')` unless the ID is in `AUTH_SCREENS` (`loginScreen`, `signupScreen`, `forgotScreen`, `consentScreen`, `pendingScreen`, `adminScreen`).

On login, `loginSuccess()` reads `savedScreen = sessionStorage.getItem('phalanx_screen')` **before** any `showScreen()` call (critical — any `showScreen()` call overwrites the value). After routing to the role's default screen, `restoreScreen(saved)` navigates to the saved screen if it matches the user's role:
- Therapist: `mlTrainerScreen` → re-open ML trainer (calls `openMLTrainer()`)
- Patient: `exercisesScreen` → call `showExercisesScreen()`; `progressScreen` → call `showProgressScreen()`
- Sweep calibration and camera screens cannot be restored (require runtime state) — fall back to role default

`logout()` calls `sessionStorage.removeItem('phalanx_screen')`.

---

## Section 17: ML Angle Trainer — Full Code Reference

### Purpose

Per-joint, per-hand angle regression. Therapist collects labeled samples (slider angle + hand pose), trains a small TF.js model in-browser, and the trained model replaces `calibGetAngle` for that joint during patient exercise sessions.

### Globals

```js
const _mlModels = new Map();        // '${joint}-${hand}' → { type: 'hybrid'|'landmarks', model }
let _mlCurrentHand = null;          // 'left' | 'right' | null — set each frame by mlOnResults
let _mlFeatureExtractor = null;     // MobileNetV1 α=0.25 instance (loaded once)
let _currentFrameFeatures = null;   // 256-dim feature vector, updated async each frame
let _currentHandLabel = null;       // set by mlOnResults, sweepOnResults, patient onResults
const _mlFingerConfig = { thumb: true, index: true, middle: true, ring: true, pinky: true };
const _ML_FINGERS = ['thumb', 'index', 'middle', 'ring', 'pinky'];
let _mlSuggestedAngle = null;       // emptiest histogram bucket midpoint
```

### Firestore Key Convention

All Firestore keys for training data and models use `${baseJoint}-${hand}`, e.g. `index-mcp-left`, `thumb-pip-right`. Hand comes from MediaPipe handedness with **inversion** applied (see below).

### Handedness Inversion

MediaPipe reports handedness from the person's perspective, which is mirror-flipped relative to the camera. Every `onResults` callback that reads `multiHandedness` inverts the label:
```js
const rawHand = results.multiHandedness[0].label.toLowerCase(); // 'left' or 'right'
_currentHandLabel = rawHand === 'left' ? 'right' : 'left';      // flip to camera perspective
```
Applied in `mlOnResults`, `sweepOnResults`, and patient camera `onResults`.

### MobileNet Feature Extractor

```js
async function loadMLFeatureExtractor() {
  if (!window.mobilenet) return;
  try {
    _mlFeatureExtractor = await window.mobilenet.load({ version: 1, alpha: 0.25 });
  } catch (e) { console.error('loadMLFeatureExtractor:', e); }
}

async function extractVisualFeatures(canvas, landmarks) {
  if (!_mlFeatureExtractor || !canvas || !landmarks) return null;
  // Crops hand region from canvas using landmark bounding box (12% padding each side)
  // Resizes crop to 224×224, runs mobilenet.infer(cropCanvas, true) (penultimate layer)
  // Returns 256-dim float array, disposes TF tensor
}
```

`_currentFrameFeatures` is updated each frame in `mlOnResults` (and patient/sweep `onResults`) by calling `extractVisualFeatures(canvas, landmarks).then(f => { _currentFrameFeatures = f; })` — async, one frame behind, imperceptible in practice.

### Model Architecture

**Landmarks-only** (when no `imageFeatures` in samples):
```
Dense(64, relu) → Dense(32, relu) → Dense(1)
input: 63 floats (21 landmarks × [x, y, z])
```

**Hybrid** (when samples have `imageFeatures`):
```
imageFeatures(256) → Dense(128, relu) \
landmarks(63)      → Dense(64,  relu)  → Concat(192) → Dense(64, relu) → Dense(1)
```
Built via `tf.model({ inputs: [imgInput, lmInput], outputs })` functional API. Saved to Firestore with `type: 'hybrid'`. Old docs without `type` field treated as `'landmarks'`.

### Sample Threshold

Minimum 100 samples before training is allowed (model has ~6,200 parameters; 20 was insufficient to prevent memorization).

### Coverage Histogram

18 buckets, 10° each (b0 = 0–9°, b17 = 170–179°). Updated at submit time via `FieldValue.increment(1)` on `trainingMeta/{joint-hand}.histogram.b{N}`. `mlRenderCoverage(histogram)` renders 18 bars; gold bar = emptiest bucket = suggested next angle. `mlUseSuggested()` sets the angle slider to `_mlSuggestedAngle`.

### Key Functions

| Function | What it does |
|----------|-------------|
| `loadMLModels()` | Loads all trained models from `mlModels` collection + calls `loadMLFeatureExtractor()` in parallel |
| `submitMLSample()` | Captures current landmarks + slider angle + `_currentFrameFeatures` + notes + fingerConfig; saves to `trainingChunks` (30 samples/chunk) and increments `trainingMeta` histogram bucket |
| `trainMLModel()` | Reads all chunks for current joint-hand key; builds landmarks-only or hybrid model; saves topology + weights to `mlModels/{joint-hand}` |
| `getTrainedAngle(jointKey, landmarks)` | Looks up `${jointKey}-${_currentHandLabel}` in `_mlModels`; runs hybrid (uses `_currentFrameFeatures`) or landmarks-only inference; falls back to `null` if no model (caller falls back to `calibGetAngle`) |
| `mlRefreshSampleCounts()` | Fetches `trainingMeta` for current joint-hand key; updates stats card + coverage histogram |
| `mlRenderCoverage(histogram)` | Renders 18 histogram bars; marks emptiest bucket gold; sets `_mlSuggestedAngle` |
| `mlToggleStats()` / `mlToggleModels()` | Collapse/expand with `scrollIntoView` on expand |
| `mlSaveNotes()` | Saves textarea value to `localStorage('ml_session_notes')` |
| `mlToggleFinger(name)` / `mlSetFingerPreset(preset)` | Toggle finger active state in `_mlFingerConfig`; presets: `all-up`, `all-down`, `random` |

### Finger Config Panel

Five toggle buttons (T / I / M / R / P) + three presets. Purely a workflow reminder — the 63-landmark input already captures all finger positions continuously. The panel helps the therapist systematically collect samples across diverse finger configurations so the model generalizes.

---

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

## Branch Merge Framework

When the user says anything like "merge", "Oliver is done", "integrate Oliver's changes", or pastes this section — follow this framework exactly. **Check in with Yash or Oliver at every step before proceeding.**

### When Yash merges feature/functionality → main

1. **Ask:** "Are you sure your branch is ready to merge? Any uncommitted changes?"
2. `git fetch origin`
3. `git checkout main && git merge --no-commit --no-ff origin/feature/functionality`
4. Show a summary of what changed. **Ask:** "Does this look right? Anything unexpected?"
5. If yes — `git add` + `git commit` + `git push origin main`
6. **Confirm:** "Pushed to main. Ready for Oliver to merge when he's done."

---

### When Oliver merges feature/ui → main

**Phase 1 — Confirm Oliver is ready**
- **Ask Oliver/Yash:** "Has Oliver pushed all his changes to `origin/feature/ui`? Should I fetch now?"
- `git fetch origin`
- Show the latest commits on `feature/ui`. **Ask:** "Are these the changes you expected?"

**Phase 2 — Preview conflicts**
- `git merge-tree $(git merge-base main origin/feature/ui) main origin/feature/ui > /tmp/merge_dry_run.txt`
- Present every conflict in a clear table: Yash's version vs Oliver's version, with a plain-English description of what each side does
- **Ask for each conflict:** "For [conflict #N], do you want to keep Yash's version, Oliver's version, or both?"
- Do not proceed until every conflict has a decision

**Phase 3 — Do the merge**
- `git checkout main`
- `git merge --no-commit --no-ff origin/feature/ui`
- Apply each resolution as decided — one conflict at a time
- After each file is resolved, **confirm:** "I've resolved [filename]. Here's what it looks like now — does this match what you expected?"
- After all files resolved, grep for critical functionality (key functions, constants, HTML elements that must be preserved). **Ask:** "Everything looks intact — should I commit?"
- `git add` + `git commit` + `git push origin main`
- **Confirm:** "Merged and pushed. Ready to test."

**Phase 4 — Test**
- `cd phalanX-test && git pull origin main && npm run dev`
- **Ask Yash:** "Dev server is running. Please test both your features and Oliver's. Let me know what you find."
- Only deploy after Yash confirms everything works

---

**Rules Claude must follow during merges:**
- Never let git auto-resolve — always use `--no-commit`
- Never move to the next phase without explicit confirmation from Yash
- If anything looks unexpected after any step, stop and ask before continuing
- After every push, verify critical code wasn't silently dropped before declaring done

## SWEEP CALIBRATION — Rule Tuning Workflow

Rules apply universally to any patient — they describe camera geometry (which angles give accurate MediaPipe readings), not patient-specific anatomy.

**Setup**
1. Open app on phone, log in as therapist, open any patient, tap "Sweep Calibration"
2. METRICS panel and live angle grid must be visible (`SWEEP_DEBUG = true`)

**For each joint:**
3. Hold your own finger at a known angle using a goniometer or reference (e.g. flat = 0°, right angle = 90°)
4. Keep the finger still — move the camera until the live angle reading on screen matches the true angle
5. Screenshot the screen (must show METRICS panel + angle grid)
6. Move camera to another position where it still reads correctly — screenshot again
7. Repeat 3–5 times from different valid positions
8. Send all screenshots to Claude with: which joint, what true angle

**Claude derives the rule:**
- Reads all 7 metric values from each screenshot
- Identifies which metric is consistently high across all valid frames
- Sets `min` = lowest observed value − 0.05 tolerance, `max` = 1.0
- Writes rule into `SWEEP_JOINT_RULES` in `app.js`, builds + deploys to Firebase

**Testing after deploy:**
- Dot turns yellow (in-range) when orientation satisfies the rule
- Dot turns green (captured) after 5 consecutive valid frames
- Start with `index-pip` — most clinically important, easiest to measure

**`SWEEP_JOINT_RULES` location:** `code/app.js` line ~3072

---

## Pre-Launch Checklist

- [ ] **Tighten Firestore security rules** — current rules allow any authenticated user to read/write everything. Before launch, scope rules so patients can only read/write their own data, therapists can only access their connected patients, and admins can only access the `users` collection.
- [ ] **Delete demo accounts** — remove `sarah.chen@mayoclinic.org` and `james.park@gmail.com` from Firebase Auth and Firestore, or change their passwords.
- [ ] **Create first real admin account** — follow the manual steps in the Firestore Role Values section above.
- [x] **Test on HTTPS / mobile** — tested via ngrok + VS Code port forwarding on iOS Safari and Chrome. Mobile uses direct `getUserMedia` path (not MediaPipe `Camera` class). `startCamera()` must be called before any `await` in session-start functions to preserve iOS gesture context. iOS Safari requires `hands.send({ image: canvas })` — passing the video element directly does not work; video must be drawn to a canvas first.
- [ ] **Review Firebase Auth settings** — disable any sign-in providers you're not using.
- [ ] **Set up video expiry Cloud Function** — currently the 30-day expiry is UI-only (files remain on Cloudinary but are inaccessible through the app). For actual deletion at launch: (1) upgrade Firebase project `phalanx-firebase-database` to Blaze plan at https://console.firebase.google.com/project/phalanx-firebase-database/usage/details — free in practice, just requires a billing account attached; (2) tell Claude "set up the video expiry Cloud Function" — it will create `functions/index.js` with a daily scheduled job that deletes Cloudinary videos older than 30 days and clears `videoUrl` from Firestore. Cloudinary credentials: cloud `dslbugsdg`, API key `853184729123867`, API secret in Yash's password manager.

## UI Rules

- **No emojis — ever.** Do not add emojis anywhere in the app: HTML, JS strings, CSS content, button labels, messages, icons, or favicons. Use plain text or standard ASCII symbols (e.g. `+`, `-`, `x`) instead.

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
