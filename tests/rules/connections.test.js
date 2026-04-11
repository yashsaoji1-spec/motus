import { describe, it, beforeAll, afterAll } from 'vitest';
import { makeEnv, assertFails, assertSucceeds } from './helpers.js';
import { doc, getDoc, setDoc, updateDoc } from 'firebase/firestore';

let env;

beforeAll(async () => {
  env = await makeEnv();
  await env.withSecurityRulesDisabled(async ctx => {
    const db = ctx.firestore();
    await setDoc(doc(db, 'users', 'patient@test.com'), { name: 'Pat', role: 'patient' });
    await setDoc(doc(db, 'users', 'other@test.com'), { name: 'Other', role: 'patient' });
    await setDoc(doc(db, 'users', 'therapist@test.com'), { name: 'Thera', role: 'therapist' });
    await setDoc(doc(db, 'connections', 'therapist@test.com'), { patients: ['patient@test.com'] });
  });
});

afterAll(async () => {
  await env.cleanup();
});

describe('connections collection', () => {
  it('therapist can read their own connections doc', async () => {
    const db = env.authenticatedContext('therapist@test.com', { email: 'therapist@test.com' }).firestore();
    await assertSucceeds(getDoc(doc(db, 'connections', 'therapist@test.com')));
  });

  it('patient in the list can read the connections doc', async () => {
    const db = env.authenticatedContext('patient@test.com', { email: 'patient@test.com' }).firestore();
    await assertSucceeds(getDoc(doc(db, 'connections', 'therapist@test.com')));
  });

  it('patient can append only their own email to patients array', async () => {
    const db = env.authenticatedContext('other@test.com', { email: 'other@test.com' }).firestore();
    await assertSucceeds(updateDoc(doc(db, 'connections', 'therapist@test.com'), {
      patients: ['patient@test.com', 'other@test.com'],
    }));
  });

  it('patient cannot add a different email to patients array', async () => {
    const db = env.authenticatedContext('patient@test.com', { email: 'patient@test.com' }).firestore();
    // Trying to add someone else's email
    await assertFails(updateDoc(doc(db, 'connections', 'therapist@test.com'), {
      patients: ['patient@test.com', 'hacker@test.com'],
    }));
  });

  it('patient cannot remove emails from patients array', async () => {
    const db = env.authenticatedContext('patient@test.com', { email: 'patient@test.com' }).firestore();
    // Removing other@test.com is not allowed — existing patients must be preserved
    await assertFails(updateDoc(doc(db, 'connections', 'therapist@test.com'), {
      patients: ['patient@test.com'],
    }));
  });
});
