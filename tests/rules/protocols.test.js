import { describe, it, beforeAll, afterAll } from 'vitest';
import { makeEnv, assertFails, assertSucceeds } from './helpers.js';
import { doc, getDoc, setDoc } from 'firebase/firestore';

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
    await setDoc(doc(db, 'protocols', 'patient@test.com'), { items: [] });
  });
});

afterAll(async () => {
  await env.cleanup();
});

describe('protocols collection', () => {
  it('patient can read their own protocol', async () => {
    const db = env.authenticatedContext('patient@test.com', { email: 'patient@test.com' }).firestore();
    await assertSucceeds(getDoc(doc(db, 'protocols', 'patient@test.com')));
  });

  it('connected therapist can read patient protocol', async () => {
    const db = env.authenticatedContext('therapist@test.com', { email: 'therapist@test.com' }).firestore();
    await assertSucceeds(getDoc(doc(db, 'protocols', 'patient@test.com')));
  });

  it('connected therapist can write patient protocol', async () => {
    const db = env.authenticatedContext('therapist@test.com', { email: 'therapist@test.com' }).firestore();
    await assertSucceeds(setDoc(doc(db, 'protocols', 'patient@test.com'), { items: [{ id: 1, name: 'Stretch' }] }));
  });

  it('unconnected therapist cannot write patient protocol', async () => {
    const db = env.authenticatedContext('stranger@test.com', { email: 'stranger@test.com' }).firestore();
    await assertFails(setDoc(doc(db, 'protocols', 'patient@test.com'), { items: [] }));
  });

  it('patient cannot read another patient protocol', async () => {
    const db = env.authenticatedContext('other@test.com', { email: 'other@test.com' }).firestore();
    await assertFails(getDoc(doc(db, 'protocols', 'patient@test.com')));
  });
});
