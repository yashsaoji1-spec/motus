// Motus — demo data seeder (4-patient caseload for the pitch video)
//
// Cast (matches MotusDemoPlaybook):
//   James Park   — HERO. Full 6-week history, pain 7→2, today's plan OPEN (film live). On track.
//   Maria Alvarez— NEEDS REVIEW. Recent session with a high-pain spike + note, unread message.
//   Robert Kim   — STALE. No session in 6 days.
//   Emily Torres — ON TRACK. Steady low pain.
// Maria/Robert/Emily never log in — the seeder writes their profiles so they
// render on Sarah's dashboard.
//
// Auth logins: James (patient@), Sarah (therapist@), and Alex Rivera
// (newpatient@ / demo1234) — Alex is created BY this seeder via admin.auth() to
// test the therapist-approval gate. Two accounts exist for that gate and neither
// is on Sarah's caseload:
//   Nina Okafor  — request already PENDING (tests approve/decline)
//   Alex Rivera  — real login, no request (tests the patient side end to end)
//
// USAGE:
//   1. Firebase Console → Project Settings → Service accounts → Generate new
//      private key. Save it as serviceAccountKey.json in the repo root.
//   2. PROJECT=motus-prod node seed.js            (seed / re-seed)
//      PROJECT=motus-prod node seed.js --reset     (wipe prior seeded data first)
//   3. DELETE serviceAccountKey.json afterward — it is a full-admin credential.
//
// --reset removes all sessions/messages/threads/protocols/connections/user-docs
// created by this seeder (keyed on the therapist), so re-running after a rehearsal
// restores the exact same state — including Maria's unread dot and review flag.

const admin = require('firebase-admin');
const serviceAccount = require('./serviceAccountKey.json');

const PROJECT = process.env.PROJECT || 'motus-staging1'; // default to staging for safety
if (serviceAccount.project_id !== PROJECT) {
  console.error(`Refusing to run: key is for "${serviceAccount.project_id}" but PROJECT="${PROJECT}". They must match.`);
  process.exit(1);
}
const RESET = process.argv.includes('--reset');

admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
const db = admin.firestore();

// ── Identities ───────────────────────────────────────────────────────────────
// Neutral demo domains only. Do NOT use a real clinic's domain (e.g. mayoclinic.org)
// — the demo is shown to prospective partners and implies an affiliation that
// doesn't exist. These demo accounts are deleted before launch (M1 cleanup).
const THERAPIST = { email: 'therapist@gmail.com', name: 'Sarah Chen' };
const JAMES  = { email: 'patient@gmail.com',        name: 'James Park' };   // hero, has a login
const MARIA  = { email: 'maria.alvarez@example.com', name: 'Maria Alvarez' };
const ROBERT = { email: 'robert.kim@example.com',    name: 'Robert Kim' };
const EMILY  = { email: 'emily.torres@example.com',  name: 'Emily Torres' };
const PATIENTS = [JAMES, MARIA, ROBERT, EMILY];

// ── Approval-flow test accounts (D-? 2026-08-09) ─────────────────────────────
// Deliberately NOT in PATIENTS: neither is connected to Sarah, neither appears
// on her caseload, and neither gets protocols. They exist to exercise the
// therapist-approval gate.
//
//   NINA  — request already filed and pending. Sarah sees "Requests to join · 1"
//           the moment she logs in, so approve/decline is testable in one window.
//   ALEX  — a real auth login with NO request at all, so the patient half of the
//           flow can be walked end to end: sign in, enter the code, land in the
//           pending state, and confirm no exercises arrive until approval.
const NINA = { email: 'nina.okafor@example.com', name: 'Nina Okafor' };
const ALEX = { email: 'newpatient@gmail.com', name: 'Alex Rivera', password: 'demo1234' };
const APPROVAL_TEST = [NINA, ALEX];

const NPP_VERSION = '2026-06-21'; // keep in sync with app.js so patients skip the consent screen

const threadId = (a, b) => [a, b].sort().join(':');
const daysAgo = (n) => { const d = new Date(); d.setDate(d.getDate() - n); return d; };

// A low-back program. These ids must exist in PROTOCOL_CATALOG — the hand/finger
// exercises this used to seed were retired on 2026-08-09, and seeding ids that
// are no longer in the catalog would put a demo patient on exercises a therapist
// can't assign or edit. assignedAt is relative to each patient's start.
function protocolItems(startDaysAgo) {
  const at = daysAgo(startDaysAgo).toISOString();
  return [
    { id: 'seed_bridge', exerciseType: 'glute_bridge',  exerciseName: 'Bridge',              reps: 10, sets: 2, frequency: 'daily', restSeconds: 30, notes: 'Lift until the body is in a straight line, then lower.', assignedBy: THERAPIST.name, assignedAt: at },
    { id: 'seed_knee',   exerciseType: 'knee_to_chest', exerciseName: 'Single Knee to Chest', reps: 5,  sets: 2, frequency: 'daily', restSeconds: 30, notes: 'Hold at the top. The other leg stays down.',            assignedBy: THERAPIST.name, assignedAt: at },
    { id: 'seed_cat',    exerciseType: 'cat_cow',       exerciseName: 'Cat and Camel',        reps: 10, sets: 2, frequency: 'daily', restSeconds: 45, notes: 'Move slowly between the two positions.',                 assignedBy: THERAPIST.name, assignedAt: at },
  ];
}

// Build one day's sessions (one per exercise) for a patient at a given day-offset.
function daySessions(patient, off, pain, items, extra = {}) {
  return items.map((ex) => {
    const setData = Array.from({ length: ex.sets }, (_, s) => ({ set: s + 1, reps: ex.reps, pain }));
    const totalReps = setData.reduce((sum, s) => sum + s.reps, 0);
    return {
      patientEmail: patient.email,
      date: daysAgo(off).toISOString(),
      reps: totalReps, pain, exerciseType: ex.exerciseType, protocolId: ex.id,
      therapistEmail: THERAPIST.email, setData, ...extra,
    };
  });
}

// ── Per-patient session builders ─────────────────────────────────────────────
// JAMES: 6 weeks, pain 7→2, today (off=0) unseeded so a live session can be filmed.
function jamesSessions(items) {
  const out = []; const DAYS = 42;
  for (let off = DAYS - 1; off >= 1; off--) {
    const pain = Math.max(2, Math.round(2 + (off / (DAYS - 1)) * 5)); // 7 → 2
    out.push(...daySessions(JAMES, off, pain, items));
  }
  return out;
}
// MARIA: ~3 weeks of low pain (3), then a spike (8) on the most recent session with a
// note. High pain (normalizePain===8) + unreviewed → "Needs review / Reported high pain".
function mariaSessions(items) {
  const out = [];
  for (let off = 21; off >= 3; off -= 2) out.push(...daySessions(MARIA, off, 3, items));
  // the flagged spike: yesterday, first exercise only, stopped early
  out.push(...daySessions(MARIA, 1, 8, [items[0]], {
    notes: 'Sharp pain on rep 6, stopped the set early.',
  }));
  return out;
}
// ROBERT: history that ends 6 days ago → daysSince>=4 → "No session in 6 days" (stale).
function robertSessions(items) {
  const out = [];
  for (let off = 20; off >= 6; off -= 2) out.push(...daySessions(ROBERT, off, 5, items));
  return out;
}
// EMILY: steady, on track, last session yesterday, low pain.
function emilySessions(items) {
  const out = [];
  for (let off = 16; off >= 1; off -= 2) out.push(...daySessions(EMILY, off, 2, items));
  return out;
}

// ── Messages ─────────────────────────────────────────────────────────────────
const JAMES_MESSAGES = [
  { from: THERAPIST.email, to: JAMES.email, text: 'Hi James — I just assigned your home program. Start with the bridges today.', day: 43, read: true },
  { from: JAMES.email, to: THERAPIST.email, text: 'Got it, thanks! The first few felt tight but doable.', day: 42, read: true },
  { from: THERAPIST.email, to: JAMES.email, text: 'That tightness is normal early on. Keep the reps slow and let me know your pain levels.', day: 41, read: true },
  { from: JAMES.email, to: THERAPIST.email, text: 'Pain is down to about a 3 this week, feeling a lot better.', day: 7, read: true },
  { from: THERAPIST.email, to: JAMES.email, text: 'Great progress — the trend looks excellent. Let’s add the cat and camel going forward.', day: 6, read: true },
];
// Maria's unread inbound message — Sarah replies to it in Shot 10.
const MARIA_MESSAGES = [
  { from: THERAPIST.email, to: MARIA.email, text: 'How did the bridges feel this week, Maria?', day: 3, read: true },
  { from: MARIA.email, to: THERAPIST.email, text: 'I had a sharp pain on the sixth rep yesterday and had to stop.', day: 1, read: false },
];

// ── Reset ────────────────────────────────────────────────────────────────────
async function deleteQuery(q, label) {
  const snap = await q.get();
  if (snap.empty) return 0;
  let n = 0;
  for (let i = 0; i < snap.docs.length; i += 400) {
    const batch = db.batch();
    snap.docs.slice(i, i + 400).forEach((d) => batch.delete(d.ref));
    await batch.commit(); n += Math.min(400, snap.docs.length - i);
  }
  console.log(`  reset: deleted ${n} ${label}`);
  return n;
}
async function reset() {
  console.log('Resetting prior seeded data...');
  await deleteQuery(db.collection('sessions').where('therapistEmail', '==', THERAPIST.email), 'sessions');
  // custom exercises the demo therapist created (keeps the exercise library clean)
  await deleteQuery(db.collection('customExercises').where('createdBy', '==', THERAPIST.email), 'custom exercises');
  const threads = [threadId(THERAPIST.email, JAMES.email), threadId(THERAPIST.email, MARIA.email)];
  for (const tid of threads) {
    await deleteQuery(db.collection('messages').where('threadId', '==', tid), `messages (${tid})`);
    await db.collection('messageThreads').doc(tid).delete().catch(() => {});
  }
  for (const p of PATIENTS) {
    await db.collection('protocols').doc(p.email).delete().catch(() => {});
    await db.collection('users').doc(p.email).delete().catch(() => {});
  }
  // Approval-flow accounts. Clear EVERY request addressed to Sarah, not just
  // these two — a re-seed must put the gate back to a known state rather than
  // leave a stale approved/declined verdict from a previous test run.
  await deleteQuery(
    db.collection('connectionRequests').where('therapistEmail', '==', THERAPIST.email),
    'connection requests');
  for (const p of APPROVAL_TEST) {
    await db.collection('users').doc(p.email).delete().catch(() => {});
    await db.collection('protocols').doc(p.email).delete().catch(() => {});
  }
  await db.collection('connections').doc(THERAPIST.email).delete().catch(() => {});
  console.log('Reset complete.\n');
}

// ── Seed ─────────────────────────────────────────────────────────────────────
async function seedPatient(patient, startDaysAgo, sessions) {
  await db.collection('users').doc(patient.email).set({
    email: patient.email, name: patient.name, role: 'patient', therapistEmail: THERAPIST.email,
    consentGiven: true, consentTimestamp: daysAgo(startDaysAgo).toISOString(),
    nppAcknowledgedAt: daysAgo(startDaysAgo).toISOString(), nppVersionAccepted: NPP_VERSION,
    tutorialCompleted: true,
  }, { merge: true });
  await db.collection('protocols').doc(patient.email).set({ items: protocolItems(startDaysAgo) });
  for (const s of sessions) await db.collection('sessions').add(s);
  return sessions.length;
}

// Writes an unconnected patient: a user doc with NO therapistEmail, no protocols,
// and no entry in Sarah's connections. This is the state the approval gate is
// supposed to hold someone in.
async function seedUnconnectedPatient(patient) {
  await db.collection('users').doc(patient.email).set({
    email: patient.email, name: patient.name, role: 'patient',
    consentGiven: true, consentTimestamp: daysAgo(1).toISOString(),
    nppAcknowledgedAt: daysAgo(1).toISOString(), nppVersionAccepted: NPP_VERSION,
    tutorialCompleted: true,
    // Explicitly REMOVE the field rather than just omitting it. merge:true keeps
    // whatever is already there, so re-seeding without --reset after a previous
    // test approval would leave therapistEmail set and the gate would look
    // broken (patient already connected) when it is actually working.
    therapistEmail: admin.firestore.FieldValue.delete(),
  }, { merge: true });
}

// Creates (or repairs) a real Firebase Auth login so the patient side of the
// approval flow can actually be signed into. emailVerified is forced true: the
// app blocks unverified non-demo accounts at login, and a seeded account has no
// inbox to click a link in.
// NON-FATAL by design. admin.auth() needs an OAuth token from accounts.google.com,
// a different host from the Firestore endpoints — so in a network-restricted
// shell this step can fail while every Firestore write above succeeded. Letting
// it throw once left prod fully reset but only half re-seeded. The Firestore
// state is what the demo depends on; a missing login is recoverable by hand.
async function ensureAuthUser(patient) {
  try {
    try {
      const existing = await admin.auth().getUserByEmail(patient.email);
      await admin.auth().updateUser(existing.uid, {
        password: patient.password, emailVerified: true, displayName: patient.name,
      });
      console.log(`  auth: reset password for ${patient.email}`);
    } catch (e) {
      if (e.code !== 'auth/user-not-found') throw e;
      await admin.auth().createUser({
        email: patient.email, password: patient.password,
        emailVerified: true, displayName: patient.name,
      });
      console.log(`  auth: created ${patient.email}`);
    }
    return true;
  } catch (e) {
    console.warn(`\n  WARNING: could not create the auth login for ${patient.email}`);
    console.warn(`  ${e.code || ''} ${e.message}`);
    console.warn('  Firestore data is fine — only the sign-in account is missing, so the');
    console.warn('  patient half of the approval flow cannot be tested until it exists.');
    console.warn('  If this was a network/DNS error, re-run from an unrestricted shell.\n');
    return false;
  }
}

async function seedThread(patient, messages) {
  const tid = threadId(THERAPIST.email, patient.email);
  await db.collection('messageThreads').doc(tid).set(
    { participants: [THERAPIST.email, patient.email], archived: false }, { merge: true });
  for (const m of messages) {
    await db.collection('messages').add({
      from: m.from, to: m.to, participants: [m.from, m.to], threadId: tid,
      text: m.text, timestamp: daysAgo(m.day).toISOString(), read: m.read,
    });
  }
  return messages.length;
}

async function run() {
  if (RESET) await reset();
  console.log(`Seeding demo data into ${PROJECT}...`);

  // Therapist user doc.
  await db.collection('users').doc(THERAPIST.email).set(
    { email: THERAPIST.email, name: THERAPIST.name, role: 'therapist' }, { merge: true });

  // Patients + their sessions.
  const jItems = protocolItems(44), mItems = protocolItems(23), rItems = protocolItems(22), eItems = protocolItems(18);
  let nS = 0;
  nS += await seedPatient(JAMES,  44, jamesSessions(jItems));
  nS += await seedPatient(MARIA,  23, mariaSessions(mItems));
  nS += await seedPatient(ROBERT, 22, robertSessions(rItems));
  nS += await seedPatient(EMILY,  18, emilySessions(eItems));

  // Connection: all four patients under Sarah.
  await db.collection('connections').doc(THERAPIST.email).set(
    { patients: admin.firestore.FieldValue.arrayUnion(...PATIENTS.map((p) => p.email)) }, { merge: true });

  // Threads.
  let nM = 0;
  nM += await seedThread(JAMES, JAMES_MESSAGES);
  nM += await seedThread(MARIA, MARIA_MESSAGES);

  // ── Approval-gate test accounts ────────────────────────────────────────────
  // Written AFTER the connections doc above, and never added to it, so neither
  // of these can leak onto Sarah's caseload.
  await seedUnconnectedPatient(NINA);
  await db.collection('connectionRequests').doc(NINA.email).set({
    patientEmail: NINA.email, patientName: NINA.name, therapistEmail: THERAPIST.email,
    status: 'pending', requestedAt: daysAgo(1).toISOString(),
  });

  await seedUnconnectedPatient(ALEX);
  const alexLoginOk = await ensureAuthUser(ALEX);
  // No connectionRequests doc for Alex on purpose — he files it himself by
  // entering the code, which is the half of the flow that needs a real login.

  // Verify against the artifact, not this script's own optimism: re-read what
  // actually landed. A patient who is silently connected would make the gate
  // look broken (or look like it passed when it didn't).
  const connDoc = await db.collection('connections').doc(THERAPIST.email).get();
  const caseload = connDoc.exists ? (connDoc.data().patients || []) : [];
  const checks = [];
  for (const p of APPROVAL_TEST) {
    const u = await db.collection('users').doc(p.email).get();
    const r = await db.collection('connectionRequests').doc(p.email).get();
    checks.push({
      patient: p.email,
      userDoc: u.exists,
      therapistEmail: u.exists ? (u.data().therapistEmail || 'none') : 'n/a',
      request: r.exists ? r.data().status : 'none',
      onSarahsCaseload: caseload.includes(p.email),
    });
  }
  console.table(checks);
  const leaked = checks.filter((c) => c.onSarahsCaseload || c.therapistEmail !== 'none');
  if (leaked.length) {
    console.error('FAIL: an approval-test patient is already connected — the gate cannot be tested.');
    process.exit(1);
  }

  console.log(`Done: ${PATIENTS.length} patients, ${nS} sessions, ${nM} messages.`);
  console.log('Dashboard should show: Maria in "Needs review", Robert "No session in 6 days", James + Emily "On track".');
  console.log('');
  console.log('Approval gate test accounts:');
  console.log(`  Nina Okafor  — request PENDING. Sarah should see "Requests to join · 1" on login.`);
  if (alexLoginOk) {
    console.log(`  Alex Rivera  — log in as ${ALEX.email} / ${ALEX.password}, enter Sarah's`);
    console.log(`                 invite code, and confirm you land in "Request sent" with no exercises.`);
  } else {
    console.log(`  Alex Rivera  — Firestore profile written, but the LOGIN WAS NOT CREATED (see`);
    console.log(`                 the warning above). Re-run from an unrestricted shell, or add`);
    console.log(`                 ${ALEX.email} manually in Firebase Console > Authentication.`);
  }
  console.log('');
  console.log('Remember to DELETE serviceAccountKey.json now.');
  process.exit(0);
}

run().catch((e) => { console.error('Seed failed:', e); process.exit(1); });
