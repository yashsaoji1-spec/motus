# ML Angle Trainer — Training Guide

## The Goal

The model learns to predict joint angle (0–180°) from MediaPipe landmarks (63 floats) and optionally MobileNet visual features (256 floats). You are the ground truth — you set the slider to what you *know* the angle is, and the model learns to match your judgment from the camera's raw data.

Accuracy target: **<10° average error** for clinical use. **<5°** is excellent.

---

## How to Know the Model Is Learning

### 1. MAE after training
After you hit Train Model, the app shows `Done — avg error: X.X°`. This is the mean absolute error on the training set.

| MAE | What it means |
|-----|---------------|
| >20° | Model hasn't learned — not enough samples or too much variety without coverage |
| 10–20° | Partial learning — some angles work, others don't |
| 5–10° | Good — usable for clinical feedback |
| <5° | Excellent |

The number shown is **training MAE** (same data it learned from), so it's optimistic. Real-world error is typically 20–50% higher.

### 2. Live comparison
While the camera is running, watch the **MEDIAPIPE vs GROUND TRUTH** panel. Set your slider to an angle you know precisely (e.g., full extension = 0°, or maximum flex you can measure), then check if the live MediaPipe reading is reasonable. If the model isn't trained yet, the live angle is raw MediaPipe — already useful as a baseline to understand where it's systematically off.

### 3. Coverage grid fill
The 6×8 grid shows how many samples you have per (orientation × angle) combination. A cell turns solid when it hits 30 samples. If large chunks of the grid are empty, the model is interpolating (guessing) for those conditions — and it'll be inaccurate there.

**Angle columns (left → right):** <0° | 0° | 1–30° | 31–60° | 61–90° | 91–120° | 121–150° | 151–180°. The gold cell is the emptiest — clicking **Use Suggested** sets the slider to its midpoint. Slider range is -30° to 180°.

### 4. Retrain and compare MAE
After adding a batch of new samples, retrain and note whether MAE dropped. If it stays flat or goes up, the new samples may be mislabeled (slider wasn't set correctly) or they're introducing noise.

---

## What Factors the Model Can Miss

### Factor 1: Hand orientation
This is the biggest one. The model sees 63 landmark coordinates — but the same joint angle looks geometrically *different* when your palm faces the camera vs faces away vs faces sideways. If you only train one orientation, the model fails on others.

**The grid tells you this directly.** Rows = orientations (TOWARD, AWAY, UP, DOWN, LEFT, RIGHT). Any empty row = the model has never seen that view.

**The 6 orientations:**
- **TOWARD** — palm facing camera (most natural selfie position)
- **AWAY** — back of hand facing camera
- **UP** — palm facing up (hand resting on table)
- **DOWN** — palm facing down
- **LEFT / RIGHT** — hand tilted sideways

### Factor 2: Angle range coverage
The model extrapolates poorly at the extremes. If you only trained 30–120°, predictions at 0° or 160° will be inaccurate. Include:
- **Hyperextension** (<0°) — some joints can go past straight
- **Full extension** (~0°) — important baseline
- **Full flexion** (>150° for MCP/PIP) — the clinical endpoint

### Factor 3: Lighting (hybrid model only)
MobileNet's 256-dim features capture lighting, contrast, and appearance. If all your samples are from the same room at the same time, the hybrid model may fail under different lighting (outdoor window light, overhead fluorescent, dim bedroom).

**Fix:** Use the session notes field to tag conditions. Deliberately record in at least 3 different lighting setups — bright overhead, dim/side-lit, and natural window light.

### Factor 4: Skin tone and appearance
MobileNet encodes visual texture. A model trained entirely on one person's skin tone may underperform on others. For clinical use across patients, collect samples from multiple people or note this as a known limitation.

### Factor 5: Camera distance and crop
The hand bounding box crop is normalized before MobileNet, but extreme distances (hand very far or very close) can still affect the 256-dim features. Keep the camera at a consistent distance (~30–50cm) or deliberately vary it.

### Factor 6: Which joint you're training
Each joint has its own model (e.g., `index-mcp-left`). Don't mix joints — the `mlJointSelect` dropdown controls which model is being trained. Make sure you're always looking at the joint you think you are.

### Factor 8: Hand selection (left vs right)
MediaPipe reports handedness from the person's perspective, which is mirror-flipped relative to the camera. The app auto-corrects this — so **LEFT in the app = your left hand** (the camera's right). Always verify the hand label displayed in the trainer matches the hand you're actually recording. If your samples end up under the wrong hand, they'll never contribute to the right model.

### Factor 7: Finger config (which other fingers are up/down)
Adjacent finger position slightly changes landmarks due to skin stretch and shadows. The `fingerConfig` field is stored per-sample — if you trained with all fingers up but predict with some fingers down, expect slight degradation. Not a huge factor but worth varying during collection.

---

## What Samples to Collect (Priority Order)

### Step 1: Follow the "Suggested" angle
The app always shows the angle+orientation combo with the *fewest* samples. Click **Use** to set the slider to that angle, then point your hand in the suggested orientation and record. This is the most efficient path to balanced coverage.

### Step 2: Fill the grid systematically
Goal: **≥30 samples per cell** (48 cells total = ~1,440 samples for complete coverage of one joint-hand).

Practical approach:
1. Pick one orientation (e.g., TOWARD)
2. Do a recording sweep across the full angle range at that orientation
3. Move to the next orientation
4. Repeat

The recording mode (~6 samples/sec) makes this fast — a slow hand sweep at one orientation for 30 seconds fills most of a row.

### Step 3: Vary conditions after baseline
Once you have 30 samples per cell in normal conditions:
- Record a batch in different lighting (note it in session notes)
- Record with some fingers in different positions
- Record at slightly different camera distances

### Step 4: Prioritize clinically relevant angles
For rehab, the angles that matter most depend on the joint:
- **MCP flexion**: 0–90° is the active rehab range
- **PIP flexion**: 0–110°
- **Full extension (0°)** is always important — it's the baseline

Give these ranges double coverage compared to extremes.

---

## Using the Angle Jig

Physical jigs in `hardware/` hold the finger at a precise angle so the slider value matches the actual joint position exactly — no estimation required.

Two designs:
- **`adjustable_jig.scad`** — one tool per joint type (MCP / PIP / DIP), adjustable 0°–90° in 10° steps via arc holes + lock peg. Print once, use for all angle recordings.
- **`finger_angle_jig.scad`** — fixed-angle, supports all 14 joints. Print one per angle needed.

**Recording workflow with the adjustable jig:**

1. Print proximal arm + distal arm + 3 lock pegs for the target joint (TPU 95A, 0.2mm layers, no supports, flat on build plate)
2. Slip the proximal arm onto the bone segment above the joint; distal arm onto the bone segment below
3. Press the distal arm socket over the proximal arm boss
4. Rotate to the target angle; push a lock peg through the matching arc hole (hole 0 = 0°, hole 9 = 90°)
5. In the ML Trainer, set the slider to match the locked angle
6. Hit **Start Recording** — move the hand through orientations while the joint stays fixed
7. **Stop Recording**; pull the peg, rotate to the next angle, push peg back in
8. Update the slider to match and record again
9. Repeat across the angle range until the coverage grid shows adequate fill

Because the joint cannot physically move from the locked position, every sample in a recording session has the same exact true angle — making this the highest-quality data collection method.

---

## Practical Recording Tips

**During a recording session:**
- Move your hand *slowly* and continuously through the range — don't hold still at one angle
- Keep the slider at the angle you're *approaching*, then adjust as you move
- Or: set the slider to one fixed angle, hold the hand at exactly that angle, record 20–30 samples, then change angle and repeat

**Session notes to add:**
- Lighting: `bright overhead`, `dim bedroom`, `window right side`
- Person: initials, skin tone, hand size note
- Distance: `close (~20cm)`, `normal (~40cm)`, `far (~60cm)`

**Check the coverage grid every ~100 samples** — it refreshes automatically during recording (every 10 captures) and shows you what's still missing.

---

## When to Retrain

Retrain after:
- Adding 100+ new samples
- Changing lighting conditions significantly
- Training a new person's hand

The Train Model button shows how many samples you have and how many more are needed (minimum 100 to unlock — the model has ~6,200 parameters and memorizes rather than generalizes below this threshold). After training, compare the new MAE to the previous — if it went up, the new samples may have bad labels.

---

## Hybrid vs Landmarks-Only Model

| | Landmarks-only | Hybrid |
|---|---|---|
| Input | 63 floats (21 landmarks × x/y/z) | 63 landmarks + 256 MobileNet visual features |
| Needs | Any 100 samples | 10+ samples with `imageFeatures` |
| Generalizes lighting? | No | Yes |
| Generalizes skin tone? | No | Better |
| When to use | Quick baseline | Production accuracy |

All samples captured now include `imageFeatures` automatically. Old samples without it are used in the landmarks-only fallback. The app auto-selects hybrid training once you have 10+ qualifying samples.

---

## Quick Reference: What to Look At

| Question | Where to look |
|---|---|
| Is the model accurate? | MAE shown after training; live MEDIAPIPE panel vs slider |
| What orientation is underrepresented? | Coverage grid row with most empty cells |
| What angle is underrepresented? | Coverage grid column with most empty cells; "Suggested" label |
| What cell needs the most work? | Highlighted (target) cell in the grid |
| How many samples total? | Sample count panel (collapsible) |
| Did retraining help? | Compare new MAE to previous |
