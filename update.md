# Motus -- Updates

Check here to see what changed since your last session. Most recent first.

---

## 2026-06-08 -- Oliver

**Firestore rule tightening + audit log + adherence edge case**

- Firestore rules: `clinicInvites` — restricted the invitee update to `status` only; previously any field could be changed, so an invitee could swap the `clinicId` before accepting to join a different clinic than intended
- Firestore rules: `messageThreads` — restricted participant updates to `archived` + `disconnectedAt` only; previously any participant could overwrite any field including `participants` itself
- Firestore rules: `sessions` update now locked to `videoUrl`/`videoExpireAt` only — previously any connected party could overwrite reps, pain, date, or exerciseType after the fact. Core clinical data is now immutable post-recording (admin exempt)
- Audit log: added missing entries for `user_signup`, `session_recorded` (both the manual-camera and simple-form paths), and `protocol_deleted` — these are the three highest-value gaps in the HIPAA audit trail
- `every_other` adherence target changed from 3.5 to 3 — using the fractional average caused a Mon/Wed/Fri patient (a perfectly valid every-other-day pattern) to show 86% instead of 100%
- Pushed and opened PR #17 for review/merge
- Firestore rules: `connections` patient-create path now restricts doc shape to `{patients}` only — previously constrained array contents but not the overall key set
- Audit log: `protocol_assigned` split into `protocol_created` vs `protocol_updated` — audit trail previously couldn't distinguish creates from edits; also added missing log for bulk-assign path (was completely untracked)

---

## 2026-06-07 -- Oliver

**Security sweep (16 stored-XSS fixes + Firestore hardening) + adherence fix**

Started from one XSS report in the DEMO button and pulled the thread -- the same pattern (user-controlled strings interpolated into HTML/attributes without proper escaping) turned up in 16 places across the app:

- **4 spots** built `onclick` attributes with incomplete quote-only escaping (manual-camera DEMO button, progress-screen + session-history video buttons, "Share from Library" button). New `escJsAttr()` helper blocks both JS-string breakout (`'`) and HTML-attribute breakout (`"`, `<`, `&`)
- **9 spots** rendered user data (display names, clinic/exercise names, emails, invite info, custom-exercise descriptions/categories) as raw unescaped HTML in list views (admin, clinic, exercise library, protocols) -- now wrapped in `escapeHtml()`
- **1 systemic spot**: custom exercise names get written into the global `exerciseLabels` lookup table (`exerciseLabels[id] = name`), which is read unescaped into HTML everywhere its label is shown. Fixed at each render site rather than at write time (escaping at write would've broken the `textContent` consumers of the same table)
- **1 high-severity spot, new dependency**: clinical notes stored/replayed raw `innerHTML`, and any therapist with patient access could write to that doc directly (no content validation in firestore.rules) -- a stored-XSS vector with a full-HTML payload surface, not just text. Added **DOMPurify** (CDN, pinned version + SRI hash, see `index.html`) and sanitize on both save and load. Verified live in-browser: `<img onerror>` / `<script>` / `onclick` / `javascript:` payloads are all stripped while basic formatting (bold/italic/lists) survives

Also:
- Firestore rules: closed a privilege-escalation hole where any user could write `role: 'therapist'`/`'admin'` onto their own profile at signup or via update -- self-signup is now restricted to `patient`/`therapist_pending`, and role is immutable for non-admins
- Firestore rules: locked down message updates so only the recipient can flip `read` to `true` -- previously either participant could rewrite any field (text, sender, timestamp) of an existing message
- Adherence calculation now accounts for prescribed frequency -- a "Twice Daily" patient doing 1 session/day now shows 50%, not 100% (resolves the known issue below)

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
- ~~Frequency is display-only -- adherence calculation doesn't account for it yet~~ Fixed by Oliver on 2026-06-07 (see above)
- Firebase Analytics measurement ID not set up yet (minor)
