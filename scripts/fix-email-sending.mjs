// Motus — restore email verification delivery on motus-prod.
//
// ROOT CAUSE (found 2026-08-09 via the Identity Platform admin API):
//   notification.sendEmail.dnsInfo = {
//     customDomain: "motusmedicine.com",
//     useCustomDomain: true,
//     customDomainState: "NOT_STARTED",        <-- never completed
//     domainVerificationRequestTime: "1970-01-01T00:00:00Z"
//   }
// Firebase was told to send as motusmedicine.com but never finished verifying
// that it may sign for the domain. It accepts sendEmailVerification(), reports
// success, and the message is dropped downstream. DNS on our side is correct
// (SPF includes _spf.firebasemail.com, both DKIM CNAMEs resolve) — the missing
// half is Firebase's own verification record.
//
// THIS SCRIPT sets useCustomDomain=false, which puts sending back on Firebase's
// own verified infrastructure (noreply@motus-prod.firebaseapp.com). Mail starts
// delivering again. The sender address is less branded until the custom domain
// is re-verified in the console — delivery first, branding after.
//
// Reversible: set useCustomDomain back to true once customDomainState reads
// VERIFIED.
//
// USAGE:  node scripts/fix-email-sending.mjs           (show current state only)
//         node scripts/fix-email-sending.mjs --apply   (make the change)

import admin from 'firebase-admin';
import { readFileSync } from 'node:fs';

const PROJECT = 'motus-prod';
const BASE = `https://identitytoolkit.googleapis.com/admin/v2/projects/${PROJECT}/config`;
const APPLY = process.argv.includes('--apply');

const sa = JSON.parse(readFileSync(new URL('../serviceAccountKey.json', import.meta.url), 'utf8'));
const app = admin.initializeApp({ credential: admin.credential.cert(sa), projectId: PROJECT });
const { access_token: token } = await app.options.credential.getAccessToken();
const auth = { Authorization: `Bearer ${token}` };

const before = await (await fetch(BASE, { headers: auth })).json();
console.log('BEFORE');
console.log('  method  :', before.notification?.sendEmail?.method);
console.log('  dnsInfo :', JSON.stringify(before.notification?.sendEmail?.dnsInfo));

if (!APPLY) {
  console.log('\nDry run. Re-run with --apply to set useCustomDomain=false.');
  process.exit(0);
}

// Clearing customDomain as well as the flag. Leaving the domain set while the
// flag is off still leaves it stamped on the From header, with no verified
// authority to sign for it — which is the same failure as leaving it on.
const res = await fetch(
  `${BASE}?updateMask=notification.sendEmail.dnsInfo.useCustomDomain,notification.sendEmail.dnsInfo.customDomain`, {
  method: 'PATCH',
  headers: { ...auth, 'Content-Type': 'application/json' },
  body: JSON.stringify({
    notification: { sendEmail: { dnsInfo: { useCustomDomain: false, customDomain: '' } } },
  }),
});
const out = await res.json();
if (out.error) {
  console.error('\nPATCH FAILED:', out.error.message);
  process.exit(1);
}

const after = await (await fetch(BASE, { headers: auth })).json();
console.log('\nAFTER');
console.log('  method  :', after.notification?.sendEmail?.method);
console.log('  dnsInfo :', JSON.stringify(after.notification?.sendEmail?.dnsInfo));
console.log('\nNow sign up with a fresh address and confirm the email arrives.');
process.exit(0);
