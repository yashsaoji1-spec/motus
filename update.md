# Motus -- Updates

Check here to see what changed since your last session. Most recent first.

---

## 2026-06-07 -- Oliver

**Security hardening + adherence fix**

- Closed stored XSS hole in the manual-camera DEMO button: exercise names and demo URLs are now escaped with `escJsAttr()`, which blocks both JS string breakout and HTML attribute breakout (old code only escaped single quotes)
- Firestore rules: fixed a privilege-escalation hole where any user could write `role: 'therapist'` or `role: 'admin'` onto their own profile -- self-signup is now restricted to `patient`/`therapist_pending`, and role is immutable for non-admins after creation
- Firestore rules: locked down message updates so only the recipient can mark a message `read` -- previously either participant could rewrite any field (text, sender, timestamp) of an existing message
- Adherence calculation now accounts for prescribed frequency: a "Twice Daily" patient doing 1 session/day now shows 50%, not 100% (resolves the known issue Yash flagged below)

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
