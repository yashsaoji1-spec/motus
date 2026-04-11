import { describe, it, beforeAll, afterAll } from 'vitest';
import { makeEnv, assertFails, assertSucceeds } from './helpers.js';
import { doc, getDoc, setDoc } from 'firebase/firestore';

let env;

beforeAll(async () => {
  env = await makeEnv();
  // Seed: create user docs for two patients and one therapist
  await env.withSecurityRulesDisabled(async ctx => {
    const db = ctx.firestore();
    await setDoc(doc(db, 'users', 'patient@test.com'), { name: 'Pat', role: 'patient' });
    await setDoc(doc(db, 'users', 'other@test.com'), { name: 'Other', role: 'patient' });
    await setDoc(doc(db, 'users', 'therapist@test.com'), { name: 'Thera', role: 'therapist' });
  });
});

afterAll(async () => {
  await env.cleanup();
});

describe('users collection', () => {
  it('patient can read their own user doc', async () => {
    const db = env.authenticatedContext('patient@test.com', { email: 'patient@test.com' }).firestore();
    await assertSucceeds(getDoc(doc(db, 'users', 'patient@test.com')));
  });

  it('patient can read another user doc (reads are open to all auth users)', async () => {
    // Rule: allow read: if isAuth() — any authenticated user can read any user doc
    const db = env.authenticatedContext('patient@test.com', { email: 'patient@test.com' }).firestore();
    await assertSucceeds(getDoc(doc(db, 'users', 'other@test.com')));
  });

  it('unauthenticated user cannot read user docs', async () => {
    const db = env.unauthenticatedContext().firestore();
    await assertFails(getDoc(doc(db, 'users', 'patient@test.com')));
  });

  it('patient can write their own user doc', async () => {
    const db = env.authenticatedContext('patient@test.com', { email: 'patient@test.com' }).firestore();
    await assertSucceeds(setDoc(doc(db, 'users', 'patient@test.com'), { name: 'Updated', role: 'patient' }));
  });

  it('patient cannot write another user doc', async () => {
    const db = env.authenticatedContext('patient@test.com', { email: 'patient@test.com' }).firestore();
    await assertFails(setDoc(doc(db, 'users', 'other@test.com'), { name: 'Hacked', role: 'patient' }));
  });
});
