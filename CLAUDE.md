When Yash says "update CLAUDE.md", "update the doc", "update the functionality form", or anything similar — update the relevant section(s) of this file directly: the "Last updated" line, the Screen System table, the Section Map table, or whichever part reflects what changed.

# Last updated: 2026-03-23 (Section 17: Persistent hand selector — LEFT/RIGHT toggle buttons replace live-camera-only hand detection for all data ops; _mlSelectedHand global persists across frames; mlSetHand() sets selection and updates toggle UI; camera auto-updates selection when hand detected but user can manually override; all data operations — submit, record, undo, clear, train — now use _mlSelectedHand instead of live _mlCurrentHand)

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
| `trainingChunks`  | auto-id                    | `{ joint, samples: [{ landmarks, trueAngle, imageFeatures?, notes?, fingerConfig?, recordedAt, recordedBy, recordingId? }], chunkIndex, createdAt }` — 30 samples/chunk; `imageFeatures` is 256 floats from MobileNet (absent on old samples); `notes` is free-text session context; `fingerConfig` is `{ thumb, index, middle, ring, pinky }` booleans; `recordingId` is present on auto-captured samples (Date.now() string of the recording session) — used by `mlUndoLastRecording` to identify and remove a full session |
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
| 17  | ML Angle Trainer — `loadMLModels`, `loadMLFeatureExtractor`, `extractVisualFeatures`, `submitMLSample`, `mlAutoCapture`, `mlStartRecording`, `mlStopRecording`, `mlUndoLastRecording`, `mlClearJoint`, `trainMLModel`, `getTrainedAngle`, `mlOnResults`, `mlSetHand`, `mlRefreshSampleCounts`, `mlRenderGrid`, `mlUseSuggested`, `mlToggleStats`, `mlToggleModels`, `mlSaveNotes`, `mlToggleFinger`, `mlSetFingerPreset`; globals: `_mlModels` (Map), `_mlCurrentHand` (live camera detection only), `_mlSelectedHand` (persistent — used by all data ops), `_mlFeatureExtractor`, `_currentFrameFeatures`, `_currentHandLabel`, `_mlFingerConfig`, `_mlSuggestedAngle`, `_mlRecording`, `_mlRecordingId`, `_mlLastRecordingId` |

## Section 16: Sweep Calibration

Full code reference: [docs/sweep-calibration-reference.md](docs/sweep-calibration-reference.md)

## Screen Persistence (sessionStorage)

`showScreen(id)` saves the screen ID to `sessionStorage('phalanx_screen')` unless the ID is in `AUTH_SCREENS` (`loginScreen`, `signupScreen`, `forgotScreen`, `consentScreen`, `pendingScreen`, `adminScreen`).

On login, `loginSuccess()` reads `savedScreen = sessionStorage.getItem('phalanx_screen')` **before** any `showScreen()` call (critical — any `showScreen()` call overwrites the value). After routing to the role's default screen, `restoreScreen(saved)` navigates to the saved screen if it matches the user's role:
- Therapist: `mlTrainerScreen` → re-open ML trainer (calls `openMLTrainer()`)
- Patient: `exercisesScreen` → call `showExercisesScreen()`; `progressScreen` → call `showProgressScreen()`
- Sweep calibration and camera screens cannot be restored (require runtime state) — fall back to role default

`logout()` calls `sessionStorage.removeItem('phalanx_screen')`.

---

## Section 17: ML Angle Trainer

Full code reference: [docs/ml-trainer-reference.md](docs/ml-trainer-reference.md)

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
# Plugin Usage Guide

At the start of every session, read this file to understand which plugins/skills are available and when to use them.

## Rules

- Do NOT invoke a plugin/skill on every prompt — only when the request clearly matches the trigger conditions below.
- When a trigger condition is met, invoke the corresponding skill BEFORE generating any response about the task.

---

## Plugin Trigger Map

### frontend-design
**Trigger when:** User asks about UI layout, styling, formatting, moving elements around, changing how something looks, redesigning a screen or component, spacing, alignment, colors, or visual polish.
**Examples:** "move the button to the right", "make this look better", "format the layout", "center this", "redesign the capture screen"

### auto-style
**Trigger when:** New HTML elements, screens, or components are being added to index.html and need styling.
**Examples:** "add a new panel", "create a new section", "add a card component"

### code-review
**Trigger when:** User explicitly asks for a review of code quality, structure, or correctness.
**Examples:** "review this", "look over my code", "what do you think of this implementation", "any issues with this?", "code review"

### simplify
**Trigger when:** User asks to clean up, simplify, refactor, or improve existing code quality.
**Examples:** "simplify this", "clean this up", "refactor", "this feels messy", "make this cleaner"

### commit-commands
**Trigger when:** User asks to commit changes, stage files, or anything git-commit related.
**Examples:** "commit this", "make a commit", "save my changes"

### github
**Trigger when:** User asks about PRs, issues, branches, or anything GitHub-related beyond basic git.
**Examples:** "create a PR", "open an issue", "check the PR status"

### firebase
**Trigger when:** User asks about Firebase config, Firestore queries, Firebase Auth, storage rules, or deployment via Firebase.
**Examples:** "deploy to Firebase", "check my Firestore rules", "Firebase auth issue"

### superpowers
**Trigger when:** User asks for advanced agentic capabilities, complex multi-step autonomous tasks, or anything that feels beyond a standard single-step response.
**Examples:** "figure this out end to end", "autonomously fix all the bugs", "take over and handle this"

### context7
**Trigger when:** User asks about library/framework documentation, API references, or "how does X work" for an external dependency.
**Examples:** "how do I use MediaPipe's pose API", "what does this Firebase method do", "look up the Chart.js docs"

### chrome-devtools-mcp
**Trigger when:** User asks to inspect, debug, or profile something in the browser — DOM, network, console errors, performance.
**Examples:** "check the console errors", "inspect the DOM", "debug why this isn't rendering"

### no-slop
**Auto-triggers on ALL code generation and modification tasks.** Ensures code looks human-written — no over-commenting, no unnecessary abstractions, no AI-coded patterns.

### production-code
**Auto-triggers whenever writing or modifying app.js, index.html, or styles.css.** Ensures every line is deployment-ready — no TODOs, no placeholders, no shortcuts.
