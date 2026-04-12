@.claude/rules/context-window.md
@.claude/rules/constraints.md
@.claude/rules/ui-rules.md
@.claude/rules/maintenance.md

## Wiki (second brain)
- Wiki lives at `~/Library/Mobile Documents/iCloud~md~obsidian/Documents/Motus/wiki/`.
- Session start: (1) read `index.md`, (2) check `_inbox/` for any files not yet in `log.md` — if found, announce them and offer to route before doing anything else, (3) read pages relevant to the current task.
- Inbox routing: classify each new `_inbox/` file (motus → projects/motus/, article/research → research/, other project → projects/{name}/), tell Yash where it's going, confirm, write wiki page, delete from inbox, update index.md + log.md.
- After completing meaningful work, update the relevant wiki pages (history.md, decisions.md, overview.md) and append to log.md.
- When Yash says "lint wiki": run the lint protocol from that wiki's CLAUDE.md.
- When Yash says "add to wiki", "file this", or pastes content: classify and route it using the inbox routing protocol above.
- Code maps: Before reading app.js, index.html, or styles.css — read the corresponding map page first (app-js-map.md, index-html-map.md, styles-css-map.md). Use the line ranges from the map to read only the relevant section, not the full file.
- After any session that adds/removes/moves functions significantly, update the line numbers in the affected map page.

# Motus — Claude Code Guide

Physical rehabilitation web app. Authors: Yash Saoji & Oliver Huelsbeck (2025)

## Git Workflow
- Run `git branch` before any git operations to verify you're on the correct branch.

## PHI guardrail
Phase C (compliance) is not done. If Yash asks to deploy a feature that introduces a new Firestore collection or stores a new type of patient data (PHI), block the production deploy and remind him that Phase C (BAAs + audit logging, items 18–29) must be completed first. Feature development is fine — just don't deploy PHI-touching features to production until Phase C is done.

## ULP — Update, Log, Push

When Yash says "ULP" (any case, with or without slash), run this sequence in full without asking for confirmation at each step. Only stop if something is genuinely ambiguous.

**Step 1 — Understand what changed**
Run in parallel: `git branch` (confirm NOT on main — stop if we are), `git status`, `git diff HEAD`, `git log --oneline -5`. Read the diff carefully to understand what features or fixes are present and why.

**Step 2 — Update deployment files if needed**
Check `wiki/motus/DEPLOYMENT/index.md`. For any item whose status changed based on what was done, update `status` and `updated` in that item's individual file frontmatter, and update the row in `index.md`. Only update items you are confident about.

**Step 3 — Write the Obsidian log entry**
Log file: `~/Library/Mobile Documents/iCloud~md~obsidian/Documents/Yash2/wiki/motus/log/YYYY-MM-DD.md` (today's date). If the file does not exist, create it with frontmatter `type: commit-log` and `date: YYYY-MM-DD`. Append one callout block per logical session:
```
> [!note]- [Short descriptive title]
> **Files:** [comma-separated relative paths]
> **Why:** [1–2 sentences — product perspective, not implementation]
>
> **What changed:**
> - [one bullet per meaningful change — specific, no filler]
>
> **Deployment checklist:** [only if a checklist item changed status. Omit if nothing changed.]
```
No emojis, no filler words ("successfully", "now works correctly"). Title descriptive enough to find by skimming.

**Step 4 — Commit and push**
Stage all changed files (code files first, then wiki files). Commit message: one line, present tense, imperative mood, feature/fix level. No emojis. Push to current branch — never main. Confirm with `git log --oneline -3`.

**Step 5 — Report back**
3–5 bullets: what was committed, log entry written, deployment items updated (if any), branch pushed to, any open questions.

## Editing Rules
- Do NOT delete or overwrite content in CLAUDE.md, CLAUDE.local.md, or other config/doc files unless explicitly asked to remove specific content.
- When updating docs, APPEND or MODIFY only the relevant sections.

## How to Run
```
npm install    # first time only
npm run dev    # http://localhost:5173
```
Camera requires secure context (`localhost` or `https://`). Static fallback: `python3 -m http.server 8080 → http://localhost:8080/index.html`.

## Demo Credentials

| Role      | Email                     | Password |
|-----------|---------------------------|----------|
| Therapist | sarah.chen@mayoclinic.org | demo123  |
| Patient   | james.park@gmail.com      | demo123  |

Firebase persists auth across reloads.

## File Structure
```
code/
  index.html   — all HTML screens
  app.js       — all JS (sections 1–17 + 5b + 8b + window exports)
  styles.css   — all styles
vite.config.mjs  — root: code/, outDir: ../dist
firestore.rules
public/404.html  — copied to dist/ by Vite
dist/            — build output (gitignored)
hardware/        — 3D jig .scad files
scripts/import-freihand.js
```

## Dependencies
- **firebase** `^9.23.0` — compat SDK (auth + firestore)
- **chart.js** `^4.0.0` — therapist charts
- **vite** `^5.0.0` (dev) — build
- **Cloudinary** — video storage, plain fetch; cloud `dslbugsdg`, preset `phalanx-videos`
- **MediaPipe Hands** + `camera_utils` + `drawing_utils` — CDN, hand tracking
- **TensorFlow.js** `@4.x` + **MobileNet** `@2.1.0` — CDN, ML angle models (dormant)
- **Google Fonts** — DM Sans, DM Mono, Space Mono

## Feature Flag: ANGLE_TRACKING_ENABLED
`app.js` line ~41, after Cloudinary constants.

**`false` (current):** sessions route to `manualCamScreen`; ML Trainer (`mlTrainerScreen`) inaccessible; ROM/Joint Monitoring hidden in therapist panel; angle builder hidden in Add Protocol form; progress shows day-grouped per-set cards (no ROM chart). Dormant code in Sections 9–11, 13, 17 is fully intact.

**To re-enable:** set to `true`, then restore ML Trainer button in `index.html` therapist sidebar (between `<h2>phalanX</h2>` and the clinic-badge div):
```html
<button class="sidebar-ml-btn" onclick="startMLTrainer()">ML Trainer</button>
```
Sessions route to `cameraScreen` (MediaPipe), therapist panel restores ROM chart + Joint Monitoring + `ejsInit`, `restoreScreen` re-enables `mlTrainerScreen`.

## GitHub & Firebase Hosting
- Repo: `https://github.com/yashsaoji1-spec/motus` — default branch `main`, current branch `yash`
- Live: `https://phalanx-firebase-database.web.app`
- Deploy: `npm run build && ~/.npm-global/bin/firebase deploy --only hosting`

## Video System
`VIDEO_TIERS` const (Section 1):

| Tier    | Bitrate  | Max     | Expiry    |
|---------|----------|---------|-----------|
| demo    | 800 kbps | 120s    | permanent |
| session | 500 kbps | 600s    | 14 days   |
| message | 300 kbps | 60s     | 7 days    |

`manualCamScreen` recorder is hardcoded at **400 kbps** (not from VIDEO_TIERS). Expiry is UI-only — Cloudinary files persist until a Cloud Function is set up (see Pre-Launch Checklist in maintenance.md).

## Firebase Setup
Project: `phalanx-firebase-database`. Config at top of `app.js` Section 1.

### Firestore Collections

| Collection         | Doc ID              | Key fields |
|--------------------|---------------------|------------|
| `users`            | `{email}`           | `name, role, consentGiven?, consentTimestamp?` |
| `connections`      | `{therapistEmail}`  | `patients: [email]` |
| `protocols`        | `{patientEmail}`    | `items: [{id, exerciseType, reps, sets, frequency, assignedBy, notes?, demoVideoUrl?, exerciseParams?}], demoWatched?: [id]` |
| `sessions`         | auto                | `patientEmail, date, reps, pain, exerciseType, protocolId, therapistEmail, setData?: [{reps, pain, notes, videoUrl?}], jointAngles?, videoUrl?` |
| `messages`         | auto                | `from, to, participants, text, timestamp, read` |
| `therapistLibrary` | `{therapistEmail}`  | `customExercises: [{id,name,cat,dr,ds,df,desc}], hiddenIds: [id], editedBuiltIns: [{id,...}]` |
| `customExercises`  | auto                | `id, name, cat, dr, ds, df, desc, createdBy` — legacy global; superceded by `therapistLibrary` |
| `jointTracking`    | `{patientEmail}`    | `joints: [key], updatedBy` |
| `calibration`      | `{patientEmail}`    | `joints: {[key]: {angle, metricVal}}, recordedAt, recordedBy` |
| `trainingChunks`   | auto                | `joint, samples: [{landmarks, trueAngle, imageFeatures?, recordingId?}], chunkIndex` |
| `trainingMeta`     | `{joint-hand}`      | `totalSamples, chunkCount, lastUpdated, histogram: {b0…b17}` |
| `mlModels`         | `{joint-hand}`      | `type, topology, weights, sampleCount, trainedAt, trainedBy` |

Backward compat: flat `protocols` docs (no `items`) are wrapped as `[{id:'legacy',...}]` by `getProtocols()`. Old sessions without `protocolId` are excluded from completion counts.

### Composite Indexes
- `sessions`: `patientEmail` ASC + `date` ASC
- `messages`: `participants` ARRAY + `timestamp` ASC
- `messages`: `to` ASC + `from` ASC + `read` ASC

### Roles
| Value               | Access |
|---------------------|--------|
| `patient`           | full patient flow |
| `therapist`         | full therapist dashboard |
| `therapist_pending` | blocked, sees pendingScreen until admin approves |
| `admin`             | approve/reject pending therapists only |

Admin accounts created manually: Firebase Auth console → add user, then Firestore `users/{email}` → `{name, role: "admin"}`.

## User Flows

**Patient:** Login → (consent first time) → (connect to therapist if needed) → `patientScreen` (greeting, today's plan, completion ring, streak) → "Start a Session":
- 1 protocol → `manualCamScreen` directly
- 2+ protocols → `exercisesScreen` (pick protocol, see done/total badge)
- If `demoVideoUrl` exists → demo overlay (skip disabled until previously watched; tracked in `protocols.demoWatched[]`)

`manualCamScreen`: tap Start → records at 400 kbps → tap End Set → **set input modal** (reps, pain 1–10, notes) → Save uploads blob to Cloudinary, appends `{reps, pain, notes, videoUrl}` to `_manualCamSetData[]` → repeat → Exit/finish → one `sessions` doc saved with full `setData` array → back to `patientScreen`.

**Therapist:** Login → `therapistScreen` (sidebar: patient list with compliance indicator, clinic code badge, Protocol Library button) → click patient → collapsible panels (all collapsed by default): Pain Chart, Session History (day-grouped, 15/page, per-set video+reps+pain+notes), Current Protocol (edit/delete/play demo), Messages → "Add Protocol": pick exercise from library, set reps/sets/freq, optionally record/upload demo video → Save appends to `protocols/{email}.items` with `id: Date.now()`. "Bulk Assign": same form + patient multi-select.

**Admin:** Login → `adminScreen` → approve/reject `therapist_pending` accounts.

## Screen Persistence
`showScreen(id)` saves to `sessionStorage('phalanx_screen')` — excluded screens (`AUTH_SCREENS`): `loginScreen`, `signupScreen`, `forgotScreen`, `consentScreen`, `pendingScreen`, `adminScreen`, `connectScreen`. `restoreScreen()` in `loginSuccess()` reads saved value **before** any `showScreen()` call. `cameraScreen` and `messagingScreen` cannot be restored (require runtime state).

## Window Exports
`app.js` ends with `Object.assign(window, {...})`. Every function called from an HTML `onclick` must be added here — the file is an ES module and won't auto-expose globals.
