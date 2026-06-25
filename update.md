# Motus -- Updates

Check here to see what changed since your last session. Most recent first.

---

## 2026-06-25 -- Yash

**Merged Oliver's UI-clarity + a11y audit branch into main + a patient-facing copy/UX polish pass.**
(All on `main`/`yash` + **staging**; prod NOT deployed yet — needs a smoke-test first.)

- **Merged `feature/ui-clarity-audit-on-main` → main** (`845f599`) after verifying Oliver's fix commit
  `e6f6e7e` resolved the review's must-fix items (the undefined `var(--font)`, the WCAG contrast sweep,
  button-label restores, pinned devDeps, seed host guard). Revert anchor: tag `pre-oliver-merge`.
- **Heads-up (not bugs):** the send-button fix is a screen-reader-only label (no visible change in his
  version), and only 3 of 11 native `confirm()` calls were migrated to the app modal — so account
  deletion + clinic actions still used the browser dialog after the merge.
- **Follow-up fixes (Yash):**
  - **Account deletion now uses the app-styled confirm modal** (was native `confirm()`), en+es.
  - **Visible "Send" labels** on both the patient and therapist message composers (were icon-only).
  - **Plain-language consent screen** (~grade 6, en+es): rewrote the consent statement + data-use bullets
    + heading + error. Kept the legal "HIPAA Notice of Privacy Practices" link name; the formal NPP/Privacy
    legal pages are left for the attorney pass.
  - **"Adherence" → "Consistency"** on patient-facing screens (home, Progress, tutorial). Therapist
    clinical view keeps "ADHERENCE". Spanish already said "Constancia".
- **★ Flagged for redesign:** the **recording area (`manualCamScreen`)** — camera view + record/log
  controls + the reps/pain set-input modal — is poorly designed and needs a UX rework (not just cleanup).
  Worth a joint pass.
- Commits: `845f599` (merge), `940272c` (account modal + send labels), `99ae550` (consent copy +
  Adherence→Consistency).

## 2026-06-22 (latest) -- Yash

**Post-cutover polish from live testing (all on prod + staging)**

- **Pain-trend box was broken for every patient** -- the Progress "Pain trend" widget keyed off a
  `s.timestamp` field that sessions don't have (they store `date`), so it always showed "--". Fixed to
  fall back to `date`. Now shows e.g. "down 1.4".
- **Added a pain chart to the patient Progress screen** -- there was no graph anywhere for patients before,
  only stat cards + a list. Pain Index line chart with 7/30/90-day toggles. (Parameterized
  `renderPainChart` with a canvasId so it no longer collides with the therapist chart.)
- **Patient home is now a 3-way CTA** -- not connected = "Connect to a therapist"; connected but no
  protocol = **"Message your therapist"**; connected + protocol = "Start Session". And `handleConnect` now
  updates the in-memory user so connecting reflects without a refresh.
- **Onboarding tutorial is strictly once-ever now** -- it only marked complete on Skip/finish before, so
  any other dismissal re-fired it. Marked complete on first show + localStorage backstop.
- **Camera fixes** -- front-camera preview now mirrors (moving right reads as right) but a back camera
  (phone filming the hand) stays raw; removed the stray dead-center "CAMERA - FRONT" label.
- **Demo data seeded on prod** (`seed.js`) -- james.park / sarah.chen, 30 daily sessions + 5 messages,
  fictional (no PHI), for the demo video. Run with a service-account key (gitignored), deleted after.
- **Heads-up: App Check enforcement is ON for prod Firestore.** I briefly gated App Check off to quiet
  console noise and it broke login (no token -> permission denied) -- reverted. Don't disable App Check
  activation; the reCAPTCHA console warnings are benign.
- **Camera-error recovery + log-without-video -- VERIFIED on prod:** a denied/unavailable camera no longer
  strands the patient. Blocked camera -> "Camera unavailable" recovery card (Retry / Log without video) ->
  reps/pain entry -> session saves and shows in Progress with no video. (Tested 2026-06-22.)

Commits `e8bf098`, `8bcb3bf`, `4273004`, `2af2637`, `9b4dd89`, `2cb4083`, `dc6991a`, `2669cb0`.

## 2026-06-22 (later) -- Yash

**PROD CUTOVER -- the whole video-security stack is now live and tested on prod**

- **motus-prod upgraded to Blaze** (same $300-trial billing account as staging), **Storage bucket
  provisioned** (us-east1), **all 3 Cloud Functions deployed** (`deleteMyAccount`, `expireVideos`,
  `getSignedVideoUrl`), invoker grants + Token Creator grant done. Rules + storage rules + hosting
  deployed with the new code (consent gate, audit de-PHI, CSP).
- **Verified end-to-end ON PROD:** video upload -> Firebase Storage, signed-URL playback by the
  therapist, and the full account-deletion cascade (nothing left behind). Prod is now at feature
  parity with staging on the security stack.
- **Cloudinary removed from the CSP** (connect/media/img-src). Code was already off Cloudinary;
  this drops the last allow-listed reference. Still TODO (Yash, console): disable the
  `phalanx-videos` upload preset in the Cloudinary dashboard so the old unsigned preset can't be
  abused.
- **3 UI fixes (also on staging):** patient connect now reflects without a refresh; patient home
  shows a 3-way CTA (Connect / Message therapist when no protocol / Start Session); onboarding
  tutorial is now strictly once-ever (marked done on first show + localStorage backstop).
- Commits `e8bf098` (UI fixes) + this one (CSP). prod + staging + git all in sync.
- **Still for M1:** remove demo-login bypass + delete prod demo accounts (holding until the RAC
  demo video is recorded), seed clean demo data, record the 2-min demo video. External: attorney
  review, domain, contact inbox.

## 2026-06-22 -- Yash

**Audit-log de-PHI + consent versioning + enforced consent gate -- TESTED on staging**

- **Audit log no longer stores PHI.** `writeAuditLog` now runs every `resourceId` through
  `redactResourceId`, which replaces any email with a stable SHA-256 pseudonym (`u_<16hex>`).
  Same email always maps to the same id, so you can still correlate one user's activity without
  the log being identifiable. Covers all ~14 audit call sites centrally. Verified on a real
  `session_recorded` entry (resourceId = `u_...`, actorId = UID).
- **Consent is now versioned.** New `NPP_VERSION` constant; the patient gate requires
  `nppVersionAccepted === NPP_VERSION` (not just "consented once"). Bumping that string re-prompts
  every patient -- the per-user, per-version acknowledgment HIPAA wants. `acceptConsent` stores the
  version and writes a `consent_accepted` audit entry.
- **Server-side teeth (firestore.rules):** patient `sessions` create now requires `hasConsented()`
  -- a never-consented patient physically cannot write PHI, even outside the UI. `auditLog` create
  now requires `actorId == request.auth.uid` so entries can't be forged under another actor.
- **Rules tests added + passing:** `tests/rules/security.test.js` (9 tests, run with `npm run test:rules`)
  covers the consent gate, audit forgery protection, and core self-promotion/read invariants.
  Added `vitest.config.mjs` so vitest doesn't inherit `root: 'code'`.
- Deployed `firestore:rules` + `hosting` to **staging only**. Prod cutover still pending.

## 2026-06-21 (later) -- Yash

**Signed-URL video viewing (the hardening) + patient connect dead-end fix -- TESTED on staging**

- **`getSignedVideoUrl` (callable, deployed + tested):** therapist/patient viewing now goes through a
  server-side access check that returns a **15-minute signed URL**, instead of a permanent download URL.
  Session videos now store **only the storage path** (no permanent URL in Firestore at all). storage.rules
  stays owner-only; signed URLs bypass rules via the service-account signature. Verified: therapist watched
  a patient's set video via signed URL.
- **Patient connect dead-end fixed:** a patient who skipped connecting had no way back. Now the home shows
  a **"Connect to a therapist"** button (replaces Start Session) whenever they're not connected, opening
  the connect screen. Skip is no longer a trap.
- **Video modal caption** fixed: no longer claims "hand tracking overlay" (angle tracking is off).
- **CSP:** added `storage.googleapis.com` to `media-src`/`img-src` (signed-URL host).

**Infra note for prod:** the signed-URL function needs two one-time grants per environment — `allUsers`
Cloud Run Invoker on `getsignedvideourl`, and **Service Account Token Creator** on the compute service
account (so it can sign URLs). Both done on staging.

**Open / minor:** assign button is unguarded against double-click (can create a duplicate exercise) -- fix
optional; App Check `recaptcha-error` still noisy (non-fatal); bucket CORS not applied (video played
without it). Still staging only; prod untouched.

---

## 2026-06-21 -- Yash

**Cloud Functions live on staging: account-deletion cascade + video expiry (TESTED end-to-end)**

Staging (`motus-staging1`) is now on Blaze (Google $300 free trial). Built and deployed the first Cloud
Functions and verified them:

- **`deleteMyAccount` (callable):** full server-side cascade. Patient deletion removes their `users`,
  `protocols`, `calibration`, `clinicalNotes`, `jointTracking`, all `sessions`, messages/threads, **and
  their Storage videos**, plus removes them from the therapist's `connections`. Therapist deletion removes
  their own artifacts (library, codes, custom exercises, owned clinics, demo videos) and disconnects their
  patients. Excludes `auditLog` (HIPAA retention). Then deletes the auth user. **Replaces the old
  client-side delete, which left orphans everywhere (and which the Firestore rules correctly blocked).**
  Verified on staging: deleting a test patient left nothing behind.
- **`expireVideos` (scheduled daily):** deletes session videos older than 30 days from Storage and clears
  their refs. Deployed; runs automatically.
- Client `deleteMyAccount()` now calls the callable, then signs out.

**Infra/config fixed along the way** (all needed for the above to work in the browser):
- CSP (`firebase.json`): added Cloud Functions, fonts, Sentry, GA, reCAPTCHA hosts to `connect-src`/`script-src`.
- **Service worker rewrite** (`sw.js`): it was intercepting *all* requests (incl. cross-origin Firebase/
  fonts/functions) and re-fetching them under its own old-CSP context, which broke everything. Now it only
  touches same-origin app files; everything else goes straight to the network. Bumped cache to v2.
- Granted the `deletemyaccount` Cloud Run service public invoker (callables must be publicly invokable; the
  auto-created org had blocked it).
- `.gitignore`: now tracks `functions/` source (was wholesale-ignored), still ignores `node_modules`.

**Known noise (non-fatal, pending):** `appCheck/recaptcha-error` floods the console on staging — App Check
isn't enforced, so it blocks nothing; the staging reCAPTCHA key just isn't registered for the domain. Will
quiet later. Still on staging only; prod untouched.

---

## 2026-06-17 (later) -- Yash

**Video storage: Cloudinary -> Firebase Storage migration (code-complete, NOT yet deployed/tested)**

The big one from the deployment plan. Patient session videos were going to an **unsigned public Cloudinary
preset** (public PHI -- the top security hole). Migrated all video upload to **Firebase Storage**:

- New `uploadVideoToStorage()` (resumable + progress, returns `{url, storagePath}`) replaces
  `uploadVideoToCloudinary()`; all 6 call sites cut over (manual-cam per-set x2, angle-path `uploadVideo`,
  demo uploads x2). `videoStoragePath` is now persisted so the future expiry/deletion Function can delete
  the object.
- New `storage.rules`: patient videos are **owner-only by path**; demo videos readable by any authed user
  (instructional, not PHI); deny-all default. Registered in `firebase.json`. Storage host added to CSP.
  `storage.cors.json` added for video range-requests.
- **Security model:** the download URL is stored in the Firestore session doc (gated by Firestore rules),
  so only the patient + connected therapist get it. This closes the public-video hole. Therapist viewing
  currently uses that tokenized download URL, **not** a short-lived signed URL -- the `getSignedVideoUrl`
  Cloud Function is the deferred hardening (needs Functions/Blaze).

**Important:** this is **uncommitted-risk code** -- it builds clean but is **untested**, because Firebase
Storage needs the **Blaze plan** (a card on file) to provision a bucket on prod/staging. Nothing deployed.
Legacy/demo Cloudinary URLs still play (kept in CSP); disable the old `phalanx-videos` preset after cutover
is confirmed. Poster thumbnails are graceful-empty for now (polish later).

Plan + PHI data-flow inventory updated to reflect code-complete/untested status.

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
