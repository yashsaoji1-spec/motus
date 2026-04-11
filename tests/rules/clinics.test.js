import { describe, it, beforeAll, afterAll } from 'vitest';
import { makeEnv, assertFails, assertSucceeds } from './helpers.js';
import { doc, getDoc, setDoc } from 'firebase/firestore';

let env;

beforeAll(async () => {
  env = await makeEnv();
  await env.withSecurityRulesDisabled(async ctx => {
    const db = ctx.firestore();
    await setDoc(doc(db, 'users', 'owner@test.com'), { name: 'Owner', role: 'therapist' });
    await setDoc(doc(db, 'users', 'member@test.com'), { name: 'Member', role: 'therapist' });
    await setDoc(doc(db, 'users', 'outsider@test.com'), { name: 'Outsider', role: 'therapist' });
    await setDoc(doc(db, 'users', 'patient@test.com'), { name: 'Pat', role: 'patient' });
    await setDoc(doc(db, 'clinics', 'clinic-1'), {
      ownerEmail: 'owner@test.com',
      therapists: ['owner@test.com', 'member@test.com'],
      joinCode: 'ABC123',
      joinCodeEnabled: true,
    });
    await setDoc(doc(db, 'clinicLibrary', 'clinic-1'), { exercises: [] });
  });
});

afterAll(async () => {
  await env.cleanup();
});

describe('clinics collection', () => {
  it('therapist can read a clinic', async () => {
    const db = env.authenticatedContext('member@test.com', { email: 'member@test.com' }).firestore();
    await assertSucceeds(getDoc(doc(db, 'clinics', 'clinic-1')));
  });

  it('patient cannot read a clinic', async () => {
    const db = env.authenticatedContext('patient@test.com', { email: 'patient@test.com' }).firestore();
    await assertFails(getDoc(doc(db, 'clinics', 'clinic-1')));
  });

  it('therapist can create a clinic with themselves as owner', async () => {
    const db = env.authenticatedContext('outsider@test.com', { email: 'outsider@test.com' }).firestore();
    await assertSucceeds(setDoc(doc(db, 'clinics', 'new-clinic'), {
      ownerEmail: 'outsider@test.com',
      therapists: ['outsider@test.com'],
      joinCode: 'XYZ999',
      joinCodeEnabled: true,
    }));
  });

  it('therapist cannot create a clinic with someone else as owner', async () => {
    const db = env.authenticatedContext('outsider@test.com', { email: 'outsider@test.com' }).firestore();
    await assertFails(setDoc(doc(db, 'clinics', 'fake-clinic'), {
      ownerEmail: 'owner@test.com',
      therapists: ['outsider@test.com'],
    }));
  });
});

describe('clinicLibrary collection', () => {
  it('clinic member can read clinic library', async () => {
    const db = env.authenticatedContext('member@test.com', { email: 'member@test.com' }).firestore();
    await assertSucceeds(getDoc(doc(db, 'clinicLibrary', 'clinic-1')));
  });

  it('non-member cannot read clinic library', async () => {
    const db = env.authenticatedContext('outsider@test.com', { email: 'outsider@test.com' }).firestore();
    await assertFails(getDoc(doc(db, 'clinicLibrary', 'clinic-1')));
  });
});
