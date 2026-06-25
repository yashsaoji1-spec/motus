import admin from 'firebase-admin';

process.env.FIRESTORE_EMULATOR_HOST ||= '127.0.0.1:8181';
process.env.FIREBASE_AUTH_EMULATOR_HOST ||= '127.0.0.1:9099';
admin.initializeApp({ projectId: 'demo-motus' });
const auth = admin.auth();
const db = admin.firestore();

const PASS = 'Demo1234!';
const personas = [
  { email: 'patient1@demo.test', name: 'Pat One',       role: 'patient' },
  { email: 'patient2@demo.test', name: 'Pat Two',       role: 'patient' },
  { email: 'therapist@demo.test', name: 'Dr. Ther',    role: 'therapist' },
  { email: 'admin@demo.test',    name: 'Adam Admin',    role: 'admin' },
  { email: 'pending@demo.test',  name: 'Penny Pending', role: 'therapist_pending' },
];

async function run() {
  // Guard: never allow destructive reset against a non-local host
  const emulatorHost = process.env.FIRESTORE_EMULATOR_HOST || '';
  if (!emulatorHost.startsWith('127.0.0.1') && !emulatorHost.startsWith('localhost')) {
    throw new Error(`Refusing to run seed against non-local FIRESTORE_EMULATOR_HOST: "${emulatorHost}"`);
  }

  // Clear emulator Firestore so seeding is idempotent (repeatable test runs)
  await fetch('http://127.0.0.1:8181/emulator/v1/projects/demo-motus/databases/(default)/documents', { method: 'DELETE' });

  for (const p of personas) {
    await auth.createUser({ email: p.email, password: PASS }).catch(() => {});
    await db.doc(`users/${p.email}`).set({
      name: p.name, role: p.role, consentGiven: true,
      consentTimestamp: admin.firestore.FieldValue.serverTimestamp(),
      nppAcknowledgedAt: new Date().toISOString(),
      nppVersionAccepted: '2026-06-21',
    });
  }

  // therapist ↔ both patients
  // connections doc (therapist-side list) + therapistEmail on each patient doc (patient-side lookup)
  await db.doc('connections/therapist@demo.test').set({
    patients: ['patient1@demo.test', 'patient2@demo.test'],
  });
  await db.doc('users/patient1@demo.test').update({ therapistEmail: 'therapist@demo.test' });
  await db.doc('users/patient2@demo.test').update({ therapistEmail: 'therapist@demo.test' });

  // patient1: one protocol item → single-protocol home
  await db.doc('protocols/patient1@demo.test').set({
    items: [{ id: 'p1a', exerciseType: 'fistMake', reps: 10, sets: 3,
      frequency: 'daily', assignedBy: 'therapist@demo.test', notes: 'Slow and steady.' }],
    demoWatched: [],
  });
  // patient2: two protocol items → exercisesScreen
  await db.doc('protocols/patient2@demo.test').set({
    items: [
      { id: 'p2a', exerciseType: 'fistMake', reps: 10, sets: 3, frequency: 'daily', assignedBy: 'therapist@demo.test' },
      { id: 'p2b', exerciseType: 'wristFlex', reps: 12, sets: 2, frequency: 'twice daily', assignedBy: 'therapist@demo.test' },
    ],
    demoWatched: [],
  });

  // a couple of sessions so progress + history screens have data
  for (const s of [
    { patientEmail: 'patient1@demo.test', reps: 30, pain: 2, exerciseType: 'fistMake', protocolId: 'p1a' },
    { patientEmail: 'patient2@demo.test', reps: 24, pain: 4, exerciseType: 'wristFlex', protocolId: 'p2a' },
  ]) {
    await db.collection('sessions').add({
      ...s, date: new Date().toISOString(),
      therapistEmail: 'therapist@demo.test',
    });
  }

  // one message thread so messaging renders populated
  await db.collection('messages').add({
    from: 'therapist@demo.test', to: 'patient1@demo.test',
    participants: ['therapist@demo.test', 'patient1@demo.test'],
    text: 'How is the hand feeling today?', read: false,
    timestamp: admin.firestore.FieldValue.serverTimestamp(),
  });

  // therapistLibrary (custom exercise) so My Exercises is non-empty
  await db.doc('therapistLibrary/therapist@demo.test').set({
    customExercises: [], hiddenIds: [], editedBuiltIns: {},
  });

  // clinic doc — fields mirrored exactly from createClinic() in code/app.js (line 1377)
  // also seeds the companion clinicLibrary doc (line 1387) and updates therapist's clinicId
  const clinicRef = db.collection('clinics').doc('clinic-demo');
  await clinicRef.set({
    name: 'Demo Clinic',
    ownerEmail: 'therapist@demo.test',
    therapists: ['therapist@demo.test'],
    joinCode: '123456',
    joinCodeEnabled: true,
    createdAt: new Date().toISOString(),
    baaStatus: 'pending',
  });
  await db.doc('users/therapist@demo.test').update({ clinicId: clinicRef.id });
  await db.doc(`clinicLibrary/${clinicRef.id}`).set({ sharedExercises: [] });

  console.log('Seed complete.');
  process.exit(0);
}
run().catch(e => { console.error(e); process.exit(1); });
