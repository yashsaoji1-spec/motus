// Motus Cloud Functions
// - deleteMyAccount: callable. Full server-side cascade delete of a user's data
//   across Firestore + Storage, then deletes the auth user. Excludes auditLog
//   (HIPAA §164.312(b) retention).
// - expireVideos: scheduled. Deletes session videos older than the retention
//   window from Storage and clears their references in Firestore.
//
// Data model (keys): users/{email}, protocols/{patientEmail}, calibration/{patientEmail},
// clinicalNotes/{patientEmail}, jointTracking/{patientEmail}, connections/{therapistEmail}={patients:[]},
// sessions (patientEmail field, setData[].videoStoragePath, videoStoragePath, date),
// messages/messageThreads (participants[] + to/from), therapistLibrary/{therapistEmail},
// therapistCodes (email field), customExercises (createdBy field), clinics (ownerEmail/therapists[]),
// clinicInvites (invitedBy/inviteeEmail), clinicLibrary/{clinicId}.

const { onCall, HttpsError } = require('firebase-functions/v2/https');
const { onSchedule } = require('firebase-functions/v2/scheduler');
const { setGlobalOptions } = require('firebase-functions/v2');
const admin = require('firebase-admin');

admin.initializeApp();
setGlobalOptions({ region: 'us-central1', maxInstances: 10 });

const db = admin.firestore();
const bucket = admin.storage().bucket();
const FieldValue = admin.firestore.FieldValue;

const SESSION_RETENTION_DAYS = 30;

// ── helpers ──────────────────────────────────────────────────────────────────
async function deleteDocs(refs) {
  let batch = db.batch(), n = 0, total = 0;
  for (const ref of refs) {
    batch.delete(ref); n++; total++;
    if (n === 450) { await batch.commit(); batch = db.batch(); n = 0; }
  }
  if (n > 0) await batch.commit();
  return total;
}

async function deleteByQuery(query) {
  const snap = await query.get();
  return snap.empty ? 0 : deleteDocs(snap.docs.map((d) => d.ref));
}

async function deleteMessagesAndThreads(email) {
  // Current docs carry a participants[] array; older/demo docs may use to/from.
  await deleteByQuery(db.collection('messages').where('participants', 'array-contains', email));
  await deleteByQuery(db.collection('messages').where('to', '==', email));
  await deleteByQuery(db.collection('messages').where('from', '==', email));
  await deleteByQuery(db.collection('messageThreads').where('participants', 'array-contains', email));
}

async function deleteStoragePrefix(prefix) {
  try { await bucket.deleteFiles({ prefix }); }
  catch (e) { console.warn(`[delete] storage prefix ${prefix}:`, e.message); }
}

// ── patient cascade ──────────────────────────────────────────────────────────
async function deletePatient(email, userData) {
  // Detach from the connected therapist's list first.
  const therapistEmail = userData && userData.therapistEmail;
  if (therapistEmail) {
    try {
      await db.collection('connections').doc(therapistEmail)
        .update({ patients: FieldValue.arrayRemove(email) });
    } catch (e) { console.warn('[delete] detach from therapist:', e.message); }
  }
  await deleteDocs([
    db.collection('users').doc(email),
    db.collection('protocols').doc(email),
    db.collection('calibration').doc(email),
    db.collection('clinicalNotes').doc(email),
    db.collection('jointTracking').doc(email),
    db.collection('connections').doc(email), // harmless if absent
  ]);
  await deleteByQuery(db.collection('sessions').where('patientEmail', '==', email));
  await deleteMessagesAndThreads(email);
  await deleteStoragePrefix(`sessions/${email}/`);
}

// ── therapist cascade ────────────────────────────────────────────────────────
// Deletes the THERAPIST's own artifacts and disconnects their patients. Also deletes
// the clinicalNotes the therapist authored about those patients. PRESERVES patient-owned
// records (each patient's protocols + sessions) — deleting a therapist must not destroy a
// patient's own care history. (Flagged design decision — see deployment notes.)
async function deleteTherapist(email) {
  const connSnap = await db.collection('connections').doc(email).get();
  const patients = connSnap.exists ? (connSnap.data().patients || []) : [];
  for (const p of patients) {
    try { await db.collection('users').doc(p).update({ therapistEmail: FieldValue.delete() }); }
    catch (e) { console.warn('[delete] clear patient therapistEmail:', e.message); }
    await deleteDocs([db.collection('clinicalNotes').doc(p)]); // therapist-authored notes
  }

  await deleteDocs([
    db.collection('users').doc(email),
    db.collection('connections').doc(email),
    db.collection('therapistLibrary').doc(email),
  ]);
  await deleteByQuery(db.collection('therapistCodes').where('email', '==', email));
  await deleteByQuery(db.collection('customExercises').where('createdBy', '==', email));
  await deleteByQuery(db.collection('clinicInvites').where('invitedBy', '==', email));
  await deleteByQuery(db.collection('clinicInvites').where('inviteeEmail', '==', email));

  // Clinics owned by this therapist → delete clinic + its library.
  const owned = await db.collection('clinics').where('ownerEmail', '==', email).get();
  for (const c of owned.docs) {
    await deleteDocs([db.collection('clinicLibrary').doc(c.id), c.ref]);
  }
  // Clinics where they're a non-owner member → remove from therapists array.
  const member = await db.collection('clinics').where('therapists', 'array-contains', email).get();
  for (const c of member.docs) {
    if (c.data().ownerEmail !== email) {
      try { await c.ref.update({ therapists: FieldValue.arrayRemove(email) }); }
      catch (e) { console.warn('[delete] leave clinic:', e.message); }
    }
  }

  await deleteMessagesAndThreads(email);
  await deleteStoragePrefix(`demos/${email}/`);
}

// ── callable: delete my account ──────────────────────────────────────────────
exports.deleteMyAccount = onCall(async (request) => {
  const email = request.auth && request.auth.token && request.auth.token.email;
  const uid = request.auth && request.auth.uid;
  if (!email || !uid) throw new HttpsError('unauthenticated', 'You must be signed in.');

  const userSnap = await db.collection('users').doc(email).get();
  const role = userSnap.exists ? userSnap.data().role : 'patient';

  try {
    if (role === 'therapist' || role === 'therapist_pending' || role === 'admin') {
      await deleteTherapist(email);
    } else {
      await deletePatient(email, userSnap.exists ? userSnap.data() : null);
    }
    await admin.auth().deleteUser(uid);
  } catch (e) {
    console.error('[deleteMyAccount] failed for', email, e);
    throw new HttpsError('internal', 'Account deletion failed. Please try again or contact support.');
  }
  return { ok: true };
});

// ── callable: short-lived signed URL for a video ─────────────────────────────
// Replaces handing out permanent download URLs. Verifies the caller may see the
// video (patient owner, their connected therapist, or admin for sessions; any
// authed user for demos), then returns a 15-minute signed URL. Signed URLs are
// authenticated by the service account and bypass Storage rules, so storage.rules
// can keep direct path reads locked to the owner.
exports.getSignedVideoUrl = onCall(async (request) => {
  const email = request.auth && request.auth.token && request.auth.token.email;
  if (!email) throw new HttpsError('unauthenticated', 'You must be signed in.');
  const path = request.data && request.data.path;
  if (!path || typeof path !== 'string') throw new HttpsError('invalid-argument', 'Missing video path.');

  if (path.startsWith('sessions/')) {
    const patientEmail = path.split('/')[1];
    let allowed = email === patientEmail;
    if (!allowed) {
      const u = await db.collection('users').doc(patientEmail).get();
      allowed = u.exists && u.data().therapistEmail === email; // connected therapist
    }
    if (!allowed) {
      const me = await db.collection('users').doc(email).get();
      allowed = me.exists && me.data().role === 'admin';
    }
    if (!allowed) throw new HttpsError('permission-denied', 'Not authorized for this video.');
  } else if (!path.startsWith('demos/')) {
    throw new HttpsError('permission-denied', 'Invalid video path.');
  }

  try {
    const [url] = await bucket.file(path).getSignedUrl({
      version: 'v4',
      action: 'read',
      expires: Date.now() + 15 * 60 * 1000,
    });
    return { url };
  } catch (e) {
    console.error('[getSignedVideoUrl] sign failed for', path, e);
    throw new HttpsError('internal', 'Could not generate video link.');
  }
});

// ── callable: connect a patient to a therapist by clinic code ────────────────
// Server-authoritative connection. Verifies the caller is a patient and that the
// code maps to a real therapist, then writes the connection with admin
// privileges. This is the ONLY writer of a patient's therapistEmail and of the
// patient's entry in a therapist's connections roster, so security rules treat
// both as authoritative — a patient can no longer self-assert a connection
// client-side (which previously also let them read any therapist's user doc by
// pointing their own therapistEmail at it).
exports.connectByCode = onCall(async (request) => {
  const email = request.auth && request.auth.token && request.auth.token.email;
  const uid = request.auth && request.auth.uid;
  if (!email || !uid) throw new HttpsError('unauthenticated', 'You must be signed in.');

  const code = request.data && request.data.code;
  if (!code || typeof code !== 'string') throw new HttpsError('invalid-argument', 'Missing clinic code.');

  // Caller must be a patient.
  const meSnap = await db.collection('users').doc(email).get();
  if (!meSnap.exists || meSnap.data().role !== 'patient') {
    throw new HttpsError('permission-denied', 'Only patients can connect to a therapist.');
  }

  // Resolve code → therapist email and confirm they are a real therapist.
  const codeSnap = await db.collection('therapistCodes').doc(code).get();
  if (!codeSnap.exists) throw new HttpsError('not-found', 'No therapist found with that code.');
  const therapistEmail = codeSnap.data().email;
  const tSnap = await db.collection('users').doc(therapistEmail).get();
  if (!tSnap.exists || tSnap.data().role !== 'therapist') {
    throw new HttpsError('not-found', 'No therapist found with that code.');
  }

  const batch = db.batch();
  batch.set(db.collection('connections').doc(therapistEmail),
    { patients: FieldValue.arrayUnion(email) }, { merge: true });
  batch.update(db.collection('users').doc(email), { therapistEmail });
  await batch.commit();

  return { therapistEmail, therapistName: tSnap.data().name || 'your therapist' };
});

// ── scheduled: expire old session videos ─────────────────────────────────────
exports.expireVideos = onSchedule('every 24 hours', async () => {
  const cutoff = new Date(Date.now() - SESSION_RETENTION_DAYS * 86400000).toISOString();
  const snap = await db.collection('sessions').where('date', '<', cutoff).get();
  let cleared = 0;

  for (const doc of snap.docs) {
    const d = doc.data();
    const paths = [];
    if (d.videoStoragePath) paths.push(d.videoStoragePath);
    if (Array.isArray(d.setData)) {
      d.setData.forEach((s) => { if (s && s.videoStoragePath) paths.push(s.videoStoragePath); });
    }
    if (paths.length === 0 && !d.videoUrl) continue;

    for (const p of paths) {
      try { await bucket.file(p).delete(); }
      catch (e) { if (e.code !== 404) console.warn('[expire] delete', p, e.message); }
    }

    const update = {
      videoUrl: FieldValue.delete(),
      videoStoragePath: FieldValue.delete(),
      videoExpireAt: FieldValue.delete(),
    };
    if (Array.isArray(d.setData)) {
      update.setData = d.setData.map((s) => {
        if (!s) return s;
        const c = { ...s }; delete c.videoUrl; delete c.videoStoragePath; return c;
      });
    }
    try { await doc.ref.update(update); cleared++; }
    catch (e) { console.warn('[expire] update', doc.id, e.message); }
  }

  console.log(`[expireVideos] cleared video from ${cleared} session(s) older than ${SESSION_RETENTION_DAYS}d`);
});
