# Motus — Manual TODO

Tasks that require human action (vendor portals, legal, accounts, purchases).
Added here as deployment items are completed. Check off when done.

---

## Items 10 + 11 — CI/CD + GitHub Secrets

All secrets referenced in `.github/workflows/deploy.yml` and `deploy-staging.yml` must be set in GitHub repo settings → Settings → Secrets and variables → Actions.

**Production secrets (`deploy.yml`):**
- [ ] `FIREBASE_SERVICE_ACCOUNT` — Firebase Console → Project Settings → Service Accounts → Generate new private key → paste JSON
- [ ] `VITE_FIREBASE_API_KEY`
- [ ] `VITE_FIREBASE_AUTH_DOMAIN`
- [ ] `VITE_FIREBASE_PROJECT_ID`
- [ ] `VITE_FIREBASE_STORAGE_BUCKET`
- [ ] `VITE_FIREBASE_MESSAGING_SENDER_ID`
- [ ] `VITE_FIREBASE_APP_ID`
- [ ] `VITE_RECAPTCHA_SITE_KEY`
- [ ] `VITE_SENTRY_DSN` (once Sentry is set up — item 30)

**Staging secrets (`deploy-staging.yml`):**
- [ ] `STAGING_FIREBASE_SERVICE_ACCOUNT` — same process, but for the `motus-staging1` project
- [ ] `STAGING_FIREBASE_API_KEY`
- [ ] `STAGING_FIREBASE_AUTH_DOMAIN`
- [ ] `STAGING_FIREBASE_PROJECT_ID`
- [ ] `STAGING_FIREBASE_STORAGE_BUCKET`
- [ ] `STAGING_FIREBASE_MESSAGING_SENDER_ID`
- [ ] `STAGING_FIREBASE_APP_ID`

**Verify:**
- Push a commit to `staging` branch → `Deploy Staging` workflow runs and succeeds
- Merge to `main` → `Deploy` workflow runs and production Hosting updates

---

## Item 18 — Privacy Policy + Terms of Service

- [ ] Have a healthcare attorney review the Privacy Policy (`/privacy`) and Terms of Service (`/tos`) — specifically the HIPAA-specific language — before commercial launch

## Item 19 — HIPAA Notice of Privacy Practices

- [ ] Have a healthcare attorney review the NPP (`/hipaa-npp`) before use with real patients
- [ ] Update `privacy@motus.app` contact email in `privacy.html`, `tos.html`, and `hipaa-npp.html` once custom domain is live (item 34)

## Item 20 — Covered Entity vs. BA Determination

- [ ] Draft a BAA template using HHS model language (free: hhs.gov/hipaa/for-professionals/covered-entities/sample-business-associate-agreement-provisions) or pay a healthcare attorney $300–800 to draft a reusable template
- [ ] Before any clinic stores real PHI: send BAA to that clinic's administrator, collect a signed copy, and flip `clinics/{clinicId}.baaStatus` from `'pending'` to `'signed'` in Firestore

## Item 25 — Firestore Automated Backups

- [ ] Create the GCS backup bucket (run once in Cloud Shell or terminal with gcloud auth):
  ```
  gsutil mb -l us-central1 gs://motus-backups
  ```
- [ ] Set the 90-day lifecycle rule (create `lifecycle.json` with `{"rule":[{"action":{"type":"Delete"},"condition":{"age":90}}]}`, then run):
  ```
  gsutil lifecycle set lifecycle.json gs://motus-backups
  ```
- [ ] Grant the Cloud Functions service account `Storage Object Creator` on the bucket:
  - Cloud Console → IAM → find `{project}@appspot.gserviceaccount.com` → add role `Storage Object Creator`
- [ ] Deploy the function after upgrading to Blaze: `firebase deploy --only functions`
- [ ] Verify: trigger `dailyBackup` via `firebase functions:shell`, confirm a new folder appears in `gs://motus-backups/YYYY-MM-DD/`
- [ ] Simulate restore on staging: `gcloud firestore import gs://motus-backups/YYYY-MM-DD/` (run against `motus-staging1`, not prod)

## Item 24 — Video Expiry Cloud Function

- [ ] Set the `CLOUDINARY_CLOUD_NAME` secret (Blaze plan required): `firebase functions:secrets:set CLOUDINARY_CLOUD_NAME` → enter `dslbugsdg`
- [ ] Confirm `CLOUDINARY_API_KEY` and `CLOUDINARY_API_SECRET` secrets are already set (they were set during item 05); if not: `firebase functions:secrets:set CLOUDINARY_API_KEY` and `firebase functions:secrets:set CLOUDINARY_API_SECRET`
- [ ] Deploy the function after upgrading to Blaze: `firebase deploy --only functions`
- [ ] Verify by uploading a test video, manually setting its `videoExpireAt` to a past timestamp in Firestore Console, then triggering via `firebase functions:shell` → `expireVideos()`; confirm `videoUrl` is nulled and the video is gone from Cloudinary

## Item 23 — Breach Notification Plan

- [ ] Create an account on the HHS Breach Reporting Portal **before** you need it (not during a crisis): https://ocrportal.hhs.gov
- [ ] Identify a HIPAA attorney before commercial launch — needed if a breach affects 500+ individuals
- [ ] Save the breach log spreadsheet template somewhere accessible (Google Sheets, etc.) so it's ready on Day 0 of any incident

## Item 30 — Error Monitoring (Sentry)

- [ ] Create a Sentry account at sentry.io → new project → Browser JavaScript
- [ ] Copy the DSN into `VITE_SENTRY_DSN` in `.env.production` and `.env.staging`
- [ ] In Sentry project settings → Data Scrubbing → add `email`, `patientEmail`, `inviteeEmail` to the server-side scrub list
- [ ] Deploy to staging, throw a test error (`throw new Error('sentry test')` in the browser console), confirm it appears in the Sentry dashboard within 30 seconds with no email addresses visible
- [ ] Confirm production errors show `environment: production` and dev errors do NOT appear

## Item 26 — Patient Data Export Cloud Function

- [ ] Deploy `exportPatientData` Cloud Function after upgrading to Blaze: `firebase deploy --only functions:exportPatientData`
- [ ] Verify: log in as a test patient → tap "Download my data" → JSON file downloads containing sessions, protocols, and messages → no other patients' data appears → `auditLog` gains a `data_export` entry

## Item 27 — Account Deletion Cloud Function

- [ ] Deploy `deleteAccount` Cloud Function after upgrading to Blaze: `firebase deploy --only functions:deleteAccount`
- [ ] Verify: create a test patient account with a session + video → trigger "Delete my account" → confirm Firebase Auth user gone (Console → Authentication) → confirm `users/{email}` doc deleted → confirm Cloudinary video deleted → confirm therapist connection list no longer includes the deleted patient

## Item 21 — BAAs: Firebase + Cloudinary

**Firebase:**
- [ ] Upgrade to Firebase Blaze (pay-as-you-go) plan if not already — BAAs require a paid plan
- [ ] Sign the Google Cloud HIPAA BAA: Google Cloud Console → IAM & Admin → Settings → "Business Associate Agreement"
- [ ] Confirm Firestore, Authentication, Hosting, and Cloud Functions are listed as covered services at signing time

**Cloudinary (decision required — pick one):**
- [ ] **Option A:** Upgrade Cloudinary to Enterprise plan and sign their BAA (~expensive, contact sales)
- [ ] **Option B:** Switch video storage from Cloudinary to Firebase Storage (already BAA-covered under the Google BAA). Requires a code rewrite of `uploadVideoToCloudinary()` in `app.js` — tell Claude "implement Cloudinary → Firebase Storage migration" when ready

> Option B is recommended: cheaper (already on Blaze), fewer vendors to manage, Firebase Storage is covered by the Google BAA you're already signing.
