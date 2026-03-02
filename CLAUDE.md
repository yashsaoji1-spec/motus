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

Both accounts are hardcoded in `app.js` (Section 1) and seeded into localStorage on first load.

## File Structure

```
index.html    — all HTML screens (448 lines)
app.js        — all JS logic (~76 KB, 14 sections)
styles.css    — all styles (870 lines)
non_func/     — LICENSE.txt (copyright + third-party licenses)
node_modules/ — prompt-sync + helpers (CLI utility only, unrelated to browser app)
```

## Dependencies (CDN only — no local install)

- **MediaPipe Hands** + `camera_utils` + `drawing_utils` — hand tracking
- **Chart.js** — therapist progress charts
- **Google Fonts** — DM Sans, DM Mono, Space Mono

## Screen System

Single-page app. All screens are `<div class="screen">` in `index.html`. Navigation is done by toggling the `.active` class via `showScreen(id)` in `app.js` (Section 2).

| Screen ID           | Purpose                                      |
|---------------------|----------------------------------------------|
| `loginScreen`       | Default landing screen (has `.active`)       |
| `signupScreen`      | New account registration                     |
| `forgotScreen`      | Password reset                               |
| `connectScreen`     | Patient↔therapist link by therapist code     |
| `patientScreen`     | Patient home (today's protocol, streak)      |
| `cameraScreen`      | Live exercise session (rep counter + pain)   |
| `therapistScreen`   | Therapist dashboard (patient list + charts)  |
| `progressScreen`    | Patient progress history                     |
| `calibrationScreen` | Joint angle calibration (MediaPipe read-out) |

## Role Split

**Patient flow:** `loginScreen` → `patientScreen` → `cameraScreen` → `progressScreen`

**Therapist flow:** `loginScreen` → `therapistScreen` (sidebar patient list + main panel with stats, charts, protocol assignment)

## localStorage Schema

All app state is stored in `localStorage` — there is no backend.

| Key                                | Contents                                  |
|------------------------------------|-------------------------------------------|
| `phalanx_accounts`                 | Array of user account objects             |
| `phalanx_connections`              | Therapist↔patient links (keyed by therapist email) |
| `phalanx_sessions_<patientEmail>`  | Array of session history objects          |
| `phalanx_protocol_<patientEmail>`  | Assigned exercise protocol object         |
| `phalanx_sound`                    | `'true'` / `'false'` — sound preference  |

Streak data is derived from session history at runtime (no dedicated key).

## app.js Section Map

The file uses `/* ══ SECTION N: ... ══ */` banners. Jump to these to find logic:

| Section | Topic |
|---------|-------|
| 1  | Auth & State — account CRUD, localStorage helpers, demo seed data |
| 2  | Navigation — `showScreen()`, patient home setup |
| 3  | Login / Signup / Forgot — form handlers |
| 4  | Connect — therapist code linking flow |
| 5  | Login Success / Logout — role routing after login |
| 6  | Patient Home — streak display, protocol rendering |
| 7  | Protocol System — protocol read/write, exercise definitions |
| 8  | Therapist Panel — patient list, Chart.js graphs, protocol form |
| 9  | Rep Counter — counting logic during camera session |
| 10 | Set Tracking — set/rest timer state machine |
| 11 | Patient Session Camera — camera screen init (`patientVideo`/`patientCanvas`) |
| 12 | Progress Screen — session history display |
| 13 | Joint Selector — therapist panel joint angle UI |
| 14 | Calibration Screen — MediaPipe Hands init + angle math (`calibVideo`/`calibCanvas`) |

## CSS Variables (styles.css `:root`)

```css
--bg           #0a0c0f       /* page background */
--surface      #111318       /* card/panel background */
--border       #1e2229       /* borders and grid lines */
--accent       #00e5c0       /* teal — primary interactive color */
--accent-dim   rgba(0,229,192,0.15)
--accent-glow  rgba(0,229,192,0.4)
--text         #e8eaed       /* primary text */
--muted        #5a6072       /* secondary/disabled text */
--danger       #ff4d6a       /* error states, pain indicator */
```

## Key Constraints

- **No build step** — edit files and refresh browser; no compilation
- **No linter or formatter** — no enforced style rules
- **No test framework** — manual browser testing only
- **CDN-only dependencies** — do not introduce npm packages for browser use
- **All state in localStorage** — no backend, no fetch calls to an API
- **Single file per layer** — keep all HTML in `index.html`, all JS in `app.js`, all CSS in `styles.css`
