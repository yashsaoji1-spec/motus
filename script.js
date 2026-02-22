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

// ─── Finger joint definitions ─────────────────────────────────────────────────
// MCP (α) = Wrist  → MCP → PIP
// PIP (β) = MCP   → PIP → DIP
// DIP (γ) = PIP   → DIP → Tip

const FINGERS = {
  thumb: {
    cardId: 'card-thumb',
    joints: {
      mcp: { a: 0,  b: 2,  c: 3,  id: 'thumb-mcp', type: 'mcp' },
      pip: { a: 2,  b: 3,  c: 4,  id: 'thumb-pip', type: 'pip' },
      dip: null,
    }
  },
  index: {
    cardId: 'card-index',
    joints: {
      mcp: { a: 0,  b: 5,  c: 6,  id: 'index-mcp', type: 'mcp' },
      pip: { a: 5,  b: 6,  c: 7,  id: 'index-pip', type: 'pip' },
      dip: { a: 6,  b: 7,  c: 8,  id: 'index-dip', type: 'dip' },
    }
  },
  middle: {
    cardId: 'card-middle',
    joints: {
      mcp: { a: 0,  b: 9,  c: 10, id: 'middle-mcp', type: 'mcp' },
      pip: { a: 9,  b: 10, c: 11, id: 'middle-pip', type: 'pip' },
      dip: { a: 10, b: 11, c: 12, id: 'middle-dip', type: 'dip' },
    }
  },
  ring: {
    cardId: 'card-ring',
    joints: {
      mcp: { a: 0,  b: 13, c: 14, id: 'ring-mcp', type: 'mcp' },
      pip: { a: 13, b: 14, c: 15, id: 'ring-pip', type: 'pip' },
      dip: { a: 14, b: 15, c: 16, id: 'ring-dip', type: 'dip' },
    }
  },
  pinky: {
    cardId: 'card-pinky',
    joints: {
      mcp: { a: 0,  b: 17, c: 18, id: 'pinky-mcp', type: 'mcp' },
      pip: { a: 17, b: 18, c: 19, id: 'pinky-pip', type: 'pip' },
      dip: { a: 18, b: 19, c: 20, id: 'pinky-dip', type: 'dip' },
    }
  },
};

// ─── Clinical range remapping ─────────────────────────────────────────────────
// Problem: our raw geometric angles underread at full curl compared to what a
// real goniometer would measure. This is because MediaPipe's z-depth is
// estimated rather than true 3D, causing foreshortening at extreme angles.
//
// Solution: linear remap from observed raw range → clinical target range.
//
// Observed at full extension: ~0-5° (good, keep as 0)
// Observed at full curl:
//   MCP: ~105°  →  clinical max: 110°
//   PIP: ~75°   →  clinical max: 115°
//   DIP: ~50°   →  clinical max: 70°
//
// Formula: clinical = (raw / rawMax) * clinicalMax
// Then clamp to [0, clinicalMax] to prevent out-of-range readings.

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
const SMOOTH_FRAMES = 20;
const angleBuffers  = {};

function getSmoothedAngle(id, newAngle) {
  if (!angleBuffers[id]) angleBuffers[id] = [];
  const buf = angleBuffers[id];
  buf.push(newAngle);
  if (buf.length > SMOOTH_FRAMES) buf.shift();
  return Math.round(buf.reduce((sum, v) => sum + v, 0) / buf.length);
}

function clearBuffers() {
  for (const key of Object.keys(angleBuffers)) angleBuffers[key] = [];
}

// ─── Dorsum plane calculation ─────────────────────────────────────────────────
function getDorsumNormal(landmarks) {
  const wrist    = landmarks[0];
  const indexMCP = landmarks[5];
  const pinkyMCP = landmarks[17];

  const e1 = {
    x: indexMCP.x - wrist.x,
    y: indexMCP.y - wrist.y,
    z: (indexMCP.z || 0) - (wrist.z || 0),
  };
  const e2 = {
    x: pinkyMCP.x - wrist.x,
    y: pinkyMCP.y - wrist.y,
    z: (pinkyMCP.z || 0) - (wrist.z || 0),
  };

  const normal = {
    x: e1.y * e2.z - e1.z * e2.y,
    y: e1.z * e2.x - e1.x * e2.z,
    z: e1.x * e2.y - e1.y * e2.x,
  };

  const mag = Math.sqrt(normal.x ** 2 + normal.y ** 2 + normal.z ** 2);
  if (mag === 0) return { x: 0, y: 0, z: 1 };
  return { x: normal.x / mag, y: normal.y / mag, z: normal.z / mag };
}

// ─── Project vector onto dorsum plane ────────────────────────────────────────
function projectOntoPlane(vec, normal) {
  const dot = vec.x * normal.x + vec.y * normal.y + vec.z * normal.z;
  return {
    x: vec.x - dot * normal.x,
    y: vec.y - dot * normal.y,
    z: vec.z - dot * normal.z,
  };
}

// ─── Dorsum-referenced angle (clinical: 0° = straight) ───────────────────────
function getDorsumAngle(a, b, c, normal) {
  const vecBA = { x: a.x - b.x, y: a.y - b.y, z: (a.z||0) - (b.z||0) };
  const vecBC = { x: c.x - b.x, y: c.y - b.y, z: (c.z||0) - (b.z||0) };

  const projBA = projectOntoPlane(vecBA, normal);
  const projBC = projectOntoPlane(vecBC, normal);

  const dot   = projBA.x * projBC.x + projBA.y * projBC.y + projBA.z * projBC.z;
  const magBA = Math.sqrt(projBA.x ** 2 + projBA.y ** 2 + projBA.z ** 2);
  const magBC = Math.sqrt(projBC.x ** 2 + projBC.y ** 2 + projBC.z ** 2);

  if (magBA === 0 || magBC === 0) return 0;

  const cosAngle = Math.max(-1, Math.min(1, dot / (magBA * magBC)));
  const rawDeg   = Math.round(Math.acos(cosAngle) * (180 / Math.PI));
  return 180 - rawDeg;
}

// ─── Status helpers ───────────────────────────────────────────────────────────
function setStatus(msg, state = 'idle') {
  statusText.textContent = msg;
  statusText.className   = state === 'active' ? 'active' : '';
  dot.className = 'dot' + (state === 'active' ? ' active' : state === 'error' ? ' error' : '');
}

// ─── Update all finger cards ──────────────────────────────────────────────────
function updateFingerCards(landmarks, normal) {
  for (const [name, finger] of Object.entries(FINGERS)) {
    const card = document.getElementById(finger.cardId);
    card.classList.add('detected');

    for (const [jointName, joint] of Object.entries(finger.joints)) {
      if (!joint) continue;
      const el       = document.getElementById(joint.id);
      const raw      = getDorsumAngle(landmarks[joint.a], landmarks[joint.b], landmarks[joint.c], normal);
      const clinical = remapToClinical(raw, joint.type);
      const smoothed = getSmoothedAngle(joint.id, clinical);
      el.textContent = smoothed + '°';
    }
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
  for (const finger of Object.values(FINGERS)) {
    const card = document.getElementById(finger.cardId);
    card.classList.remove('detected');
    for (const joint of Object.values(finger.joints)) {
      if (!joint) continue;
      const el = document.getElementById(joint.id);
      if (el) el.textContent = '—';
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
      drawConnectors(ctx, landmarks, HAND_CONNECTIONS, {
        color: 'rgba(0, 229, 192, 0.5)',
        lineWidth: 2,
      });

      drawLandmarks(ctx, landmarks, {
        color: '#00e5c0',
        fillColor: 'rgba(0, 229, 192, 0.3)',
        lineWidth: 1,
        radius: 4,
      });

      TIP_INDICES.forEach(i => {
        const lm = landmarks[i];
        const x  = lm.x * canvas.width;
        const y  = lm.y * canvas.height;
        ctx.beginPath();
        ctx.arc(x, y, 7, 0, Math.PI * 2);
        ctx.fillStyle   = '#00e5c0';
        ctx.shadowBlur  = 12;
        ctx.shadowColor = '#00e5c0';
        ctx.fill();
        ctx.shadowBlur  = 0;
      });

      const normal = getDorsumNormal(landmarks);
      updateFingerCards(landmarks, normal);
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
      onFrame: async () => {
        await hands.send({ image: video });
      },
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