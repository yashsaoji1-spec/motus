// Motus — email verification diagnostic + manual unblock.
//
// Reads the live Firebase Auth email config for motus-prod (the thing the
// console only half shows) and, optionally, mints a verification link for a
// given address so a user can be verified without any email being delivered.
//
// USAGE:
//   1. Firebase Console -> Project Settings -> Service accounts ->
//      "Generate new private key". Save as serviceAccountKey.json in repo root.
//   2. node scripts/email-diag.mjs                      (diagnose only)
//      node scripts/email-diag.mjs mom@example.com      (diagnose + link for her)
//   3. DELETE serviceAccountKey.json afterward — it is a full-admin credential.

import admin from 'firebase-admin';
import { readFileSync } from 'node:fs';

const PROJECT = 'motus-prod';
const KEY_PATH = new URL('../serviceAccountKey.json', import.meta.url);

let serviceAccount;
try {
  serviceAccount = JSON.parse(readFileSync(KEY_PATH, 'utf8'));
} catch (e) {
  console.error('Could not read serviceAccountKey.json in the repo root.');
  console.error('Firebase Console -> Project Settings -> Service accounts -> Generate new private key.');
  process.exit(1);
}

const app = admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  projectId: PROJECT,
});

const { access_token: token } = await app.options.credential.getAccessToken();

// ── 1. The live email-sending config ───────────────────────────────────────
const res = await fetch(
  `https://identitytoolkit.googleapis.com/admin/v2/projects/${PROJECT}/config`,
  { headers: { Authorization: `Bearer ${token}` } }
);
const cfg = await res.json();
if (cfg.error) {
  console.error('Config read failed:', cfg.error.message);
} else {
  const send = cfg.notification?.sendEmail ?? {};
  console.log('=== how Firebase is sending mail ===');
  console.log('method             :', send.method ?? '(unset)');
  console.log('custom SMTP        :', send.smtp ? `${send.smtp.host}:${send.smtp.port} as ${send.smtp.username}` : 'none');
  console.log('callback URI       :', send.callbackUri ?? '(default handler)');
  console.log('verify sender      :', send.verifyEmailTemplate?.senderEmail ?? '(unset)');
  console.log('verify sender name :', send.verifyEmailTemplate?.senderLocalPart ?? send.verifyEmailTemplate?.senderDisplayName ?? '(unset)');
  console.log();
  // dnsInfo hangs off notification.sendEmail, NOT notification — reading it at
  // the wrong level reports "none configured" on a project that has one, which
  // is exactly the wrong answer when a half-configured domain is the bug.
  // If this is anything but VERIFIED while useCustomDomain is true, Firebase
  // accepts every send and the mail is dropped downstream.
  const dns = send.dnsInfo;
  console.log('=== custom sending domain ===');
  console.log(JSON.stringify(dns ?? '(none configured)', null, 2));
  if (dns?.useCustomDomain && dns?.customDomainState !== 'VERIFIED') {
    console.log('\n  >> BROKEN: sending as', dns.customDomain, 'but state is',
                dns.customDomainState, '- mail will be dropped.');
    console.log('  >> Run: node scripts/fix-email-sending.mjs --apply');
  }
  console.log();
  console.log('=== sign-in / quota relevant ===');
  console.log('authorized domains :', (cfg.authorizedDomains ?? []).join(', ') || '(none)');
  console.log('email enumeration  :', cfg.emailPrivacyConfig?.enableImprovedEmailPrivacy ? 'protection ON' : 'off');
}

// ── 2. Mint a verification link for a specific user ────────────────────────
const target = process.argv[2];
if (target) {
  console.log();
  console.log('=== verification link for', target, '===');
  try {
    const user = await admin.auth().getUserByEmail(target);
    console.log('account exists     :', user.uid);
    console.log('emailVerified      :', user.emailVerified);
    console.log('created            :', user.metadata.creationTime);
    if (user.emailVerified) {
      console.log('Already verified — nothing to do.');
    } else {
      const link = await admin.auth().generateEmailVerificationLink(target);
      console.log();
      console.log('Send them this link. Opening it verifies the account with no');
      console.log('email delivery involved at all:');
      console.log();
      console.log(link);
    }
  } catch (e) {
    console.error('Lookup failed:', e.code || e.message);
    if (e.code === 'auth/user-not-found') {
      console.error('No account with that exact address — check the spelling on the Auth account.');
    }
  }
}

process.exit(0);
