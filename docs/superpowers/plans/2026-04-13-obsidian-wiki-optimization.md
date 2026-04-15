# Obsidian Wiki Optimization — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fully populate the Motus Obsidian wiki so Claude Code can navigate the 12k-line codebase without reading whole files.

**Architecture:** Seven wiki files are created or fixed in priority order. The three map files are the highest-leverage deliverables — they are the navigation layer the CLAUDE.md instructs Claude to read before any source file. All files live in the local Obsidian vault at `/Users/mini/Documents/Obsidian Vault/`.

**Tech Stack:** Markdown, Obsidian vault (local), no build step.

---

## Task 1: Fix `index.md` paths

**Files:**
- Modify: `/Users/mini/Documents/Obsidian Vault/index.md`

The current index points to `app/overview.md` etc. Actual paths are `wiki/motus/app/overview.md`. The DEPLOYMENT and raw/ rows reference folders that don't exist yet; remove them (DEPLOYMENT will be added after Task 5).

- [ ] **Step 1: Read the current index.md**

Run: open `/Users/mini/Documents/Obsidian Vault/index.md`

- [ ] **Step 2: Replace the full file with corrected content**

Write this exact content to `/Users/mini/Documents/Obsidian Vault/index.md`:

```markdown
# Motus Wiki — Index

Read this file first in every session. Then read only the pages relevant to your task.
To find pages for a query, scan the catalog below and drill into relevant ones.

---

## App

| Page | Summary |
|------|---------|
| [Overview](wiki/motus/app/overview.md) | Tech stack, file structure, key constraints, feature flags, demo credentials, Firestore schema |
| [Decisions](wiki/motus/app/decisions.md) | D-1 through D-8: architectural decisions with motivation and status |
| [History](wiki/motus/app/history.md) | Chronological build log — what changed, what files were touched, gotchas |
| [app.js map](wiki/motus/app/app-js-map.md) | Sections 1–17 with function names and line numbers |
| [index.html map](wiki/motus/app/index-html-map.md) | All screens and modals with IDs and line ranges |
| [styles.css map](wiki/motus/app/styles-css-map.md) | All CSS sections with line ranges |

---

## Deployment

| Page | Summary |
|------|---------|
| [Deployment checklist](wiki/motus/DEPLOYMENT/index.md) | Pre-launch checklist across 5 phases (Code Fixes, Testing, Compliance, Deployment, Business) |

---

## Meta

| Page | Summary |
|------|---------|
| [Log](log.md) | Append-only record of all ingests, queries, and lint passes |
```

- [ ] **Step 3: Verify**

Open the file and confirm all paths begin with `wiki/motus/`.

---

## Task 2: Fill `app-js-map.md`

**Files:**
- Modify: `/Users/mini/Documents/Obsidian Vault/wiki/motus/app/app-js-map.md`

`app.js` is 6,311 lines split into named sections. This map lets future sessions read only the relevant 50–300 lines instead of the full file.

- [ ] **Step 1: Write the map**

Write this exact content to `/Users/mini/Documents/Obsidian Vault/wiki/motus/app/app-js-map.md`:

```markdown
---
project: motus
type: map
file: code/app.js
lines: 6311
updated: 2026-04-13
---

# app.js Map

Before reading app.js, use this map to find the relevant line range.
Never read the full file — read only the section you need.

## Key constants (top of file)

| Constant / block | Line | Notes |
|---|---|---|
| npm imports | 6–13 | Firebase compat, Chart.js |
| Sentry monitoring | 14–34 | prod/staging only |
| MediaPipe CDN note | 35–38 | accessed via window at call time |
| `ANGLE_TRACKING_ENABLED` flag | 130–132 | set false = manualCamScreen path |
| `VIDEO_TIERS` const | 123–129 | demo/session/message bitrate + expiry |
| Firebase config | 133–199 | project credentials |

## Sections

| Section | Name | Lines | Key functions / subsections |
|---|---|---|---|
| 1 | Auth & State (Firebase) | 39–318 | `initAuth`, `onAuthStateChanged`, global state vars. Subsections: Protocol Library state (55), Clinic state (62), Video recording state (71), Demo recording state (79), Session timeout (200), Audit logging / HIPAA (285) |
| 2 | Navigation | 319–399 | `showScreen`, `restoreScreen`, `AUTH_SCREENS` list |
| 3 | Login / Signup / Forgot | 400–490 | `login`, `signup`, `forgotPassword`, form helpers |
| 4 | Connect | 491–517 | `connectToTherapist`, connect flow |
| 5 | Login Success / Logout | 518–626 | `loginSuccess`, `logout`, role routing |
| 5b | Admin Panel | 627–665 | `loadAdminPanel`, `approveTherapist`, `rejectTherapist` |
| 5c | Clinics | 666–1018 | `loadClinicScreen`, `createClinic`, `joinClinic`, clinic invite/manage logic. Clinic badge (475 in CSS) |
| 5d | Clinic Library | 1019–1163 | `loadClinicLibrary`, `shareExercise`, `closeShareExerciseModal` |
| 6 | Patient Home | 1164–1705 | `loadPatientHome`, completion ring, streak. Manual session logging (1396): `saveManualSession`. Manual Camera Session (1417): `startManualCam`, `endSet`, `finishManualSession` |
| 7 | Protocol System | 1706–2512 | `getProtocols`, `addProtocol`, `deleteProtocol`, `bulkAssignProtocol`. Demo video recording (1927): `startDemoRecording`, `stopDemoRecording`. Protocol card demo actions (2199). Patient-side demo auto-play (2231): `checkAndShowDemo` |
| 8 | Therapist Panel | 2513–3647 | `loadTherapistPanel`, `loadPatientPanel`, `backToPatientList`, `filterPatients`, `toggleTpSection`. Mobile helpers (2610). Add Protocol Modal (2938): `openAddProtocol`, `closeAddProtocol`, `saveProtocol`, `plToggleHiddenSection` |
| 9 | Rep Counter (camera) | 3648–3956 | `initRepCounter`, `countRep`, `updateAngleDisplay`. TAM (Total Arc of Motion) (3833) |
| 10 | Set Tracking | 3957–4164 | `startSet`, `endSet`, `saveSetData`, set state management |
| 11 | Patient Session Camera | 4165–4525 | `startCamera`, `stopCamera`. Recording pipeline (4302). Compression pipeline (4380). Upload pipeline (4468): `uploadToCloudinary`. Video modal (4489): `openVideoModal`, `closeVideoModal` |
| 12 | Progress Screen | 4526–4816 | `loadProgressScreen`, `renderProgressCards`, day-grouped card rendering |
| 15 | Messaging | 4817–5141 | XSS protection + `timeAgo` (4821). Core helpers (4846). Thread renderer (4881): `renderThread`. Patient-side (4953): `loadMessaging`, `sendMessage`. Therapist panel builder (5083): `buildMessagingPanel` |
| 17 | ML Angle Trainer (dormant) | 5142–6279 | `loadMLModels` (5170), `getTrainedAngle` (5230), `startMLTrainer` (5273), `mlStartCamera` (5311), `mlOnResults` (5412), `trainMLModel` (5735), `mlRefreshSampleCounts` (5876), `mlRenderSamples` (6098). All dormant — `ANGLE_TRACKING_ENABLED = false` |
| Window exports | 6280–6311 | `Object.assign(window, {...})` — all onclick-callable functions must be listed here |

## Notes

- Sections 13, 14, 16 do not exist in the codebase (skipped numbering).
- Section 8b is referenced in CLAUDE.md but is embedded within Section 8 (therapist panel subsections).
- `manualCamScreen` recorder is hardcoded at 400 kbps — not from `VIDEO_TIERS`.
- `getTrainedAngle` (Section 17, line 5230) is called from Sections 9 and 16 — the only cross-section dependency to watch.
```

- [ ] **Step 2: Verify**

Confirm the file has content and includes the Window exports row at line 6280.

---

## Task 3: Fill `index-html-map.md`

**Files:**
- Modify: `/Users/mini/Documents/Obsidian Vault/wiki/motus/app/index-html-map.md`

`index.html` is 1,147 lines. Every screen, modal, and overlay is cataloged here.

- [ ] **Step 1: Write the map**

Write this exact content to `/Users/mini/Documents/Obsidian Vault/wiki/motus/app/index-html-map.md`:

```markdown
---
project: motus
type: map
file: code/index.html
lines: 1147
updated: 2026-04-13
---

# index.html Map

Before editing index.html, use this map to find the element by ID without scanning the full file.

## Screens

| ID | Scope | Line | Description |
|---|---|---|---|
| `loginScreen` | patient | 18 | Login form — email/password, forgot link, sign up link |
| `signupScreen` | patient | 48 | Sign-up form — name, email, password, role selector |
| `forgotScreen` | patient | 81 | Forgot password — email field only |
| `consentScreen` | patient | 106 | HIPAA consent — shown once on first login |
| `pendingScreen` | patient | 139 | Therapist pending approval — shown while role is `therapist_pending` |
| `adminScreen` | therapist | 156 | Admin panel — approve/reject pending therapists |
| `connectScreen` | patient | 172 | Connect to therapist — enter therapist code |
| `patientScreen` | patient | 194 | Patient home — greeting, today's plan, completion ring, streak |
| `exercisesScreen` | patient | 265 | Exercise select — shown when patient has 2+ protocols |
| `cameraScreen` | patient | 279 | MediaPipe camera session (dormant — `ANGLE_TRACKING_ENABLED = false`) |
| `manualCamScreen` | patient | 361 | Manual camera session — video recording, end-set flow |
| `therapistScreen` | therapist | 445 | Therapist dashboard — icon sidebar + 3-column layout |
| `progressScreen` | patient | 510 | Progress — day-grouped session cards |
| `messagingScreen` | patient | 536 | Messaging — patient ↔ therapist thread |
| `clinicScreen` | therapist | 558 | Clinic home — manage clinic members |
| `createClinicScreen` | therapist | 571 | Create new clinic |
| `joinClinicScreen` | therapist | 594 | Join existing clinic with code |
| `clinicLibraryScreen` | therapist | 629 | Clinic exercise library — shared exercises |
| `mlTrainerScreen` | therapist | 655 | ML angle trainer — dormant, hidden unless `ANGLE_TRACKING_ENABLED = true` |

## Modals & Overlays

| ID | Type | Line | Description |
|---|---|---|---|
| `calOverlay` | overlay | 283 | Calibration overlay (inside cameraScreen) |
| `congratsOverlay` | overlay | 319 | Congrats animation (inside cameraScreen) |
| `restTimerOverlay` | overlay | 329 | Rest timer between sets (inside cameraScreen) |
| `setInputModal` | bottom sheet | 389 | Set input form — reps, pain, notes (inside manualCamScreen) |
| `setNotesModal` | modal | 521 | View set notes detail |
| `shareExerciseModal` | modal | 641 | Share exercise to clinic library |
| `mlOverlay` | overlay | 670 | MediaPipe loading overlay (inside mlTrainerScreen) |
| `sessionSummaryOverlay` | overlay | 804 | Session summary after completing all sets |
| `logoutModal` | modal | 840 | Logout confirmation |
| `videoModal` | modal | 862 | Video playback — session recordings |
| `addProtocolModal` | modal | 877 | Add protocol form — exercise picker, reps/sets/freq, demo video |
| `protocolLibraryModal` | modal | 975 | Protocol library — browse/filter all exercises |
| `manualSessionModal` | modal | 1092 | Manual session entry (no camera) |
| `demoVideoOverlay` | overlay | 1114 | Demo video playback before session |
| `compressionOverlay` | overlay | 1130 | Video compression progress indicator |

## Notes

- `AUTH_SCREENS` (never restored by `restoreScreen`): loginScreen, signupScreen, forgotScreen, consentScreen, pendingScreen, adminScreen, connectScreen.
- `cameraScreen` and `messagingScreen` cannot be restored — require runtime state.
- `exercisesScreenInner` (line 272) is a dynamic container filled by JS — not a screen itself.
- `progressContent` (line 516) is a dynamic container inside progressScreen.
```

- [ ] **Step 2: Verify**

Confirm the file is non-empty and includes both the Screens and Modals tables.

---

## Task 4: Fill `styles-css-map.md`

**Files:**
- Modify: `/Users/mini/Documents/Obsidian Vault/wiki/motus/app/styles-css-map.md`

`styles.css` is 4,875 lines. This map groups sections by screen so you can find the right line range without scanning.

- [ ] **Step 1: Write the map**

Write this exact content to `/Users/mini/Documents/Obsidian Vault/wiki/motus/app/styles-css-map.md`:

```markdown
---
project: motus
type: map
file: code/styles.css
lines: 4875
updated: 2026-04-13
---

# styles.css Map

Before editing styles.css, use this map to find the right line range.
Never read the full file — read only the section you need.

## Global / Foundations

| Section | Lines | Notes |
|---|---|---|
| CSS variables (`:root`) | 1–45 | All design tokens: `--bg`, `--accent`, `--text`, `--danger`, `--green`, `--gold`, gradients |
| Patient scope | 46–63 | `.patient-scope` show/hide rules |
| Therapist scope | 64–87 | `.therapist-scope` show/hide rules |
| Global focus & transitions | 88–111 | Focus rings, `transition` defaults |
| Shared status pill / dot | 112–138 | `.status-pill`, `.status-dot` — used across screens |

## Auth Screens

| Section | Lines | Notes |
|---|---|---|
| Auth screens | 139–264 | loginScreen, signupScreen, forgotScreen shared layout |
| Patient hero / outline / accent buttons | 265–360 | `.pt-hero-btn`, `.pt-outline-btn`, `.pt-accent-btn` |
| Role segmented control | 361–389 | Sign-up role selector |
| Consent screen extras | 390–438 | consentScreen scroll area, checkbox |
| Admin panel | 439–474 | adminScreen table, approve/reject buttons |
| Clinic badge | 475–523 | `.clinicInviteBadge` in therapist sidebar |
| Bulk assign patient selector | 524–547 | Multi-select patient list in Add Protocol modal |

## Patient Home (`patientScreen`)

| Section | Lines | Notes |
|---|---|---|
| Patient home | 548–739 | 3-zone layout, greeting, completion ring, streak counter, today's plan list |
| Patient sub-screen shell | 740–787 | Shared shell for progressScreen, messagingScreen (`.pt-subscreen`) |

## Camera Screens

| Section | Lines | Notes |
|---|---|---|
| Camera screen (cameraScreen) | 788–875 | MediaPipe session layout — dormant |
| Camera HUD + Control Card | 876–961 | Angle readout, rep counter HUD |
| Congrats overlay | 962–973 | Congrats animation within cameraScreen |
| Calibration overlay | 974–1008 | Joint calibration UI |
| Rep dots / speed warning / streak | 1806–1830 | Rep feedback dots, speed warning pill |
| Rest timer overlay | 1831–1862 | Between-set rest timer |
| Rep feedback HUD | 1863–1870 | Live angle readout below camera |
| Session summary overlay | 1871–1927 | Post-session summary card |
| XP / Level bar | 1928–1947 | XP progress bar (session summary) |
| Camera screen (manualCamScreen) | 3900–4034 | Manual recording session layout |
| Set input bottom sheet | 4035–4126 | `setInputModal` — reps, pain slider, notes |

## Therapist Screen (`therapistScreen`)

| Section | Lines | Notes |
|---|---|---|
| Therapist screen | 1009–1346 | Icon sidebar, 3-column layout, patient list, compliance indicator |
| Therapist layout high-specificity overrides | 1341–1346 | Specificity hacks for responsive cascade |
| Protocol card & form | 1347–1430 | Protocol cards, edit/delete, frequency badge |
| My Exercises | 1431–1473 | Per-therapist exercise library panel |
| Exercise Params UI (`ep-*`) | 1474–1522 | Direction range inputs in Add Protocol form |
| Session history | 1523–1606 | Day-grouped history cards, 6-column desktop grid, mobile card layout |
| Modal (generic) | 1607–1624 | Generic `.modal-overlay` backdrop |
| Calibration (ML trainer section) | 1948–2398 | Full ML calibration UI — dormant |
| Calibration button in sidebar | 2370–2398 | Sidebar calibration shortcut button |
| Charts grid | 2399–2402 | ROM chart grid layout |
| ML Trainer screen | 2403–3116 | `mlTrainerScreen` — all ML trainer styles. Dormant. |
| Therapist empty state | 3373–3378 | "No patient selected" placeholder |
| Collapsible therapist panel sections | 3379–3405 | `.tp-colsec` collapsible panel system |
| Mobile responsive overlays | 3406–3459 | Mobile therapist panel slide-in overlay |
| Patient panel header | 3535–3556 | Patient name + action buttons in panel header |
| Add Protocol button (panel header) | 3557–3579 | "Add Protocol" CTA in patient panel |
| Add Protocol Modal | 3580–3899 | Full `addProtocolModal` layout and form |

## Progress Screen (`progressScreen`)

| Section | Lines | Notes |
|---|---|---|
| Progress screen | 1625–1805 | Day-grouped cards, set details, video thumbnails |

## Messaging Screen (`messagingScreen`)

| Section | Lines | Notes |
|---|---|---|
| Messaging screen | 3247–3372 | Thread layout, message bubbles, send form |

## Shared / Utility

| Section | Lines | Notes |
|---|---|---|
| Bottom sheet | 3460–3513 | Generic `.pt-bottom-sheet-overlay` |
| Video playback modal | 3514–3522 | `videoModal` player layout |
| Session history video button | 3523–3534 | Play button on history card |
| My Exercises screen (`exs-*`) | 4127–4216 | `exercisesScreen` — exercise pick list |
| Manual Session Modal | 4217–4304 | `manualSessionModal` — no-camera session entry |
| Compression Progress Overlay | 4305–4346 | `compressionOverlay` spinner + progress bar |
| Protocol Library | 4347–4518 | `protocolLibraryModal` — full exercise browser |

## Responsive / Media Queries

| Section | Lines | Notes |
|---|---|---|
| Responsive base (< 640px) | 3117–3179 | Mobile-first overrides |
| Tablet (≥ 640px) | 3180–3210 | Tablet breakpoint |
| Desktop (≥ 1024px) | 3211–3246 | Desktop layout adjustments |
| Admin screen responsive (bottom of file) | 4519–4875 | Admin screen + final responsive rules |

## Notes

- CSS variables live at lines 1–45. Always use `var(--token)` — never hardcode colors.
- The `--gradient-cta` is used for primary action buttons across all screens.
- Therapist section (1009–1346) is large — for sidebar-only changes read 1009–1100; for patient list read 1100–1250.
- ML trainer styles (2403–3116) are dormant but must not be deleted.
```

- [ ] **Step 2: Verify**

Confirm the file is non-empty and the Global/Foundations and Responsive sections are present.

---

## Task 5: Create `DEPLOYMENT/index.md`

**Files:**
- Create: `/Users/mini/Documents/Obsidian Vault/wiki/motus/DEPLOYMENT/index.md`

The CLAUDE.md ULP sequence reads this file at Step 2. It doesn't exist yet — the ULP will silently skip updates without it.

- [ ] **Step 1: Create the directory and file**

Create `/Users/mini/Documents/Obsidian Vault/wiki/motus/DEPLOYMENT/index.md` with this content:

```markdown
---
project: motus
type: deployment-checklist
updated: 2026-04-13
---

# Motus — Pre-Launch Checklist

Five phases. Update `status` and `updated` when an item's state changes.
ULP reads this file — keep it current.

---

## Phase A — Code Fixes

| # | Item | Status | Updated |
|---|---|---|---|
| A-1 | Delete or rotate demo credentials (sarah.chen, james.park) | pending | — |
| A-2 | Audit all `console.log` — remove or gate behind dev flag | pending | — |
| A-3 | Replace all `REPLACE_*` placeholders in Firebase config | done | 2026-04-11 |
| A-4 | Set up video expiry Cloud Function (Cloudinary + Firebase Blaze plan) | pending | — |
| A-5 | Review and harden Firestore security rules | pending | — |

---

## Phase B — Testing

| # | Item | Status | Updated |
|---|---|---|---|
| B-1 | Full patient flow on iOS Safari (consent → session → summary) | pending | — |
| B-2 | Full therapist flow (add protocol, bulk assign, session history, messaging) | pending | — |
| B-3 | Admin flow (approve / reject therapist_pending) | pending | — |
| B-4 | Test on HTTPS — camera requires secure context | done | 2026-04-11 |
| B-5 | Test Cloudinary upload on mobile (real device, not simulator) | pending | — |
| B-6 | Test demo video overlay — skip disabled until previously watched | pending | — |
| B-7 | Verify screen restoration (`sessionStorage`) for all non-auth screens | pending | — |

---

## Phase C — Compliance (PHI gate)

> **PHI BLOCK:** Do not deploy features that introduce new Firestore collections or store new patient data until all Phase C items are complete. See CLAUDE.md PHI guardrail.

| # | Item | Status | Updated |
|---|---|---|---|
| C-1 | Sign Business Associate Agreements (BAAs) with Firebase / Google | pending | — |
| C-2 | Sign BAA with Cloudinary | pending | — |
| C-3 | Enable Firebase audit logging (HIPAA §164.312(b)) — audit log stubs exist in app.js | pending | — |
| C-4 | Review consent screen text with legal | pending | — |
| C-5 | Document data retention policy | pending | — |
| C-6 | Confirm session timeout values meet HIPAA requirements | pending | — |

---

## Phase D — Deployment

| # | Item | Status | Updated |
|---|---|---|---|
| D-1 | Upgrade Firebase project to Blaze plan (required for Cloud Functions) | pending | — |
| D-2 | Run `npm run build && firebase deploy --only hosting` from clean main branch | pending | — |
| D-3 | Verify live URL: https://phalanx-firebase-database.web.app | pending | — |
| D-4 | Disable unused Firebase Auth sign-in providers | pending | — |
| D-5 | Create first real admin account (Firebase Auth console + Firestore `users/{email}` → `{role: "admin"}`) | pending | — |
| D-6 | Set up custom domain (if applicable) | pending | — |

---

## Phase E — Business

| # | Item | Status | Updated |
|---|---|---|---|
| E-1 | Decide on free vs. paid tier structure | pending | — |
| E-2 | Set up Stripe or billing (if monetizing at launch) | pending | — |
| E-3 | Privacy policy and terms of service pages | pending | — |
| E-4 | Onboarding email for new therapist signups | pending | — |
```

- [ ] **Step 2: Verify**

Confirm the file exists and all five phase tables are present.

---

## Task 6: Update `history.md`

**Files:**
- Modify: `/Users/mini/Documents/Obsidian Vault/wiki/motus/app/history.md`

The history currently ends at the wiki scaffold entry. Oliver's `oliver` branch contains 10 significant commits of UI work that must be logged.

- [ ] **Step 1: Read the current history.md**

Read `/Users/mini/Documents/Obsidian Vault/wiki/motus/app/history.md` to find the end of the file.

- [ ] **Step 2: Append the new entry**

Append this block to the end of `/Users/mini/Documents/Obsidian Vault/wiki/motus/app/history.md`:

```markdown
## 2026-04-13 — Oliver UI branch (oliver branch)
What changed: Full UI design system rollout from the `oliver` branch. 10 commits covering all visible screens.
Files touched: `code/index.html`, `code/styles.css`, `code/app.js`

Changes by area:
- **Patient home screen**: Restructured to 3-zone no-scroll layout. Greeting zone, today's plan zone, action zone.
- **Exercise select screen**: `exercisesScreen` added for patients with 2+ protocols. Shows done/total badge per protocol.
- **Session recording**: `manualCamScreen` set input bottom sheet (`setInputModal`) — reps, pain 1–10, notes. Cloudinary upload on save.
- **Progress screen**: `progressScreen` day-grouped set cards. 15 cards per page.
- **Messaging screen**: `messagingScreen` patient ↔ therapist thread. XSS-safe renderer, relative timestamps.
- **Therapist dashboard**: Icon sidebar, 3-column layout (sidebar / patient list / patient panel). Compliance indicator on patient list. Clinic code badge.
- **Admin screen**: `adminScreen` — approve/reject `therapist_pending` accounts. Table layout.
- **Design system rollout**: Full CSS variable usage across all screens. No hardcoded colors. Removed dead rules.

Known side effects / gotchas: manualCamScreen recorder is hardcoded at 400 kbps (not from VIDEO_TIERS const). setInputModal uses `.pt-bottom-sheet-overlay` — same class as the generic bottom sheet.
```

- [ ] **Step 3: Verify**

Confirm the 2026-04-13 entry is present at the end of the file.

---

## Task 7: Append to `log.md`

**Files:**
- Modify: `/Users/mini/Documents/Obsidian Vault/log.md`

The log is append-only. One entry records this entire wiki optimization session.

- [ ] **Step 1: Read the current log.md**

Read `/Users/mini/Documents/Obsidian Vault/log.md` to confirm the last entry.

- [ ] **Step 2: Append the entry**

Append this block to the end of `/Users/mini/Documents/Obsidian Vault/log.md`:

```markdown
## [2026-04-13] mapping | Wiki optimization — maps, deployment checklist, history
Files: index.md, wiki/motus/app/app-js-map.md, wiki/motus/app/index-html-map.md, wiki/motus/app/styles-css-map.md, wiki/motus/DEPLOYMENT/index.md, wiki/motus/app/history.md
What: Filled all three empty map files from source (app.js 6311 lines, index.html 1147 lines, styles.css 4875 lines). Created DEPLOYMENT pre-launch checklist (5 phases, 25 items). Updated history.md with Oliver branch UI work (10 commits). Fixed broken paths in index.md. All wiki pages now populated.
```

- [ ] **Step 3: Verify**

Confirm the 2026-04-13 mapping entry is present.

---

## Self-Review

**Spec coverage:**
- Fix index.md paths → Task 1 ✓
- Fill app-js-map.md → Task 2 ✓
- Fill index-html-map.md → Task 3 ✓
- Fill styles-css-map.md → Task 4 ✓
- Create DEPLOYMENT/index.md → Task 5 ✓
- Update history.md → Task 6 ✓
- Append log.md → Task 7 ✓

All spec requirements covered. No placeholders. No TBD. All content is actual Markdown to be written verbatim.
