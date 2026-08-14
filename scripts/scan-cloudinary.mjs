// Read-only: find any Firestore document still pointing at a Cloudinary URL.
//
// Cloudinary was removed 2026-08-02 and uploads go to Firebase Storage now, but
// documents written BEFORE that may still reference cloudinary.com. If that
// account is closed or restricted, those specific videos stop loading. This
// answers whether anything would actually break.
//
//   node scripts/scan-cloudinary.mjs
//
// Needs serviceAccountKey.json in the repo root (gitignored). Delete it after.

import admin from 'firebase-admin';
import { readFileSync } from 'node:fs';

const sa = JSON.parse(readFileSync(new URL('../serviceAccountKey.json', import.meta.url), 'utf8'));
admin.initializeApp({ credential: admin.credential.cert(sa), projectId: 'motus-prod' });
const db = admin.firestore();

const hits = [];
// Walk any nested shape rather than checking known field names — the point is
// to find references we did NOT anticipate.
function walk(value, path, docLabel) {
  if (typeof value === 'string') {
    if (value.includes('cloudinary.com')) hits.push({ docLabel, path, value });
    return;
  }
  if (Array.isArray(value)) return value.forEach((v, i) => walk(v, `${path}[${i}]`, docLabel));
  if (value && typeof value === 'object') {
    for (const [k, v] of Object.entries(value)) walk(v, path ? `${path}.${k}` : k, docLabel);
  }
}

const COLLECTIONS = ['sessions', 'protocols', 'therapistLibrary', 'users', 'messages', 'clinicLibrary', 'customExercises'];
for (const col of COLLECTIONS) {
  let snap;
  try { snap = await db.collection(col).get(); }
  catch (e) { console.log(`${col}: could not read (${e.code || e.message})`); continue; }
  const before = hits.length;
  snap.forEach(d => walk(d.data(), '', `${col}/${d.id}`));
  console.log(`${col.padEnd(18)} ${String(snap.size).padStart(4)} docs   ${hits.length - before} cloudinary refs`);
}

console.log(`\n=== ${hits.length} total reference(s) ===`);
for (const h of hits) {
  console.log(` ${h.docLabel}`);
  console.log(`   ${h.path} = ${h.value.slice(0, 110)}`);
}
if (!hits.length) {
  console.log(' Nothing references Cloudinary. Deleting that account breaks nothing.');
}
process.exit(0);
