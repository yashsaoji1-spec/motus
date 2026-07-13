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
  setDoc, doc, addDoc, collection, getDoc, getDocs,
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

describe('users — therapist doc privacy', () => {
  it('allows a patient to read their OWN connected therapist\'s doc', async () => {
    await seed('users', 'pat@x.com', { role: 'patient', therapistEmail: 'ther@x.com' });
    await seed('users', 'ther@x.com', { role: 'therapist', name: 'Dr. T' });
    const db = as('uid-pat', 'pat@x.com');
    await assertSucceeds(getDoc(doc(db, 'users', 'ther@x.com')));
  });

  it('blocks a patient reading a therapist they are NOT connected to', async () => {
    await seed('users', 'pat@x.com', { role: 'patient' });
    await seed('users', 'ther@x.com', { role: 'therapist', name: 'Dr. T' });
    const db = as('uid-pat', 'pat@x.com');
    await assertFails(getDoc(doc(db, 'users', 'ther@x.com')));
  });

  it('blocks reading another PATIENT via self-assigned therapistEmail', async () => {
    // therapistEmail is self-writable; pointing it at a non-therapist must not
    // grant read access to that user's doc.
    await seed('users', 'pat@x.com', { role: 'patient', therapistEmail: 'victim@x.com' });
    await seed('users', 'victim@x.com', { role: 'patient', name: 'Victim' });
    const db = as('uid-pat', 'pat@x.com');
    await assertFails(getDoc(doc(db, 'users', 'victim@x.com')));
  });
});

describe('messageThreads + messages — thread integrity', () => {
  it('allows a participant to create the canonical thread doc', async () => {
    await seed('users', 'pat@x.com', { role: 'patient' });
    const db = as('uid-pat', 'pat@x.com');
    await assertSucceeds(setDoc(doc(db, 'messageThreads', 'pat@x.com:ther@x.com'), {
      participants: ['pat@x.com', 'ther@x.com'], archived: true,
    }));
  });

  it('blocks creating a thread doc whose id names two OTHER users', async () => {
    await seed('users', 'evil@x.com', { role: 'patient' });
    const db = as('uid-evil', 'evil@x.com');
    await assertFails(setDoc(doc(db, 'messageThreads', 'pat@x.com:ther@x.com'), {
      participants: ['evil@x.com', 'ther@x.com'], archived: true,
    }));
  });

  it('blocks sending without a threadId (archived-check dodge)', async () => {
    await seed('users', 'pat@x.com', { role: 'patient' });
    const db = as('uid-pat', 'pat@x.com');
    await assertFails(addDoc(collection(db, 'messages'), {
      from: 'pat@x.com', to: 'ther@x.com',
      participants: ['pat@x.com', 'ther@x.com'], text: 'no thread', read: false,
    }));
  });

  it('blocks sending into an archived thread', async () => {
    await seed('users', 'pat@x.com', { role: 'patient' });
    await seed('messageThreads', 'pat@x.com:ther@x.com', {
      participants: ['pat@x.com', 'ther@x.com'], archived: true,
    });
    const db = as('uid-pat', 'pat@x.com');
    await assertFails(addDoc(collection(db, 'messages'), {
      from: 'pat@x.com', to: 'ther@x.com',
      participants: ['pat@x.com', 'ther@x.com'],
      threadId: 'pat@x.com:ther@x.com', text: 'hi', read: false,
    }));
  });
});

describe('connections — roster privacy + self add/remove', () => {
  it('blocks a patient from reading their therapist\'s roster (co-patient PII)', async () => {
    await seed('users', 'pat@x.com', { role: 'patient', therapistEmail: 'ther@x.com' });
    await seed('connections', 'ther@x.com', { patients: ['pat@x.com', 'other@x.com'] });
    const db = as('uid-pat', 'pat@x.com');
    await assertFails(getDoc(doc(db, 'connections', 'ther@x.com')));
  });

  it('allows a patient to append themselves (connect-by-code)', async () => {
    await seed('users', 'pat@x.com', { role: 'patient' });
    await seed('connections', 'ther@x.com', { patients: ['other@x.com'] });
    const db = as('uid-pat', 'pat@x.com');
    await assertSucceeds(setDoc(doc(db, 'connections', 'ther@x.com'), {
      patients: ['other@x.com', 'pat@x.com'],
    }));
  });

  it('allows a patient to remove themselves (patient-initiated disconnect)', async () => {
    await seed('users', 'pat@x.com', { role: 'patient' });
    await seed('connections', 'ther@x.com', { patients: ['other@x.com', 'pat@x.com'] });
    const db = as('uid-pat', 'pat@x.com');
    await assertSucceeds(setDoc(doc(db, 'connections', 'ther@x.com'), {
      patients: ['other@x.com'],
    }));
  });

  it('blocks a patient from removing a different patient', async () => {
    await seed('users', 'pat@x.com', { role: 'patient' });
    await seed('connections', 'ther@x.com', { patients: ['other@x.com', 'pat@x.com'] });
    const db = as('uid-pat', 'pat@x.com');
    await assertFails(setDoc(doc(db, 'connections', 'ther@x.com'), {
      patients: ['pat@x.com'],
    }));
  });

  it('blocks a patient update that injects keys beyond patients', async () => {
    await seed('users', 'pat@x.com', { role: 'patient' });
    await seed('connections', 'ther@x.com', { patients: ['other@x.com'] });
    const db = as('uid-pat', 'pat@x.com');
    await assertFails(setDoc(doc(db, 'connections', 'ther@x.com'), {
      patients: ['other@x.com', 'pat@x.com'], hijacked: true,
    }));
  });
});

describe('messages — sender pinning', () => {
  it('allows sending a message as yourself', async () => {
    await seed('users', 'pat@x.com', { role: 'patient' });
    const db = as('uid-pat', 'pat@x.com');
    await assertSucceeds(addDoc(collection(db, 'messages'), {
      from: 'pat@x.com', to: 'ther@x.com',
      participants: ['pat@x.com', 'ther@x.com'],
      threadId: 'pat@x.com:ther@x.com', text: 'hello', read: false,
    }));
  });

  it('blocks forging a message from the other participant', async () => {
    await seed('users', 'pat@x.com', { role: 'patient' });
    const db = as('uid-pat', 'pat@x.com');
    await assertFails(addDoc(collection(db, 'messages'), {
      from: 'ther@x.com', to: 'pat@x.com',
      participants: ['pat@x.com', 'ther@x.com'],
      threadId: 'pat@x.com:ther@x.com', text: 'forged', read: false,
    }));
  });
});

describe('therapistCodes — shape', () => {
  it('allows a therapist to create their own bare code doc', async () => {
    await seed('users', 'ther@x.com', { role: 'therapist' });
    const db = as('uid-ther', 'ther@x.com');
    await assertSucceeds(setDoc(doc(db, 'therapistCodes', '123456'), {
      email: 'ther@x.com',
    }));
  });

  it('blocks extra keys riding along in the publicly readable code doc', async () => {
    await seed('users', 'ther@x.com', { role: 'therapist' });
    const db = as('uid-ther', 'ther@x.com');
    await assertFails(setDoc(doc(db, 'therapistCodes', '123456'), {
      email: 'ther@x.com', note: 'smuggled',
    }));
  });

  it('allows a patient to GET a code doc by its exact id (connect-by-code)', async () => {
    await seed('users', 'pat@x.com', { role: 'patient' });
    await seed('therapistCodes', '123456', { email: 'ther@x.com' });
    const db = as('uid-pat', 'pat@x.com');
    await assertSucceeds(getDoc(doc(db, 'therapistCodes', '123456')));
  });

  it('blocks a patient from LISTING therapistCodes (email harvesting)', async () => {
    await seed('users', 'pat@x.com', { role: 'patient' });
    await seed('therapistCodes', '123456', { email: 'ther@x.com' });
    const db = as('uid-pat', 'pat@x.com');
    await assertFails(getDocs(collection(db, 'therapistCodes')));
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
