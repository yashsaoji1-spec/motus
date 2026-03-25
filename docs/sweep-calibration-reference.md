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
