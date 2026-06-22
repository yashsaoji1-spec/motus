// Firestore security-rules tests (run against the emulator).
//   npm run test:rules
// Focused on the consent gate + audit-log integrity rules, plus a few core
// authorization invariants. Uses @firebase/rules-unit-testing.

import { readFileSync } from 'fs';
import {
  initializeTestEnvironment,
  assertFails,
  assertSucceeds,
} from '@firebase/rules-unit-testing';
import {
  setDoc, doc, addDoc, collection, getDoc,
} from 'firebase/firestore';
import { describe, it, beforeAll, afterAll, beforeEach } from 'vitest';

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

// Authenticated client whose token carries the email the rules key off of.
function as(uid, email) {
  return testEnv.authenticatedContext(uid, { email }).firestore();
}

// Seed a doc bypassing rules (for fixtures the rules then evaluate against).
async function seed(path, id, data) {
  await testEnv.withSecurityRulesDisabled(async (ctx) => {
    await setDoc(doc(ctx.firestore(), path, id), data);
  });
}

describe('sessions create — consent gate', () => {
  it('allows a consented patient to create their own session', async () => {
    await seed('users', 'pat@x.com', { role: 'patient', consentGiven: true });
    const db = as('uid-pat', 'pat@x.com');
    await assertSucceeds(addDoc(collection(db, 'sessions'), {
      patientEmail: 'pat@x.com', pain: 3, date: '2026-06-22',
    }));
  });

  it('blocks a patient who has not consented', async () => {
    await seed('users', 'pat@x.com', { role: 'patient' }); // no consentGiven
    const db = as('uid-pat', 'pat@x.com');
    await assertFails(addDoc(collection(db, 'sessions'), {
      patientEmail: 'pat@x.com', pain: 3, date: '2026-06-22',
    }));
  });

  it('blocks a patient creating a session for someone else', async () => {
    await seed('users', 'pat@x.com', { role: 'patient', consentGiven: true });
    const db = as('uid-pat', 'pat@x.com');
    await assertFails(addDoc(collection(db, 'sessions'), {
      patientEmail: 'victim@x.com', pain: 3, date: '2026-06-22',
    }));
  });
});

describe('auditLog — append-only, no forgery', () => {
  it('allows a create with the caller\'s own actorId', async () => {
    await seed('users', 'pat@x.com', { role: 'patient' });
    const db = as('uid-pat', 'pat@x.com');
    await assertSucceeds(addDoc(collection(db, 'auditLog'), {
      actorId: 'uid-pat', action: 'login', resourceId: 'u_abc123',
    }));
  });

  it('blocks a create that forges another actorId', async () => {
    await seed('users', 'pat@x.com', { role: 'patient' });
    const db = as('uid-pat', 'pat@x.com');
    await assertFails(addDoc(collection(db, 'auditLog'), {
      actorId: 'uid-someone-else', action: 'login', resourceId: 'u_abc123',
    }));
  });

  it('blocks reading the audit log from a client', async () => {
    await seed('auditLog', 'entry1', { actorId: 'uid-pat', action: 'login' });
    const db = as('uid-pat', 'pat@x.com');
    await assertFails(getDoc(doc(db, 'auditLog', 'entry1')));
  });
});

describe('users — no self-promotion', () => {
  it('allows a patient to update their own doc keeping role', async () => {
    await seed('users', 'pat@x.com', { role: 'patient', name: 'Old' });
    const db = as('uid-pat', 'pat@x.com');
    await assertSucceeds(setDoc(doc(db, 'users', 'pat@x.com'), {
      role: 'patient', name: 'New',
    }));
  });

  it('blocks a patient escalating their own role to therapist', async () => {
    await seed('users', 'pat@x.com', { role: 'patient' });
    const db = as('uid-pat', 'pat@x.com');
    await assertFails(setDoc(doc(db, 'users', 'pat@x.com'), { role: 'therapist' }));
  });

  it('blocks a patient from reading another patient\'s doc', async () => {
    await seed('users', 'pat@x.com', { role: 'patient' });
    await seed('users', 'other@x.com', { role: 'patient' });
    const db = as('uid-pat', 'pat@x.com');
    await assertFails(getDoc(doc(db, 'users', 'other@x.com')));
  });
});
