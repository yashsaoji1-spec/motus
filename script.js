const video      = document.getElementById('video');
const canvas     = document.getElementById('canvas');
const ctx        = canvas.getContext('2d');
const overlay    = document.getElementById('overlay');
const overlayMsg = document.getElementById('overlay-msg');
const dot        = document.getElementById('dot');
const statusText = document.getElementById('status-text');
const handCount  = document.getElementById('hand-count');
const cameraWrap = document.getElementById('cameraWrap');
const readoutPanel = document.getElementById('readoutPanel');

// ─── Active joints state ──────────────────────────────────────────────────────
// activeJoints[finger][joint] = true/false
const activeJoints = {
  thumb:  { mcp: true,  pip: true,  dip: false },
  index:  { mcp: true,  pip: true,  dip: true  },
  middle: { mcp: true,  pip: true,  dip: true  },
  ring:   { mcp: true,  pip: true,  dip: true  },
  pinky:  { mcp: true,  pip: true,  dip: true  },
};

// ─── Toggle grid interactions ─────────────────────────────────────────────────
document.querySelectorAll('.grid-cell').forEach(cell => {
  cell.addEventListener('click', () => {
    const finger = cell.dataset.finger;
    const joint  = cell.dataset.joint;
    if (finger === 'thumb' && joint === 'dip') return; // doesn't exist
    activeJoints[finger][joint] = !activeJoints[finger][joint];
    cell.querySelector('.cell-inner').classList.toggle('active', activeJoints[finger][joint]);
    rebuildReadouts();
  });
});

document.getElementById('allBtn').addEventListener('click', () => {
  for (const finger of Object.keys(activeJoints)) {
    for (const joint of Object.keys(activeJoints[finger])) {
      if (finger === 'thumb' && joint === 'dip') continue;
      activeJoints[finger][joint] = true;
    }
  }
  document.querySelectorAll('.cell-inner').forEach(el => {
    const cell   = el.parentElement;
    const finger = cell.dataset.finger;
    const joint  = cell.dataset.joint;
    if (finger === 'thumb' && joint === 'dip') return;
    el.classList.add('active');
  });
  rebuildReadouts();
});

document.getElementById('noneBtn').addEventListener('click', () => {
  for (const finger of Object.keys(activeJoints)) {
    for (const joint of Object.keys(activeJoints[finger])) {
      activeJoints[finger][joint] = false;
    }
  }
  document.querySelectorAll('.cell-inner').forEach(el => el.classList.remove('active'));
  rebuildReadouts();
});

// ─── Readout DOM management ───────────────────────────────────────────────────
const FINGER_FULL = {
  thumb: 'Thumb', index: 'Index', middle: 'Middle', ring: 'Ring', pinky: 'Pinky'
};

const JOINT_MAX = { mcp: 110, pip: 115, dip: 70 };

function rebuildReadouts() {
  readoutPanel.innerHTML = '';
  let count = 0;

  for (const finger of ['thumb', 'index', 'middle', 'ring', 'pinky']) {
  const hasActive = ['mcp','pip','dip'].some(j =>
    activeJoints[finger][j] && !(finger === 'thumb' && j === 'dip') && FINGERS[finger][j]
  );
  if (!hasActive) continue;

  const label = document.createElement('div');
  label.className = 'readout-group-label';
  label.innerHTML = `<strong>${FINGER_FULL[finger]}</strong>`;
  readoutPanel.appendChild(label);

  for (const joint of ['mcp', 'pip', 'dip']) {
      if (!activeJoints[finger][joint]) continue;
      if (finger === 'thumb' && joint === 'dip') continue;

      const row = document.createElement('div');
      row.className = 'readout-row';
      row.id = `readout-${finger}-${joint}`;

      row.innerHTML = `
        <div class="readout-label">
          <span>${FINGER_FULL[finger]} ${joint.toUpperCase()}</span>
          <span class="readout-val" id="rval-${finger}-${joint}">—</span>
        </div>
        <div class="readout-bar-wrap">
          <div class="readout-bar" id="rbar-${finger}-${joint}"></div>
        </div>
      `;
      readoutPanel.appendChild(row);
      count++;
    }
  }

  if (count === 0) {
    readoutPanel.innerHTML = '<div class="readout-empty">No joints selected</div>';
  }
}

// Build initial readouts


// ─── Per-landmark stability tracking ─────────────────────────────────────────
const LANDMARK_PREV = {};

const FINGER_THRESHOLDS = {
  thumb: 0.05, index: 0.05, middle: 0.018, ring: 0.018, pinky: 0.05,
};

function landmarkJumped(index, lm, threshold) {
  const prev = LANDMARK_PREV[index];
  if (!prev) { LANDMARK_PREV[index] = { x: lm.x, y: lm.y }; return false; }
  const dist = Math.sqrt((lm.x-prev.x)**2 + (lm.y-prev.y)**2);
  LANDMARK_PREV[index] = { x: lm.x, y: lm.y };
  return dist > threshold;
}

// ─── Finger joint definitions ─────────────────────────────────────────────────
const FINGERS = {
  thumb:  { mcp: { a:0, b:2,  c:3,  id:'thumb-mcp'  }, pip: { a:2,  b:3,  c:4,  id:'thumb-pip'  }, dip: null },
  index:  { mcp: { a:0, b:5,  c:6,  id:'index-mcp'  }, pip: { a:5,  b:6,  c:7,  id:'index-pip'  }, dip: { a:6,  b:7,  c:8,  id:'index-dip'  } },
  middle: { mcp: { a:0, b:9,  c:10, id:'middle-mcp' }, pip: { a:9,  b:10, c:11, id:'middle-pip' }, dip: { a:10, b:11, c:12, id:'middle-dip' } },
  ring:   { mcp: { a:0, b:13, c:14, id:'ring-mcp'   }, pip: { a:13, b:14, c:15, id:'ring-pip'   }, dip: { a:14, b:15, c:16, id:'ring-dip'   } },
  pinky:  { mcp: { a:0, b:17, c:18, id:'pinky-mcp'  }, pip: { a:17, b:18, c:19, id:'pinky-pip'  }, dip: { a:18, b:19, c:20, id:'pinky-dip'  } },
};

rebuildReadouts();

const FINGER_LANDMARKS = {
  thumb:[0,1,2,3,4], index:[0,5,6,7,8], middle:[0,9,10,11,12], ring:[0,13,14,15,16], pinky:[0,17,18,19,20],
};

const TIP_INDICES = new Set([4, 8, 12, 16, 20]);

// ─── One Euro Filter ──────────────────────────────────────────────────────────
const ONE_EURO_MINCUTOFF = 0.3;
const ONE_EURO_BETA      = 0.1;
const ONE_EURO_DCUTOFF   = 1.0;
const filterStates = {};

function oneEuroFilter(id, rawValue, timestamp) {
  if (!filterStates[id]) {
    filterStates[id] = { prevValue: rawValue, prevDeriv: 0, prevTime: timestamp };
    return rawValue;
  }
  const state = filterStates[id];
  const dt    = timestamp - state.prevTime || 1/60;
  const alpha_d = _alphaFor(ONE_EURO_DCUTOFF, dt);
  const deriv   = alpha_d * ((rawValue - state.prevValue) / dt) + (1 - alpha_d) * state.prevDeriv;
  const cutoff  = ONE_EURO_MINCUTOFF + ONE_EURO_BETA * Math.abs(deriv);
  const alpha   = _alphaFor(cutoff, dt);
  const value   = alpha * rawValue + (1 - alpha) * state.prevValue;
  state.prevValue = value;
  state.prevDeriv = deriv;
  state.prevTime  = timestamp;
  return Math.round(value);
}

function _alphaFor(cutoff, dt) {
  const r = 2 * Math.PI * cutoff * dt;
  return r / (r + 1);
}

function clearBuffers() {
  for (const key of Object.keys(filterStates)) delete filterStates[key];
}

// ─── Angle calculation ────────────────────────────────────────────────────────
function getAngle(a, b, c) {
  const ba = { x: a.x-b.x, y: a.y-b.y, z: (a.z||0)-(b.z||0) };
  const bc = { x: c.x-b.x, y: c.y-b.y, z: (c.z||0)-(b.z||0) };
  const dot   = ba.x*bc.x + ba.y*bc.y + ba.z*bc.z;
  const magBA = Math.sqrt(ba.x**2 + ba.y**2 + ba.z**2);
  const magBC = Math.sqrt(bc.x**2 + bc.y**2 + bc.z**2);
  if (magBA === 0 || magBC === 0) return 0;
  const cos = Math.max(-1, Math.min(1, dot / (magBA * magBC)));
  return Math.round(180 - Math.acos(cos) * (180 / Math.PI));
}

// ─── Status helpers ───────────────────────────────────────────────────────────
function setStatus(msg, state = 'idle') {
  statusText.textContent = msg;
  statusText.className   = state === 'active' ? 'active' : '';
  dot.className = 'dot' + (state === 'active' ? ' active' : state === 'error' ? ' error' : '');
}

// ─── Compute one joint ────────────────────────────────────────────────────────
function computeJoint(joint, landmarks, threshold) {
  const aJ = landmarkJumped(joint.a, landmarks[joint.a], threshold);
  const bJ = landmarkJumped(joint.b, landmarks[joint.b], threshold);
  const cJ = landmarkJumped(joint.c, landmarks[joint.c], threshold);
  if (!aJ && !bJ && !cJ) {
    const raw = getAngle(landmarks[joint.a], landmarks[joint.b], landmarks[joint.c]);
    return oneEuroFilter(joint.id, raw, performance.now() / 1000);
  }
  return filterStates[joint.id]?.prevValue ? Math.round(filterStates[joint.id].prevValue) : 0;
}

// ─── Update readouts ──────────────────────────────────────────────────────────
function updateReadouts(landmarks) {
  for (const finger of Object.keys(FINGERS)) {
    const threshold = FINGER_THRESHOLDS[finger];
    for (const joint of ['mcp', 'pip', 'dip']) {
      if (!activeJoints[finger][joint]) continue;
      const jDef = FINGERS[finger][joint];
      if (!jDef) continue;

      const valEl = document.getElementById(`rval-${finger}-${joint}`);
      const barEl = document.getElementById(`rbar-${finger}-${joint}`);
      if (!valEl || !barEl) continue;

      const smoothed = computeJoint(jDef, landmarks, threshold);
      valEl.textContent = Math.min(smoothed, JOINT_MAX[joint]) + '°';
      barEl.style.width = Math.min(100, (smoothed / JOINT_MAX[joint]) * 100) + '%';
    }
  }
}

// ─── Clear readouts ───────────────────────────────────────────────────────────
function clearReadouts() {
  for (const finger of Object.keys(FINGERS)) {
    for (const joint of ['mcp', 'pip', 'dip']) {
      const valEl = document.getElementById(`rval-${finger}-${joint}`);
      const barEl = document.getElementById(`rbar-${finger}-${joint}`);
      if (valEl) valEl.textContent = '—';
      if (barEl) barEl.style.width = '0%';
    }
  }
  clearBuffers();
}

// ─── Draw landmarks ───────────────────────────────────────────────────────────
function drawLandmarksOnCanvas(landmarks) {
  drawConnectors(ctx, landmarks, HAND_CONNECTIONS, {
    color: 'rgba(0, 229, 192, 0.45)', lineWidth: 2,
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
}

// ─── MediaPipe results callback ───────────────────────────────────────────────
function onResults(results) {
  canvas.width  = results.image.width;
  canvas.height = results.image.height;

  ctx.save();
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(results.image, 0, 0, canvas.width, canvas.height);

  const count = results.multiHandLandmarks ? results.multiHandLandmarks.length : 0;
  handCount.textContent = `${count} hand${count !== 1 ? 's' : ''}`;

  if (count > 0) {
    setStatus('Tracking active', 'active');
    cameraWrap.classList.add('scanning');
    for (const landmarks of results.multiHandLandmarks) {
      drawLandmarksOnCanvas(landmarks);
      updateReadouts(landmarks);
    }
  } else {
    setStatus('Point camera at hand', 'idle');
    cameraWrap.classList.remove('scanning');
    clearReadouts();
  }

  ctx.restore();
}

// ─── Init ─────────────────────────────────────────────────────────────────────
async function init() {
  setStatus('Loading...', 'idle');
  overlayMsg.textContent = 'LOADING MEDIAPIPE...';

  const hands = new Hands({
    locateFile: file => `https://cdn.jsdelivr.net/npm/@mediapipe/hands/${file}`,
  });

  hands.setOptions({
    maxNumHands: 2,
    modelComplexity: 1,
    minDetectionConfidence: 0.85,
    minTrackingConfidence: 0.75,
  });

  hands.onResults(onResults);
  overlayMsg.textContent = 'REQUESTING CAMERA...';

  try {
    const stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: 'user', width: 1280, height: 720 },
    });

    video.srcObject = stream;
    video.onloadedmetadata = () => video.play();
    video.onplaying = () => {
      video.classList.add('ready');
      overlay.classList.add('hidden');
      setStatus('Point camera at hand', 'idle');
    };

    const camera = new Camera(video, {
      onFrame: async () => { await hands.send({ image: video }); },
      width: 1280, height: 720,
    });

    camera.start();

  } catch (err) {
    overlay.classList.remove('hidden');
    overlayMsg.textContent = 'CAMERA ACCESS DENIED';
    dot.className = 'dot error';
    setStatus('Camera denied', 'error');
    console.error(err);
  }
}

init();