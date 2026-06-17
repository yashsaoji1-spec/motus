# Motus -- Updates

Check here to see what changed since your last session. Most recent first.

---

## 2026-06-17 -- Yash

**Deployment-readiness pass: legal truth + security headers + real data export + UI fixes -- on staging**

All on `yash`, deployed to **staging (motus-staging1) only** -- prod untouched. These are the "safe, no-Blaze" items from the deployment plan.

Security + compliance:
- `firebase.json`: added **HSTS, Referrer-Policy, Permissions-Policy** (camera/mic locked to `self`; geolocation/payment/usb blocked) -- were missing entirely.
- **Real data export:** replaced the `downloadMyData()` "coming soon" stub with a working client-side JSON export (profile + protocol + sessions + messages, audit-logged). Fulfills the HIPAA Right-of-Access promise the policy makes.
- **Legal pages made truthful:** removed the false "videos auto-deleted after 14 days" (no deletion code exists yet, and the number was wrong -- config is 30/7); "under 13" -> 18+ to match ToS; softened the App Check claim (wired but not enforced); reconciled the NPP payment/insurance contradiction (we don't bill); added a named Privacy Officer. Mirrored all factual fixes into the Spanish pages.
- **Contact email:** swapped `privacy@motus.app` (bounces -- domain not owned) -> `yashsaoji1@gmail.com` everywhere, as an interim until a real domain + forwarding exists.

UI fixes:
- **Session-save failures now surface.** The manual-camera path silently showed success on a failed save (therapist got nothing, data lost); now it alerts and offers a retry that preserves the recorded sets.
- **Therapist "Notes for Patient" now visible to patients** -- rendered inline in each exercise row. The detail sheet that previously showed them was dead code (never invoked).
- **Removed the redundant Start Session -> identical list step.** Home "Start Session" now uses the smart-start; today's-plan list items are tappable to start directly.
- **Therapist patient-detail:** labeled the time windows (`AVG PAIN - 7D`, `N sessions (90d)`) and defaulted the Pain Index chart to **30D** (was 1D).

Still open (need Blaze/Cloud Functions, not done here): video -> Firebase Storage migration; account-deletion cascade (`deleteMyAccount` still orphans calibration/clinicalNotes/jointTracking/videos + the therapist's connection entry); scheduled video expiry. Spanish legal text is machine-translated and still needs professional review.

---

## 2026-06-12 (later) -- Yash

**LLC reference removed + full deployment-readiness plan drafted**

- Removed "Motus Health, LLC" from the HIPAA NPP (`code/public/hipaa-npp.html` + `-es`) -> just "Motus" (we don't have a formed entity yet). Uncommitted on `yash`.
- Ran a deep multi-agent audit of the whole app and wrote a single "Ready to Email the RAC" deployment checklist (lives in the wiki, not the repo). Key things it surfaced that we should tackle before real patients: **patient videos are public PHI on Cloudinary** (recommend migrating video to **Firebase Storage** -- also ~100x cheaper than Cloudinary's HIPAA tier); **there's no `functions/` dir** so `firebase deploy` currently fails and our policy promises (auto-delete, data export, 6-yr audit) aren't enforced by any code; `deleteMyAccount` leaves orphaned data; `privacy@motus.app` is a domain we don't own so it bounces. No prod deploy yet -- this is planning, not shipped code.

---

## 2026-06-12 -- Yash

**UI polish pass + bilingual (en/es) i18n + Spanish legal pages**

All of this is on the `yash` branch and deployed to **staging only** -- prod is NOT updated (it's missing this plus the 06-10/11 tutorial + bug sweep). Hold prod until we manually test, check a real phone, and get the Spanish reviewed.

UI polish (`fdf10f5`):
- Unified the curved wave header across patient screens; removed a leftover gradient band under the login wave
- Patient home kicker shows the week ("Week of Jun 8") instead of repeating "Your Protocol"; record button is a red dot (was a play triangle) with an aria-label
- Messages now group under day dividers (Today/Yesterday/date) with clock times
- Therapist vitals/columns no longer stretch into big empty voids (align-items:start); Pain Index chart capped at 240px; empty state centered; protocol rows left-aligned
- **Bug fix:** patient Messages composer was pushed below the screen (min-height:100vh) -- now fixed 100dvh with an internally scrolling thread
- Settings is a centered 680px column on wide screens; signup + clinic spacing tightened

i18n (`c5b87b5` Phase 1, `3f24394` Phase 2):
- New lightweight i18n layer in app.js: en/es dictionary, `t(key)` helper, `data-i18n` attributes, `setLanguage()`. Language = saved account pref > localStorage > browser; persists to the user's Firestore doc; swaps live, no reload
- Phase 1: entire patient surface translated (auth, home, session, settings) + Settings language selector re-added + pre-auth login toggle; removed the orphaned 7-language signup picker
- Phase 2: built-in exercise library translated (names/descriptions/categories) via exName()/exDesc()/exCat() -- viewer language; therapist renames + custom exercises stay verbatim; session/protocol records still store English (language-neutral)

Legal pages (`504a7af`):
- Added privacy-es.html, tos-es.html, hipaa-npp-es.html with a controlling-language disclaimer (English governs) + English/Español toggles; in-app legal links are language-aware; Firebase rewrites added for the -es clean URLs

**Heads up:** all Spanish is machine-translated by Claude. The clinical exercise cues and the legal/HIPAA text need a Spanish-speaking PT / legal review before any real Spanish-speaking patient relies on them. Therapist dashboard chrome is still English (Phase 3, not started). ios/android Capacitor copies of the legal pages are still English-only -- regenerate with `npx cap sync`.

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

## 2026-06-07 -- Yash

**15-fix audit sweep + production deploy**

- Adherence is now frequency-aware: `calcCompliance()` uses daily=7, twice_daily=14, every_other=4, three_week=3 expected sessions/week. Applied to patient home, progress screen, therapist dashboard, and all prior-week deltas.
- Pain trend fixed: was reading `avgPain` (undefined), now reads `pain`
- Therapist notes fixed: `p.note` -> `p.notes`
- Video retention consent/code aligned: both say 30 days now
- Skip button race condition fixed (video error flag prevents re-disabling)
- "Responds typically within 4h" hardcoded text removed from patient therapist card
- Demographics tags now shown on therapist patient detail view
- "Download my data" shows "coming soon" alert (was calling a non-existent Cloud Function)
- "Delete my account" now works client-side (Firestore batch + auth deletion)
- Clinic codes are collision-resistant via new `therapistCodes` Firestore collection
- Rest seconds fully customizable per protocol (therapist sets it, camera timer uses it)
- Deleted dead code: XP system, orphaned manual session modal, empty stubs, getDemoSessions
- Fixed Firestore rules: added `therapistCodes` collection rule (was blocking ALL therapist logins)

**Known issues resolved from last session**
- "Frequency is display-only" -- FIXED. Adherence now accounts for frequency.

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
