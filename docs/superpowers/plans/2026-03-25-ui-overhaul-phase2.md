# Phase 2 UI Overhaul Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Overhaul the camera session, overlays, exercises, progress, and messaging screens to match Phase 1's warm neutral design system.

**Architecture:** All changes happen in three files (`code/index.html`, `code/styles.css`, `code/app.js`). No new files, no build tools, no dependencies. CSS uses existing `:root` tokens. JS modifications preserve all existing element IDs and `getElementById` references. New responsive breakpoint at 768px.

**Tech Stack:** Vanilla HTML/CSS/JS, Chart.js (existing), MediaPipe (existing), Firebase (existing)

**Spec:** `docs/superpowers/specs/2026-03-25-ui-overhaul-phase2-design.md`

---

### Task 1: Camera Session — HTML Restructure

Restructure the `#cameraScreen` HTML to the hybrid layout: remove `.cam-header`, move elements into HUD overlays and a new control card below the viewport.

**Files:**
- Modify: `code/index.html:216-273`

**Spec reference:** §1 (Camera Session — Hybrid Layout)

- [ ] **Step 1: Replace camera screen HTML**

Replace lines 216–273 of `index.html` with the new hybrid layout structure. The `.cam-header` is removed. Back button moves into the viewport as a HUD overlay. `#camExerciseName` and `#camSetLabel` move into a new `.cam-ctrl-card` below the viewport. Set tracker, progress bar, pain slider, and end button also move into the control card.

```html
<div id="cameraScreen" class="screen">
  <div class="cam-viewport">
    <video id="patientVideo" autoplay playsinline muted></video>
    <canvas id="patientCanvas"></canvas>
    <button class="cam-hud-back" onclick="showScreen('patientScreen')">← Back</button>
    <button id="flipCameraBtn" class="cam-flip-btn" onclick="flipCamera()" style="display:none;">
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="white" width="20" height="20"><path d="M20 5h-3.17L15 3H9L7.17 5H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V7c0-1.1-.9-2-2-2zm-5 11.5V14H9v2.5L5.5 13 9 9.5V12h6V9.5l3.5 3.5-3.5 3.5z"/></svg>
    </button>
    <div class="cam-hud-sets" id="setTracker"></div>
    <div class="rep-overlay">
      <div class="rep-count-row">
        <span class="rep-number" id="repDisplay">0</span>
        <span class="rep-target" id="repTargetDisplay">/ 10</span>
      </div>
    </div>
    <div class="speed-warning" id="speedWarning">Slow down — control the movement</div>
    <div id="congratsOverlay">
      <h2>Great work!</h2>
      <p>Set <strong id="currentSetDisplay">1</strong> of <strong id="totalSetsDisplay">3</strong> complete!</p>
      <p class="congrats-reps-text"><strong id="targetDisplay">10</strong> reps completed</p>
      <p id="allSetsComplete" class="congrats-all-sets">All sets complete for today!</p>
      <p class="congrats-pain-prompt">How much pain are you in right now?</p>
      <input type="range" min="1" max="10" value="5" id="painSliderCongrats" class="congrats-pain-slider" />
      <p id="painValueCongrats" class="congrats-pain-value">5 / 10</p>
      <button class="reset-btn" id="nextSetBtn" onclick="advanceSet()">Start Next Set</button>
    </div>
    <div id="restTimerOverlay" class="rest-timer-overlay" style="display:none;">
      <p class="rest-timer-label">Rest Period</p>
      <div id="restTimerCount" class="rest-timer-count">30</div>
      <p class="rest-timer-sub">Next set starts automatically</p>
      <div class="rest-timer-bar">
        <div id="restTimerFill" class="rest-timer-fill"></div>
      </div>
      <button class="reset-btn rest-skip-btn" onclick="skipRest()">Skip Rest →</button>
    </div>
  </div>

  <div class="cam-ctrl-card">
    <div class="cam-ctrl-header">
      <span class="cam-exercise-name" id="camExerciseName">Session</span>
      <span class="cam-set-label" id="camSetLabel">Set 1 of 3</span>
    </div>
    <div id="repFeedback" class="cam-feedback"></div>
    <div class="progress-bar-track">
      <div class="progress-bar-fill" id="progressFill"></div>
    </div>
    <div class="cam-pain-strip">
      <label class="cam-pain-label">Pain</label>
      <input type="range" min="1" max="10" value="1" id="painSlider"
             oninput="document.getElementById('painValue').textContent = this.value + ' / 10'" />
      <span class="cam-pain-value" id="painValue">1 / 10</span>
    </div>
    <button class="cam-end-btn" onclick="completeSessionEarly()">End Session</button>
  </div>
</div>
```

All existing IDs preserved: `patientVideo`, `patientCanvas`, `flipCameraBtn`, `setTracker`, `repDisplay`, `repTargetDisplay`, `speedWarning`, `congratsOverlay`, `currentSetDisplay`, `totalSetsDisplay`, `targetDisplay`, `allSetsComplete`, `painSliderCongrats`, `painValueCongrats`, `nextSetBtn`, `restTimerOverlay`, `restTimerCount`, `restTimerFill`, `repFeedback`, `progressFill`, `painSlider`, `painValue`, `camExerciseName`, `camSetLabel`.

- [ ] **Step 2: Verify no broken ID references**

Search `app.js` for every element ID used in the camera screen to confirm none were lost or renamed:

```bash
grep -n "getElementById\|querySelector" code/app.js | grep -i "cam\|rep\|pain\|progress\|congrat\|rest\|flip\|speed\|set"
```

Every ID in the grep output must exist in the new HTML.

- [ ] **Step 3: Commit**

```bash
git add code/index.html
git commit -m "Restructure camera screen to hybrid layout (HTML only)"
```

---

### Task 2: Camera Session — CSS

Restyle the camera screen CSS. Remove old `.cam-header` styles. Add HUD overlay positioning, control card styling, and responsive breakpoints.

**Files:**
- Modify: `code/styles.css:476-480` (`#cameraScreen`)
- Modify: `code/styles.css:604-673` (`.cam-*` classes)
- Modify: `code/styles.css:1754-1768` (mobile overrides)

**Spec reference:** §1 (Camera Session — Hybrid Layout)

- [ ] **Step 1: Replace `#cameraScreen` base styles**

Replace the `#cameraScreen` rule at line 476–480:

```css
#cameraScreen {
  flex-direction: column;
  align-items: center;
  height: 100vh;
  padding: var(--space-3);
  gap: var(--space-3);
  overflow: hidden;
}
```

- [ ] **Step 2: Replace camera redesigned layout section**

Replace the `/* ── Camera (redesigned layout) */` block at lines 604–673 with new HUD + control card styles:

```css
/* ── Camera HUD + Control Card ─────────────────────────────────────── */
.cam-viewport {
  width: 100%;
  max-width: 720px;
  position: relative;
  border-radius: var(--radius-xl);
  overflow: hidden;
  background: #000;
  border: 2px solid var(--border);
  box-shadow: var(--shadow-md);
  flex: 1;
  min-height: 0;
  aspect-ratio: 16/9;
}
.cam-viewport video { object-fit: contain; }
.cam-viewport video, .cam-viewport canvas {
  position: absolute; width: 100%; height: 100%;
  transform: scaleX(-1);
}
.cam-hud-back {
  position: absolute; top: var(--space-3); left: var(--space-3);
  z-index: 15; padding: 5px 14px;
  background: rgba(0,0,0,0.5); border: none;
  border-radius: var(--radius-md); color: rgba(255,255,255,0.7);
  font-size: 0.78rem; font-weight: 600; cursor: pointer;
  font-family: inherit; backdrop-filter: blur(4px);
  transition: background 0.2s;
}
.cam-hud-back:hover { background: rgba(0,0,0,0.7); color: #fff; }
.cam-flip-btn {
  position: absolute; top: var(--space-3); right: var(--space-3);
  z-index: 15; width: 40px; height: 40px;
  background: rgba(0,0,0,0.5); border: none; border-radius: var(--radius-full);
  cursor: pointer; display: flex; align-items: center; justify-content: center;
  backdrop-filter: blur(4px); transition: background 0.2s;
}
.cam-flip-btn:hover { background: rgba(0,0,0,0.7); }
.cam-hud-sets {
  position: absolute; bottom: 12px; left: 12px;
  z-index: 10; display: flex; gap: 6px;
}
.cam-ctrl-card {
  width: 100%; max-width: 720px;
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-sm);
  padding: var(--space-4);
  display: flex; flex-direction: column;
  gap: var(--space-2); flex-shrink: 0;
}
.cam-ctrl-header {
  display: flex; justify-content: space-between; align-items: center;
}
.cam-exercise-name { font-size: 1.1rem; font-weight: 700; color: var(--text); }
.cam-set-label { font-size: 0.78rem; color: var(--muted); font-weight: 500; }
.cam-feedback {
  text-align: center; font-size: 0.9rem; font-weight: 600;
  color: var(--accent); height: 1.4rem; line-height: 1.4rem;
  overflow: hidden; white-space: nowrap; text-overflow: ellipsis;
  transition: opacity 0.12s ease;
}
.cam-pain-strip {
  display: flex; align-items: center; gap: var(--space-3);
}
.cam-pain-label { font-size: 0.82rem; font-weight: 600; color: var(--muted); flex-shrink: 0; }
.cam-pain-value { font-size: 0.82rem; font-weight: 600; color: var(--text); flex-shrink: 0; min-width: 44px; text-align: right; }
.cam-pain-strip input[type="range"] { flex: 1; }
.cam-end-btn {
  width: 100%; padding: var(--space-3);
  background: none; border: 1px solid var(--border);
  color: var(--muted); border-radius: var(--radius-md);
  font-size: 0.85rem; font-weight: 600; cursor: pointer;
  font-family: inherit; transition: all 0.15s;
}
.cam-end-btn:hover { border-color: var(--danger); color: var(--danger); background: rgba(239,68,68,0.04); }
```

- [ ] **Step 3: Update mobile responsive overrides**

Find the existing camera mobile overrides at lines 1754–1768 and replace with:

```css
@media (max-width: 767px) {
  #cameraScreen { padding: 0; gap: 0; }
  .cam-viewport {
    border-radius: 0; border-left: none; border-right: none;
    aspect-ratio: auto; flex: 1;
  }
  .cam-ctrl-card {
    border-radius: 0; border-left: none; border-right: none;
    padding: var(--space-3);
  }
}
```

- [ ] **Step 4: Remove stale camera CSS**

Remove the old `.cam-header`, `.cam-header-info`, `.cam-back-btn` rules (they were at lines 605–620) since those elements no longer exist.

- [ ] **Step 5: Verify in browser**

Open http://localhost:5173, navigate to camera screen. Confirm:
- Camera viewport fills most of the screen with 16:9 aspect ratio
- Back button is a frosted pill in top-left of viewport
- Control card sits below with exercise name, progress bar, pain slider, end button
- On mobile viewport (resize to <768px): camera goes full-width, control card loses border-radius

- [ ] **Step 6: Commit**

```bash
git add code/styles.css
git commit -m "Restyle camera session with hybrid layout CSS"
```

---

### Task 3: Camera Session — JS (Set Tracker in HUD)

The set tracker dots now render inside the viewport (`.cam-hud-sets`). Update the JS that builds set tracker HTML to work in the new container.

**Files:**
- Modify: `code/app.js` — search for `setTracker` references
- Modify: `code/styles.css` — set dot sizing override

**Spec reference:** §1 (HUD overlays — set dots)

- [ ] **Step 1: Verify set tracker rendering**

Search for where set tracker dots are built:

```bash
grep -n "setTracker\|set-dot\|set\.dot" code/app.js
```

The existing `setTracker` div is now inside `.cam-hud-sets` inside the viewport. The JS sets innerHTML on `#setTracker` which still exists with the same ID — this should work without changes. Verify by reading the relevant function.

- [ ] **Step 2: Update set dot sizing for HUD**

The set dots inside the HUD need to be smaller (they're now overlaid on the camera). Add CSS to scope HUD set dots:

In `styles.css`, add after the `.cam-hud-sets` rule:

```css
.cam-hud-sets .set-dot {
  width: 28px; height: 28px; min-width: 28px;
  flex: none;
}
```

This overrides the `flex: 1` from the base `.set-dot` rule so dots don't stretch inside the HUD.

- [ ] **Step 3: Verify in browser**

Navigate to camera screen with a multi-set exercise. Confirm set dots appear as compact circles in the bottom-left of the camera viewport, overlaid on the feed.

- [ ] **Step 4: Commit**

```bash
git add code/styles.css code/app.js
git commit -m "Position set tracker dots in camera HUD overlay"
```

---

### Task 4: Congrats Overlay — Responsive

Restyle the existing congrats overlay CSS. Desktop stays in-viewport. Mobile becomes full-screen takeover.

**Files:**
- Modify: `code/styles.css:517-537` (existing `#congratsOverlay`)
- Modify: `code/styles.css:676-680` (`.congrats-*` children)

**Spec reference:** §3 (Congrats Overlay)

- [ ] **Step 1: Update desktop congrats styles**

Replace the `#congratsOverlay` and `#congratsOverlay.show` rules at lines 517–530 and the children at 531–537 and 676–680. Preserve all existing structure. Desktop styles remain in-viewport:

```css
#congratsOverlay {
  display: none; position: absolute; inset: 0;
  background: rgba(0,0,0,0.88); backdrop-filter: blur(8px);
  border-radius: var(--radius-xl); flex-direction: column;
  align-items: center; justify-content: center;
  z-index: 20; gap: 14px;
}
#congratsOverlay.show {
  display: flex;
  animation: congratsIn 0.35s ease-out;
}
@keyframes congratsIn {
  from { opacity: 0; transform: scale(0.9); }
  to   { opacity: 1; transform: scale(1); }
}
#congratsOverlay h2 {
  font-size: 2.2rem; font-weight: 900;
  background: var(--gradient-text);
  -webkit-background-clip: text; -webkit-text-fill-color: transparent; background-clip: text;
}
#congratsOverlay p { color: rgba(255,255,255,0.65); font-size: 0.95rem; }
#congratsOverlay strong { color: rgba(255,255,255,0.9); }
.congrats-reps-text { color: rgba(255,255,255,0.55); font-size: 0.9rem; }
.congrats-all-sets { display: none; font-size: 1rem; font-weight: 700; color: var(--success); }
.congrats-pain-prompt { color: rgba(255,255,255,0.5); font-size: 0.85rem; margin-top: var(--space-2); }
.congrats-pain-slider { width: 200px; accent-color: var(--accent); }
.congrats-pain-value { color: rgba(255,255,255,0.7); font-size: 0.9rem; font-weight: 600; }
```

- [ ] **Step 2: Add mobile full-screen congrats**

Add a media query for mobile congrats takeover:

```css
@media (max-width: 767px) {
  #congratsOverlay {
    position: fixed; inset: 0;
    border-radius: 0;
    background: var(--bg);
    z-index: 100;
  }
  #congratsOverlay.show {
    animation: congratsMobileIn 0.3s ease-out;
  }
  @keyframes congratsMobileIn {
    from { opacity: 0; transform: translateY(40px); }
    to   { opacity: 1; transform: translateY(0); }
  }
  #congratsOverlay h2 {
    font-size: 2rem;
    background: none; -webkit-background-clip: unset;
    -webkit-text-fill-color: var(--accent); color: var(--accent);
  }
  #congratsOverlay p { color: var(--muted); }
  #congratsOverlay strong { color: var(--text); }
  .congrats-pain-prompt { color: var(--muted); }
  .congrats-pain-slider { width: 100%; }
  .congrats-pain-value { color: var(--text); }
  #congratsOverlay .reset-btn {
    width: 100%; padding: var(--space-4);
  }
}
```

- [ ] **Step 3: Verify in browser**

Desktop: congrats overlay appears inside camera viewport with dark glass.
Mobile (resize <768px): congrats overlay covers full screen with light bg.

- [ ] **Step 4: Commit**

```bash
git add code/styles.css
git commit -m "Add responsive congrats overlay (in-viewport desktop, fullscreen mobile)"
```

---

### Task 5: Rest Timer Overlay — Responsive

Same responsive treatment as congrats: desktop in-viewport, mobile full-screen.

**Files:**
- Modify: `code/styles.css:1205-1237` (existing `.rest-timer-*`)

**Spec reference:** §4 (Rest Timer Overlay)

- [ ] **Step 1: Update desktop rest timer styles**

Replace the rest timer block at lines 1205–1237:

```css
.rest-timer-overlay {
  position: absolute; inset: 0;
  background: rgba(0,0,0,0.88); backdrop-filter: blur(8px);
  border-radius: var(--radius-xl);
  display: flex; flex-direction: column;
  align-items: center; justify-content: center;
  z-index: 20; gap: var(--space-3);
}
.rest-timer-label {
  color: rgba(255,255,255,0.5); font-size: 0.9rem; font-weight: 600;
}
.rest-timer-count {
  font-size: 3rem; font-weight: 900; color: #fff;
}
.rest-timer-sub {
  color: rgba(255,255,255,0.4); font-size: 0.82rem;
}
.rest-timer-bar {
  width: 200px; height: 4px;
  background: rgba(255,255,255,0.15); border-radius: 99px; overflow: hidden;
}
.rest-timer-fill {
  height: 100%; background: var(--accent);
  border-radius: 99px; transition: width 1s linear;
}
.rest-skip-btn { margin-top: var(--space-2); }
```

- [ ] **Step 2: Add mobile full-screen rest timer**

```css
@media (max-width: 767px) {
  .rest-timer-overlay {
    position: fixed; inset: 0;
    border-radius: 0; background: var(--bg);
    z-index: 100;
  }
  .rest-timer-label { color: var(--muted); }
  .rest-timer-count { font-size: 4rem; color: var(--text); }
  .rest-timer-sub { color: var(--muted); }
  .rest-timer-bar { width: 100%; max-width: 300px; background: var(--border); }
  .rest-skip-btn { width: 100%; max-width: 300px; }
}
```

- [ ] **Step 3: Verify in browser**

Desktop: rest timer appears inside camera viewport.
Mobile: rest timer covers full screen with light background, large countdown.

- [ ] **Step 4: Commit**

```bash
git add code/styles.css
git commit -m "Add responsive rest timer overlay (in-viewport desktop, fullscreen mobile)"
```

---

### Task 6: Calibration — Camera Overlay Integration

Convert calibration from a separate screen into an overlay within the camera session. Add the calibration overlay HTML, CSS, and error/timeout handling.

**Files:**
- Modify: `code/index.html` (add calibration overlay inside `.cam-viewport`)
- Add CSS: `code/styles.css` (new `.cal-*` classes)
- Modify: `code/app.js` — `startCamera()` function and related calibration logic

**Spec reference:** §2 (Calibration — Camera Overlay)

- [ ] **Step 1: Add calibration overlay HTML**

Inside `.cam-viewport` in `index.html`, add the calibration overlay after the `<canvas>` element and before the HUD buttons:

```html
    <div id="calOverlay" class="cal-overlay" style="display:none;">
      <svg class="cal-hand-guide" viewBox="0 0 200 280" fill="none" xmlns="http://www.w3.org/2000/svg">
        <path d="M100 20 C60 20 40 60 40 100 L40 180 C40 220 60 260 100 260 C140 260 160 220 160 180 L160 100 C160 60 140 20 100 20Z" stroke="rgba(255,255,255,0.25)" stroke-width="2" fill="none"/>
        <line x1="70" y1="30" x2="70" y2="80" stroke="rgba(255,255,255,0.15)" stroke-width="1.5"/>
        <line x1="90" y1="20" x2="90" y2="70" stroke="rgba(255,255,255,0.15)" stroke-width="1.5"/>
        <line x1="110" y1="20" x2="110" y2="70" stroke="rgba(255,255,255,0.15)" stroke-width="1.5"/>
        <line x1="130" y1="30" x2="130" y2="80" stroke="rgba(255,255,255,0.15)" stroke-width="1.5"/>
      </svg>
      <p class="cal-prompt">Position your hand in frame</p>
      <p class="cal-hint" id="calHint" style="display:none;">Try moving your hand closer to the camera</p>
    </div>
    <div id="calError" class="cal-error" style="display:none;">
      <p id="calErrorMsg">Camera unavailable — check permissions</p>
      <button class="reset-btn" onclick="showScreen('patientScreen')">Go Back</button>
    </div>
```

- [ ] **Step 2: Add calibration overlay CSS**

Add to `styles.css`:

```css
/* ── Calibration Overlay ───────────────────────────────────────────── */
.cal-overlay {
  position: absolute; inset: 0;
  background: rgba(0,0,0,0.4);
  display: flex; flex-direction: column;
  align-items: center; justify-content: center;
  z-index: 18; gap: var(--space-3);
  transition: opacity 0.3s ease-out;
}
.cal-overlay.fade-out { opacity: 0; pointer-events: none; }
.cal-hand-guide { width: 120px; height: 168px; }
.cal-prompt {
  font-size: 1rem; font-weight: 600; color: #fff;
  animation: calPulse 1.5s ease-in-out infinite;
}
@keyframes calPulse {
  0%, 100% { opacity: 0.6; }
  50% { opacity: 1; }
}
.cal-hint {
  font-size: 0.85rem; color: rgba(255,255,255,0.5);
  animation: calPulse 1.5s ease-in-out infinite;
}
.cal-error {
  position: absolute; inset: 0;
  background: rgba(0,0,0,0.85);
  display: flex; flex-direction: column;
  align-items: center; justify-content: center;
  z-index: 19; gap: var(--space-4);
}
.cal-error p {
  color: rgba(255,255,255,0.7); font-size: 1rem; font-weight: 600;
  text-align: center; padding: 0 var(--space-4);
}
```

- [ ] **Step 3: Modify JS calibration flow**

In `app.js`, modify the session start flow. When `startSessionWithProtocol()` or equivalent is called:

1. Show `#cameraScreen` via `showScreen('cameraScreen')`
2. Show `#calOverlay` (set `display: flex`)
3. Start camera via existing `startCamera()`
4. If camera fails → hide `#calOverlay`, show `#calError` with "Camera unavailable" message
5. If MediaPipe fails to load → same pattern with "Hand tracking unavailable" message
6. Start a 15-second timeout → if hand not detected, show `#calHint`
7. When MediaPipe detects a hand → add `.fade-out` to `#calOverlay`, after 300ms set `display: none`, clear the hint timeout, begin rep counting

The existing `startCamera()` function (app.js:1891-2002) already has MediaPipe hand detection. Modify `startCamera()` to:
- Show cal overlay before starting
- On first successful hand detection, fade out cal overlay
- On camera error, show cal error

Add to `app.js`:

```javascript
let calHintTimer = null;

function showCalOverlay() {
  const overlay = document.getElementById('calOverlay');
  const hint = document.getElementById('calHint');
  const error = document.getElementById('calError');
  overlay.style.display = 'flex';
  overlay.classList.remove('fade-out');
  hint.style.display = 'none';
  error.style.display = 'none';
  calHintTimer = setTimeout(function() {
    hint.style.display = 'block';
  }, 15000);
}

function hideCalOverlay() {
  clearTimeout(calHintTimer);
  const overlay = document.getElementById('calOverlay');
  overlay.classList.add('fade-out');
  setTimeout(function() { overlay.style.display = 'none'; }, 300);
}

function showCalError(msg) {
  clearTimeout(calHintTimer);
  document.getElementById('calOverlay').style.display = 'none';
  const error = document.getElementById('calError');
  document.getElementById('calErrorMsg').textContent = msg;
  error.style.display = 'flex';
}
```

Then in the existing `startCamera()` function, add `showCalOverlay()` call at the start, wrap the `getUserMedia` catch with `showCalError('Camera unavailable — check permissions')`, and in the hand detection callback, call `hideCalOverlay()` on first detection (use a flag to only trigger once per session).

- [ ] **Step 4: Verify in browser**

1. Start a session → calibration overlay appears over camera feed
2. Show hand → overlay fades out, session begins
3. Wait 15s without showing hand → hint text appears
4. Block camera permissions → error screen with "Go Back" button

- [ ] **Step 5: Commit**

```bash
git add code/index.html code/styles.css code/app.js
git commit -m "Convert calibration to camera overlay with error handling"
```

---

### Task 7: Exercise Detail — Bottom Sheet

Add the bottom sheet component: HTML shell in `index.html`, CSS for the sheet + backdrop, JS for show/dismiss/begin.

**Files:**
- Modify: `code/index.html` (add sheet HTML before closing `</body>`)
- Add CSS: `code/styles.css` (new `.sheet-*` classes)
- Modify: `code/app.js` (new `showExerciseDetail()`, `dismissExerciseDetail()`)

**Spec reference:** §5 (Exercise Detail — Bottom Sheet)

- [ ] **Step 1: Add bottom sheet HTML**

Add before the closing `</body>` tag in `index.html`:

```html
<div id="sheetBackdrop" class="sheet-backdrop" style="display:none;" onclick="dismissExerciseDetail()"></div>
<div id="exerciseSheet" class="sheet" style="display:none;">
  <div class="sheet-handle"></div>
  <div class="sheet-content">
    <h3 id="sheetExName" class="sheet-title"></h3>
    <p id="sheetExRx" class="sheet-rx"></p>
    <p id="sheetExNotes" class="sheet-notes"></p>
    <button class="sheet-begin-btn" id="sheetBeginBtn">Begin Session</button>
  </div>
</div>
```

- [ ] **Step 2: Add bottom sheet CSS**

```css
/* ── Bottom Sheet ──────────────────────────────────────────────────── */
.sheet-backdrop {
  position: fixed; inset: 0;
  background: rgba(0,0,0,0.3);
  z-index: 200;
  animation: sheetFadeIn 0.2s ease-out;
}
@keyframes sheetFadeIn {
  from { opacity: 0; } to { opacity: 1; }
}
.sheet {
  position: fixed; bottom: 0; left: 0; right: 0;
  background: var(--surface);
  border-radius: var(--radius-xl) var(--radius-xl) 0 0;
  box-shadow: var(--shadow-lg);
  z-index: 201;
  transform: translateY(0);
  animation: sheetSlideUp 0.25s ease-out;
}
@keyframes sheetSlideUp {
  from { transform: translateY(100%); } to { transform: translateY(0); }
}
.sheet.dismissing {
  animation: sheetSlideDown 0.2s ease-in forwards;
}
@keyframes sheetSlideDown {
  from { transform: translateY(0); } to { transform: translateY(100%); }
}
.sheet-handle {
  width: 40px; height: 4px;
  background: var(--border); border-radius: 99px;
  margin: var(--space-3) auto 0;
}
.sheet-content { padding: var(--space-4); }
.sheet-title { font-size: 1.2rem; font-weight: 700; color: var(--text); margin: 0; }
.sheet-rx { font-size: 0.9rem; color: var(--muted); margin-top: var(--space-2); }
.sheet-notes {
  font-size: 0.85rem; color: var(--placeholder); font-style: italic;
  margin-top: var(--space-3); line-height: 1.5;
}
.sheet-begin-btn {
  width: 100%; margin-top: var(--space-4);
  padding: var(--space-3);
  background: var(--accent); color: #fff;
  border: none; border-radius: var(--radius-md);
  font-size: 0.95rem; font-weight: 600;
  font-family: inherit; cursor: pointer;
  transition: background 0.15s;
}
.sheet-begin-btn:hover { background: var(--accent-hover); }
```

- [ ] **Step 3: Add bottom sheet JS**

Add to `app.js`:

```javascript
let activeSheetProtocol = null;

function showExerciseDetail(protocol) {
  activeSheetProtocol = protocol;
  document.getElementById('sheetExName').textContent = protocol.exerciseName || protocol.label || 'Exercise';
  const sets = protocol.sets || 3;
  const reps = protocol.reps || 10;
  const rest = protocol.restSeconds || 30;
  document.getElementById('sheetExRx').textContent = sets + ' sets × ' + reps + ' reps · ' + rest + 's rest';
  const notesEl = document.getElementById('sheetExNotes');
  if (protocol.notes) {
    notesEl.textContent = protocol.notes;
    notesEl.style.display = 'block';
  } else {
    notesEl.style.display = 'none';
  }
  document.getElementById('sheetBeginBtn').onclick = function() {
    dismissExerciseDetail();
    startSessionWithProtocol(activeSheetProtocol);
  };
  document.getElementById('sheetBackdrop').style.display = 'block';
  var sheet = document.getElementById('exerciseSheet');
  sheet.classList.remove('dismissing');
  sheet.style.display = 'block';
}

function dismissExerciseDetail() {
  var sheet = document.getElementById('exerciseSheet');
  sheet.classList.add('dismissing');
  setTimeout(function() {
    sheet.style.display = 'none';
    sheet.classList.remove('dismissing');
    document.getElementById('sheetBackdrop').style.display = 'none';
  }, 200);
  activeSheetProtocol = null;
}
```

- [ ] **Step 4: Verify in browser**

Call `showExerciseDetail({exerciseName: 'Finger Flexion', sets: 3, reps: 10, restSeconds: 30, notes: 'Focus on full range'})` in console. Sheet slides up with exercise info. Tap backdrop to dismiss.

- [ ] **Step 5: Commit**

```bash
git add code/index.html code/styles.css code/app.js
git commit -m "Add exercise detail bottom sheet component"
```

---

### Task 8: My Exercises Screen — Redesign

Overhaul the exercises screen with new card layout, completion indicators, and empty state. Wire exercise cards to open the bottom sheet.

**Files:**
- Modify: `code/index.html:203-211` (exercise screen container)
- Modify: `code/styles.css:831-907` (existing `.exs-*` styles)
- Modify: `code/app.js:827-900` (`showExercisesScreen()` function)

**Spec reference:** §6 (My Exercises Screen)

- [ ] **Step 1: Update exercises screen HTML**

Replace lines 203–211 in `index.html`:

```html
<div id="exercisesScreen" class="screen">
  <div class="ex-container">
    <div class="ex-header">
      <h2 class="ex-title">My Exercises</h2>
      <p class="ex-subtitle" id="exSubtitle"></p>
      <button class="ex-back-btn" onclick="showScreen('patientScreen')">← Back</button>
    </div>
    <div id="exercisesScreenInner" class="ex-list"></div>
  </div>
</div>
```

- [ ] **Step 2: Replace exercises CSS**

Replace the `.exs-*` block at lines 831–907 with new `.ex-*` styles:

```css
/* ── My Exercises ──────────────────────────────────────────────────── */
#exercisesScreen { flex-direction: column; align-items: center; padding: var(--space-4); }
.ex-container { width: 100%; max-width: 480px; }
.ex-header { margin-bottom: var(--space-4); position: relative; }
.ex-title { font-size: 1.3rem; font-weight: 700; color: var(--text); margin: 0; }
.ex-subtitle { font-size: 0.85rem; color: var(--muted); margin-top: 2px; }
.ex-back-btn {
  position: absolute; top: 0; right: 0;
  background: none; border: 1px solid var(--border);
  color: var(--muted); padding: 5px 14px;
  border-radius: var(--radius-md); font-size: 0.78rem;
  font-weight: 600; cursor: pointer; font-family: inherit;
  transition: all 0.15s;
}
.ex-back-btn:hover { border-color: var(--muted); color: var(--text); background: var(--surface-alt); }
.ex-list { display: flex; flex-direction: column; gap: var(--space-3); }
.ex-card {
  display: flex; justify-content: space-between; align-items: center;
  background: var(--surface); border: 1px solid var(--border);
  border-radius: var(--radius-lg); padding: var(--space-4);
  cursor: pointer; transition: all 0.15s;
}
.ex-card:hover { border-color: var(--accent); background: var(--surface-alt); }
.ex-card-left { display: flex; flex-direction: column; gap: 2px; }
.ex-card-name { font-size: 1rem; font-weight: 600; color: var(--text); }
.ex-card-rx { font-size: 0.82rem; color: var(--muted); }
.ex-card-right { display: flex; align-items: center; gap: var(--space-2); }
.ex-status-pill {
  font-size: 0.72rem; font-weight: 600; padding: 3px 8px;
  border-radius: var(--radius-full);
}
.ex-status-pill.in-progress { background: var(--accent-dim); color: var(--accent); }
.ex-status-done {
  width: 24px; height: 24px; border-radius: var(--radius-full);
  background: var(--success); display: flex;
  align-items: center; justify-content: center;
}
.ex-status-done svg { width: 14px; height: 14px; }
.ex-chevron { color: var(--muted); font-size: 1.2rem; font-weight: 300; }
.ex-empty { text-align: center; padding: var(--space-8) 0; color: var(--muted); }
.ex-empty-icon { margin-bottom: var(--space-3); }
.ex-empty p { font-size: 0.9rem; }
```

- [ ] **Step 3: Rewrite `showExercisesScreen()` in JS**

Replace the existing `showExercisesScreen()` function (app.js:827-881) to build the new card layout. Each card calls `showExerciseDetail(protocol)` on click. Use `textContent` for user-facing data; build structural HTML via string concatenation (matching existing codebase pattern). Protocol data comes from `window.patientProtocols`.

The function should:
1. Call `showScreen('exercisesScreen')`
2. Get protocols from `window.patientProtocols || []`
3. Set subtitle text with count
4. For each protocol, build an `.ex-card` div with name, rx, completion status, and chevron
5. Handle empty state with clipboard icon and message

- [ ] **Step 4: Verify in browser**

Navigate to exercises screen. Confirm:
- Cards display with exercise name, sets × reps
- Completion indicators show correctly
- Tapping a card opens the bottom sheet
- Empty state shows when no protocols assigned

- [ ] **Step 5: Commit**

```bash
git add code/index.html code/styles.css code/app.js
git commit -m "Redesign My Exercises screen with card layout and bottom sheet integration"
```

---

### Task 9: Progress Screen — Redesign

Overhaul the progress screen with summary stat cards, restyled chart, and patient-specific session history grid.

**Files:**
- Modify: `code/index.html:310-318` (progress screen container)
- Add CSS: `code/styles.css` (new `.prog-*` classes)
- Modify: `code/app.js:2060-2164` (`showProgressScreen()`, `renderProgressScreen()`)
- Add: `code/app.js` (new `buildPatientSessionHistory()`)

**Spec reference:** §7 (Progress Screen)

- [ ] **Step 1: Update progress screen HTML**

Replace lines 310–318 in `index.html`:

```html
<div id="progressScreen" class="screen">
  <div class="prog-container">
    <div class="prog-header">
      <h2 class="prog-title">Your Progress</h2>
      <button class="prog-back-btn" onclick="showScreen('patientScreen')">← Back</button>
    </div>
    <div id="progressContent"></div>
  </div>
</div>
```

- [ ] **Step 2: Add progress screen CSS**

Replace existing progress styles (lines 1139–1235) with new `.prog-*` classes:

```css
/* ── Progress Screen ───────────────────────────────────────────────── */
#progressScreen { flex-direction: column; align-items: center; padding: var(--space-4); }
.prog-container { width: 100%; max-width: 480px; }
.prog-header { margin-bottom: var(--space-4); position: relative; }
.prog-title { font-size: 1.3rem; font-weight: 700; color: var(--text); margin: 0; }
.prog-back-btn {
  position: absolute; top: 0; right: 0;
  background: none; border: 1px solid var(--border);
  color: var(--muted); padding: 5px 14px;
  border-radius: var(--radius-md); font-size: 0.78rem;
  font-weight: 600; cursor: pointer; font-family: inherit;
  transition: all 0.15s;
}
.prog-back-btn:hover { border-color: var(--muted); color: var(--text); background: var(--surface-alt); }
.prog-stats-row {
  display: flex; gap: var(--space-3); overflow-x: auto;
  margin-bottom: var(--space-4);
}
.prog-stat-card {
  flex: 1; min-width: 120px;
  background: var(--surface); border: 1px solid var(--border);
  border-radius: var(--radius-lg); padding: var(--space-3) var(--space-4);
}
.prog-stat-value { font-size: 1.3rem; font-weight: 700; color: var(--text); }
.prog-stat-value.improving { color: var(--success); }
.prog-stat-value.worsening { color: var(--danger); }
.prog-stat-label { font-size: 0.75rem; color: var(--muted); margin-top: 2px; }
.prog-chart-card {
  background: var(--surface); border: 1px solid var(--border);
  border-radius: var(--radius-lg); padding: var(--space-4);
  margin-bottom: var(--space-4);
}
.prog-chart-card canvas { width: 100%; max-height: 200px; }
.prog-history-card {
  background: var(--surface); border: 1px solid var(--border);
  border-radius: var(--radius-lg); overflow: hidden;
}
.prog-grid-header {
  display: grid; grid-template-columns: 100px 1fr 80px 60px;
  padding: var(--space-2) var(--space-3);
  font-size: 0.75rem; font-weight: 600; color: var(--muted);
}
.prog-grid-row {
  display: grid; grid-template-columns: 100px 1fr 80px 60px;
  padding: var(--space-2) var(--space-3);
  font-size: 0.85rem; color: var(--text);
  border-top: 1px solid var(--border);
}
.prog-grid-row:nth-child(even) { background: var(--surface-alt); }
.prog-empty { text-align: center; padding: var(--space-8) 0; color: var(--muted); }
.prog-empty-icon { margin-bottom: var(--space-3); }
.prog-empty p { font-size: 0.9rem; }
```

- [ ] **Step 3: Add `buildPatientSessionHistory()` to JS**

Add a new function to `app.js` (separate from the therapist's `buildSessionHistoryCard`):

```javascript
function buildPatientSessionHistory(sessions) {
  if (!sessions || !sessions.length) return '';
  var html = '<div class="prog-history-card">' +
    '<div class="prog-grid-header">' +
    '<span>Date</span><span>Exercise</span><span>Sets</span><span>Pain</span></div>';
  sessions.slice(0, 20).forEach(function(s) {
    var date = s.timestamp ? timeAgo(s.timestamp.toDate ? s.timestamp.toDate() : new Date(s.timestamp)) : '—';
    var exercise = s.exerciseName || s.label || '—';
    var sets = (s.completedSets || 0) + '/' + (s.totalSets || s.sets || '—');
    var pain = s.avgPain != null ? s.avgPain.toFixed(1) : '—';
    html += '<div class="prog-grid-row">' +
      '<span>' + date + '</span>' +
      '<span>' + exercise + '</span>' +
      '<span>' + sets + '</span>' +
      '<span>' + pain + '</span></div>';
  });
  html += '</div>';
  return html;
}
```

- [ ] **Step 4: Rewrite `renderProgressScreen()`**

Update the existing `renderProgressScreen()` (app.js:2066-2164) to use the new layout. The function should:

1. Get sessions from `window.patientSessions || []`
2. Show empty state if no sessions
3. Calculate summary stats: sessions this week, pain trend (compare last 7 days vs prior 7 days), best ROM
4. Build HTML with `.prog-stats-row` (3 stat cards), `.prog-chart-card` (Chart.js canvas), and `buildPatientSessionHistory()` output
5. Set container innerHTML and initialize Chart.js on the new canvas

Chart config: line chart, `#0B6CB0` border, `rgba(11,108,176,0.08)` fill, last 10 sessions, `tension: 0.3`, no legend, light grid lines.

- [ ] **Step 5: Verify in browser**

Navigate to progress screen. Confirm:
- Summary stats row shows 3 cards (sessions, pain trend, best ROM)
- ROM chart renders in a surface card
- Session history grid shows with 4 columns
- Empty state shows when no sessions

- [ ] **Step 6: Commit**

```bash
git add code/index.html code/styles.css code/app.js
git commit -m "Redesign progress screen with stat cards, chart, and patient session grid"
```

---

### Task 10: Messaging Screen — Visual Polish

Restyle the messaging screen with polished bubbles, timestamps, read indicators, and circular send button.

**Files:**
- Modify: `code/index.html:323-336` (messaging screen HTML)
- Modify: `code/styles.css:1927-1944` (existing `.msg-*` styles)
- Modify: `code/app.js:3222-3274` (`renderThread()`, `buildMessagePanel()`)

**Spec reference:** §8 (Messaging Screen)

- [ ] **Step 1: Update messaging HTML**

Replace lines 323–336 in `index.html`:

```html
<div id="messagingScreen" class="screen">
  <div class="msg-container">
    <div class="msg-header">
      <button class="msg-back-btn" onclick="showScreen('patientScreen')">←</button>
      <span class="msg-header-name" id="msgHeaderName">Therapist</span>
    </div>
    <div class="msg-thread" id="msgThread"></div>
    <div class="msg-input-row">
      <input type="text" id="msgInput" class="msg-input" placeholder="Type a message..."
             onkeydown="if(event.key==='Enter'&&!document.getElementById('msgSendBtn').disabled)sendMessageFromPatient()"
             oninput="toggleMsgSend()" />
      <button class="msg-send-btn" id="msgSendBtn" onclick="sendMessageFromPatient()" disabled>
        <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M3.4 20.4l17.45-7.48a1 1 0 000-1.84L3.4 3.6a.993.993 0 00-1.39.91L2 9.12c0 .5.37.93.87.99L17 12 2.87 13.88c-.5.07-.87.5-.87 1l.01 4.61c0 .71.73 1.2 1.39.91z"/></svg>
      </button>
    </div>
  </div>
</div>
```

Note: the `onkeydown` handler checks `!disabled` before sending, matching the spec requirement that the disabled attribute blocks keyboard activation.

- [ ] **Step 2: Replace messaging CSS**

Replace the `.msg-*` block at lines 1927–1944:

```css
/* ── Messaging Screen ──────────────────────────────────────────────── */
#messagingScreen { flex-direction: column; height: 100vh; }
.msg-container { display: flex; flex-direction: column; height: 100%; max-width: 640px; width: 100%; margin: 0 auto; }
.msg-header {
  display: flex; align-items: center; gap: var(--space-3);
  padding: var(--space-3) var(--space-4);
  background: var(--surface); border-bottom: 1px solid var(--border);
  flex-shrink: 0;
}
.msg-back-btn {
  background: none; border: none; color: var(--muted);
  font-size: 1.2rem; cursor: pointer; padding: 4px 8px;
  font-family: inherit; transition: color 0.15s;
}
.msg-back-btn:hover { color: var(--text); }
.msg-header-name { font-size: 1rem; font-weight: 600; color: var(--text); }
.msg-thread {
  flex: 1; overflow-y: auto; padding: var(--space-4);
  background: var(--bg);
  display: flex; flex-direction: column; gap: var(--space-2);
}
.msg-bubble {
  max-width: 75%; padding: var(--space-2) var(--space-3);
  font-size: 0.9rem; line-height: 1.5; word-wrap: break-word;
}
.msg-bubble.sent {
  background: var(--accent); color: #fff;
  border-radius: var(--radius-lg) var(--radius-lg) 4px var(--radius-lg);
  margin-left: auto;
}
.msg-bubble.received {
  background: var(--surface); color: var(--text);
  border: 1px solid var(--border);
  border-radius: var(--radius-lg) var(--radius-lg) var(--radius-lg) 4px;
}
.msg-timestamp {
  font-size: 0.72rem; color: var(--placeholder); margin-top: 2px;
}
.msg-timestamp.sent { text-align: right; }
.msg-read-indicator {
  font-size: 0.7rem; color: var(--placeholder); text-align: right; margin-top: 1px;
}
.msg-empty {
  flex: 1; display: flex; align-items: center; justify-content: center;
  color: var(--muted); font-size: 0.9rem;
}
.msg-input-row {
  display: flex; align-items: center; gap: var(--space-2);
  padding: var(--space-3); background: var(--surface);
  border-top: 1px solid var(--border); flex-shrink: 0;
}
.msg-input {
  flex: 1; background: var(--surface-alt);
  border: 1px solid var(--border); border-radius: var(--radius-full);
  padding: var(--space-2) var(--space-3);
  font-size: 0.9rem; font-family: inherit; color: var(--text);
  outline: none; transition: border-color 0.15s;
}
.msg-input:focus { border-color: var(--accent); }
.msg-input::placeholder { color: var(--placeholder); }
.msg-send-btn {
  width: 40px; height: 40px; border-radius: var(--radius-full);
  border: none; display: flex; align-items: center; justify-content: center;
  cursor: pointer; font-family: inherit; transition: all 0.15s;
  flex-shrink: 0; background: var(--surface-alt); color: var(--muted);
}
.msg-send-btn:disabled { opacity: 0.5; cursor: default; }
.msg-send-btn:not(:disabled) { background: var(--accent); color: #fff; }
.msg-send-btn:not(:disabled):hover { background: var(--accent-hover); }
.msg-unread-badge {
  background: var(--accent); color: #fff; font-size: 0.65rem;
  font-weight: 700; width: 18px; height: 18px; border-radius: var(--radius-full);
  display: flex; align-items: center; justify-content: center;
}
```

- [ ] **Step 3: Add `toggleMsgSend()` and update `renderThread()`**

Add `toggleMsgSend()` to `app.js`:

```javascript
function toggleMsgSend() {
  var input = document.getElementById('msgInput');
  var btn = document.getElementById('msgSendBtn');
  btn.disabled = !input.value.trim();
}
```

Then modify `renderThread()` (app.js:3222-3242) to render bubbles with timestamp clustering. The function should:
1. Get thread via `getThread(myEmail, otherEmail)`
2. Show empty state if no messages
3. For each message, render a `.msg-bubble` div with `.sent` or `.received` class
4. After the last message in a same-sender cluster, render a `.msg-timestamp` with `timeAgo()`
5. After the very last sent message if it's been read, render `.msg-read-indicator`
6. Auto-scroll to bottom after rendering

- [ ] **Step 4: Verify in browser**

Navigate to messaging screen. Confirm:
- Sent bubbles are blue (accent), right-aligned with squared bottom-right corner
- Received bubbles are white/surface, left-aligned with squared bottom-left corner
- Timestamps appear below message clusters
- Send button is circular, disabled when input is empty, accent when text present
- Empty state shows when no messages

- [ ] **Step 5: Commit**

```bash
git add code/index.html code/styles.css code/app.js
git commit -m "Polish messaging screen with bubble layout, timestamps, and circular send button"
```

---

### Task 11: Responsive Cleanup & Mobile Overrides

Consolidate all mobile responsive rules into a clean media query block. Ensure all Phase 2 screens work at <768px.

**Files:**
- Modify: `code/styles.css` — mobile media query section (lines 1753–1828)

**Spec reference:** CSS Architecture Notes (responsive breakpoint 768px)

- [ ] **Step 1: Consolidate mobile overrides**

Ensure the `@media (max-width: 767px)` block includes overrides for all Phase 2 components. Add any missing mobile rules for exercises, progress, and messaging:

```css
@media (max-width: 767px) {
  /* Exercise screen */
  .ex-container { padding: 0 var(--space-3); }
  .ex-back-btn { position: static; margin-top: var(--space-2); }

  /* Progress screen */
  .prog-container { padding: 0 var(--space-3); }
  .prog-back-btn { position: static; margin-top: var(--space-2); }
  .prog-stats-row { gap: var(--space-2); }
  .prog-stat-card { min-width: 100px; padding: var(--space-2) var(--space-3); }
  .prog-stat-value { font-size: 1.1rem; }
  .prog-grid-header, .prog-grid-row { font-size: 0.78rem; padding: var(--space-2); }

  /* Messaging */
  .msg-header { padding: var(--space-2) var(--space-3); }
  .msg-thread { padding: var(--space-3); }
  .msg-input-row { padding: var(--space-2) var(--space-3); }
}
```

- [ ] **Step 2: Remove stale mobile rules**

Remove any old camera/exercise/progress mobile overrides that reference deleted classes (`.cam-header`, `.exs-*`, old progress classes).

- [ ] **Step 3: Verify at mobile viewport**

Resize browser to 375px width. Navigate through all screens:
- Camera: full-width, no border-radius
- Exercises: cards stack full-width
- Progress: stat cards scroll horizontally
- Messaging: bubbles and input work at narrow width
- Congrats overlay: full-screen takeover
- Rest timer: full-screen takeover

- [ ] **Step 4: Commit**

```bash
git add code/styles.css
git commit -m "Consolidate Phase 2 mobile responsive overrides"
```

---

### Task 12: Dead CSS Cleanup

Remove any CSS rules that referenced old classes no longer in the HTML after the Phase 2 restructure.

**Files:**
- Modify: `code/styles.css`

**Spec reference:** N/A (housekeeping)

- [ ] **Step 1: Identify dead CSS**

Search for CSS selectors that reference removed HTML structures:

```bash
grep -n "\.cam-header\b" code/styles.css
grep -n "\.exs-" code/styles.css
grep -n "\.psc-" code/styles.css
grep -n "\.camera-box\|\.pain-section\|\.end-session-btn\|\.assigned-protocol\|\.progress-section" code/styles.css
```

- [ ] **Step 2: Remove dead rules**

Delete all CSS rules whose selectors reference elements that no longer exist in the HTML. This includes:
- `.camera-box` and children (lines ~492-500) — replaced by `.cam-viewport`
- `.patient-header` (line ~481) — if not used elsewhere
- `.pain-section` (line ~559-572) — replaced by `.cam-pain-strip`
- `.end-session-btn` (line ~564-570) — replaced by `.cam-end-btn`
- `.assigned-protocol` and children (lines ~575-586) — if not used
- `.progress-section` (line ~546) — if not used
- Old `.exs-*` rules — already replaced in Task 8
- Old progress rules (`.psc-*`) — already replaced in Task 9

**Critical:** Verify each class is truly dead by grepping both `index.html` and `app.js` before removing. Some classes may be generated dynamically in JS template literals.

- [ ] **Step 3: Verify no visual regressions**

Navigate through every screen in the browser after removal. Nothing should change visually — these were dead rules.

- [ ] **Step 4: Commit**

```bash
git add code/styles.css
git commit -m "Remove dead CSS from pre-Phase-2 components"
```

---

### Task 13: Final Visual Verification

End-to-end visual verification of all Phase 2 changes.

**Files:** None (verification only)

- [ ] **Step 1: Desktop walkthrough**

Open http://localhost:5173 at 1280px width. Navigate through:
1. Patient home → My Exercises → tap exercise → bottom sheet → Begin Session
2. Camera session: verify hybrid layout, HUD overlays, control card
3. Complete a set → congrats overlay (in-viewport) → rest timer → next set
4. End session → back to patient home
5. Patient home → Progress → stat cards, chart, session grid
6. Patient home → Messaging → send a message, verify bubbles

- [ ] **Step 2: Mobile walkthrough**

Resize to 375px. Repeat the same flow:
1. Exercises → bottom sheet → camera (full-width)
2. Complete a set → congrats (full-screen takeover) → rest timer (full-screen)
3. Progress → horizontally scrollable stats
4. Messaging → compact bubbles, input bar

- [ ] **Step 3: Screenshot key states**

Take screenshots of:
- Camera session (desktop)
- Camera session (mobile)
- Congrats overlay (desktop vs. mobile)
- My Exercises with mixed completion states
- Progress screen with data
- Messaging conversation

- [ ] **Step 4: Commit any final fixes**

If visual verification reveals issues, fix them and commit with a descriptive message.
