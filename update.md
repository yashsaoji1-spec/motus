# Motus -- Updates

Check here to see what changed since your last session. Most recent first.

---

## 2026-06-07 -- Oliver

**Security hardening + adherence fix**

- Closed stored XSS holes across 4 spots that built `onclick` attributes by interpolating user-controlled data (exercise names, demo/video URLs, patient names/emails, dates) with incomplete escaping -- manual-camera DEMO button, progress-screen video button, therapist session-history video button, and the patient-detail "Share from Library" button. All now use a new `escJsAttr()` helper that blocks both JS string breakout (`'`) and HTML attribute breakout (`"`, `<`, `&`)
- Firestore rules: fixed a privilege-escalation hole where any user could write `role: 'therapist'` or `role: 'admin'` onto their own profile -- self-signup is now restricted to `patient`/`therapist_pending`, and role is immutable for non-admins after creation
- Firestore rules: locked down message updates so only the recipient can mark a message `read` -- previously either participant could rewrite any field (text, sender, timestamp) of an existing message
- Adherence calculation now accounts for prescribed frequency: a "Twice Daily" patient doing 1 session/day now shows 50%, not 100% (resolves the known issue Yash flagged below)
- Closed 9 more stored XSS spots where user data (display names, clinic/exercise names, emails, invite info, custom-exercise descriptions/categories) was rendered as raw, unescaped HTML in lists across admin, clinic, exercise-library, and protocol views -- now wrapped in `escapeHtml()`
- Found and fixed a systemic one: custom exercise names get written into the global `exerciseLabels` lookup table (`exerciseLabels[id] = name`), and that table is read unescaped into HTML all over the app -- a malicious exercise name would have rendered as live markup anywhere its label showed up. Fixed at each render site rather than at write time (escaping at write would've broken the `textContent` consumers of the same table)
- **New dependency**: added DOMPurify (CDN, pinned + SRI hash, see `index.html`) to sanitize clinical-notes rich text on save and load -- the notes editor was storing/replaying raw `innerHTML`, and any therapist with patient access could write to that doc directly (no validation in firestore.rules), making it a stored-XSS vector with a much bigger payload surface (full HTML, not just text fields) than everything else fixed today. Verified live: `<img onerror>`/`<script>`/`onclick`/`javascript:` payloads all get stripped while basic formatting survives

---

## 2026-06-05 -- Yash

**Session flow fix + repo cleanup**

- Fixed demo video trap: if video fails to load, Skip and Start buttons now appear instead of locking the user out
- Disabled App Check in dev mode (was causing 403 errors on localhost)
- Commented out MediaPipe + TensorFlow CDN scripts (not used while angle tracking is off) -- page loads much faster now
- Frequency badge: patient home now shows "Twice Daily" in a blue pill instead of raw `twice_daily` text
- Sentry error monitoring: confirmed working, tested live
- Repo cleanup: deleted 4 stale branches, removed 100+ unused files from tracking (Capacitor, tests, CI workflows, Claude artifacts), repo is now public with a README
- Merged everything to main

**Known issues**
- Frequency is display-only -- adherence calculation doesn't account for it yet (e.g., "Twice Daily" patient doing 1 session shows 100%). This is a future feature.
- Firebase Analytics measurement ID not set up yet (minor)
