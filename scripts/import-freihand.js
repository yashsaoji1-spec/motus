/**
 * import-freihand.js
 * Imports FreiHAND dataset samples into Firestore as trainingChunks documents.
 *
 * Usage:
 *   node scripts/import-freihand.js <path-to-freihand-dir> <joint-key> <hand>
 *
 * Arguments:
 *   freihand-dir   Path to local FreiHAND dataset root (contains training_xyz.json)
 *   joint-key      e.g. index-pip, middle-mcp, ring-dip
 *   hand           left | right
 *
 * Example:
 *   node scripts/import-freihand.js ~/datasets/FreiHAND index-pip right
 *
 * Requirements:
 *   - Place your Firebase service account key at scripts/serviceAccount.json
 *   - npm install (firebase-admin is already in devDependencies)
 *
 * FreiHAND landmark order (21 joints, same as MediaPipe):
 *   0: Wrist
 *   1-4:   Thumb  (CMC, MCP, IP, TIP)
 *   5-8:   Index  (MCP, PIP, DIP, TIP)
 *   9-12:  Middle (MCP, PIP, DIP, TIP)
 *   13-16: Ring   (MCP, PIP, DIP, TIP)
 *   17-20: Pinky  (MCP, PIP, DIP, TIP)
 */

import admin from 'firebase-admin';
import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

// ── Joint → landmark triplet (prev, joint, next) ────────────────────────────
const JOINT_TRIPLETS = {
  'thumb-cmc':   [0,  1,  2],
  'thumb-mcp':   [1,  2,  3],
  'thumb-ip':    [2,  3,  4],
  'index-mcp':   [0,  5,  6],
  'index-pip':   [5,  6,  7],
  'index-dip':   [6,  7,  8],
  'middle-mcp':  [0,  9, 10],
  'middle-pip':  [9, 10, 11],
  'middle-dip':  [10, 11, 12],
  'ring-mcp':    [0, 13, 14],
  'ring-pip':    [13, 14, 15],
  'ring-dip':    [14, 15, 16],
  'pinky-mcp':   [0, 17, 18],
  'pinky-pip':   [17, 18, 19],
  'pinky-dip':   [18, 19, 20],
};

const CHUNK_SIZE   = 30;
const RECORDED_BY  = 'freihand-import';

// ── Helpers ──────────────────────────────────────────────────────────────────
function angleBetween(a, b, c) {
  // Angle at point b formed by segments b->a and b->c, in degrees (0 = straight)
  const ba = { x: a[0] - b[0], y: a[1] - b[1], z: a[2] - b[2] };
  const bc = { x: c[0] - b[0], y: c[1] - b[1], z: c[2] - b[2] };
  const dot = ba.x * bc.x + ba.y * bc.y + ba.z * bc.z;
  const magBa = Math.sqrt(ba.x ** 2 + ba.y ** 2 + ba.z ** 2);
  const magBc = Math.sqrt(bc.x ** 2 + bc.y ** 2 + bc.z ** 2);
  if (magBa === 0 || magBc === 0) return 0;
  const cosAngle = Math.max(-1, Math.min(1, dot / (magBa * magBc)));
  // Convert: 180 = straight, 0 = fully bent → flip to app convention (0 = straight)
  return 180 - Math.round(Math.acos(cosAngle) * (180 / Math.PI));
}

function xyzToLandmarks(xyz21) {
  // Normalise to [0,1] range matching MediaPipe output structure
  const xs = xyz21.map(p => p[0]);
  const ys = xyz21.map(p => p[1]);
  const zs = xyz21.map(p => p[2]);
  const minX = Math.min(...xs), maxX = Math.max(...xs);
  const minY = Math.min(...ys), maxY = Math.max(...ys);
  const rangeX = maxX - minX || 1;
  const rangeY = maxY - minY || 1;
  return xyz21.map(p => ({
    x: (p[0] - minX) / rangeX,
    y: (p[1] - minY) / rangeY,
    z: p[2],
  }));
}

function histogramBucket(angle) {
  return `b${Math.min(17, Math.floor(angle / 10))}`;
}

// ── Main ─────────────────────────────────────────────────────────────────────
const [,, freihandDir, jointKey, hand] = process.argv;

if (!freihandDir || !jointKey || !hand) {
  console.error('Usage: node scripts/import-freihand.js <freihand-dir> <joint-key> <hand>');
  console.error('Example: node scripts/import-freihand.js ~/datasets/FreiHAND index-pip right');
  process.exit(1);
}

if (!JOINT_TRIPLETS[jointKey]) {
  console.error(`Unknown joint: ${jointKey}. Valid joints: ${Object.keys(JOINT_TRIPLETS).join(', ')}`);
  process.exit(1);
}

if (hand !== 'left' && hand !== 'right') {
  console.error('Hand must be "left" or "right"');
  process.exit(1);
}

const serviceAccountPath = resolve(__dirname, 'serviceAccount.json');
let serviceAccount;
try {
  serviceAccount = JSON.parse(readFileSync(serviceAccountPath, 'utf8'));
} catch {
  console.error(`Service account not found at ${serviceAccountPath}`);
  console.error('Download it from Firebase Console > Project Settings > Service Accounts');
  process.exit(1);
}

admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
const db = admin.firestore();

const xyzPath = resolve(freihandDir, 'training_xyz.json');
let allXyz;
try {
  allXyz = JSON.parse(readFileSync(xyzPath, 'utf8'));
} catch {
  console.error(`Could not read ${xyzPath} — make sure the FreiHAND dataset is at ${freihandDir}`);
  process.exit(1);
}

const [prevIdx, jointIdx, nextIdx] = JOINT_TRIPLETS[jointKey];
const jointHand = `${jointKey}-${hand}`;
const recordingId = Date.now().toString();
const now = new Date().toISOString();

console.log(`Importing FreiHAND samples for ${jointHand} (${allXyz.length} frames available)`);

const samples = allXyz.map(xyz21 => {
  const landmarks = xyzToLandmarks(xyz21);
  const trueAngle = angleBetween(xyz21[prevIdx], xyz21[jointIdx], xyz21[nextIdx]);
  return { landmarks, trueAngle };
});

// Split into chunks of CHUNK_SIZE
const chunks = [];
for (let i = 0; i < samples.length; i += CHUNK_SIZE) {
  chunks.push(samples.slice(i, i + CHUNK_SIZE));
}

console.log(`Writing ${chunks.length} chunks (${samples.length} samples) to Firestore...`);

// Get current chunk count from meta to continue numbering
const metaRef  = db.collection('trainingMeta').doc(jointHand);
const metaSnap = await metaRef.get();
const existingChunks = metaSnap.exists ? (metaSnap.data().chunkCount || 0) : 0;

const histogramIncrements = {};
samples.forEach(s => {
  const b = histogramBucket(s.trueAngle);
  histogramIncrements[b] = (histogramIncrements[b] || 0) + 1;
});

let written = 0;
for (let i = 0; i < chunks.length; i++) {
  const chunk = chunks[i];
  await db.collection('trainingChunks').add({
    joint:      jointHand,
    chunkIndex: existingChunks + i,
    createdAt:  now,
    samples:    chunk.map(s => ({
      landmarks:   s.landmarks,
      trueAngle:   s.trueAngle,
      recordedAt:  now,
      recordedBy:  RECORDED_BY,
      recordingId,
    })),
  });
  written += chunk.length;
  process.stdout.write(`\r  ${written}/${samples.length} samples written`);
}

// Update trainingMeta
const histUpdate = {};
Object.entries(histogramIncrements).forEach(([b, count]) => {
  histUpdate[`histogram.${b}`] = admin.firestore.FieldValue.increment(count);
});

if (metaSnap.exists) {
  await metaRef.update({
    totalSamples: admin.firestore.FieldValue.increment(samples.length),
    chunkCount:   admin.firestore.FieldValue.increment(chunks.length),
    lastUpdated:  now,
    ...histUpdate,
  });
} else {
  const histogram = {};
  for (let b = 0; b <= 17; b++) histogram[`b${b}`] = histogramIncrements[`b${b}`] || 0;
  await metaRef.set({ totalSamples: samples.length, chunkCount: chunks.length, lastUpdated: now, histogram });
}

console.log(`\nDone. ${samples.length} samples imported for ${jointHand}.`);
process.exit(0);
