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
  setDoc, updateDoc, doc, getDoc,
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

beforeEach(async () => {
  await testEnv.clearFirestore();
  // Role docs the rules' myRole() helper reads.
  await seed('users', PATIENT, { role: 'patient', name: 'James Park', consentGiven: true });
  await seed('users', OTHER_PATIENT, { role: 'patient', name: 'Maria Alvarez', consentGiven: true });
  await seed('users', THERAPIST, { role: 'therapist', name: 'Sarah Chen' });
  await seed('users', RIVAL, { role: 'therapist', name: 'Rival Clinic' });
});

function as(uid, email) {
  return testEnv.authenticatedContext(uid, { email }).firestore();
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
    await assertFails(setDoc(doc(asPatient(), 'connections', THERAPIST), { patients: [PATIENT] }));
  });

  it('blocks appending themselves to an existing caseload', async () => {
    await seed('connections', THERAPIST, { patients: [OTHER_PATIENT] });
    await assertFails(updateDoc(doc(asPatient(), 'connections', THERAPIST), {
      patients: [OTHER_PATIENT, PATIENT],
    }));
  });

  it('blocks setting their own users.therapistEmail', async () => {
    await assertFails(updateDoc(doc(asPatient(), 'users', PATIENT), { therapistEmail: THERAPIST }));
  });

  it('still allows ordinary profile self-updates', async () => {
    await assertSucceeds(updateDoc(doc(asPatient(), 'users', PATIENT), { name: 'James P' }));
  });
});

describe('requests can only ever be filed as pending', () => {
  it('allows a patient to file their own pending request', async () => {
    await assertSucceeds(setDoc(
      doc(asPatient(), 'connectionRequests', PATIENT), newRequest(PATIENT, THERAPIST)));
  });

  it('blocks a request that arrives pre-approved', async () => {
    await assertFails(setDoc(
      doc(asPatient(), 'connectionRequests', PATIENT), newRequest(PATIENT, THERAPIST, 'approved')));
  });

  it('blocks a patient self-approving an existing request', async () => {
    await seedRequest(PATIENT, THERAPIST);
    await assertFails(updateDoc(
      doc(asPatient(), 'connectionRequests', PATIENT), { status: 'approved' }));
  });

  it('blocks filing a request on someone else behalf', async () => {
    await assertFails(setDoc(
      doc(asPatient(), 'connectionRequests', OTHER_PATIENT), newRequest(OTHER_PATIENT, THERAPIST)));
  });

  it('allows re-requesting after a decline', async () => {
    await seedRequest(PATIENT, THERAPIST, 'declined');
    await assertSucceeds(updateDoc(doc(asPatient(), 'connectionRequests', PATIENT), {
      patientEmail: PATIENT, therapistEmail: THERAPIST, status: 'pending',
    }));
  });
});

describe('only the addressed therapist can approve, and only while pending', () => {
  it('blocks attaching a patient who never asked', async () => {
    await assertFails(updateDoc(
      doc(asTherapist(), 'users', PATIENT), { therapistEmail: THERAPIST }));
  });

  it('ALLOWS attaching a patient with a pending request to them', async () => {
    await seedRequest(PATIENT, THERAPIST);
    await assertSucceeds(updateDoc(
      doc(asTherapist(), 'users', PATIENT), { therapistEmail: THERAPIST }));
  });

  it('blocks a rival therapist poaching a request addressed elsewhere', async () => {
    await seedRequest(PATIENT, THERAPIST);
    await assertFails(updateDoc(doc(asRival(), 'users', PATIENT), { therapistEmail: RIVAL }));
  });

  it('blocks attaching once the request is declined', async () => {
    await seedRequest(PATIENT, THERAPIST, 'declined');
    await assertFails(updateDoc(
      doc(asTherapist(), 'users', PATIENT), { therapistEmail: THERAPIST }));
  });

  it('blocks pointing a patient at a different therapist', async () => {
    await seedRequest(PATIENT, THERAPIST);
    await assertFails(updateDoc(doc(asTherapist(), 'users', PATIENT), { therapistEmail: RIVAL }));
  });

  it('blocks smuggling extra fields into the approval write', async () => {
    await seedRequest(PATIENT, THERAPIST);
    await assertFails(updateDoc(doc(asTherapist(), 'users', PATIENT), {
      therapistEmail: THERAPIST, role: 'admin',
    }));
  });

  it('allows the addressed therapist to record a verdict', async () => {
    await seedRequest(PATIENT, THERAPIST);
    await assertSucceeds(updateDoc(doc(asTherapist(), 'connectionRequests', PATIENT), {
      status: 'declined', decidedAt: '2026-08-05T01:00:00.000Z',
    }));
  });

  it('blocks a rival reading or deciding a request addressed elsewhere', async () => {
    await seedRequest(PATIENT, THERAPIST);
    await assertFails(getDoc(doc(asRival(), 'connectionRequests', PATIENT)));
    await assertFails(updateDoc(
      doc(asRival(), 'connectionRequests', PATIENT), { status: 'approved' }));
  });
});

describe('the happy path still works end to end', () => {
  it('request -> approve -> connected', async () => {
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

    const snap = await testEnv.withSecurityRulesDisabled(async (ctx) =>
      getDoc(doc(ctx.firestore(), 'users', PATIENT)));
    expect(snap.data().therapistEmail).toBe(THERAPIST);
  });
});
