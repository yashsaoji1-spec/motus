# Motus — Services & Infrastructure

An inventory of the external services Motus depends on, what each does, and where its
configuration lives.

> **No secrets are stored in this file or the repo.** All API keys, DSNs, and passwords
> live in the service consoles and in gitignored `.env.*` files. This document lists
> *what* we use and *where* to configure it — not credential values.

## Platform — Firebase / Google Cloud (project: `motus-prod`)
- **Hosting** — serves the app at `motusmedicine.com` and `motus-prod.web.app`
- **Authentication** — email/password with email verification
- **Firestore** — application database
- **Storage** — session video, access-controlled with short-lived signed URLs
- **Cloud Functions** — data retention + cascade account deletion
- **App Check** — reCAPTCHA v3, enforced on Firestore
- **Google Auth Platform (Branding)** — sets the app name used in auth emails
- **Custom email sending domain** — sends `noreply@motusmedicine.com` (verification/reset)
- Staging project: `motus-staging1`

## Domain & DNS — Namecheap
- `motusmedicine.com` — registrar + DNS. Points to Firebase Hosting and holds the
  email DNS records (MX / SPF / DKIM).

## Email
- **Zoho Mail** (free plan) — team inbox: `yash@`, `support@`, `privacy@` `motusmedicine.com`
- **Firebase custom-domain sending** — `noreply@motusmedicine.com` for transactional auth emails
- SPF is shared between both senders:
  `v=spf1 include:_spf.firebasemail.com include:zoho.com ~all`
- _Resend was evaluated for SMTP but is disabled — it conflicts with Firebase's
  custom-domain sending._

## Analytics — Google Analytics 4
- GA4 via Google Tag Manager. Measurement ID in `.env.production`
  (`VITE_FIREBASE_MEASUREMENT_ID`).

## Security — reCAPTCHA v3
- Backs Firebase App Check. Site key in `.env.*` (`VITE_RECAPTCHA_SITE_KEY`).

## Error monitoring — Sentry
- Client-side error tracking. DSN in `.env.*` (`VITE_SENTRY_DSN`), loaded lazily in production.

## Uptime — UptimeRobot
- HTTP monitor on `https://motusmedicine.com` (5-minute interval, email alerts).

## Source control & deploy — GitHub
- Repo: `github.com/yashsaoji1-spec/motus`. Working branch `yash`, released via `main`.
- Production deploy: `npm run build` then `firebase deploy --only hosting` (serves `dist/`).

## Client dependencies (CSP allowlist, not accounts)
- `cdn.jsdelivr.net` (TensorFlow.js, DOMPurify), `tfhub.dev` (ML models), Google Fonts.

## Configuration
Environment variables live in gitignored files: `.env.production`, `.env.staging`,
`.env.development`, `.env.audit`. Variable names (values are secret):

```
VITE_FIREBASE_API_KEY
VITE_FIREBASE_AUTH_DOMAIN
VITE_FIREBASE_PROJECT_ID
VITE_FIREBASE_STORAGE_BUCKET
VITE_FIREBASE_MESSAGING_SENDER_ID
VITE_FIREBASE_APP_ID
VITE_FIREBASE_MEASUREMENT_ID
VITE_RECAPTCHA_SITE_KEY
VITE_SENTRY_DSN
VITE_USE_EMULATORS
```
