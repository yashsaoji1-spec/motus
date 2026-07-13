# Firestore Security Rules Audit

Generated with the `firebase-security-rules-auditor` skill
(firebase/agent-skills). Scope: `firestore.rules`, `storage.rules`.

Three audit rounds have been run. Round 1 fixed two authenticated-therapist
privilege bypasses. Round 2 fixed the moderate findings plus three issues
discovered while red-teaming the round-2 changes. Round 3 (final pass) closed
therapistCodes enumeration and made the patient→therapist connection
server-authoritative, which also eliminated the last cross-user read vector.

## Assessment (JSON) — round 3, current rules

```json
{
  "score": 5,
  "summary": "All critical/major/moderate findings across three rounds are fixed and no cross-user read/write or privilege-escalation vector remains: roles and the patient→therapist connection are both authoritative (DB-sourced role, connectByCode Cloud Function the sole writer of therapistEmail and roster membership), reads are ownership/connection-scoped per collection, and field-level diff() guards are paired with identity checks. Remaining items are minor and require no rule change to be safe: trusted-role (connected therapist/admin) collections lack document-size ceilings, global ML collections are writable by any approved therapist, and type coverage beyond security-relevant fields is partial.",
  "findings": [
    {
      "check": "Storage Abuse / Resource Exhaustion",
      "severity": "minor",
      "issue": "protocols, calibration, jointTracking, therapistLibrary, clinicLibrary, trainingChunks still use unbounded `allow write` for trusted roles (connected therapist/admin). messages.text (2000), sessions.notes (1000) and clinicalNotes.html (50000) are now bounded.",
      "recommendation": "Add size/shape ceilings to the remaining bulk-writable collections to cap abuse from a compromised therapist account."
    },
    {
      "check": "Field-Level vs. Identity-Level Security",
      "severity": "minor",
      "issue": "Any approved therapist (not just the involved one) can write the global mlModels, trainingChunks and trainingMeta collections, so one compromised therapist account could poison shared model data.",
      "recommendation": "Scope training/model writes to clinic membership or move them behind a Cloud Function."
    },
    {
      "check": "Type Safety",
      "severity": "minor",
      "issue": "Type checks now cover the fields the rules themselves depend on (participants lists, from/to, patientEmail, text/notes/html strings, code-doc shape), but most other document fields remain untyped.",
      "recommendation": "Extend is-type assertions to writable clinical fields as they become security-relevant."
    },
    {
      "check": "Storage rules review",
      "severity": "minor",
      "issue": "storage.rules locks session videos to the owner with a 200MB/video-content-type ceiling. Therapist access is served by the getSignedVideoUrl Cloud Function (already deployed), which authorizes the caller and returns a 15-minute signed URL, so direct-path reads stay owner-only. contentType.matches still trusts the client-declared MIME type.",
      "recommendation": "No rule change needed. Treat declared contentType as advisory only; optionally verify magic bytes server-side if untrusted uploads become a concern."
    }
  ]
}
```

## Fixed in round 2 (this change)

- **Co-patient roster PII exposure (moderate)** — patients could read their
  therapist's entire `connections` doc, exposing every co-patient's email (a
  PHI-adjacent disclosure of who is in therapy). Verified against `code/app.js`
  that no patient code path reads `connections` — reads are now owner+admin only.
- **Full therapist-doc read access for patients (moderate)** — any patient could
  read any user doc with `role == 'therapist'` (including a role query scan).
  Patients can now read exactly one therapist doc: their own connected
  therapist (`role == 'therapist' && users/{me}.therapistEmail == docId`).
  Connect-by-code no longer reads therapist docs pre-connection: the
  `therapistCodes` doc (creatable only by the therapist it names) proves the
  code is real, and the client fetches the name after the connection is saved.
  The legacy hash-scan fallback in `getTherapistForCode` was removed — a code
  whose therapist never opened the Clinic Code screen resolves as "not found"
  until they view it once (which creates the code doc).
- **Self-assigned therapistEmail read leak (found red-teaming round 2's own
  fix)** — `therapistEmail` is self-writable, so without the added
  `resource.data.role == 'therapist'` guard a patient could point it at any
  user's email and read that doc, including other patients'.
- **Message sender forgery (moderate, new finding)** — messages create only
  required the sender to be a participant, so either participant could forge a
  message with `from` set to the other party. `from == myEmail()` is now pinned.
- **Thread squatting / archived-flag abuse (moderate, new finding)** —
  `messageThreads` create never tied the doc id to its participants, so anyone
  could pre-create `messageThreads/{a:b}` for two other users with
  `archived: true` and block their messaging. The doc id must now be the
  canonical sorted id of its own participants, which must include the caller.
- **Archived-thread bypass (moderate, new finding)** — `threadId` was optional
  on messages create, so a sender could omit it (or point it at a different
  thread) and keep messaging after a disconnect archived the thread. `threadId`
  is now required and must be the canonical id for the participants.
- **Patient-initiated disconnect was rule-broken (business logic)** — the
  patient branch of `connections` update only allowed *appending* self, but
  `disconnectFromTherapist()` arrayRemoves the caller from the roster, so the
  flow failed with permission-denied. The branch now allows add-self OR
  remove-self, with `affectedKeys().hasOnly(['patients'])` so nothing else can
  ride along.
- **therapistCodes enumeration / therapist-email harvest (moderate, found on
  final pass)** — `therapistCodes` used `allow read: if isAuth()`, which covers
  both get-by-id and list. Connect-by-code only ever reads a single doc by its
  exact code (`getOrCreateTherapistCode` — no list query anywhere in the client),
  but the rule also let any patient enumerate the whole collection and scrape
  every therapist's email — partially undoing the therapist-doc read restriction
  above. Split into `allow get` only (no `list`).
- **Client-asserted patient→therapist connection (round 3)** — the rules let any
  patient append themselves to any therapist's `connections` roster and self-set
  their own `therapistEmail`, because the connect-code check ran only client-side.
  A patient who knew a therapist's email could connect without the code, and —
  because `isMyTherapist` keys off the patient's own `therapistEmail` — could read
  any therapist's user doc by pointing `therapistEmail` at it (one at a time),
  partly undoing the round-2 therapist-doc restriction. Now server-authoritative:
  a new `connectByCode` Cloud Function verifies the caller is a patient and the
  code maps to a real therapist, then writes the roster entry and `therapistEmail`
  with admin privileges. Rules were tightened so `connections` has no patient
  create/add-self path (patients may only *remove* themselves on disconnect) and a
  patient self-write can keep or clear `therapistEmail` but never set/change it.
  `therapistEmail` is now genuinely authoritative, so `isMyTherapist` means a real
  connection. `getTherapistForCode`/`saveConnection` client helpers removed.
- **Roster griefing via disconnect (round 3, found red-teaming the above)** — the
  patient disconnect branch allowed any patients-only change that left the caller
  a subset, which also let a patient *remove other patients* from a shared roster
  as long as they left themselves in. Tightened to force `new == old \ {me}`
  (self must be absent from the new list; nothing added; nothing but self removed).
- **Type/shape hardening (minor)** — participants must be a 2-element list on
  messages/messageThreads create; `to`/`text`/`notes`/`patientEmail` typed;
  `clinicalNotes.html` bounded at 50k chars (delete split out so it still
  works); `therapistCodes` docs restricted to `keys().hasOnly(['email'])`
  since they are readable by every signed-in user.

All round-2 fixes are covered by emulator tests in
`tests/rules/security.test.js` (25 passing).

## Fixed in round 1

- **clinics ownerEmail escalation (major)** — join/leave now constrained to
  `hasOnly(['therapists'])`, blocking a member from setting `ownerEmail=self`
  in the same write.
- **therapistCodes hijack (major)** — `write` split into `create`/`update`/
  `delete`; `update`/`delete` require ownership of the existing doc, blocking
  connect-by-code hijacking.
