@.claude/rules/context-window.md
@.claude/rules/constraints.md
@.claude/rules/ui-rules.md
@.claude/rules/maintenance.md

# PhalanX — Claude Code Guide

Hand rehabilitation web app using MediaPipe hand tracking.
Authors: Yash Saoji & Oliver Huelsbeck (2025)

## Feature Flag: ANGLE_TRACKING_ENABLED

Located at top of `app.js` (line ~41), right after the Cloudinary constants.

```js
const ANGLE_TRACKING_ENABLED = false;  // set to true to re-enable
```

**When `false` (current state):**
- Session start routes to a manual log modal (reps + pain slider) instead of the camera
- ML Trainer screen is inaccessible (`startMLTrainer` returns immediately)
- ML Trainer button is absent from the therapist sidebar
- Therapist patient panel shows: pain chart, session history (no ROM), protocol, messages
- ROM / Joint Monitoring sections are hidden
- Angle condition builder is hidden in the Add Protocol form

**When set back to `true`:**
- Restore the ML Trainer button in `index.html` therapist sidebar: `<button class="sidebar-ml-btn" onclick="startMLTrainer()">ML Trainer</button>` (goes between `<h2>phalanX</h2>` and the clinic-badge div)
- Session start routes back to `cameraScreen` with MediaPipe tracking
- Therapist panel restores: ROM stat card, ROM chart, Joint Monitoring section, `ejsInit` call
- Session history restores ROM column
- Angle condition builder reappears in Add Protocol form
- `restoreScreen` resumes restoring `mlTrainerScreen` for therapists

The dormant code (Sections 9–11, 13, 17) is fully intact — no functions were deleted.

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
hardware/
  adjustable_jig.scad   — parametric adjustable angle jig (MCP/PIP/DIP); 2-piece pivot + lock peg; 0–90° in 10° steps
  finger_angle_jig.scad — fixed-angle jig v2; supports all 14 joints via finger+joint lookup table
scripts/
  import-freihand.js    — Node.js script to import FreiHAND training data into Firestore
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
| `protocols`     | `{patientEmail}`     | `{ items: [{ id, exerciseType, reps, sets, frequency, assignedBy, notes?, exerciseParams?, demoVideoUrl? }, …], demoWatched?: [id, …] }` — `demoVideoUrl` is a Cloudinary URL set at assign time; `demoWatched` tracks which protocol item IDs the patient has already auto-watched |
| `sessions`      | auto-id              | `{ patientEmail, date, reps, rom, pain, tam, therapistEmail, exerciseType, protocolId, jointAngles?, videoUrl? }` |
| `calibration`   | `{patientEmail}`     | `{ joints: { [key]: { angle, metricVal } }, recordedAt, recordedBy }` — best angle per joint from calibration |
| `messages`      | auto-id              | `{ from, to, participants, text, timestamp, read }` |
| `jointTracking`   | `{patientEmail}`           | `{ joints: [key, …], updatedBy }` — therapist's selected joints for this patient |
| `customExercises` | auto-id                    | `{ id, name, cat, dr, ds, df, desc, createdBy }` — therapist-created exercises; loaded and merged into `PROTOCOL_CATALOG` on `openAddProtocol`; `id` is a slug derived from `name` |
| `trainingChunks`  | auto-id                    | `{ joint, samples: [{ landmarks, trueAngle, imageFeatures?, notes?, recordedAt, recordedBy, recordingId? }], chunkIndex, createdAt }` — 30 samples/chunk; `imageFeatures` is 256 floats from MobileNet (absent on old samples); `notes` is free-text session context; `recordingId` is present on auto-captured samples (Date.now() string of the recording session) — used by `mlUndoLastRecording` to identify and remove a full session |
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

**Therapist screen layout:**
- Sidebar: patient list with search, clinic code copy button
- Main panel (empty state): shows "+ Add Protocol" button in header
- When patient selected: shows back button (←) in patient header to deselect
- Clicking "+ Add Protocol" opens bulk assign modal with patient search

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
| `cameraScreen`             | Live exercise session (rep counter, pain slider, plain-English rep cue, set tracker, REC indicator while recording); `#mlStatusLine` shows `Raw tracking` when no ML models are active, or `ML <joint>` tags for each joint using a trained model |
| `therapistScreen`          | Therapist dashboard (patient list + collapsible sections: charts, joint monitoring, session history, protocol form, messages) |
| `progressScreen`           | Patient progress history                                       |
| `messagingScreen`          | In-app patient↔therapist messaging thread                      |
| `mlTrainerScreen`          | ML Angle Trainer — therapist trains per-joint per-hand angle regression models (Section 17); hand selected via persistent LEFT/RIGHT toggle buttons (auto-updated when camera detects a hand, but can be manually overridden — no live tracking required for data ops); angle set via slider + submit (single frame) or recording mode (auto-capture ~2/sec while moving hand); recording locks slider, shows blinking dot + live counter; after stop shows undo bar to discard the recording by `recordingId`; "Clear all samples" button wipes all chunks + meta for selected joint-hand; shows coverage grid with suggested angle; collapsible sample counts + trained models panels; session notes textarea |

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
| 6   | Patient Home — `getTodayCompletion` (filters by `protocolId`), `updatePatientHomeScreen`, `showExercisesScreen` (per-protocol completion badges + white card design), `startSessionByIndex(i)` (onclick handler — looks up `_exercisesProtocols[i]` in module scope; **do not use `window._exercisesProtocols` in onclicks** — `Object.assign` freezes it as `[]` at init), `startSessionWithProtocol` (async — loads `trackedJoints`; if `protocol.demoVideoUrl` exists and the protocol ID is not in `demoWatched`, shows `#demoVideoOverlay` and stores `_pendingDemoProtocol` — proceeds to `openManualSession` only after patient watches or skips), `openManualSession` (shows `#manualSessionDemoBtn` when `protocol.demoVideoUrl` exists), `startScanSession`, `sendMessageFromPatient`; globals: `_pendingDemoProtocol` |
| 7   | Protocol System — `PROTOCOL_CATALOG` (built-in exercises + custom exercises merged in at modal open), `EXERCISE_DEFAULTS`, `FINGER_LANDMARK_MAP`, `CALIB_FINGERS` (derived from `FINGER_LANDMARK_MAP` as `{a,b,c}` format — used by sweep calibration and TAM calc), `getProtocols`, `getExistingProtocol`, `assignProtocol` (appends; reads patient email from `_protoPatientEmail` global — no parameter; uploads `_demoBlob` to Cloudinary before Firestore write if present; angle params collection guarded by `ANGLE_TRACKING_ENABLED`), `deleteProtocol` (removes by id; demo video URL becomes orphaned on Cloudinary — accepted limitation), `editProtocol` (opens Add Protocol modal pre-populated for edit; loads existing `demoVideoUrl` into confirmed state), `cancelEditProtocol` (calls `closeAddProtocol()`), `normalizeExerciseParams`, `loadTrackedJoints`, `saveTrackedJoints`; globals: `_protoPatientEmail`, `_apmNewExCat` (boolean — true when in create-exercise mode) |
| 8   | Therapist Panel — `makeCollapsible`, `toggleTpSection`, `showRealPatient`, `buildSessionHistory`, `buildProtocolList` (adds Play Demo / Remove Demo buttons per protocol card when `demoVideoUrl` exists), `openAddProtocol` (async — side-by-side layout: form left, demo col right; resets `apmSelectedExInfo` and demo state on open), `closeAddProtocol` (calls `_demoCleanup()`), `_apmRenderLibrary` (renders library with + button in search bar), `_apmLoadCustomExercises` (fetches `customExercises` from Firestore, merges into `PROTOCOL_CATALOG` + `exerciseLabels`), `apmEnterCreateMode`, `apmExitCreateMode`, `apmSaveCustomExercise`, `apmSelectExercise` (populates `#apmSelectedExName` + `#apmSelectedExDesc` + shows `#apmSelectedExInfo`; sets reps/sets/freq defaults), `apmFilter`, `updateExerciseParamsUI` (hides container entirely when `ANGLE_TRACKING_ENABLED = false`), `epAddCondition`, `epRemoveCondition`; `backToPatientList`; `showTherapistOnboarding`, `dismissTherapistOnboarding`; **demo recording globals**: `_demoStream`, `_demoMediaRecorder`, `_demoChunks`, `_demoBlob`, `_demoFacingMode`, `_demoTimerInterval`, `_demoTimerSec`, `_demoAnimFrame`, `_demoExistingVideoUrl`; **demo functions**: `_demoSetState`, `_demoStopCamera`, `_demoCleanup`, `_demoStartCameraAndRecord`, `demoStartDemo`, `demoEndDemo`, `demoFlipCamera`, `demoUseThis`, `demoReRecord`, `demoClearVideo`, `demoUploadFile`, `demoHandleFileSelect`, `playProtocolDemo`, `removeProtocolDemo`, `closeDemoAndStart`, `skipDemoVideo`, `replayDemoInSession` — demo recording uses separate MediaRecorder globals from session recording to avoid conflicts; camera preview uses `transform: none` to prevent browser mirroring; playback seeks to `currentTime = 0.001` on `onloadeddata` to show first frame |
| 9   | Rep Counter — `checkExerciseState`, `updateRepCount` (per-joint angle tracking into `jointMaxAngles`), `updateRepFeedback` (plain-English cues), `fingerLabel`, `saveSession` (saves `exerciseType`, `protocolId`, `jointAngles`; two-step: Firestore first, then Cloudinary upload in background, then `update({videoUrl})`); `toggleSound`, `skipRest`, `dismissSummary`, `dismissSummaryToProgress` (skips patientScreen — goes straight to progress screen) |
| 10  | Set Tracking — `initSetTracker` (resets all state including `jointMaxAngles`), `renderSetDots`, `advanceSet`, `completeSessionEarly` (saves `exerciseType`, `protocolId`, `jointAngles`; same two-step video pattern as `saveSession`) |
| 11  | Patient Session Camera — `startCamera` (desktop: uses MediaPipe `Camera` class; mobile: direct `getUserMedia` + `requestAnimationFrame` loop, canvas dimensions set from video, aspect ratio adjusted dynamically, canvas mirrored only for front camera; **iOS Safari fix**: `hands.send({ image: sessionCanvas })` — canvas not video, required for iOS); calls `startRecording(sessionCanvas)` after camera starts; `flipCamera` discards pre-flip footage and restarts recording; `isMobile`; `updateMLStatusLine` (called on hand-label change — shows which exercise joints are using trained ML models vs raw MediaPipe; blank for non-angle exercises); recording utilities: `getRecordingMimeType`, `startRecording` (**400 kbps** via `videoBitsPerSecond: 400_000`), `stopRecording`, `uploadSessionVideo` (Cloudinary fetch), `showRecordingIndicator`, `hideRecordingIndicator`, `openVideoModal(videoUrl, sessionDate, patientName)` (wires modal download button), `closeVideoModal`, `downloadSessionVideo(url, date, patientName)` (fetches blob → triggers download as `phalanx-session-{PatientName}-{YYYY-MM-DD}.{ext}`; falls back to `window.open` if fetch blocked by CORS) |
| 12  | Progress Screen — session history display |
| 13  | Joint Selector (Enhanced) — `buildJointSelector`, `ejsInit` (async — loads saved joints from Firestore, renders charts), `ejsOnSelectionChange` (updates UI + charts + debounced Firestore save), `renderJointCharts` (Chart.js line chart per tracked joint from session history), `ejsToggleJoint`, `ejsRefreshUI`, `ejsDotClick`, `ejsSelectCard`, `ejsToggleFromInfo`, `ejsRemoveChip`, `ejsQuickSelectFinger`, `ejsSelectAll`, `ejsClearAll` |
| 15  | Messaging — `sendMessage`, `renderThread`, `buildMessagePanel`, etc. |
| 17  | ML Angle Trainer — `loadMLModels`, `loadMLFeatureExtractor`, `extractVisualFeatures`, `submitMLSample`, `mlAutoCapture`, `mlStartRecording`, `mlStopRecording`, `mlUndoLastRecording`, `mlClearJoint`, `trainMLModel`, `getTrainedAngle`, `mlOnResults`, `mlSetHand`, `mlRefreshSampleCounts`, `mlRenderGrid`, `mlUseSuggested`, `mlToggleStats`, `mlToggleModels`, `mlSaveNotes`; globals: `_mlModels` (Map), `_mlCurrentHand` (live camera detection only), `_mlSelectedHand` (persistent — used by all data ops), `_mlFeatureExtractor`, `_currentFrameFeatures`, `_currentHandLabel`, `_mlSuggestedAngle`, `_mlRecording`, `_mlRecordingId`, `_mlLastRecordingId` |

## Screen Persistence (sessionStorage)

`showScreen(id)` saves the screen ID to `sessionStorage('phalanx_screen')` unless the ID is in `AUTH_SCREENS` (`loginScreen`, `signupScreen`, `forgotScreen`, `consentScreen`, `pendingScreen`, `adminScreen`).

On login, `loginSuccess()` reads `savedScreen = sessionStorage.getItem('phalanx_screen')` **before** any `showScreen()` call (critical — any `showScreen()` call overwrites the value). After routing to the role's default screen, `restoreScreen(saved)` navigates to the saved screen if it matches the user's role:
- Therapist: `mlTrainerScreen` → re-open ML trainer (calls `openMLTrainer()`)
- Patient: `exercisesScreen` → call `showExercisesScreen()`; `progressScreen` → call `showProgressScreen()`
- Camera screen cannot be restored (requires runtime state) — fall back to role default

`logout()` calls `sessionStorage.removeItem('phalanx_screen')`.

---

## Section 17: ML Angle Trainer

Full code reference: see `ml_trainer/ml-training-guide.md`

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

