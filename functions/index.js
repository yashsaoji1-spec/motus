const { onCall, HttpsError } = require('firebase-functions/v2/https');
const { onSchedule } = require('firebase-functions/v2/scheduler');
const { defineSecret } = require('firebase-functions/params');
const { v2: cloudinary } = require('cloudinary');
const admin = require('firebase-admin');

admin.initializeApp();

const CLOUDINARY_API_KEY    = defineSecret('CLOUDINARY_API_KEY');
const CLOUDINARY_API_SECRET = defineSecret('CLOUDINARY_API_SECRET');
const CLOUDINARY_CLOUD_NAME = defineSecret('CLOUDINARY_CLOUD_NAME');

// Parse Cloudinary public_id from a delivery URL.
// Input:  https://res.cloudinary.com/{cloud}/video/upload/v123/motus-videos/abc.webm
// Output: motus-videos/abc
function extractPublicId(url) {
  if (!url || !url.includes('cloudinary.com')) return null;
  const match = url.match(/\/upload\/(?:v\d+\/)?(.+?)(?:\.[a-z0-9]+)?$/i);
  return match ? match[1] : null;
}

// Expire videos in a given Firestore collection.
// Finds documents where videoExpireAt <= now and videoUrl is set,
// deletes the video from Cloudinary, and nulls the videoUrl field.
async function expireCollectionVideos(db, collectionName) {
  const now = new Date().toISOString();
  const snap = await db.collection(collectionName)
    .where('videoExpireAt', '<=', now)
    .get();

  let deleted = 0;
  let errors  = 0;

  for (const doc of snap.docs) {
    const { videoUrl } = doc.data();
    if (!videoUrl) continue;

    const publicId = extractPublicId(videoUrl);
    if (!publicId) {
      console.warn(`[expireVideos] Could not parse publicId from ${videoUrl}`);
      errors++;
      continue;
    }

    try {
      await cloudinary.uploader.destroy(publicId, { resource_type: 'video' });
      await doc.ref.update({ videoUrl: null, videoExpireAt: null });
      deleted++;
    } catch (e) {
      console.error(`[expireVideos] Failed to delete ${publicId}:`, e.message);
      errors++;
    }
  }

  console.log(`[expireVideos] ${collectionName}: ${deleted} deleted, ${errors} errors`);
}

exports.expireVideos = onSchedule(
  {
    schedule: 'every 24 hours',
    secrets: [CLOUDINARY_API_KEY, CLOUDINARY_API_SECRET, CLOUDINARY_CLOUD_NAME],
    maxInstances: 1,
  },
  async () => {
    cloudinary.config({
      cloud_name:  CLOUDINARY_CLOUD_NAME.value(),
      api_key:     CLOUDINARY_API_KEY.value(),
      api_secret:  CLOUDINARY_API_SECRET.value(),
    });

    const db = admin.firestore();
    await expireCollectionVideos(db, 'sessions');
    await expireCollectionVideos(db, 'messages');
  }
);

// Daily Firestore export to GCS (HIPAA audit log retention + disaster recovery).
// Exports all collections to gs://motus-backups/YYYY-MM-DD/
// Bucket lifecycle rule (set in Cloud Console) auto-deletes backups older than 90 days.
exports.dailyBackup = onSchedule(
  { schedule: 'every 24 hours', timeZone: 'America/Chicago', maxInstances: 1 },
  async () => {
    const projectId = process.env.GCLOUD_PROJECT;
    if (!projectId) throw new Error('GCLOUD_PROJECT env var not set');

    const date = new Date().toISOString().split('T')[0];
    const outputUriPrefix = `gs://motus-backups/${date}`;

    // Get service account token from the GCE metadata server (always available in Cloud Functions)
    const tokenRes = await fetch(
      'http://metadata.google.internal/computeMetadata/v1/instance/service-accounts/default/token',
      { headers: { 'Metadata-Flavor': 'Google' } }
    );
    if (!tokenRes.ok) throw new Error(`Metadata token fetch failed: ${tokenRes.status}`);
    const { access_token } = await tokenRes.json();

    const exportRes = await fetch(
      `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default):exportDocuments`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${access_token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          outputUriPrefix,
          collectionIds: [], // empty = all collections
        }),
      }
    );

    if (!exportRes.ok) {
      const body = await exportRes.text();
      throw new Error(`Firestore export failed (${exportRes.status}): ${body}`);
    }

    console.log(`[dailyBackup] Export started → ${outputUriPrefix}`);
  }
);

// HIPAA §164.524 — Right of Access: produce a patient's PHI in readable electronic form.
// Returns a JSON payload the client downloads as a file.
// HIPAA data minimization + CCPA + Apple App Store requirement.
// Deletes all PHI for the calling user across Firestore, Cloudinary, and Firebase Auth.
// Runs server-side to cascade atomically across collections.
exports.deleteAccount = onCall(
  { secrets: [CLOUDINARY_API_KEY, CLOUDINARY_API_SECRET, CLOUDINARY_CLOUD_NAME], maxInstances: 10 },
  async (request) => {
    if (!request.auth) {
      throw new HttpsError('unauthenticated', 'Must be signed in');
    }

    const email = request.auth.token.email;
    const uid   = request.auth.uid;
    const db    = admin.firestore();

    cloudinary.config({
      cloud_name:  CLOUDINARY_CLOUD_NAME.value(),
      api_key:     CLOUDINARY_API_KEY.value(),
      api_secret:  CLOUDINARY_API_SECRET.value(),
    });

    // 1. Delete session docs + their Cloudinary videos
    const sessionsSnap = await db.collection('sessions')
      .where('patientEmail', '==', email).get();

    const BATCH_SIZE = 500;
    let batch = db.batch();
    let batchCount = 0;

    for (const doc of sessionsSnap.docs) {
      const { videoUrl } = doc.data();
      if (videoUrl) {
        const publicId = extractPublicId(videoUrl);
        if (publicId) {
          try {
            await cloudinary.uploader.destroy(publicId, { resource_type: 'video' });
          } catch (e) {
            console.warn(`[deleteAccount] Cloudinary destroy failed for ${publicId}:`, e.message);
          }
        }
      }
      batch.delete(doc.ref);
      batchCount++;
      if (batchCount === BATCH_SIZE) {
        await batch.commit();
        batch = db.batch();
        batchCount = 0;
      }
    }
    if (batchCount > 0) await batch.commit();

    // 2. Remove patient from all therapist connections docs
    const connectionsSnap = await db.collection('connections')
      .where('patients', 'array-contains', email).get();

    batch = db.batch();
    batchCount = 0;
    for (const doc of connectionsSnap.docs) {
      const patients = (doc.data().patients || []).filter(p => p !== email);
      batch.update(doc.ref, { patients });
      batchCount++;
      if (batchCount === BATCH_SIZE) {
        await batch.commit();
        batch = db.batch();
        batchCount = 0;
      }
    }
    if (batchCount > 0) await batch.commit();

    // 3. Anonymize message threads (replace email with "[deleted]" in participants/from/to)
    const messagesSnap = await db.collection('messages')
      .where('participants', 'array-contains', email).get();

    batch = db.batch();
    batchCount = 0;
    for (const doc of messagesSnap.docs) {
      const data = doc.data();
      const update = {
        participants: data.participants.map(p => p === email ? '[deleted]' : p),
      };
      if (data.from === email) update.from = '[deleted]';
      if (data.to   === email) update.to   = '[deleted]';
      batch.update(doc.ref, update);
      batchCount++;
      if (batchCount === BATCH_SIZE) {
        await batch.commit();
        batch = db.batch();
        batchCount = 0;
      }
    }
    if (batchCount > 0) await batch.commit();

    // 4. Delete protocols doc
    await db.collection('protocols').doc(email).delete();

    // 5. Delete user Firestore doc
    await db.collection('users').doc(email).delete();

    // 6. Audit log before deleting the Auth account
    await db.collection('auditLog').add({
      actorId:   uid,
      action:    'account_deleted',
      resourceId: email,
      timestamp: admin.firestore.FieldValue.serverTimestamp(),
      userAgent: request.rawRequest?.headers?.['user-agent'] || '',
    });

    // 7. Delete Firebase Auth account (must be last — invalidates the token)
    await admin.auth().deleteUser(uid);

    return { success: true };
  }
);

exports.exportPatientData = onCall({ maxInstances: 10 }, async (request) => {
  if (!request.auth) {
    throw new HttpsError('unauthenticated', 'Must be signed in');
  }

  const patientEmail = request.auth.token.email;
  const db = admin.firestore();

  // Sessions — all, no expiry filter (export must include historical data)
  const sessionsSnap = await db.collection('sessions')
    .where('patientEmail', '==', patientEmail)
    .get();
  const sessions = sessionsSnap.docs.map(d => ({ id: d.id, ...d.data() }));

  // Protocols
  const protocolSnap = await db.collection('protocols').doc(patientEmail).get();
  const protocols = protocolSnap.exists ? (protocolSnap.data().items || []) : [];

  // Messages — both sent and received
  const messagesSnap = await db.collection('messages')
    .where('participants', 'array-contains', patientEmail)
    .get();
  // Strip video blobs, keep only text + metadata
  const messages = messagesSnap.docs.map(d => {
    const { text, from, to, timestamp, read, videoUrl } = d.data();
    return { id: d.id, text, from, to, timestamp, read, videoUrl: videoUrl || null };
  });

  // Audit log — server-side write (no client UID needed here; use email as actorId)
  await db.collection('auditLog').add({
    actorId:   request.auth.uid,
    action:    'data_export',
    resourceId: patientEmail,
    timestamp: admin.firestore.FieldValue.serverTimestamp(),
    userAgent: request.rawRequest?.headers?.['user-agent'] || '',
  });

  return {
    exportedAt: new Date().toISOString(),
    patient:    patientEmail,
    sessions,
    protocols,
    messages,
  };
});

exports.cloudinarySignature = onCall(
  { secrets: [CLOUDINARY_API_KEY, CLOUDINARY_API_SECRET, CLOUDINARY_CLOUD_NAME], maxInstances: 10 },
  async (request) => {
    if (!request.auth) {
      throw new HttpsError('unauthenticated', 'Must be signed in');
    }
    const timestamp = Math.round(Date.now() / 1000);
    const folder    = 'motus-videos';
    const signature = cloudinary.utils.api_sign_request(
      { timestamp, folder },
      CLOUDINARY_API_SECRET.value()
    );
    return {
      signature,
      timestamp,
      folder,
      cloudName: CLOUDINARY_CLOUD_NAME.value(),
      apiKey: CLOUDINARY_API_KEY.value(),
    };
  }
);
