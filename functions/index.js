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
// Resolved LAZILY. At module scope this blocks: admin.storage().bucket() needs a
// default bucket, which only exists in the deployed runtime — so the module never
// finished loading locally, and `firebase deploy` must load it to enumerate
// exports. That made the functions codebase undeployable ("User code failed to
// load. Cannot determine backend specification. Timeout after 10000"). Inside a
// handler the runtime config is present and this resolves fine.
let _bucket;
const bucket = () => (_bucket || (_bucket = admin.storage().bucket()));
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
  try { await bucket().deleteFiles({ prefix }); }
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
    // Any outstanding join request. Left behind it becomes a ghost row on a
    // therapist's list for an account that no longer exists — and approving it
    // would half-recreate the deleted user's doc.
    db.collection('connectionRequests').doc(email),
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
  // Join requests addressed to this therapist. The patients who filed them stay,
  // but the request is dead — the therapist it was sent to no longer exists, and
  // nobody else is permitted to act on it.
  await deleteByQuery(db.collection('connectionRequests').where('therapistEmail', '==', email));
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
    const [url] = await bucket().file(path).getSignedUrl({
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
      try { await bucket().file(p).delete(); }
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


// ── Verification email, sent by us instead of Firebase ─────────────────────
//
// Firebase's built-in sender put every verification email in spam: it sends from
// the shared noreply@motus-prod.firebaseapp.com, so a message branded "Motus
// Medicine" arrives from a domain with no relationship to it — a phishing shape,
// on a domain whose reputation is shared with every other Firebase project.
// Firebase's own custom-domain feature is not a way out: its console flow arms
// useCustomDomain WITHOUT starting verification, which silently drops ALL mail
// (2026-07-11 and again 2026-08-09).
//
// So Firebase only mints the oobCode here; we own the send. Mail goes out signed
// as motusmedicine.com through Resend, and the link points at our own branded
// /auth/action page rather than motus-prod.firebaseapp.com. Resend's dashboard
// then shows delivered/bounced/complained per message — the visibility whose
// absence made the August outage take hours.
const { defineSecret } = require('firebase-functions/params');
const RESEND_API_KEY = defineSecret('RESEND_API_KEY');

const VERIFY_COOLDOWN_MS = 60 * 1000;

function verifyEmailBody(link, lang) {
  const es = lang === 'es';
  const t = es ? {
    hi: 'Hola,',
    lead: 'Confirma tu correo para empezar a usar Motus.',
    cta: 'Verificar mi correo',
    fallback: 'Si el botón no funciona, copia y pega este enlace:',
    ignore: 'Si no creaste una cuenta en Motus, puedes ignorar este mensaje.',
    sign: 'El equipo de Motus Medicine',
  } : {
    hi: 'Hi,',
    lead: 'Confirm your email address to start using Motus.',
    cta: 'Verify my email',
    fallback: "If the button doesn't work, copy and paste this link:",
    ignore: "If you didn't create a Motus account, you can ignore this message.",
    sign: 'The Motus Medicine team',
  };
  // Plain text alongside HTML: a multipart message scores better with filters
  // than HTML alone, and some clients only ever render the text part.
  const text = `${t.hi}\n\n${t.lead}\n\n${link}\n\n${t.ignore}\n\n${t.sign}`;
  const html = `<!doctype html><html><body style="margin:0;padding:24px;background:#f5f3ef;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;color:#1e293b">
  <div style="max-width:480px;margin:0 auto;background:#fff;border-radius:12px;padding:32px">
    <p style="margin:0 0 16px;font-size:16px">${t.hi}</p>
    <p style="margin:0 0 24px;font-size:16px;line-height:1.5">${t.lead}</p>
    <p style="margin:0 0 24px"><a href="${link}" style="display:inline-block;background:#2f6f62;color:#fff;text-decoration:none;padding:12px 24px;border-radius:8px;font-weight:600">${t.cta}</a></p>
    <p style="margin:0 0 8px;font-size:13px;color:#64748b">${t.fallback}</p>
    <p style="margin:0 0 24px;font-size:13px;word-break:break-all"><a href="${link}" style="color:#2f6f62">${link}</a></p>
    <p style="margin:0 0 8px;font-size:13px;color:#64748b">${t.ignore}</p>
    <p style="margin:0;font-size:13px;color:#64748b">${t.sign}</p>
  </div></body></html>`;
  return { text, html, subject: es ? 'Verifica tu correo para Motus Medicine' : 'Verify your email for Motus Medicine' };
}

exports.sendVerificationEmail = onCall({ secrets: [RESEND_API_KEY] }, async (request) => {
  // Callable and authenticated: the caller is signed in as the account being
  // verified, so nobody can trigger mail to an address they do not control.
  const email = request.auth?.token?.email;
  if (!email) throw new HttpsError('unauthenticated', 'Sign in before requesting verification.');
  if (request.auth.token.email_verified) return { sent: false, reason: 'already-verified' };

  const lang = request.data?.lang === 'es' ? 'es' : 'en';
  const ref = db.collection('verificationSends').doc(email);
  const prior = await ref.get();
  const lastSent = prior.exists ? (prior.data().lastSentAt || 0) : 0;
  if (Date.now() - lastSent < VERIFY_COOLDOWN_MS) {
    throw new HttpsError('resource-exhausted', 'A verification email was just sent. Check your inbox and spam, then try again in a minute.');
  }

  // Firebase still mints the oobCode — only the delivery changes. The generated
  // link points at Firebase's default handler, so keep the code and re-point it
  // at our own /auth/action page, which already knows how to apply it.
  const generated = await admin.auth().generateEmailVerificationLink(email, {
    url: 'https://motusmedicine.com',
    handleCodeInApp: false,
  });
  const oobCode = new URL(generated).searchParams.get('oobCode');
  if (!oobCode) throw new HttpsError('internal', 'Could not build a verification link.');
  const link = `https://motusmedicine.com/auth/action?mode=verifyEmail&oobCode=${encodeURIComponent(oobCode)}&lang=${lang}`;

  const { subject, html, text } = verifyEmailBody(link, lang);
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${RESEND_API_KEY.value()}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: 'Motus Medicine <noreply@motusmedicine.com>',
      reply_to: 'support@motusmedicine.com',
      to: [email],
      subject, html, text,
    }),
  });

  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    console.error('[verify] Resend rejected the send:', res.status, detail);
    throw new HttpsError('internal', 'Could not send the verification email.');
  }
  const body = await res.json().catch(() => ({}));
  await ref.set({ lastSentAt: Date.now(), messageId: body.id || null }, { merge: true });
  console.log(`[verify] sent to ${email.replace(/^(.).*(@.*)$/, '$1***$2')} id=${body.id}`);
  return { sent: true };
});


// ── Therapist approval: verified email required ────────────────────────────
//
// The pending queue is driven by users/{email}.role == 'therapist_pending',
// which is written at signup, before any email is sent and with no reference to
// whether the address was ever confirmed. So the queue happily lists people who
// never proved they own the address they signed up with, and approving one
// hands a stranger's inbox a caseload of patient data.
//
// Firestore rules cannot close this: emailVerified lives in Firebase Auth, and
// rules cannot read it. Nor can the check live in the admin UI — a disabled
// button is not enforcement, the same principle the connection rules follow. So
// the promotion moves here, where the Admin SDK can read Auth directly and the
// role is only written after the check passes.

async function assertAdmin(request) {
  const email = request.auth?.token?.email;
  if (!email) throw new HttpsError('unauthenticated', 'Sign in first.');
  const me = await db.collection('users').doc(email).get();
  if (!me.exists || me.data().role !== 'admin') {
    throw new HttpsError('permission-denied', 'Admins only.');
  }
  return email;
}

// Pending therapists, each annotated with whether Auth says their email is
// verified. The UI needs this to show WHY an Approve button is unavailable.
exports.listPendingTherapists = onCall(async (request) => {
  await assertAdmin(request);
  const snap = await db.collection('users').where('role', '==', 'therapist_pending').get();
  const rows = await Promise.all(snap.docs.map(async (d) => {
    let emailVerified = false;
    let createdAt = null;
    try {
      const u = await admin.auth().getUserByEmail(d.id);
      emailVerified = u.emailVerified;
      createdAt = u.metadata.creationTime;
    } catch (e) {
      // No Auth user (deleted account, stale Firestore doc). Treat as
      // unverified — never as verified — so a broken lookup cannot approve.
      console.warn('[approval] no auth user for', d.id, e.code || e.message);
    }
    return { email: d.id, name: d.data().name || '', emailVerified, createdAt };
  }));
  return { pending: rows };
});

exports.approveTherapist = onCall(async (request) => {
  const adminEmail = await assertAdmin(request);
  const email = (request.data?.email || '').trim().toLowerCase();
  if (!email) throw new HttpsError('invalid-argument', 'No email given.');

  const doc = await db.collection('users').doc(email).get();
  if (!doc.exists) throw new HttpsError('not-found', 'No such user.');
  if (doc.data().role !== 'therapist_pending') {
    throw new HttpsError('failed-precondition', 'That account is not awaiting approval.');
  }

  // THE GATE. A failed lookup is a refusal, not a pass.
  let user;
  try {
    user = await admin.auth().getUserByEmail(email);
  } catch (e) {
    throw new HttpsError('failed-precondition', 'That account has no sign-in record.');
  }
  if (!user.emailVerified) {
    throw new HttpsError('failed-precondition',
      'That email address has never been verified, so this account cannot be approved yet.');
  }

  await db.collection('users').doc(email).update({ role: 'therapist' });
  console.log(`[approval] ${adminEmail} approved ${email.replace(/^(.).*(@.*)$/, '$1***$2')}`);
  return { approved: true };
});


// ── Messages expire after two weeks ────────────────────────────────────────
//
// Patient↔therapist messages are clinical correspondence: they name symptoms,
// setbacks and body parts, and they accumulate forever with nobody pruning them.
// Two weeks is long enough to hold a conversation and short enough that the app
// is not sitting on an indefinite archive of PHI it has no reason to keep.
//
// Deleted, not hidden. Telling users messages expire while quietly retaining the
// documents would be the kind of promise this app cannot afford to break.
//
// The messageThreads doc is deliberately left alone — it holds participants and
// the archived flag, no message content, and removing it would break the thread
// list for a conversation that is merely old rather than over.
const MESSAGE_RETENTION_DAYS = 14;

exports.expireMessages = onSchedule('every 24 hours', async () => {
  const cutoff = new Date(Date.now() - MESSAGE_RETENTION_DAYS * 86400000);
  // timestamp is a Firestore serverTimestamp. Documents written before that
  // field existed, or with it still resolving, sort as null and are skipped —
  // an unsent-yet write must not be deleted out from under its own callback.
  const snap = await db.collection('messages').where('timestamp', '<', cutoff).get();
  if (snap.empty) {
    console.log('[expireMessages] nothing older than', MESSAGE_RETENTION_DAYS, 'days');
    return;
  }

  // Batches cap at 500 writes.
  let deleted = 0;
  const docs = snap.docs;
  for (let i = 0; i < docs.length; i += 450) {
    const batch = db.batch();
    docs.slice(i, i + 450).forEach((d) => batch.delete(d.ref));
    await batch.commit();
    deleted += Math.min(450, docs.length - i);
  }
  console.log(`[expireMessages] deleted ${deleted} message(s) older than ${MESSAGE_RETENTION_DAYS} days`);
});
