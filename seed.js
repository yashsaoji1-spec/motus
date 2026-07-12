// Motus — demo data seeder
// Seeds believable, PHI-free demo data for screenshots and the demo video:
// one therapist with a four-patient caseload (one "needs review", one going
// stale, two on track), assigned protocols, weeks of session history with
// distinct pain trends, clinical notes, and message threads (one unread).
//
// Only James Park needs a real Firebase Auth account (he's the patient we log
// in as on the phone). The other three patients are display-only rows on the
// therapist dashboard and are rendered purely from Firestore.
//
// USAGE:
//   1. Firebase Console → Project Settings → Service accounts → Generate new
//      private key. Save it as serviceAccountKey.json in the repo root.
//   2. PROJECT=motus-prod node seed.js        (or motus-staging1)
//   3. DELETE serviceAccountKey.json afterward — it is a full-admin credential.
//
// Idempotent: safe to re-run. Existing demo sessions/messages/notes for these
// demo emails are deleted first, so every run produces the exact same state.

// Modular imports: the old `admin.credential.cert(...)` namespace API was
// removed in firebase-admin v14; these subpaths work on every version >= v10.
const { initializeApp, cert } = require('firebase-admin/app');
const { getFirestore, FieldValue } = require('firebase-admin/firestore');
const serviceAccount = require('./serviceAccountKey.json');

const PROJECT = process.env.PROJECT || 'motus-staging1'; // default to staging for safety
if (serviceAccount.project_id !== PROJECT) {
  console.error(`Refusing to run: key is for "${serviceAccount.project_id}" but PROJECT="${PROJECT}". They must match.`);
  process.exit(1);
}

initializeApp({ credential: cert(serviceAccount) });
const db = getFirestore();

const NPP_VERSION = '2026-06-21'; // keep in sync with app.js so the demo patient skips the consent screen

const THERAPIST = { email: 'sarah.chen@mayoclinic.org', name: 'Sarah Chen' };

const threadId = (a, b) => [a, b].sort().join(':');
const daysAgo = (n, hour = 9) => { const d = new Date(); d.setDate(d.getDate() - n); d.setHours(hour, 15, 0, 0); return d; };

// A protocol item assigned `assignedDaysAgo` days ago. `type` must be a
// built-in exerciseType id from app.js (exerciseLabels).
const proto = (id, type, name, reps, sets, notes, assignedDaysAgo) => ({
  id, exerciseType: type, exerciseName: name, reps, sets,
  frequency: 'daily', restSeconds: 30, notes,
  assignedBy: THERAPIST.name, assignedAt: daysAgo(assignedDaysAgo).toISOString(),
});

// ── The caseload ──────────────────────────────────────────────────────────────
// Each patient tells one story on the dashboard:
//   James  — the hero patient (has an auth account; we log in as him on the
//            phone). 3-exercise program, daily sessions, pain trending 6 → 2.
//            Status: "On track". Has clinical notes + a full message thread.
//   Maria  — "Needs review": yesterday's session averaged pain 7 ("a lot"),
//            unreviewed, plus an unread message about it. This is the patient
//            the therapist clicks Review on during the demo.
//   Robert — going stale: last session 6 days ago, so his row reads
//            "No session in 6 days". Shows the dashboard surfaces drop-off.
//   Emily  — recently onboarded and doing great: 12 days of sessions, low
//            pain, high adherence. Fills out the "All patients" group.
const PATIENTS = [
  {
    email: 'james.park@gmail.com', name: 'James Park',
    demographics: { ageRange: '35-44', injuryArea: 'hand-wrist', rehabDuration: '1-3mo' },
    hasAuthAccount: true,
    protocol: [
      proto('seed_grip',  'grip_squeeze',   'Grip Squeeze',   10, 3, 'Squeeze slowly, hold 2s at the top.', 28),
      proto('seed_flex',  'finger_flexion', 'Finger Flexion', 12, 3, 'Full range, stop if sharp pain.', 28),
      proto('seed_wrist', 'wrist_flexion',  'Wrist Flexion',  10, 2, 'Keep forearm supported on the table.', 28),
    ],
    // Daily coverage for the last 10 days incl. today keeps the adherence
    // widget healthy regardless of which day the demo is recorded. Oldest
    // pain caps at 6: 7+ would normalize to the "a lot" bucket and drag James
    // into the Needs-review group, which is Maria's role in this demo.
    sessions: dailySessions({ days: 10, painFrom: 6, painTo: 2 }),
    clinicalNotes:
      '<p><strong>Dx:</strong> R wrist fracture, post-cast (6 wk immobilization). Referred for grip and ROM restoration.</p>' +
      '<p><strong>Plan:</strong> Daily home program — grip squeeze, finger flexion, wrist flexion. Progress resistance once pain stays under 3 for a full week.</p>' +
      '<ul><li>Wk 1: guarded, pain 6-7 during grip work</li>' +
      '<li>Wk 2: ROM clearly improved, pain trending down</li>' +
      '<li>Next visit: reassess grip strength, consider adding wrist extension</li></ul>',
    messages: [
      { from: 'therapist', text: 'Hi James — I just assigned your home program. Start with the grip squeezes today.', day: 28 },
      { from: 'patient',   text: 'Got it, thanks! The first few felt tight but doable.', day: 27 },
      { from: 'therapist', text: 'That tightness is normal early on. Keep the reps slow and let me know your pain levels.', day: 26 },
      { from: 'patient',   text: 'Pain is down to about a 3 this week, feeling a lot better.', day: 7 },
      { from: 'therapist', text: 'Great progress — the trend looks excellent. Let’s add the wrist work going forward.', day: 6 },
    ],
  },
  {
    email: 'maria.alvarez.demo@gmail.com', name: 'Maria Alvarez',
    demographics: { ageRange: '55-64', injuryArea: 'hand-wrist', rehabDuration: '3-6mo' },
    protocol: [
      proto('seed_ext',   'finger_extension', 'Finger Extension', 10, 3, 'Straighten fully, no forcing past resistance.', 21),
      proto('seed_pip',   'pip_blocking',     'PIP Blocking',     10, 3, 'Stabilize the base knuckle with the other hand.', 21),
    ],
    // Was improving, then spiked: yesterday's session averages pain 7 ("a
    // lot"), unreviewed → she lands in the "Needs review" group with a
    // Review button. The set note explains what happened.
    sessions: [
      ...dailySessions({ days: 8, painFrom: 6, painTo: 4, endOffset: 2, exercises: ['seed_ext', 'seed_pip'] }),
      session('seed_pip', 1, [
        { set: 1, reps: 10, pain: 6 },
        { set: 2, reps: 10, pain: 7 },
        { set: 3, reps: 6,  pain: 8, notes: 'Sharp pain on rep 6, stopped the set early.' },
      ]),
    ],
    clinicalNotes:
      '<p><strong>Dx:</strong> Trigger finger (R middle), s/p injection. Extension lag improving.</p>' +
      '<p>Watch for pain spikes during blocking work — she tends to push through instead of stopping.</p>',
    messages: [
      { from: 'therapist', text: 'How did the blocking exercises feel this week?', day: 3 },
      { from: 'patient',   text: 'Mostly fine, but I felt a sharp pain in my middle finger during yesterday’s session and stopped early.', day: 1, unread: true },
    ],
  },
  {
    email: 'robert.kim.demo@gmail.com', name: 'Robert Kim',
    demographics: { ageRange: '65+', injuryArea: 'hand-wrist', rehabDuration: '6-12mo' },
    protocol: [
      proto('seed_grip2', 'grip_squeeze',  'Grip Squeeze',  8, 2, 'Light squeeze only, arthritis-friendly pace.', 40),
      proto('seed_abd',   'finger_abduction', 'Finger Abduction', 12, 2, 'Spread gently, hold 1s.', 40),
    ],
    // Last session 6 days ago → row reads "No session in 6 days" (stale).
    sessions: dailySessions({ days: 8, painFrom: 5, painTo: 4, endOffset: 6, exercises: ['seed_grip2', 'seed_abd'] }),
    messages: [
      { from: 'therapist', text: 'Robert, I noticed you haven’t logged a session this week. Everything okay?', day: 2 },
    ],
  },
  {
    email: 'emily.torres.demo@gmail.com', name: 'Emily Torres',
    demographics: { ageRange: '25-34', injuryArea: 'hand-wrist', rehabDuration: '<1mo' },
    protocol: [
      proto('seed_opp',    'thumb_index_opposition', 'Thumb to Index Opposition', 12, 3, 'Make a round O shape, don’t collapse the thumb.', 12),
      proto('seed_flex2',  'finger_flexion',         'Finger Flexion',            12, 3, '', 12),
    ],
    // New patient crushing it: 12 straight days, pain already low.
    sessions: dailySessions({ days: 12, painFrom: 4, painTo: 1, exercises: ['seed_opp', 'seed_flex2'] }),
    messages: [
      { from: 'patient',   text: 'Two weeks in and typing barely hurts anymore. This is working!', day: 4 },
      { from: 'therapist', text: 'Fantastic — keep that daily streak going and we’ll retest your pinch strength next visit.', day: 4 },
    ],
  },
];

// ── Session builders ──────────────────────────────────────────────────────────

// One session doc for `protocolId` on `dayOffset` days ago with explicit sets.
function session(protocolId, dayOffset, setData) {
  return { protocolId, dayOffset, setData };
}

// Daily sessions covering [endOffset .. endOffset+days-1] days ago, pain
// interpolating painFrom (oldest) → painTo (newest). `exercises` limits which
// protocol items get sessions (default: all of the patient's items).
function dailySessions({ days, painFrom, painTo, endOffset = 0, exercises = null }) {
  const out = [];
  for (let i = 0; i < days; i++) {
    const off = endOffset + i; // i=0 is the most recent day
    const pain = Math.round(painTo + (i / Math.max(1, days - 1)) * (painFrom - painTo));
    out.push({ dayOffset: off, painForAll: pain, exercises });
  }
  return out;
}

// Expand the compact session specs above into Firestore docs.
function buildSessionDocs(patient) {
  const docs = [];
  for (const spec of patient.sessions) {
    const items = spec.protocolId
      ? patient.protocol.filter(p => p.id === spec.protocolId)
      : patient.protocol.filter(p => !spec.exercises || spec.exercises.includes(p.id));
    for (const ex of items) {
      const setData = spec.setData ||
        Array.from({ length: ex.sets }, (_, s) => ({ set: s + 1, reps: ex.reps, pain: spec.painForAll }));
      const totalReps = setData.reduce((sum, s) => sum + s.reps, 0);
      const avgPain = setData.reduce((sum, s) => sum + s.pain, 0) / setData.length;
      docs.push({
        patientEmail: patient.email,
        date: daysAgo(spec.dayOffset, 9 + docs.length % 3).toISOString(),
        reps: totalReps,
        pain: Math.round(avgPain),
        exerciseType: ex.exerciseType,
        protocolId: ex.id,
        therapistEmail: THERAPIST.email,
        setData,
      });
    }
  }
  return docs;
}

// ── Cleanup: remove prior seeded state so re-runs are exact resets ────────────
async function deleteWhere(coll, field, value) {
  const snap = await db.collection(coll).where(field, '==', value).get();
  let n = 0;
  for (let i = 0; i < snap.docs.length; i += 400) {
    const batch = db.batch();
    snap.docs.slice(i, i + 400).forEach(d => { batch.delete(d.ref); n++; });
    await batch.commit();
  }
  return n;
}

async function cleanup() {
  for (const p of PATIENTS) {
    const nSess = await deleteWhere('sessions', 'patientEmail', p.email);
    const nMsg = await deleteWhere('messages', 'threadId', threadId(THERAPIST.email, p.email));
    if (nSess || nMsg) console.log(`  cleaned ${p.name}: ${nSess} sessions, ${nMsg} messages`);
  }
}

// ── Seed ──────────────────────────────────────────────────────────────────────
async function run() {
  console.log(`Seeding demo data into ${PROJECT}...`);
  await cleanup();

  // Therapist user doc (merge so we never clobber other fields).
  await db.collection('users').doc(THERAPIST.email).set(
    { email: THERAPIST.email, name: THERAPIST.name, role: 'therapist' }, { merge: true });

  let totals = { sessions: 0, messages: 0 };
  for (const p of PATIENTS) {
    // User doc — consent pre-accepted so the login-able patient skips straight
    // to the home screen on camera.
    await db.collection('users').doc(p.email).set({
      email: p.email, name: p.name, role: 'patient', therapistEmail: THERAPIST.email,
      consentGiven: true, consentTimestamp: daysAgo(30).toISOString(),
      nppAcknowledgedAt: daysAgo(30).toISOString(), nppVersionAccepted: NPP_VERSION,
      tutorialCompleted: true,
      ...p.demographics,
    }, { merge: true });

    // Connection.
    await db.collection('connections').doc(THERAPIST.email).set(
      { patients: FieldValue.arrayUnion(p.email) }, { merge: true });

    // Protocol (full overwrite — the seed owns this doc).
    await db.collection('protocols').doc(p.email).set({ items: p.protocol });

    // Sessions.
    const sessionDocs = buildSessionDocs(p);
    for (const s of sessionDocs) await db.collection('sessions').add(s);
    totals.sessions += sessionDocs.length;
    p._sessionCount = sessionDocs.length;

    // Clinical notes.
    if (p.clinicalNotes) {
      await db.collection('clinicalNotes').doc(p.email).set({
        html: p.clinicalNotes, updatedBy: THERAPIST.email,
        updatedAt: FieldValue.serverTimestamp(),
      });
    }

    // Thread metadata + messages. Maria's latest message stays unread so the
    // dashboard shows an unread dot and the Messages inbox has a live badge.
    if (p.messages?.length) {
      const tid = threadId(THERAPIST.email, p.email);
      await db.collection('messageThreads').doc(tid).set(
        { participants: [THERAPIST.email, p.email], archived: false }, { merge: true });
      for (const m of p.messages) {
        const from = m.from === 'therapist' ? THERAPIST.email : p.email;
        const to = m.from === 'therapist' ? p.email : THERAPIST.email;
        await db.collection('messages').add({
          from, to, participants: [from, to], threadId: tid,
          text: m.text, timestamp: daysAgo(m.day, 14).toISOString(), read: !m.unread,
        });
        totals.messages++;
      }
    }

    console.log(`  seeded ${p.name}: ${p.protocol.length} exercises, ${p._sessionCount} sessions${p.clinicalNotes ? ', notes' : ''}${p.messages?.length ? `, ${p.messages.length} messages` : ''}`);
  }

  console.log(`Done: ${PATIENTS.length} patients, ${totals.sessions} sessions, ${totals.messages} messages.`);
  console.log('Auth reminder: only james.park@gmail.com needs a real Auth account (plus the therapist).');
  console.log('Remember to DELETE serviceAccountKey.json now.');
  process.exit(0);
}

run().catch((e) => { console.error('Seed failed:', e); process.exit(1); });
