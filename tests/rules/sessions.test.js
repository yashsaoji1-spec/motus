import { describe, it, beforeAll, afterAll } from 'vitest';
import { makeEnv, assertFails, assertSucceeds } from './helpers.js';
import { doc, getDoc, setDoc, addDoc, collection } from 'firebase/firestore';

let env;

beforeAll(async () => {
  env = await makeEnv();
  await env.withSecurityRulesDisabled(async ctx => {
    const db = ctx.firestore();
    await setDoc(doc(db, 'users', 'patient@test.com'), { name: 'Pat', role: 'patient' });
    await setDoc(doc(db, 'users', 'other@test.com'), { name: 'Other', role: 'patient' });
    await setDoc(doc(db, 'users', 'therapist@test.com'), { name: 'Thera', role: 'therapist' });
    await setDoc(doc(db, 'users', 'stranger@test.com'), { name: 'Stranger', role: 'therapist' });
    await setDoc(doc(db, 'connections', 'therapist@test.com'), { patients: ['patient@test.com'] });
    await setDoc(doc(db, 'sessions', 'existing-session'), {
      patientEmail: 'patient@test.com',
      therapistEmail: 'therapist@test.com',
      date: '2026-04-01',
      reps: 10,
      pain: 3,
    });
  });
});

afterAll(async () => {
  await env.cleanup();
});

describe('sessions collection', () => {
  it('patient can read their own session', async () => {
    const db = env.authenticatedContext('patient@test.com', { email: 'patient@test.com' }).firestore();
    await assertSucceeds(getDoc(doc(db, 'sessions', 'existing-session')));
  });

  it('patient cannot read another patient session', async () => {
    const db = env.authenticatedContext('other@test.com', { email: 'other@test.com' }).firestore();
    await assertFails(getDoc(doc(db, 'sessions', 'existing-session')));
  });

  it('connected therapist can read patient session', async () => {
    const db = env.authenticatedContext('therapist@test.com', { email: 'therapist@test.com' }).firestore();
    await assertSucceeds(getDoc(doc(db, 'sessions', 'existing-session')));
  });

  it('unconnected therapist cannot read patient session', async () => {
    const db = env.authenticatedContext('stranger@test.com', { email: 'stranger@test.com' }).firestore();
    await assertFails(getDoc(doc(db, 'sessions', 'existing-session')));
  });

  it('patient can create a session with their own email', async () => {
    const db = env.authenticatedContext('patient@test.com', { email: 'patient@test.com' }).firestore();
    await assertSucceeds(addDoc(collection(db, 'sessions'), {
      patientEmail: 'patient@test.com',
      date: '2026-04-11',
      reps: 5,
      pain: 2,
    }));
  });

  it('patient cannot create a session with a different email', async () => {
    const db = env.authenticatedContext('patient@test.com', { email: 'patient@test.com' }).firestore();
    await assertFails(addDoc(collection(db, 'sessions'), {
      patientEmail: 'other@test.com',
      date: '2026-04-11',
      reps: 5,
      pain: 2,
    }));
  });
});
