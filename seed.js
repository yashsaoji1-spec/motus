// Motus — demo data seeder
// Seeds believable, PHI-free demo data for screenshots and the demo video:
// a connected therapist + patient, an assigned protocol, ~12 sessions over the
// last few weeks with a downward pain trend, and a short message thread.
//
// USAGE:
//   1. Firebase Console → Project Settings → Service accounts → Generate new
//      private key. Save it as serviceAccountKey.json in the repo root.
//   2. PROJECT=motus-prod node seed.js        (or motus-staging1)
//   3. DELETE serviceAccountKey.json afterward — it is a full-admin credential.
//
// Idempotent: re-running overwrites the protocol/connection and appends a fresh
// set of sessions/messages (clear them first in the console if you want a reset).

const admin = require('firebase-admin');
const serviceAccount = require('./serviceAccountKey.json');

const PROJECT = process.env.PROJECT || 'motus-staging1'; // default to staging for safety
if (serviceAccount.project_id !== PROJECT) {
  console.error(`Refusing to run: key is for "${serviceAccount.project_id}" but PROJECT="${PROJECT}". They must match.`);
  process.exit(1);
}

admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
const db = admin.firestore();

// ── Demo identities (match the existing demo auth accounts) ──────────────────
const THERAPIST = { email: 'sarah.chen@mayoclinic.org', name: 'Sarah Chen' };
const PATIENT    = { email: 'james.park@gmail.com',     name: 'James Park' };
const NPP_VERSION = '2026-06-21'; // keep in sync with app.js so the demo patient skips the consent screen

const threadId = (a, b) => [a, b].sort().join(':');
const daysAgo = (n) => { const d = new Date(); d.setDate(d.getDate() - n); return d; };

// Protocol: three believable hand-rehab exercises.
const PROTOCOL_ITEMS = [
  { id: 'seed_grip',  exerciseType: 'grip_squeeze',  exerciseName: 'Grip Squeeze',   reps: 10, sets: 3, frequency: 'daily', restSeconds: 30, notes: 'Squeeze slowly, hold 2s at the top.', assignedBy: THERAPIST.name, assignedAt: daysAgo(28).toISOString() },
  { id: 'seed_flex',  exerciseType: 'finger_flexion', exerciseName: 'Finger Flexion', reps: 12, sets: 3, frequency: 'daily', restSeconds: 30, notes: 'Full range, stop if sharp pain.',     assignedBy: THERAPIST.name, assignedAt: daysAgo(28).toISOString() },
  { id: 'seed_wrist', exerciseType: 'wrist_flexion',  exerciseName: 'Wrist Flexion',  reps: 10, sets: 2, frequency: 'daily', restSeconds: 45, notes: 'Keep forearm supported on the table.', assignedBy: THERAPIST.name, assignedAt: daysAgo(28).toISOString() },
];

// 12 sessions over ~28 days, pain trending 7 → 2 (recovery story for the chart).
function buildSessions() {
  const sessions = [];
  const dayOffsets = [27, 25, 23, 20, 18, 15, 12, 10, 7, 5, 3, 1];
  dayOffsets.forEach((off, i) => {
    const pain = Math.max(2, Math.round(7 - (i / (dayOffsets.length - 1)) * 5)); // 7 down to ~2
    const ex = PROTOCOL_ITEMS[i % PROTOCOL_ITEMS.length];
    const setData = Array.from({ length: ex.sets }, (_, s) => ({ set: s + 1, reps: ex.reps, pain }));
    const totalReps = setData.reduce((sum, s) => sum + s.reps, 0);
    sessions.push({
      patientEmail: PATIENT.email,
      date: daysAgo(off).toISOString(),
      reps: totalReps,
      pain,
      exerciseType: ex.exerciseType,
      protocolId: ex.id,
      therapistEmail: THERAPIST.email,
      setData,
    });
  });
  return sessions;
}

const MESSAGES = [
  { from: THERAPIST.email, to: PATIENT.email, text: 'Hi James — I just assigned your home program. Start with the grip squeezes today.', day: 28 },
  { from: PATIENT.email, to: THERAPIST.email, text: 'Got it, thanks! The first few felt tight but doable.', day: 27 },
  { from: THERAPIST.email, to: PATIENT.email, text: 'That tightness is normal early on. Keep the reps slow and let me know your pain levels.', day: 26 },
  { from: PATIENT.email, to: THERAPIST.email, text: 'Pain is down to about a 3 this week, feeling a lot better.', day: 7 },
  { from: THERAPIST.email, to: PATIENT.email, text: 'Great progress — the trend looks excellent. Let’s add the wrist work going forward.', day: 6 },
];

async function run() {
  console.log(`Seeding demo data into ${PROJECT}...`);

  // User docs (merge so we never clobber other fields).
  await db.collection('users').doc(THERAPIST.email).set(
    { email: THERAPIST.email, name: THERAPIST.name, role: 'therapist' }, { merge: true });
  await db.collection('users').doc(PATIENT.email).set(
    { email: PATIENT.email, name: PATIENT.name, role: 'patient', therapistEmail: THERAPIST.email,
      consentGiven: true, consentTimestamp: daysAgo(28).toISOString(),
      nppAcknowledgedAt: daysAgo(28).toISOString(), nppVersionAccepted: NPP_VERSION,
      tutorialCompleted: true }, { merge: true });

  // Connection.
  await db.collection('connections').doc(THERAPIST.email).set(
    { patients: admin.firestore.FieldValue.arrayUnion(PATIENT.email) }, { merge: true });

  // Protocol.
  await db.collection('protocols').doc(PATIENT.email).set({ items: PROTOCOL_ITEMS });

  // Sessions.
  const sessions = buildSessions();
  for (const s of sessions) await db.collection('sessions').add(s);

  // Thread metadata + messages.
  const tid = threadId(THERAPIST.email, PATIENT.email);
  await db.collection('messageThreads').doc(tid).set(
    { participants: [THERAPIST.email, PATIENT.email], archived: false }, { merge: true });
  for (const m of MESSAGES) {
    await db.collection('messages').add({
      from: m.from, to: m.to, participants: [m.from, m.to], threadId: tid,
      text: m.text, timestamp: daysAgo(m.day).toISOString(), read: true,
    });
  }

  console.log(`Done: 1 protocol (${PROTOCOL_ITEMS.length} exercises), ${sessions.length} sessions, ${MESSAGES.length} messages.`);
  console.log('Remember to DELETE serviceAccountKey.json now.');
  process.exit(0);
}

run().catch((e) => { console.error('Seed failed:', e); process.exit(1); });
