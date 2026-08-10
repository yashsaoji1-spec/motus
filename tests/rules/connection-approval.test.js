// Firestore security-rules tests for the therapist-approval gate (#5).
//   npm run test:rules
// These assert the RULES by attempting each write directly as the real signed-in
// principal — not through the UI. A disabled button is not enforcement.
// Same harness/style as security.test.js.

import { readFileSync } from 'fs';
import {
  initializeTestEnvironment,
  assertFails,
  assertSucceeds,
} from '@firebase/rules-unit-testing';
import {
  setDoc, updateDoc, doc, getDoc, deleteField, arrayRemove, arrayUnion,
} from 'firebase/firestore';
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';

const PATIENT = 'patient@x.com';
const OTHER_PATIENT = 'other@x.com';
const THERAPIST = 'therapist@x.com';
const RIVAL = 'rival@x.com';

let testEnv;

beforeAll(async () => {
  testEnv = await initializeTestEnvironment({
    projectId: 'motus-rules-test',
    firestore: {
      rules: readFileSync('firestore.rules', 'utf8'),
      host: '127.0.0.1',
      port: 8181,
    },
  });
});

afterAll(async () => { await testEnv.cleanup(); });

beforeEach(async () => { await testEnv.clearFirestore(); });

// Role docs the rules' myRole() helper reads. Seeded INSIDE each test, not in
// beforeEach: clearFirestore() returns before the wipe has fully settled, so
// docs written straight after it can be swallowed. Every test that seeded in
// its own body passed while the two that relied on beforeEach failed with
// "Null value error" — get(users/...) returning null. security.test.js already
// seeds per-test for this reason; follow it.
// All four docs in ONE rules-disabled context. Four separate calls meant 72
// contexts across the suite, which is the same churn that made as() flaky.
async function seedUsers() {
  await testEnv.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    await setDoc(doc(db, 'users', PATIENT), { role: 'patient', name: 'James Park', consentGiven: true });
    await setDoc(doc(db, 'users', OTHER_PATIENT), { role: 'patient', name: 'Maria Alvarez', consentGiven: true });
    await setDoc(doc(db, 'users', THERAPIST), { role: 'therapist', name: 'Sarah Chen' });
    await setDoc(doc(db, 'users', RIVAL), { role: 'therapist', name: 'Rival Clinic' });
  });
}

// Each context's Firestore client is built ONCE and reused. Building a fresh
// client per call leaked dozens of them across 18 tests and produced spurious,
// flaky PERMISSION_DENIED / "Null value error" results — the same operations
// pass every time in a small file (see _diagnose.test.js) and intermittently in
// a large one. The rules were never the problem.
const _clients = {};
function as(uid, email) {
  if (!_clients[uid]) _clients[uid] = testEnv.authenticatedContext(uid, { email }).firestore();
  return _clients[uid];
}
const asPatient   = () => as('uid-pat', PATIENT);
const asTherapist = () => as('uid-th', THERAPIST);
const asRival     = () => as('uid-rival', RIVAL);

async function seed(path, id, data) {
  await testEnv.withSecurityRulesDisabled(async (ctx) => {
    await setDoc(doc(ctx.firestore(), path, id), data);
  });
}

const seedRequest = (patient, therapist, status = 'pending') =>
  seed('connectionRequests', patient, {
    patientEmail: patient, patientName: 'X', therapistEmail: therapist,
    status, requestedAt: '2026-08-05T00:00:00.000Z',
  });

const newRequest = (patient, therapist, status = 'pending') => ({
  patientEmail: patient, patientName: 'James Park', therapistEmail: therapist,
  status, requestedAt: '2026-08-05T00:00:00.000Z',
});

describe('a patient cannot join a caseload on their own', () => {
  it('blocks creating connections/{therapist} naming themselves', async () => {
    await seedUsers();
    await assertFails(setDoc(doc(asPatient(), 'connections', THERAPIST), { patients: [PATIENT] }));
  });

  it('blocks appending themselves to an existing caseload', async () => {
    await seedUsers();
    await seed('connections', THERAPIST, { patients: [OTHER_PATIENT] });
    await assertFails(updateDoc(doc(asPatient(), 'connections', THERAPIST), {
      patients: [OTHER_PATIENT, PATIENT],
    }));
  });

  it('blocks setting their own users.therapistEmail', async () => {
    await seedUsers();
    await assertFails(updateDoc(doc(asPatient(), 'users', PATIENT), { therapistEmail: THERAPIST }));
  });

  it('still allows ordinary profile self-updates', async () => {
    await seedUsers();
    await assertSucceeds(updateDoc(doc(asPatient(), 'users', PATIENT), { name: 'James P' }));
  });
});

describe('requests can only ever be filed as pending', () => {
  it('allows a patient to file their own pending request', async () => {
    await seedUsers();
    await assertSucceeds(setDoc(
      doc(asPatient(), 'connectionRequests', PATIENT), newRequest(PATIENT, THERAPIST)));
  });

  it('blocks a request that arrives pre-approved', async () => {
    await seedUsers();
    await assertFails(setDoc(
      doc(asPatient(), 'connectionRequests', PATIENT), newRequest(PATIENT, THERAPIST, 'approved')));
  });

  it('blocks a patient self-approving an existing request', async () => {
    await seedUsers();
    await seedRequest(PATIENT, THERAPIST);
    await assertFails(updateDoc(
      doc(asPatient(), 'connectionRequests', PATIENT), { status: 'approved' }));
  });

  it('blocks filing a request on someone else behalf', async () => {
    await seedUsers();
    await assertFails(setDoc(
      doc(asPatient(), 'connectionRequests', OTHER_PATIENT), newRequest(OTHER_PATIENT, THERAPIST)));
  });

  it('allows re-requesting after a decline', async () => {
    await seedUsers();
    await seedRequest(PATIENT, THERAPIST, 'declined');
    await assertSucceeds(updateDoc(doc(asPatient(), 'connectionRequests', PATIENT), {
      patientEmail: PATIENT, therapistEmail: THERAPIST, status: 'pending',
    }));
  });
});

describe('only the addressed therapist can approve, and only while pending', () => {
  it('blocks attaching a patient who never asked', async () => {
    await seedUsers();
    await assertFails(updateDoc(
      doc(asTherapist(), 'users', PATIENT), { therapistEmail: THERAPIST }));
  });

  it('ALLOWS attaching a patient with a pending request to them', async () => {
    await seedUsers();
    await seedRequest(PATIENT, THERAPIST);
    await assertSucceeds(updateDoc(
      doc(asTherapist(), 'users', PATIENT), { therapistEmail: THERAPIST }));
  });

  it('blocks a rival therapist poaching a request addressed elsewhere', async () => {
    await seedUsers();
    await seedRequest(PATIENT, THERAPIST);
    await assertFails(updateDoc(doc(asRival(), 'users', PATIENT), { therapistEmail: RIVAL }));
  });

  it('blocks attaching once the request is declined', async () => {
    await seedUsers();
    await seedRequest(PATIENT, THERAPIST, 'declined');
    await assertFails(updateDoc(
      doc(asTherapist(), 'users', PATIENT), { therapistEmail: THERAPIST }));
  });

  it('blocks pointing a patient at a different therapist', async () => {
    await seedUsers();
    await seedRequest(PATIENT, THERAPIST);
    await assertFails(updateDoc(doc(asTherapist(), 'users', PATIENT), { therapistEmail: RIVAL }));
  });

  it('blocks smuggling extra fields into the approval write', async () => {
    await seedUsers();
    await seedRequest(PATIENT, THERAPIST);
    await assertFails(updateDoc(doc(asTherapist(), 'users', PATIENT), {
      therapistEmail: THERAPIST, role: 'admin',
    }));
  });

  it('allows the addressed therapist to record a verdict', async () => {
    await seedUsers();
    await seedRequest(PATIENT, THERAPIST);
    await assertSucceeds(updateDoc(doc(asTherapist(), 'connectionRequests', PATIENT), {
      status: 'declined', decidedAt: '2026-08-05T01:00:00.000Z',
    }));
  });

  it('blocks a rival reading or deciding a request addressed elsewhere', async () => {
    await seedUsers();
    await seedRequest(PATIENT, THERAPIST);
    await assertFails(getDoc(doc(asRival(), 'connectionRequests', PATIENT)));
    await assertFails(updateDoc(
      doc(asRival(), 'connectionRequests', PATIENT), { status: 'approved' }));
  });
});

describe('the happy path still works end to end', () => {
  it('request -> approve -> connected', async () => {
    await seedUsers();
    await assertSucceeds(setDoc(
      doc(asPatient(), 'connectionRequests', PATIENT), newRequest(PATIENT, THERAPIST)));
    // Same order the app uses: the gated write first, the verdict last. Flipping
    // the request to approved first would make the rule reject the very write it
    // is meant to authorise.
    await assertSucceeds(updateDoc(
      doc(asTherapist(), 'users', PATIENT), { therapistEmail: THERAPIST }));
    await assertSucceeds(setDoc(
      doc(asTherapist(), 'connections', THERAPIST), { patients: [PATIENT] }));
    await assertSucceeds(updateDoc(doc(asTherapist(), 'connectionRequests', PATIENT), {
      status: 'approved', decidedAt: '2026-08-05T01:00:00.000Z',
    }));

    // withSecurityRulesDisabled does not forward the callback's return value,
    // so capture it out-of-band rather than awaiting the wrapper.
    let after;
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      after = await getDoc(doc(ctx.firestore(), 'users', PATIENT));
    });
    expect(after.data().therapistEmail).toBe(THERAPIST);
  });
});

// Leaving is not joining. The rule barring a patient from touching their own
// therapistEmail was aimed at ATTACHING with a known invite code, but written as
// "must not touch" it also blocked DETACHING — so both Disconnect buttons in the
// patient UI failed every time. These pin the asymmetry: clearing is allowed,
// setting still is not.
describe('a patient can disconnect themselves', () => {
  it('allows clearing their own therapistEmail', async () => {
    await seedUsers();
    await seed('users', PATIENT, {
      role: 'patient', name: 'James Park', consentGiven: true, therapistEmail: THERAPIST,
    });
    await assertSucceeds(updateDoc(doc(asPatient(), 'users', PATIENT), {
      therapistEmail: deleteField(),
    }));
  });

  it('still blocks setting their own therapistEmail', async () => {
    await seedUsers();
    await assertFails(updateDoc(doc(asPatient(), 'users', PATIENT), {
      therapistEmail: THERAPIST,
    }));
  });

  it('still blocks re-pointing an existing therapistEmail at someone else', async () => {
    await seedUsers();
    await seed('users', PATIENT, {
      role: 'patient', name: 'James Park', consentGiven: true, therapistEmail: THERAPIST,
    });
    await assertFails(updateDoc(doc(asPatient(), 'users', PATIENT), {
      therapistEmail: RIVAL,
    }));
  });

  it('allows removing themselves from the caseload', async () => {
    await seedUsers();
    await seed('connections', THERAPIST, { patients: [PATIENT, OTHER_PATIENT] });
    await assertSucceeds(updateDoc(doc(asPatient(), 'connections', THERAPIST), {
      patients: arrayRemove(PATIENT),
    }));
  });

  it('blocks removing a DIFFERENT patient from the caseload', async () => {
    await seedUsers();
    await seed('connections', THERAPIST, { patients: [PATIENT, OTHER_PATIENT] });
    await assertFails(updateDoc(doc(asPatient(), 'connections', THERAPIST), {
      patients: arrayRemove(OTHER_PATIENT),
    }));
  });

  it('blocks adding themselves to a caseload they are not on', async () => {
    await seedUsers();
    await seed('connections', THERAPIST, { patients: [OTHER_PATIENT] });
    await assertFails(updateDoc(doc(asPatient(), 'connections', THERAPIST), {
      patients: arrayUnion(PATIENT),
    }));
  });
});
