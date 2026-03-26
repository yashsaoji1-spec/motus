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
let _mlSuggestedAngle = null;       // emptiest histogram bucket midpoint

// Recording mode
let _mlRecording = false;           // true while recording session active
let _mlRecordFrameCount = 0;        // frame counter for throttle
let _mlRecordSampleCount = 0;       // samples captured in current recording
let _mlRecordingId = null;          // Date.now() string — unique ID per recording session
let _mlLastRecordingId = null;      // ID of most recently stopped recording (for undo)
let _mlLastRecordingCount = 0;      // sample count of most recently stopped recording
const ML_RECORD_FRAME_INTERVAL = 15;        // ~2 samples/sec at ~30fps
const ML_RECORD_GRID_REFRESH_INTERVAL = 10; // refresh coverage grid every N auto-captures
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

### Coverage Grid

**6 orientation rows × 8 angle columns = 48 cells × 30 samples each = 1,440 samples for full joint-hand coverage.**

**Orientation rows** (from full 3D palm normal via `mlPalmNormal` + `mlClassifyOrientation`):

| Key | Meaning |
|-----|---------|
| `toward` | Palm facing camera |
| `away` | Back of hand facing camera |
| `up` | Palm facing ceiling |
| `down` | Palm facing floor |
| `left` | Palm facing left |
| `right` | Palm facing right |

Classification: largest absolute component of the palm normal vector wins. Y-axis inverted (image coords).

**Angle columns** (via `mlAngleBucket(angle)`):

| Key | Range | Label | Suggested midpoint |
|-----|-------|-------|--------------------|
| `hyp` | < 0° | `<0` | -15° |
| `0`   | exactly 0° | `0` | 0° |
| `1`   | 1–30° | `1-30` | 15° |
| `31`  | 31–60° | `31-60` | 45° |
| `61`  | 61–90° | `61-90` | 75° |
| `91`  | 91–120° | `91-120` | 105° |
| `121` | 121–150° | `121-150` | 135° |
| `151` | 151–180° | `151-180` | 165° |

**Slider range**: -30° to 180° (extended for hyperextension).

**Cell visual**: horizontal fill bar. `--pct` CSS custom property drives `linear-gradient(to right, var(--accent) var(--pct), var(--border) var(--pct))`. Fill % = `min(count, 30) / 30 × 100`. Cell turns green (`--green`) when count ≥ 30. Gold cell = emptiest (fewest samples toward 30 target).

**Firestore storage**: each submit increments `trainingMeta/{joint-hand}.grid_{orient}_{bucketKey}` via `FieldValue.increment(1)`. Example key: `grid_toward_1`, `grid_up_hyp`. `mlRefreshSampleCounts()` reads all `grid_*` keys from the meta doc and passes them to `mlRenderGrid(grid)`.

`mlUseSuggested()` sets the slider to `_mlSuggestedAngle` (midpoint of emptiest bucket).

### Key Functions

| Function | What it does |
|----------|-------------|
| `loadMLModels()` | Loads all trained models from `mlModels` collection + calls `loadMLFeatureExtractor()` in parallel |
| `submitMLSample()` | Single-frame capture: landmarks + slider angle + notes + fingerConfig → `trainingChunks`; resets slider to 90° after save |
| `mlAutoCapture()` | Same as `submitMLSample` but: no button state changes, no slider reset, tags sample with `_mlRecordingId`; called fire-and-forget from `mlOnResults` every `ML_RECORD_FRAME_INTERVAL` frames during recording |
| `mlStartRecording()` | Sets `_mlRecording = true`, generates new `_mlRecordingId`, disables slider + submit button, shows stop button + blinking dot |
| `mlStopRecording()` | Sets `_mlRecording = false`, stores `_mlLastRecordingId` for undo, re-enables slider (resets to 90°) + submit, shows undo bar if samples were captured |
| `mlUndoLastRecording()` | Reads all chunks for current joint, filters out samples where `recordingId === _mlLastRecordingId`, writes back via batch, rebuilds `trainingMeta` from scratch from remaining samples |
| `mlClearJoint()` | Deletes all `trainingChunks` docs for current joint-hand + the `trainingMeta` doc; nuclear reset |
| `trainMLModel()` | Reads all chunks for current joint-hand key; builds landmarks-only or hybrid model; saves topology + weights to `mlModels/{joint-hand}` |
| `getTrainedAngle(jointKey, landmarks)` | Looks up `${jointKey}-${_currentHandLabel}` in `_mlModels`; runs hybrid (uses `_currentFrameFeatures`) or landmarks-only inference; falls back to `null` if no model (caller falls back to `calibGetAngle`) |
| `mlRefreshSampleCounts()` | Fetches `trainingMeta` for current joint-hand key; updates stats card; extracts all `grid_*` keys and calls `mlRenderGrid(grid)` |
| `mlPalmNormal(landmarks)` | Returns `{nx, ny, nz}` — full 3D unit palm normal from wrist + index/pinky MCP cross product |
| `mlClassifyOrientation(landmarks)` | Returns one of `toward/away/up/down/left/right` — whichever palm normal component is largest |
| `mlAngleBucket(angle)` | Maps angle (int, can be negative) to Firestore key: `hyp/<0/1/31/61/91/121/151` |
| `mlRenderGrid(grid)` | Renders 6×8 coverage grid with fill bars; gold = emptiest cell; sets `_mlSuggestedAngle` |
| `mlToggleStats()` / `mlToggleModels()` | Collapse/expand with `scrollIntoView` on expand |
| `mlSaveNotes()` | Saves textarea value to `localStorage('ml_session_notes')` |

---
