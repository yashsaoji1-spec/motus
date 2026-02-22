const video        = document.getElementById('video');
const canvas       = document.getElementById('canvas');
const ctx          = canvas.getContext('2d');
const overlay      = document.getElementById('overlay');
const overlayMsg   = document.getElementById('overlay-msg');
const dot          = document.getElementById('dot');
const statusText   = document.getElementById('status-text');
const handCount    = document.getElementById('hand-count');
const cameraWrap   = document.getElementById('cameraWrap');
const landmarkGrid = document.getElementById('landmark-grid');
const viewToggle   = document.getElementById('viewToggle');

// ─── View mode ────────────────────────────────────────────────────────────────
// 'focus' = single selected finger | 'all' = all five fingers
let viewMode = 'focus';

viewToggle.addEventListener('click', () => {
  if (viewMode === 'focus') {
    viewMode = 'all';
    viewToggle.textContent = 'FOCUS MODE';
    viewToggle.classList.add('active');
    document.getElementById('focus-mode').classList.add('hidden');
    document.getElementById('all-mode').classList.remove('hidden');
  } else {
    viewMode = 'focus';
    viewToggle.textContent = 'ALL FINGERS';
    viewToggle.classList.remove('active');
    document.getElementById('focus-mode').classList.remove('hidden');
    document.getElementById('all-mode').classList.add('hidden');
  }
  clearBuffers();
});

// ─── Per-landmark stability tracking ─────────────────────────────────────────
const LANDMARK_PREV = {};

const FINGER_THRESHOLDS = {
  thumb:  0.05,
  index:  0.05,
  middle: 0.018,
  ring:   0.018,
  pinky:  0.05,
};

function landmarkJumped(index, lm, threshold) {
  const prev = LANDMARK_PREV[index];
  if (!prev) {
    LANDMARK_PREV[index] = { x: lm.x, y: lm.y };
    return false;
  }
  const dx   = lm.x - prev.x;
  const dy   = lm.y - prev.y;
  const dist = Math.sqrt(dx * dx + dy * dy);
  LANDMARK_PREV[index] = { x: lm.x, y: lm.y };
  return dist > threshold;
}

// ─── Finger joint definitions ─────────────────────────────────────────────────
const FINGERS = {
  thumb: {
    joints: {
      mcp: { a: 0,  b: 2,  c: 3,  id: 'thumb-mcp', type: 'mcp' },
      pip: { a: 2,  b: 3,  c: 4,  id: 'thumb-pip', type: 'pip' },
      dip: null,
    }
  },
  index: {
    joints: {
      mcp: { a: 0,  b: 5,  c: 6,  id: 'index-mcp', type: 'mcp' },
      pip: { a: 5,  b: 6,  c: 7,  id: 'index-pip', type: 'pip' },
      dip: { a: 6,  b: 7,  c: 8,  id: 'index-dip', type: 'dip' },
    }
  },
  middle: {
    joints: {
      mcp: { a: 0,  b: 9,  c: 10, id: 'middle-mcp', type: 'mcp' },
      pip: { a: 9,  b: 10, c: 11, id: 'middle-pip', type: 'pip' },
      dip: { a: 10, b: 11, c: 12, id: 'middle-dip', type: 'dip' },
    }
  },
  ring: {
    joints: {
      mcp: { a: 0,  b: 13, c: 14, id: 'ring-mcp', type: 'mcp' },
      pip: { a: 13, b: 14, c: 15, id: 'ring-pip', type: 'pip' },
      dip: { a: 14, b: 15, c: 16, id: 'ring-dip', type: 'dip' },
    }
  },
  pinky: {
    joints: {
      mcp: { a: 0,  b: 17, c: 18, id: 'pinky-mcp', type: 'mcp' },
      pip: { a: 17, b: 18, c: 19, id: 'pinky-pip', type: 'pip' },
      dip: { a: 18, b: 19, c: 20, id: 'pinky-dip', type: 'dip' },
    }
  },
};

// Which landmark indices belong to each finger (for canvas drawing)
const FINGER_LANDMARKS = {
  thumb:  [0, 1, 2, 3, 4],
  index:  [0, 5, 6, 7, 8],
  middle: [0, 9, 10, 11, 12],
  ring:   [0, 13, 14, 15, 16],
  pinky:  [0, 17, 18, 19, 20],
};

// ─── Clinical range remapping ─────────────────────────────────────────────────
const JOINT_RANGES = {
  mcp: { rawMax: 105, clinicalMax: 110 },
  pip: { rawMax: 75,  clinicalMax: 115 },
  dip: { rawMax: 50,  clinicalMax: 70  },
};

function remapToClinical(rawAngle, type) {
  const range = JOINT_RANGES[type];
  if (!range) return rawAngle;
  const remapped = Math.round((rawAngle / range.rawMax) * range.clinicalMax);
  return Math.max(0, Math.min(range.clinicalMax, remapped));
}

const LANDMARK_NAMES = [
  'WRIST',
  'THUMB_CMC','THUMB_MCP','THUMB_IP','THUMB_TIP',
  'INDEX_MCP','INDEX_PIP','INDEX_DIP','INDEX_TIP',
  'MIDDLE_MCP','MIDDLE_PIP','MIDDLE_DIP','MIDDLE_TIP',
  'RING_MCP','RING_PIP','RING_DIP','RING_TIP',
  'PINKY_MCP','PINKY_PIP','PINKY_DIP','PINKY_TIP',
];

const TIP_INDICES = new Set([4, 8, 12, 16, 20]);

// ─── Smoothing buffer ─────────────────────────────────────────────────────────
const SMOOTH_FRAMES = 8;
const angleBuffers  = {};

function getSmoothedAngle(id, newAngle, confident = true) {
  if (!angleBuffers[id]) angleBuffers[id] = [];
  const buf = angleBuffers[id];
  if (confident) {
    buf.push(newAngle);
    if (buf.length > SMOOTH_FRAMES) buf.shift();
  }
  if (buf.length === 0) return newAngle;
  return Math.round(buf.reduce((sum, v) => sum + v, 0) / buf.length);
}

function clearBuffers() {
  for (const key of Object.keys(angleBuffers)) angleBuffers[key] = [];
}

// ─── Dorsum plane ─────────────────────────────────────────────────────────────
function getDorsumNormal(landmarks) {
  const wrist    = landmarks[0];
  const indexMCP = landmarks[5];
  const pinkyMCP = landmarks[17];
  const e1 = { x: indexMCP.x - wrist.x, y: indexMCP.y - wrist.y, z: (indexMCP.z||0) - (wrist.z||0) };
  const e2 = { x: pinkyMCP.x - wrist.x, y: pinkyMCP.y - wrist.y, z: (pinkyMCP.z||0) - (wrist.z||0) };
  const normal = {
    x: e1.y * e2.z - e1.z * e2.y,
    y: e1.z * e2.x - e1.x * e2.z,
    z: e1.x * e2.y - e1.y * e2.x,
  };
  const mag = Math.sqrt(normal.x ** 2 + normal.y ** 2 + normal.z ** 2);
  if (mag === 0) return { x: 0, y: 0, z: 1 };
  return { x: normal.x / mag, y: normal.y / mag, z: normal.z / mag };
}

function projectOntoPlane(vec, normal) {
  const d = vec.x * normal.x + vec.y * normal.y + vec.z * normal.z;
  return { x: vec.x - d * normal.x, y: vec.y - d * normal.y, z: vec.z - d * normal.z };
}

function getDorsumAngle(a, b, c, normal) {
  const vecBA  = { x: a.x - b.x, y: a.y - b.y, z: (a.z||0) - (b.z||0) };
  const vecBC  = { x: c.x - b.x, y: c.y - b.y, z: (c.z||0) - (b.z||0) };
  const projBA = projectOntoPlane(vecBA, normal);
  const projBC = projectOntoPlane(vecBC, normal);
  const dot    = projBA.x * projBC.x + projBA.y * projBC.y + projBA.z * projBC.z;
  const magBA  = Math.sqrt(projBA.x ** 2 + projBA.y ** 2 + projBA.z ** 2);
  const magBC  = Math.sqrt(projBC.x ** 2 + projBC.y ** 2 + projBC.z ** 2);
  if (magBA === 0 || magBC === 0) return 0;
  const cosAngle = Math.max(-1, Math.min(1, dot / (magBA * magBC)));
  return 180 - Math.round(Math.acos(cosAngle) * (180 / Math.PI));
}

// ─── Status helpers ───────────────────────────────────────────────────────────
function setStatus(msg, state = 'idle') {
  statusText.textContent = msg;
  statusText.className   = state === 'active' ? 'active' : '';
  dot.className = 'dot' + (state === 'active' ? ' active' : state === 'error' ? ' error' : '');
}

// ─── Selected finger state (focus mode) ──────────────────────────────────────
let selectedFinger = 'index';

const FINGER_JOINT_LABELS = {
  thumb:  { mcp: 'MCP', pip: 'IP',  dip: null },
  index:  { mcp: 'MCP', pip: 'PIP', dip: 'DIP' },
  middle: { mcp: 'MCP', pip: 'PIP', dip: 'DIP' },
  ring:   { mcp: 'MCP', pip: 'PIP', dip: 'DIP' },
  pinky:  { mcp: 'MCP', pip: 'PIP', dip: 'DIP' },
};

const FINGER_JOINT_LONG = {
  thumb:  'Metacarpophalangeal · Interphalangeal',
  index:  'Metacarpophalangeal · Proximal · Distal',
  middle: 'Metacarpophalangeal · Proximal · Distal',
  ring:   'Metacarpophalangeal · Proximal · Distal',
  pinky:  'Metacarpophalangeal · Proximal · Distal',
};

function applyFingerSelection(fingerName) {
  selectedFinger = fingerName;
  document.getElementById('focus-name').textContent =
    fingerName.charAt(0).toUpperCase() + fingerName.slice(1);
  document.getElementById('focus-sub').textContent = FINGER_JOINT_LONG[fingerName];
  const dipRow = document.getElementById('focus-row-dip');
  const labels = FINGER_JOINT_LABELS[fingerName];
  dipRow.style.display = labels.dip ? 'flex' : 'none';
  document.querySelector('#focus-row-pip .focus-label').textContent = labels.pip;
  ['mcp', 'pip', 'dip'].forEach(k => {
    const el  = document.getElementById(`focus-${k}`);
    const bar = document.getElementById(`focus-bar-${k}`);
    if (el)  el.textContent = '—';
    if (bar) bar.style.width = '0%';
  });
}

document.querySelectorAll('.finger-tab').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.finger-tab').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    applyFingerSelection(btn.dataset.finger);
  });
});

// ─── Helper: compute + smooth one joint, return degree value ─────────────────
function computeJoint(joint, landmarks, normal, threshold) {
  const aJumped  = landmarkJumped(joint.a, landmarks[joint.a], threshold);
  const bJumped  = landmarkJumped(joint.b, landmarks[joint.b], threshold);
  const cJumped  = landmarkJumped(joint.c, landmarks[joint.c], threshold);
  const confident = !aJumped && !bJumped && !cJumped;
  const raw      = getDorsumAngle(landmarks[joint.a], landmarks[joint.b], landmarks[joint.c], normal);
  const clinical = remapToClinical(raw, joint.type);
  return getSmoothedAngle(joint.id, clinical, confident);
}

// ─── Update focus mode card ───────────────────────────────────────────────────
function updateFocusCard(landmarks, normal) {
  const finger    = FINGERS[selectedFinger];
  const card      = document.getElementById('focus-card');
  const threshold = FINGER_THRESHOLDS[selectedFinger];
  card.classList.add('detected');

  for (const key of ['mcp', 'pip', 'dip']) {
    const joint = finger.joints[key];
    const valEl = document.getElementById(`focus-${key}`);
    const barEl = document.getElementById(`focus-bar-${key}`);
    const rowEl = document.getElementById(`focus-row-${key}`);
    if (!joint) { rowEl.style.display = 'none'; continue; }
    rowEl.style.display = 'flex';
    const smoothed = computeJoint(joint, landmarks, normal, threshold);
    valEl.textContent  = smoothed + '°';
    const pct = Math.min(100, (smoothed / (JOINT_RANGES[key]?.clinicalMax || 1)) * 100);
    barEl.style.width  = pct + '%';
  }
}

// ─── Update all mode cards ────────────────────────────────────────────────────
function updateAllCards(landmarks, normal) {
  for (const [fingerName, finger] of Object.entries(FINGERS)) {
    const card      = document.getElementById(`all-card-${fingerName}`);
    const threshold = FINGER_THRESHOLDS[fingerName];
    card.classList.add('detected');

    for (const key of ['mcp', 'pip', 'dip']) {
      const joint = finger.joints[key];
      if (!joint) continue;
      const valEl = document.getElementById(`all-${fingerName}-${key}`);
      const barEl = document.getElementById(`all-bar-${fingerName}-${key}`);
      if (!valEl || !barEl) continue;
      const smoothed    = computeJoint(joint, landmarks, normal, threshold);
      valEl.textContent = smoothed + '°';
      const pct = Math.min(100, (smoothed / (JOINT_RANGES[key]?.clinicalMax || 1)) * 100);
      barEl.style.width = pct + '%';
    }
  }
}

// ─── Draw landmarks on canvas ─────────────────────────────────────────────────
function drawLandmarksOnCanvas(landmarks) {
  if (viewMode === 'all') {
    // All mode: draw all 21 points and all connectors
    drawConnectors(ctx, landmarks, HAND_CONNECTIONS, {
      color: 'rgba(0, 229, 192, 0.45)',
      lineWidth: 2,
    });
    landmarks.forEach((lm, i) => {
      const x = lm.x * canvas.width;
      const y = lm.y * canvas.height;
      ctx.beginPath();
      ctx.arc(x, y, TIP_INDICES.has(i) ? 7 : 4, 0, Math.PI * 2);
      ctx.fillStyle   = TIP_INDICES.has(i) ? '#00e5c0' : 'rgba(0,229,192,0.7)';
      ctx.shadowBlur  = TIP_INDICES.has(i) ? 14 : 5;
      ctx.shadowColor = '#00e5c0';
      ctx.fill();
      ctx.shadowBlur  = 0;
    });
  } else {
    // Focus mode: draw only the selected finger's landmarks
    const activeLandmarkSet = new Set(FINGER_LANDMARKS[selectedFinger]);
    const filteredLandmarks = landmarks.map((lm, i) =>
      activeLandmarkSet.has(i) ? lm : { x: -1, y: -1, z: 0, visibility: 0 }
    );
    drawConnectors(ctx, filteredLandmarks, HAND_CONNECTIONS, {
      color: 'rgba(0, 229, 192, 0.3)',
      lineWidth: 1,
    });
    FINGER_LANDMARKS[selectedFinger].forEach(i => {
      const lm = landmarks[i];
      const x  = lm.x * canvas.width;
      const y  = lm.y * canvas.height;
      ctx.beginPath();
      ctx.arc(x, y, TIP_INDICES.has(i) ? 7 : 5, 0, Math.PI * 2);
      ctx.fillStyle   = TIP_INDICES.has(i) ? '#00e5c0' : 'rgba(0,229,192,0.6)';
      ctx.shadowBlur  = TIP_INDICES.has(i) ? 14 : 6;
      ctx.shadowColor = '#00e5c0';
      ctx.fill();
      ctx.shadowBlur  = 0;
    });
  }
}

// ─── Update raw landmark debug grid ──────────────────────────────────────────
function updateLandmarkGrid(landmarks) {
  landmarkGrid.innerHTML = '';
  landmarks.forEach((lm, i) => {
    const div = document.createElement('div');
    div.className   = 'landmark-item' + (TIP_INDICES.has(i) ? ' tip' : '');
    div.textContent = `${i} ${LANDMARK_NAMES[i]}: ${lm.x.toFixed(2)}, ${lm.y.toFixed(2)}`;
    landmarkGrid.appendChild(div);
  });
}

// ─── Clear UI when no hands ───────────────────────────────────────────────────
function clearUI() {
  // Focus card
  document.getElementById('focus-card').classList.remove('detected');
  ['mcp', 'pip', 'dip'].forEach(k => {
    const el  = document.getElementById(`focus-${k}`);
    const bar = document.getElementById(`focus-bar-${k}`);
    if (el)  el.textContent = '—';
    if (bar) bar.style.width = '0%';
  });
  // All cards
  for (const fingerName of Object.keys(FINGERS)) {
    const card = document.getElementById(`all-card-${fingerName}`);
    if (card) card.classList.remove('detected');
    for (const key of ['mcp', 'pip', 'dip']) {
      const valEl = document.getElementById(`all-${fingerName}-${key}`);
      const barEl = document.getElementById(`all-bar-${fingerName}-${key}`);
      if (valEl) valEl.textContent = '—';
      if (barEl) barEl.style.width = '0%';
    }
  }
  clearBuffers();
  landmarkGrid.innerHTML = '<div class="landmark-item">Waiting for hand...</div>';
}

// ─── MediaPipe results callback ───────────────────────────────────────────────
function onResults(results) {
  canvas.width  = results.image.width;
  canvas.height = results.image.height;

  ctx.save();
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(results.image, 0, 0, canvas.width, canvas.height);

  const count = results.multiHandLandmarks ? results.multiHandLandmarks.length : 0;
  handCount.textContent = `${count} hand${count !== 1 ? 's' : ''} detected`;

  if (count > 0) {
    setStatus('Hand detected — tracking active', 'active');
    cameraWrap.classList.add('scanning');

    for (const landmarks of results.multiHandLandmarks) {
      const normal = getDorsumNormal(landmarks);

      drawLandmarksOnCanvas(landmarks);

      if (viewMode === 'focus') {
        updateFocusCard(landmarks, normal);
      } else {
        updateAllCards(landmarks, normal);
      }

      updateLandmarkGrid(landmarks);
    }
  } else {
    setStatus('Point camera at your hand', 'idle');
    cameraWrap.classList.remove('scanning');
    clearUI();
  }

  ctx.restore();
}

// ─── Init MediaPipe Hands ─────────────────────────────────────────────────────
async function init() {
  setStatus('Loading MediaPipe...', 'idle');
  overlayMsg.textContent = 'LOADING MEDIAPIPE...';

  const hands = new Hands({
    locateFile: (file) =>
      `https://cdn.jsdelivr.net/npm/@mediapipe/hands/${file}`,
  });

  hands.setOptions({
    maxNumHands: 2,
    modelComplexity: 1,
    minDetectionConfidence: 0.7,
    minTrackingConfidence: 0.5,
  });

  hands.onResults(onResults);
  overlayMsg.textContent = 'REQUESTING CAMERA...';

  try {
    const stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: 'user', width: 640, height: 480 },
    });

    video.srcObject = stream;
    video.onloadedmetadata = () => video.play();

    video.onplaying = () => {
      video.classList.add('ready');
      overlay.classList.add('hidden');
      setStatus('Point camera at your hand', 'idle');
    };

    const camera = new Camera(video, {
      onFrame: async () => { await hands.send({ image: video }); },
      width: 640,
      height: 480,
    });

    camera.start();

  } catch (err) {
    overlay.classList.remove('hidden');
    overlayMsg.textContent = 'CAMERA ACCESS DENIED';
    dot.className = 'dot error';
    setStatus('Camera permission denied — check browser settings', 'error');
    console.error('Camera error:', err);
  }
}

init();