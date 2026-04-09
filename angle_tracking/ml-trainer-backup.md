# ML Angle Trainer — Section 17 Backup
Snapshotted before Recording Mode was added (2026-03-23).

---

## app.js — Section 17 (lines 3767–4470)

```js
/* ══════════════════════════════════════════════════════════════════════════
   SECTION 17: ML ANGLE TRAINER
   ══════════════════════════════════════════════════════════════════════════ */

const _mlModels = new Map();           // jointKey-hand → { type, model }
let   _mlTrainerCamera    = null;
let   _mlTrainerFacingMode = 'environment';
const _mlFilterStates     = {};        // One Euro filter state for ML trainer
let   _mlCurrentLandmarks = null;
let   _mlCurrentHand      = null;      // 'left' | 'right' | null
let   _mlMpHands          = null;
let   _mlFeatureExtractor = null;      // MobileNetV1 α=0.25
let   _currentFrameFeatures = null;   // cached per-frame 256-dim visual vector
let   _currentHandLabel   = null;      // 'left' | 'right' | null — set by each onResults

// ── loadMLModels (called at login, background) ─────────────────────────────
async function loadMLModels() {
  if (!window.tf) return;
  try {
    const [snap] = await Promise.all([
      db.collection('mlModels').get(),
      loadMLFeatureExtractor(),
    ]);
    for (const doc of snap.docs) {
      const data          = doc.data();
      const type          = data.type || 'landmarks';
      const model         = await window.tf.models.modelFromJSON(JSON.parse(data.topology));
      const weightTensors = data.weights.map(w => window.tf.tensor(w));
      model.setWeights(weightTensors);
      weightTensors.forEach(t => t.dispose());
      _mlModels.set(doc.id, { type, model });
    }
  } catch (e) {
    console.error('loadMLModels:', e);
  }
}

async function loadMLFeatureExtractor() {
  if (!window.mobilenet) return;
  try {
    _mlFeatureExtractor = await window.mobilenet.load({ version: 1, alpha: 0.25 });
  } catch (e) {
    console.error('loadMLFeatureExtractor:', e);
  }
}

async function extractVisualFeatures(canvas, landmarks) {
  if (!_mlFeatureExtractor || !canvas || !landmarks) return null;
  try {
    const xs  = landmarks.map(l => l.x), ys = landmarks.map(l => l.y);
    const pad = 0.12;
    const x0  = Math.max(0, Math.min(...xs) - pad);
    const y0  = Math.max(0, Math.min(...ys) - pad);
    const x1  = Math.min(1, Math.max(...xs) + pad);
    const y1  = Math.min(1, Math.max(...ys) + pad);
    const cw  = canvas.width, ch = canvas.height;

    const crop = document.createElement('canvas');
    crop.width = crop.height = 224;
    crop.getContext('2d').drawImage(
      canvas,
      x0 * cw, y0 * ch, (x1 - x0) * cw, (y1 - y0) * ch,
      0, 0, 224, 224
    );

    const tensor = _mlFeatureExtractor.infer(crop, true);
    const result = Array.from(tensor.dataSync());
    tensor.dispose();
    return result;
  } catch (e) {
    console.error('extractVisualFeatures:', e);
    return null;
  }
}

// ── getTrainedAngle — used throughout app (Sections 9, 16) ────────────────
function getTrainedAngle(jointKey, landmarks) {
  if (!_currentHandLabel) return null;
  const entry = _mlModels.get(`${jointKey}-${_currentHandLabel}`);
  if (!entry) return null;
  const flat = landmarks.map(lm => [lm.x, lm.y, lm.z || 0]).flat();

  if (entry.type === 'hybrid') {
    if (!_currentFrameFeatures) return null;
    const imgT  = window.tf.tensor2d([_currentFrameFeatures]);
    const lmT   = window.tf.tensor2d([flat]);
    const pred  = entry.model.predict([imgT, lmT]);
    const angle = Math.round(pred.dataSync()[0] * 180);
    imgT.dispose(); lmT.dispose(); pred.dispose();
    return Math.max(0, Math.min(180, angle));
  }

  const input = window.tf.tensor2d([flat]);
  const pred  = entry.model.predict(input);
  const angle = Math.round(pred.dataSync()[0] * 180);
  input.dispose(); pred.dispose();
  return Math.max(0, Math.min(180, angle));
}

// ── One Euro Filter for ML trainer landmarks ───────────────────────────────
function mlOneEuroFilter(id, rawValue, timestamp) {
  if (!_mlFilterStates[id]) {
    _mlFilterStates[id] = { prevValue: rawValue, prevDeriv: 0, prevTime: timestamp };
    return rawValue;
  }
  const state  = _mlFilterStates[id];
  const dt     = (timestamp - state.prevTime) || (1 / 60);
  const alphaD = calibAlphaFor(1.0, dt);
  const deriv  = alphaD * ((rawValue - state.prevValue) / dt) + (1 - alphaD) * state.prevDeriv;
  const cutoff = 1.0 + 0.1 * Math.abs(deriv);
  const alpha  = calibAlphaFor(cutoff, dt);
  const value  = alpha * rawValue + (1 - alpha) * state.prevValue;
  state.prevValue = value;
  state.prevDeriv = deriv;
  state.prevTime  = timestamp;
  return value;
}

// ── startMLTrainer ─────────────────────────────────────────────────────────
async function startMLTrainer() {
  _mlTrainerFacingMode = 'environment';
  Object.keys(_mlFilterStates).forEach(k => delete _mlFilterStates[k]);
  _mlCurrentLandmarks = null;

  showScreen('mlTrainerScreen');

  const select = document.getElementById('mlJointSelect');
  if (select) {
    select.innerHTML = SWEEP_JOINTS
      .map(j => `<option value="${j.key}">${j.finger} ${j.joint.toUpperCase()}</option>`)
      .join('');
  }

  const slider   = document.getElementById('mlAngleSlider');
  const sliderEl = document.getElementById('mlSliderAngle');
  if (slider)   slider.value = 90;
  if (sliderEl) sliderEl.textContent = '90°';

  const notesEl = document.getElementById('mlSessionNotes');
  if (notesEl) notesEl.value = localStorage.getItem('ml_session_notes') || '';

  await Promise.all([mlRefreshSampleCounts(), mlRefreshModelsList()]);

  if (_mlTrainerCamera) return;

  const hands = new window.Hands({
    locateFile: file => `https://cdn.jsdelivr.net/npm/@mediapipe/hands/${file}`,
  });
  hands.setOptions({ maxNumHands: 1, modelComplexity: 1, minDetectionConfidence: 0.85, minTrackingConfidence: 0.75 });
  hands.onResults(mlOnResults);
  _mlMpHands = hands;

  mlStartCamera();
}

// ── mlStartCamera ──────────────────────────────────────────────────────────
function mlStartCamera() {
  const video      = document.getElementById('mlVideo');
  const overlay    = document.getElementById('mlOverlay');
  const overlayMsg = document.getElementById('mlOverlayMsg');

  if (isMobile()) {
    const mirror = _mlTrainerFacingMode === 'user' ? 'scaleX(-1)' : 'none';
    if (video) video.style.transform = mirror;
    const canvas = document.getElementById('mlCanvas');
    if (canvas) canvas.style.transform = mirror;
  }

  if (overlayMsg) overlayMsg.textContent = 'REQUESTING CAMERA...';

  if (isMobile()) {
    let active = true;
    _mlTrainerCamera = { stop: () => { active = false; } };

    navigator.mediaDevices.getUserMedia({
      video: { facingMode: _mlTrainerFacingMode, width: { ideal: 1280 }, height: { ideal: 720 } },
      audio: false,
    }).then(stream => {
      video.srcObject = stream;
      const offCanvas = document.createElement('canvas');
      const offCtx    = offCanvas.getContext('2d');

      const processFrame = async () => {
        if (!active) return;
        if (video.readyState >= 2) {
          const maxW = 1280, maxH = 720;
          const scale = Math.min(maxW / video.videoWidth, maxH / video.videoHeight, 1);
          offCanvas.width  = Math.round(video.videoWidth  * scale);
          offCanvas.height = Math.round(video.videoHeight * scale);
          offCtx.drawImage(video, 0, 0, offCanvas.width, offCanvas.height);
          try { await _mlMpHands.send({ image: offCanvas }); } catch(e) {}
        }
        if (active) requestAnimationFrame(processFrame);
      };

      video.onloadedmetadata = () => {
        video.play();
        if (overlay) overlay.classList.add('hidden');
        video.classList.add('ready');
        processFrame();
      };

      _mlTrainerCamera = {
        stop: () => {
          active = false;
          stream.getTracks().forEach(t => t.stop());
          video.srcObject = null;
          video.classList.remove('ready');
        }
      };
    }).catch(err => {
      if (overlay)    overlay.classList.remove('hidden');
      if (overlayMsg) overlayMsg.textContent = 'CAMERA ACCESS DENIED';
      console.error(err);
    });
  } else {
    let active = true;
    _mlTrainerCamera = { stop: () => { active = false; } };

    navigator.mediaDevices.getUserMedia({
      video: { facingMode: { ideal: _mlTrainerFacingMode }, width: { ideal: 1280 }, height: { ideal: 720 } },
      audio: false,
    }).then(stream => {
      video.srcObject = stream;

      const processFrame = async () => {
        if (!active) return;
        if (video.readyState >= 2) {
          try { await _mlMpHands.send({ image: video }); } catch(e) {}
        }
        if (active) requestAnimationFrame(processFrame);
      };

      video.onloadedmetadata = () => {
        video.play();
        if (overlay) overlay.classList.add('hidden');
        video.classList.add('ready');
        processFrame();
      };

      _mlTrainerCamera = {
        stop: () => {
          active = false;
          stream.getTracks().forEach(t => t.stop());
          video.srcObject = null;
          video.classList.remove('ready');
        }
      };
    }).catch(err => {
      if (overlay)    overlay.classList.remove('hidden');
      if (overlayMsg) overlayMsg.textContent = 'CAMERA ACCESS DENIED';
      console.error(err);
    });
  }
}

// ── mlOnResults ────────────────────────────────────────────────────────────
function mlOnResults(results) {
  const canvas   = document.getElementById('mlCanvas');
  const trackDot = document.getElementById('mlTrackDot');
  if (!canvas) return;

  const ctx  = canvas.getContext('2d');
  const srcW = results.image.width, srcH = results.image.height;
  const size = Math.min(srcW, srcH);
  const cropX = (srcW - size) / 2, cropY = (srcH - size) / 2;
  canvas.width = size; canvas.height = size;
  ctx.drawImage(results.image, cropX, cropY, size, size, 0, 0, size, size);

  const liveEl = document.getElementById('mlLiveAngle');

  const handEl = document.getElementById('mlHandLabel');

  if (results.multiHandLandmarks.length === 0 || !sweepIsRealHand(results.multiHandLandmarks[0])) {
    _mlCurrentLandmarks = null;
    _mlCurrentHand      = null;
    _currentHandLabel   = null;
    if (trackDot) trackDot.classList.remove('active');
    if (liveEl)   liveEl.textContent = '—';
    if (handEl)   handEl.textContent = '—';
    return;
  }

  const rawHand = (results.multiHandedness?.[0]?.label || '').toLowerCase();
  const hand = rawHand === 'left' ? 'right' : rawHand === 'right' ? 'left' : null;
  if (hand !== _mlCurrentHand) {
    _mlCurrentHand  = hand;
    _currentHandLabel = hand;
    if (hand) mlRefreshSampleCounts();
  }
  if (handEl) handEl.textContent = hand ? hand.charAt(0).toUpperCase() + hand.slice(1) : '—';

  const t   = performance.now() / 1000;
  const raw = results.multiHandLandmarks[0];
  const landmarks = raw.map((lm, i) => ({
    ...lm,
    x: mlOneEuroFilter(`${i}-x`, lm.x, t),
    y: mlOneEuroFilter(`${i}-y`, lm.y, t),
    z: mlOneEuroFilter(`${i}-z`, lm.z || 0, t),
  }));

  _mlCurrentLandmarks = landmarks;
  if (trackDot) trackDot.classList.add('active');
  extractVisualFeatures(canvas, landmarks).then(f => { _currentFrameFeatures = f; });

  const drawLm = landmarks.map(lm => ({
    ...lm,
    x: (lm.x * srcW - cropX) / size,
    y: (lm.y * srcH - cropY) / size,
  }));
  calibDrawLandmarks(ctx, drawLm);

  const select = document.getElementById('mlJointSelect');
  if (!select || !liveEl) return;
  const jDef  = SWEEP_JOINTS.find(j => j.key === select.value);
  if (!jDef) return;

  const trained = getTrainedAngle(select.value, landmarks);
  const angle   = trained !== null
    ? trained
    : Math.round(calibGetAngle(landmarks[jDef.def.a], landmarks[jDef.def.b], landmarks[jDef.def.c]));

  liveEl.textContent  = angle + '°';
  liveEl.style.color  = trained !== null ? 'var(--green)' : '';
}

// ── Finger config ──────────────────────────────────────────────────────────
const _mlFingerConfig = { thumb: true, index: true, middle: true, ring: true, pinky: true };
const _ML_FINGERS = ['thumb', 'index', 'middle', 'ring', 'pinky'];

function mlToggleFinger(name) {
  _mlFingerConfig[name] = !_mlFingerConfig[name];
  const btn = document.getElementById(`mlFinger-${name}`);
  if (btn) btn.classList.toggle('active', _mlFingerConfig[name]);
}

function mlSetFingerPreset(preset) {
  if (preset === 'all') {
    _ML_FINGERS.forEach(f => { _mlFingerConfig[f] = true; });
  } else if (preset === 'none') {
    _ML_FINGERS.forEach(f => { _mlFingerConfig[f] = false; });
  } else {
    _ML_FINGERS.forEach(f => { _mlFingerConfig[f] = Math.random() > 0.5; });
  }
  _ML_FINGERS.forEach(f => {
    const btn = document.getElementById(`mlFinger-${f}`);
    if (btn) btn.classList.toggle('active', _mlFingerConfig[f]);
  });
}

// ── mlSaveNotes ────────────────────────────────────────────────────────────
function mlSaveNotes() {
  const el = document.getElementById('mlSessionNotes');
  if (el) localStorage.setItem('ml_session_notes', el.value);
}

// ── mlOnJointChange ────────────────────────────────────────────────────────
async function mlOnJointChange() {
  const select = document.getElementById('mlJointSelect');
  if (select) await mlRefreshSampleCounts(select.value);
}

// ── mlOnSlider ─────────────────────────────────────────────────────────────
function mlOnSlider(value) {
  const el = document.getElementById('mlSliderAngle');
  if (el) el.textContent = value + '°';
}

function mlAngleBucket(angle) {
  if (angle < 0)    return 'hyp';
  if (angle === 0)  return '0';
  if (angle <= 30)  return '1';
  if (angle <= 60)  return '31';
  if (angle <= 90)  return '61';
  if (angle <= 120) return '91';
  if (angle <= 150) return '121';
  return '151';
}

// ── submitMLSample ─────────────────────────────────────────────────────────
async function submitMLSample() {
  if (!_mlCurrentLandmarks || !_mlCurrentHand) return;
  const select = document.getElementById('mlJointSelect');
  const slider = document.getElementById('mlAngleSlider');
  const btn    = document.getElementById('mlSubmitBtn');
  if (!select || !slider || !btn) return;

  const joint     = `${select.value}-${_mlCurrentHand}`;
  const trueAngle = parseInt(slider.value);
  const landmarks = _mlCurrentLandmarks.map(lm => [lm.x, lm.y, lm.z || 0]);

  btn.disabled = true;
  btn.textContent = 'Saving...';

  try {
    const metaRef  = db.collection('trainingMeta').doc(joint);
    const meta     = await metaRef.get();
    const total    = meta.exists ? meta.data().totalSamples : 0;
    const chunkIdx = Math.floor(total / 50);
    const chunkId  = `${joint}_chunk_${chunkIdx}`;
    const notes       = document.getElementById('mlSessionNotes')?.value?.trim() || '';
    const fingerConfig = _ML_FINGERS.filter(f => _mlFingerConfig[f]).join(',');
    const sample      = { landmarks, trueAngle, recordedAt: new Date().toISOString(), recordedBy: currentUser?.email || '', notes, fingerConfig };

    const bucketKey = `histogram.b${Math.min(17, Math.floor(trueAngle / 10))}`;
    const orient    = mlClassifyOrientation(_mlCurrentLandmarks);
    const gridKey   = `grid_${orient}_${mlAngleBucket(trueAngle)}`;
    await db.collection('trainingChunks').doc(chunkId).set(
      { joint, chunk: chunkIdx, samples: firebase.firestore.FieldValue.arrayUnion(sample) },
      { merge: true }
    );
    await metaRef.set({
      joint,
      totalSamples: firebase.firestore.FieldValue.increment(1),
      [bucketKey]: firebase.firestore.FieldValue.increment(1),
      [gridKey]: firebase.firestore.FieldValue.increment(1),
    }, { merge: true });

    btn.textContent = 'Saved!';
    setTimeout(() => { btn.textContent = 'Submit Sample'; btn.disabled = false; }, 700);

    slider.value = 90;
    mlOnSlider(90);
    await mlRefreshSampleCounts(joint);
  } catch (e) {
    btn.textContent = 'Error — retry';
    btn.disabled = false;
    console.error(e);
  }
}

// ── trainMLModel ───────────────────────────────────────────────────────────
async function trainMLModel() {
  if (!window.tf || !_mlCurrentHand) return;
  const select       = document.getElementById('mlJointSelect');
  const trainBtn     = document.getElementById('mlTrainBtn');
  const statusEl     = document.getElementById('mlTrainStatus');
  const progressWrap = document.getElementById('mlProgressWrap');
  const progressBar  = document.getElementById('mlProgressBar');
  if (!select || !trainBtn || !statusEl) return;

  const joint = `${select.value}-${_mlCurrentHand}`;
  trainBtn.disabled    = true;
  trainBtn.textContent = 'Loading samples...';
  if (statusEl)      statusEl.textContent  = '';
  if (progressWrap)  progressWrap.style.display = 'block';
  if (progressBar)   progressBar.style.width    = '0%';

  try {
    const snap    = await db.collection('trainingChunks').where('joint', '==', joint).get();
    const samples = snap.docs.flatMap(d => d.data().samples);

    if (samples.length === 0) {
      statusEl.textContent = 'No samples found.';
      trainBtn.disabled = false; trainBtn.textContent = 'Train Model';
      return;
    }

    statusEl.textContent = `Training on ${samples.length} samples...`;

    const xs = window.tf.tensor2d(samples.map(s => s.landmarks.flat()));
    const ys = window.tf.tensor2d(samples.map(s => [s.trueAngle / 180]));

    const model = window.tf.sequential({ layers: [
      window.tf.layers.dense({ inputShape: [63], units: 64, activation: 'relu' }),
      window.tf.layers.dense({ units: 32, activation: 'relu' }),
      window.tf.layers.dense({ units: 1 }),
    ]});
    model.compile({ optimizer: window.tf.train.adam(0.001), loss: 'meanSquaredError' });

    const epochs = 100;
    await model.fit(xs, ys, {
      epochs,
      validationSplit: samples.length >= 10 ? 0.1 : 0,
      callbacks: { onEpochEnd: (epoch) => {
        if (progressBar) progressBar.style.width = `${Math.round((epoch + 1) / epochs * 100)}%`;
      }},
    });

    const pred       = model.predict(xs);
    const predAngles = Array.from(pred.dataSync()).map(v => v * 180);
    const mae        = predAngles.reduce((s, v, i) => s + Math.abs(v - samples[i].trueAngle), 0) / predAngles.length;

    const weights = model.getWeights().map(w => Array.from(w.dataSync()));
    await db.collection('mlModels').doc(joint).set({
      topology:    JSON.stringify(model.toJSON()),
      weights,
      sampleCount: samples.length,
      trainedAt:   new Date().toISOString(),
      mae:         parseFloat(mae.toFixed(2)),
    });

    _mlModels.set(joint, { type: 'landmarks', model });
    xs.dispose(); ys.dispose(); pred.dispose();

    statusEl.textContent = `Done — avg error: ${mae.toFixed(1)}°`;
    trainBtn.textContent = 'Train Again';
    trainBtn.disabled    = false;
    await mlRefreshModelsList();
  } catch (e) {
    statusEl.textContent = 'Training failed.';
    trainBtn.textContent = 'Train Model';
    trainBtn.disabled    = false;
    console.error(e);
  }
}

// ── mlRefreshSampleCounts ──────────────────────────────────────────────────
async function mlRefreshSampleCounts(joint) {
  const select   = document.getElementById('mlJointSelect');
  const baseKey  = joint || (select ? select.value : null);
  if (!baseKey || !_mlCurrentHand) return;
  const j        = `${baseKey}-${_mlCurrentHand}`;
  const countEl  = document.getElementById('mlSampleCount');
  const trainBtn = document.getElementById('mlTrainBtn');

  try {
    const [meta, allMeta] = await Promise.all([
      db.collection('trainingMeta').doc(j).get(),
      db.collection('trainingMeta').get(),
    ]);
    const jointCount  = meta.exists ? meta.data().totalSamples : 0;
    const grandTotal  = allMeta.docs.reduce((sum, d) => sum + (d.data().totalSamples || 0), 0);

    if (countEl) countEl.textContent = `${jointCount} sample${jointCount !== 1 ? 's' : ''}`;
    if (trainBtn) {
      trainBtn.disabled    = jointCount < 100;
      trainBtn.textContent = jointCount < 100 ? `Train Model (need ${100 - jointCount} more)` : 'Train Model';
    }

    const labelEl = document.getElementById('mlStatJointLabel');
    const jCountEl = document.getElementById('mlStatJointCount');
    const totalEl  = document.getElementById('mlStatTotal');
    if (labelEl && select) {
      const optText = select.options[select.selectedIndex]?.text || baseKey;
      const handStr = _mlCurrentHand ? ` (${_mlCurrentHand})` : '';
      labelEl.textContent = `Samples for ${optText}${handStr}`;
    }
    if (jCountEl) jCountEl.textContent = jointCount;
    if (totalEl)  totalEl.textContent  = grandTotal;

    const docData = meta.exists ? meta.data() : {};
    const grid = {};
    Object.keys(docData).forEach(k => { if (k.startsWith('grid_')) grid[k] = docData[k]; });
    mlRenderGrid(grid);
  } catch (e) {
    console.error(e);
  }
}

// ── mlClassifyOrientation / mlRenderGrid ───────────────────────────────────
let _mlSuggestedAngle = null;

function mlPalmNormal(landmarks) {
  const w = landmarks[0], p1 = landmarks[5], p5 = landmarks[17];
  const ax = p5.x - w.x, ay = p5.y - w.y, az = (p5.z || 0) - (w.z || 0);
  const bx = p1.x - w.x, by = p1.y - w.y, bz = (p1.z || 0) - (w.z || 0);
  const nx = ay * bz - az * by;
  const ny = az * bx - ax * bz;
  const nz = ax * by - ay * bx;
  const mag = Math.sqrt(nx * nx + ny * ny + nz * nz);
  return mag === 0 ? { nx: 0, ny: 0, nz: 0 } : { nx: nx / mag, ny: ny / mag, nz: nz / mag };
}

function mlClassifyOrientation(landmarks) {
  const { nx, ny, nz } = mlPalmNormal(landmarks);
  const ax = Math.abs(nx), ay = Math.abs(ny), az = Math.abs(nz);
  if (az >= ax && az >= ay) return nz > 0 ? 'toward' : 'away';
  if (ay >= ax && ay >= az) return ny < 0 ? 'up' : 'down';
  return nx > 0 ? 'right' : 'left';
}

function mlRenderGrid(grid) {
  const gridEl  = document.getElementById('mlCoverageGrid');
  const labelEl = document.getElementById('mlNextAngleLabel');
  const useBtn  = document.getElementById('mlUseBtn');
  if (!gridEl) return;

  const ORIENTS = [
    { key: 'toward', label: 'TOWARD' },
    { key: 'away',   label: 'AWAY'   },
    { key: 'up',     label: 'UP'     },
    { key: 'down',   label: 'DOWN'   },
    { key: 'left',   label: 'LEFT'   },
    { key: 'right',  label: 'RIGHT'  },
  ];
  const BUCKETS = [
    { key: 'hyp', label: '<0',      mid: -15 },
    { key: '0',   label: '0',       mid: 0   },
    { key: '1',   label: '1-30',    mid: 15  },
    { key: '31',  label: '31-60',   mid: 45  },
    { key: '61',  label: '61-90',   mid: 75  },
    { key: '91',  label: '91-120',  mid: 105 },
    { key: '121', label: '121-150', mid: 135 },
    { key: '151', label: '151-180', mid: 165 },
  ];

  const cells     = ORIENTS.map(o => BUCKETS.map(b => grid[`grid_${o.key}_${b.key}`] || 0));
  const allCounts = cells.flat();
  const minCount  = Math.min(...allCounts);
  const minFlat   = allCounts.indexOf(minCount);
  const minOi     = Math.floor(minFlat / BUCKETS.length);
  const minBi     = minFlat % BUCKETS.length;
  _mlSuggestedAngle = BUCKETS[minBi].mid;

  if (labelEl) labelEl.textContent = `Suggested: ${_mlSuggestedAngle}° (${ORIENTS[minOi].label})`;
  if (useBtn)  useBtn.disabled = false;

  gridEl.innerHTML = `
    <div class="ml-grid-row ml-grid-header">
      <div class="ml-grid-orient-label"></div>
      ${BUCKETS.map(b => `<div class="ml-grid-col-label">${b.label}</div>`).join('')}
    </div>
    ${ORIENTS.map((o, oi) => `
      <div class="ml-grid-row">
        <div class="ml-grid-orient-label">${o.label}</div>
        ${BUCKETS.map((b, bi) => {
          const count  = cells[oi][bi];
          const pct    = Math.min(100, Math.round(count / 30 * 100));
          const isDone = count >= 30;
          const isMin  = oi === minOi && bi === minBi;
          const style  = isMin || isDone ? '' : `--pct:${pct}%`;
          return `<div class="ml-grid-cell${isDone ? ' ml-grid-cell--done' : ''}${isMin ? ' ml-grid-cell--target' : ''}" style="${style}" title="${count}/30"></div>`;
        }).join('')}
      </div>
    `).join('')}
  `;
}

function mlUseSuggested() {
  if (_mlSuggestedAngle === null) return;
  const slider = document.getElementById('mlAngleSlider');
  if (slider) { slider.value = _mlSuggestedAngle; mlOnSlider(_mlSuggestedAngle); }
}

// ── mlRefreshModelsList ────────────────────────────────────────────────────
async function mlRefreshModelsList() {
  const list = document.getElementById('mlModelsList');
  if (!list) return;

  try {
    const snap = await db.collection('mlModels').get();
    if (snap.empty) {
      list.textContent = 'No models trained yet.';
      return;
    }
    list.innerHTML = snap.docs.map(doc => {
      const d = doc.data();
      return `<div class="ml-model-row">
        <span class="ml-model-joint">${doc.id}</span>
        <span class="ml-model-meta">${d.sampleCount} samples — ${d.mae}° avg error</span>
      </div>`;
    }).join('');
  } catch (e) {
    list.textContent = 'Failed to load.';
    console.error(e);
  }
}

// ── mlFlipCamera ───────────────────────────────────────────────────────────
function mlFlipCamera() {
  _mlTrainerFacingMode = _mlTrainerFacingMode === 'environment' ? 'user' : 'environment';
  if (_mlTrainerCamera) { _mlTrainerCamera.stop(); _mlTrainerCamera = null; }
  Object.keys(_mlFilterStates).forEach(k => delete _mlFilterStates[k]);
  mlStartCamera();
}

// ── mlToggleStats ──────────────────────────────────────────────────────────
function mlToggleStats() {
  const body    = document.getElementById('mlStatsBody');
  const chevron = document.getElementById('mlStatsChevron');
  const card    = document.getElementById('mlStatsCard');
  if (!body) return;
  const open = body.style.display === 'none';
  body.style.display = open ? 'block' : 'none';
  if (chevron) chevron.textContent = open ? '▾' : '▸';
  if (open && card) setTimeout(() => card.scrollIntoView({ behavior: 'smooth', block: 'nearest' }), 20);
}

// ── mlToggleModels ─────────────────────────────────────────────────────────
function mlToggleModels() {
  const body    = document.getElementById('mlModelsBody');
  const chevron = document.getElementById('mlModelsChevron');
  const card    = document.getElementById('mlModelsCard');
  if (!body) return;
  const open = body.style.display === 'none';
  body.style.display  = open ? 'block' : 'none';
  if (chevron) chevron.textContent = open ? '▾' : '▸';
  if (open && card) setTimeout(() => card.scrollIntoView({ behavior: 'smooth', block: 'nearest' }), 20);
}

// ── mlTrainerBack ──────────────────────────────────────────────────────────
function mlTrainerBack() {
  if (_mlTrainerCamera) { _mlTrainerCamera.stop(); _mlTrainerCamera = null; }
  _mlMpHands = null;
  _mlCurrentLandmarks = null;
  const video = document.getElementById('mlVideo');
  if (video?.srcObject) {
    video.srcObject.getTracks().forEach(t => t.stop());
    video.srcObject = null;
    video.classList.remove('ready');
  }
  Object.keys(_mlFilterStates).forEach(k => delete _mlFilterStates[k]);
  showScreen('therapistScreen');
}
```

---

## index.html — #mlTrainerScreen (lines 503–631)

```html
<div id="mlTrainerScreen" class="screen">

  <header class="sweep-header">
    <button class="sweep-back-btn" onclick="mlTrainerBack()">← Back</button>
    <span class="sweep-header-title">ML Angle Trainer</span>
    <span style="width:60px"></span>
  </header>

  <div class="calib-main">

    <div class="calib-camera-col">
      <div class="calib-camera-wrap sweep-camera-wrap" id="mlCameraWrap">
        <div class="calib-scan-line"></div>
        <video id="mlVideo" playsinline autoplay muted></video>
        <canvas id="mlCanvas"></canvas>
        <div class="calib-overlay" id="mlOverlay">
          <div class="calib-spinner"></div>
          <div class="calib-overlay-text" id="mlOverlayMsg">LOADING MEDIAPIPE...</div>
        </div>
        <div class="sweep-track-dot" id="mlTrackDot"></div>
        <button class="sweep-flip-btn" onclick="mlFlipCamera()">flip</button>
      </div>
    </div>

    <div class="calib-right-col ml-right-col">

      <!-- Joint selector -->
      <div class="ml-joint-row">
        <select id="mlJointSelect" class="ml-joint-select" onchange="mlOnJointChange()"></select>
        <span class="ml-hand-label" id="mlHandLabel">—</span>
      </div>

      <!-- Session notes -->
      <textarea id="mlSessionNotes" class="ml-notes" placeholder="Session notes (e.g. white male, 35, bedroom lighting)" oninput="mlSaveNotes()" rows="2"></textarea>

      <!-- Finger config -->
      <div class="ml-finger-config">
        <span class="ml-config-label">OTHER FINGERS</span>
        <div class="ml-finger-btns">
          <button class="ml-finger-btn active" id="mlFinger-thumb"  onclick="mlToggleFinger('thumb')"  title="Thumb">T</button>
          <button class="ml-finger-btn active" id="mlFinger-index"  onclick="mlToggleFinger('index')"  title="Index">I</button>
          <button class="ml-finger-btn active" id="mlFinger-middle" onclick="mlToggleFinger('middle')" title="Middle">M</button>
          <button class="ml-finger-btn active" id="mlFinger-ring"   onclick="mlToggleFinger('ring')"   title="Ring">R</button>
          <button class="ml-finger-btn active" id="mlFinger-pinky"  onclick="mlToggleFinger('pinky')"  title="Pinky">P</button>
        </div>
        <div class="ml-finger-presets">
          <button class="ml-preset-btn" onclick="mlSetFingerPreset('all')">All up</button>
          <button class="ml-preset-btn" onclick="mlSetFingerPreset('none')">All down</button>
          <button class="ml-preset-btn" onclick="mlSetFingerPreset('random')">Random</button>
        </div>
      </div>

      <!-- Angle comparison hero -->
      <div class="ml-capture-panel">
        <div class="ml-angle-block">
          <div class="ml-angle-tag">MEDIAPIPE</div>
          <div class="ml-angle-big" id="mlLiveAngle">—</div>
        </div>
        <div class="ml-vs">vs</div>
        <div class="ml-angle-block ml-angle-block--true">
          <div class="ml-angle-tag">GROUND TRUTH</div>
          <div class="ml-angle-big ml-angle-big--true" id="mlSliderAngle">90°</div>
        </div>
        <div class="ml-slider-wrap">
          <input type="range" min="-30" max="180" value="90" id="mlAngleSlider" class="ml-slider" oninput="mlOnSlider(this.value)">
          <div class="ml-slider-ticks">
            <span>-30°</span><span>0°</span><span>45°</span><span>90°</span><span>135°</span><span>180°</span>
          </div>
        </div>
      </div>

      <button class="sweep-save-btn" id="mlSubmitBtn" onclick="submitMLSample()">Submit Sample</button>

      <!-- Coverage guidance -->
      <div class="ml-coverage-card">
        <div class="ml-coverage-header">
          <span class="ml-coverage-title">ANGLE COVERAGE</span>
          <div class="ml-coverage-next">
            <span id="mlNextAngleLabel">Suggested: —</span>
            <button class="ml-use-btn" id="mlUseBtn" onclick="mlUseSuggested()" disabled>Use</button>
          </div>
        </div>
        <div class="ml-coverage-grid" id="mlCoverageGrid"></div>
      </div>

      <!-- Training -->
      <div class="ml-train-card">
        <button class="ml-train-btn" id="mlTrainBtn" onclick="trainMLModel()" disabled>Train Model</button>
        <div class="ml-train-status" id="mlTrainStatus"></div>
        <div class="ml-progress-wrap" id="mlProgressWrap" style="display:none">
          <div class="ml-progress-bar" id="mlProgressBar"></div>
        </div>
      </div>

      <!-- Sample stats -->
      <div class="ml-stats-card" id="mlStatsCard">
        <button class="ml-models-toggle" onclick="mlToggleStats()">
          <span class="sweep-panel-title">SAMPLE COUNTS</span>
          <span class="ml-models-chevron" id="mlStatsChevron">▸</span>
        </button>
        <div class="ml-stats-body" id="mlStatsBody" style="display:none">
          <div class="ml-stat-row">
            <span class="ml-stat-label" id="mlStatJointLabel">Samples for —</span>
            <span class="ml-stat-val" id="mlStatJointCount">0</span>
          </div>
          <div class="ml-stat-row">
            <span class="ml-stat-label">Total Samples</span>
            <span class="ml-stat-val" id="mlStatTotal">0</span>
          </div>
        </div>
      </div>

      <!-- Trained models -->
      <div class="ml-models-card" id="mlModelsCard">
        <button class="ml-models-toggle" onclick="mlToggleModels()">
          <span class="sweep-panel-title">TRAINED MODELS</span>
          <span class="ml-models-chevron" id="mlModelsChevron">▸</span>
        </button>
        <div class="ml-models-body" id="mlModelsBody" style="display:none">
          <div id="mlModelsList" class="ml-models-list">No models trained yet.</div>
        </div>
      </div>

    </div>
  </div>

  <footer class="calib-footer">phalanX ML Trainer — TensorFlow.js</footer>

</div>
```
