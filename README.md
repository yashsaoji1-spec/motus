# Motus

Physical rehabilitation web app that connects patients with therapists for guided exercise sessions and progress tracking.

Patients receive exercise protocols from their therapist, record video of each set, and track pain and adherence over time. Therapists manage patient protocols, review session history, and communicate through in-app messaging.

**Live:** [motus-prod.web.app](https://motus-prod.web.app)

---

## Features

**Patient side**
- Receive and follow exercise protocols assigned by a therapist
- Record video of each exercise set with front/back camera
- Log reps, sets, and pain level per set
- Track 7-day adherence and average pain with week-over-week trends
- Watch therapist-uploaded demo videos before starting a session
- In-app messaging with therapist

**Therapist side**
- Dashboard with patient list, vitals overview, and session history
- Assign exercise protocols with reps, sets, frequency, and optional demo videos
- Custom exercise library (create, edit, hide built-in exercises)
- Rich-text clinical notes per patient
- Pain index chart with 1-day, 7-day, and 30-day views
- Bulk protocol assignment across multiple patients
- In-app messaging with patients

**Infrastructure**
- Progressive Web App (installable on mobile)
- Video recording with compression and upload to Cloudinary
- Sentry error monitoring with PHI scrubbing
- Consent flow with timestamped acceptance
- Role-based access (patient, therapist, admin)

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | Vanilla JS, HTML, CSS (single-file architecture) |
| Auth & Database | Firebase Authentication + Cloud Firestore |
| Video Storage | Cloudinary (unsigned upload) |
| Error Monitoring | Sentry |
| Build Tool | Vite |
| Hosting | Firebase Hosting |

---

## Run Locally

```bash
git clone https://github.com/yashsaoji1-spec/motus.git
cd motus
npm install
```

Create a `.env.development` file with your Firebase config:

```
VITE_FIREBASE_API_KEY=your-api-key
VITE_FIREBASE_AUTH_DOMAIN=your-project.firebaseapp.com
VITE_FIREBASE_PROJECT_ID=your-project-id
VITE_FIREBASE_STORAGE_BUCKET=your-project.firebasestorage.app
VITE_FIREBASE_MESSAGING_SENDER_ID=your-sender-id
VITE_FIREBASE_APP_ID=your-app-id
```

```bash
npm run dev        # http://localhost:5173
```

---

## Deploy

```bash
npm run build
firebase deploy --only hosting
```

---

## Project Structure

```
code/
  index.html     -- all screens and modals
  app.js         -- all application logic
  styles.css     -- all styles
  public/        -- PWA manifest, icons, legal pages, service worker
vite.config.mjs  -- dev server and build config
firestore.rules  -- Firestore security rules
```

Single-file-per-layer architecture: one HTML file, one JS file, one CSS file.

---

## Authors

- **Yash Saoji** -- [github.com/yashsaoji1-spec](https://github.com/yashsaoji1-spec)
- **Oliver Huelsbeck**

Built in Rochester, MN. 2025-2026.
