# Last updated: 2026-03-01 (admin approval system added)

# PhalanX — Claude Code Guide

Hand rehabilitation web app using MediaPipe hand tracking.
Authors: Yash Saoji & Oliver Huelsbeck (2025)

## How to Run

Open `index.html` directly in a browser. There is **no build step** — no npm install, no bundler, no dev server.

> **MediaPipe camera access requires a secure context.** The app works on `localhost` or `https://`. Opening via `file://` may block camera access in Chrome. Use a simple local server if needed:
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
index.html    — all HTML screens (487 lines)
app.js        — all JS logic (15 sections + Section 5b, 2303 lines)
styles.css    — all styles (1034 lines)
non_func/     — LICENSE.txt (copyright + third-party licenses)
node_modules/ — prompt-sync + helpers (CLI utility only, unrelated to browser app)
```

## Dependencies (CDN only — no local install)

- **MediaPipe Hands** + `camera_utils` + `drawing_utils` — hand tracking
- **Chart.js** — therapist progress charts
- **Google Fonts** — DM Sans, DM Mono, Space Mono
- **Firebase v9 compat** (`firebase-app-compat`, `firebase-auth-compat`, `firebase-firestore-compat`) — auth + database

## Firebase Setup

Firebase project: `phalanx-firebase-database`

Config is set in `FIREBASE_CONFIG` at the top of `app.js` (Section 1).

### Firestore collections

| Collection    | Document ID          | Fields |
|---------------|----------------------|--------|
| `users`       | `{email}`            | `{ name, role }` |
| `connections` | `{therapistEmail}`   | `{ patients: [email, …] }` |
| `protocols`   | `{patientEmail}`     | full protocol object |
| `sessions`    | auto-id              | `{ patientEmail, date, reps, rom, pain, tam, therapistEmail }` |
| `messages`    | auto-id              | `{ from, to, participants, text, timestamp, read }` |

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

| Key             | Contents                          |
|-----------------|-----------------------------------|
| `phalanx_sound` | `'true'` / `'false'` — sound preference (local UI only) |

All other state (accounts, connections, protocols, sessions, messages) is in Firestore.

## Screen System

Single-page app. All screens are `<div class="screen">` in `index.html`. Navigation is done by toggling the `.active` class via `showScreen(id)` in `app.js` (Section 2).

| Screen ID           | Purpose                                                        |
|---------------------|----------------------------------------------------------------|
| `loginScreen`       | Default landing screen (has `.active`)                         |
| `signupScreen`      | New account registration                                       |
| `forgotScreen`      | Password reset (sends Firebase reset email)                    |
| `pendingScreen`     | Shown to therapist_pending users awaiting admin approval       |
| `adminScreen`       | Admin panel — approve/reject pending therapist accounts        |
| `connectScreen`     | Patient↔therapist link by therapist code                       |
| `patientScreen`     | Patient home (today's protocol, streak, completion status)     |
| `exercisesScreen`   | Patient view of assigned protocol + today's completion status  |
| `cameraScreen`      | Live exercise session (rep counter + pain)                     |
| `therapistScreen`   | Therapist dashboard (patient list + charts)                    |
| `progressScreen`    | Patient progress history                                       |
| `messagingScreen`   | In-app patient↔therapist messaging thread                      |
| `calibrationScreen` | Joint angle calibration (MediaPipe read-out)                   |

## Role Split

**Patient flow:** `loginScreen` → `patientScreen` → `cameraScreen` → `progressScreen` / `messagingScreen` / `exercisesScreen`

**Therapist flow:** `loginScreen` → `therapistScreen` (sidebar patient list + main panel with stats, charts, protocol assignment, message panel)

**Therapist pending flow:** `loginScreen` → `pendingScreen` (blocked until admin approves)

**Admin flow:** `loginScreen` → `adminScreen` (approve/reject pending therapists — admin accounts created manually by Yash in Firebase)

### `exerciseParams` schema (inside a protocol object)

For angle-metric exercises:
```js
{ metric: 'angle', conditions: [{ finger, joint, flexAt, extendAt }, ...], requireAll: bool }
```
For distance/abduction exercises the defaults are copied directly (`metric`, `tipA`, `tipB`, etc.).
Angle convention: **0° = straight, higher = more bent** — matches the calibration tool.
Old protocols without `exerciseParams` are auto-normalized at runtime via `normalizeExerciseParams()`.

## app.js Section Map

The file uses `/* ══ SECTION N: ... ══ */` banners. Jump to these to find logic:

| Section | Topic |
|---------|-------|
| 1   | Auth & State — Firebase init, `onAuthStateChanged`, async Firestore helpers (`getConnectedPatients`, `saveConnection`, `getConnectedTherapist`, `getTherapistForCode`) |
| 2   | Navigation — `showScreen()`, `screenTitles` map, patient home setup |
| 3   | Login / Signup / Forgot — async Firebase Auth handlers; therapist signup writes `therapist_pending` role |
| 4   | Connect — therapist code linking flow (async Firestore) |
| 5   | Login Success / Logout — role routing: `admin` → adminScreen, `therapist` → therapistScreen, `therapist_pending` → pendingScreen, `patient` → patientScreen/connectScreen |
| 5b  | Admin Panel — `loadAdminScreen()`, `approveTherapist()`, `rejectTherapist()` |
| 6   | Patient Home — streak display, protocol rendering, `getTodayCompletion`, `showExercisesScreen` (all async) |
| 7   | Protocol System — `EXERCISE_DEFAULTS`, `FINGER_LANDMARK_MAP`, protocol CRUD (`assignProtocol`, `deleteProtocol`, `normalizeExerciseParams`) — Firestore |
| 8   | Therapist Panel — patient list, Chart.js graphs, protocol form (`buildProtocolForm`, `updateExerciseParamsUI`, `epAddCondition`, `epRemoveCondition`) — Firestore |
| 9   | Rep Counter — `getMiddleFingerAngle`, `getJointAngle`, `getTipDistance`, `checkExerciseState`, `updateRepCount`, `currentExerciseParams` global; `saveSession` writes to Firestore |
| 10  | Set Tracking — set/rest timer state machine, `initSetTracker` (async, sets `currentExerciseParams`) |
| 11  | Patient Session Camera — camera screen init (`patientVideo`/`patientCanvas`) |
| 12  | Progress Screen — session history display (async Firestore) |
| 13  | Joint Selector — therapist panel joint angle UI |
| 14  | Calibration Screen — MediaPipe Hands init + angle math (`calibVideo`/`calibCanvas`) |
| 15  | Messaging — patient↔therapist in-app thread (`sendMessage`, `getThread`, `markRead`, `unreadCount`, `renderThread`, `openPatientMessaging`, `sendMessageFromPatient`, `buildMessagePanel`) — all async Firestore |

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

- [ ] **Tighten Firestore security rules** — current rules allow any authenticated user to read/write everything. Before launch, scope rules so patients can only read/write their own data, therapists can only access their connected patients, and admins can only access the `users` collection.
- [ ] **Delete demo accounts** — remove `sarah.chen@mayoclinic.org` and `james.park@gmail.com` from Firebase Auth and Firestore, or change their passwords.
- [ ] **Create first real admin account** — follow the manual steps in the Firestore Role Values section above.
- [ ] **Test on HTTPS** — MediaPipe camera requires a secure context; verify the production URL is `https://`.
- [ ] **Review Firebase Auth settings** — disable any sign-in providers you're not using.

## Key Constraints

- **No build step** — edit files and refresh browser; no compilation
- **No linter or formatter** — no enforced style rules
- **No test framework** — manual browser testing only
- **CDN-only dependencies** — do not introduce npm packages for browser use
- **Firebase backend** — all user data in Firestore; `phalanx_sound` is the only remaining localStorage key
- **Single file per layer** — keep all HTML in `index.html`, all JS in `app.js`, all CSS in `styles.css`
