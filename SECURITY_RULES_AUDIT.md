# Firestore Security Rules Audit

Generated with the `firebase-security-rules-auditor` skill
(firebase/agent-skills). Scope: `firestore.rules`, `storage.rules`.

Two audit rounds have been run. Round 1 fixed two authenticated-therapist
privilege bypasses. Round 2 fixed the remaining moderate findings plus three
issues discovered while red-teaming the round-2 changes themselves.

## Assessment (JSON) — round 2, current rules

```json
{
  "score": 4,
  "summary": "All critical/major/moderate findings from both rounds are fixed: no privilege escalation, no cross-user data leaks, no validation bypasses found against the current rules. Reads are ownership- or connection-scoped per collection, roles are DB-sourced and immutable to non-admins, and field-level diff() guards are paired with identity checks. Remaining items are minor: the patient→therapist connection is client-asserted (by design, pending a server-side code check), trusted-role collections lack size ceilings, and type coverage is partial.",
  "findings": [
    {
      "check": "Authority Source",
      "severity": "minor",
      "issue": "The patient→therapist connection itself is client-asserted: rules let any patient append themselves to any therapist's connections doc and set their own therapistEmail, because the connect-code check happens client-side. A patient who knows a therapist's email can connect without the code, which also grants read access to that one therapist's user doc.",
      "recommendation": "Verify the connect code server-side (Cloud Function writes the connection), then drop the patient-append branch from connections update/create."
    },
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
      "issue": "storage.rules locks session videos to the owner with a 200MB/video-content-type ceiling; therapist access rides on the tokenized download URL in the Firestore session doc, and contentType.matches trusts the client-declared MIME type.",
      "recommendation": "Proceed with the planned getSignedVideoUrl Cloud Function so direct reads can be denied entirely; treat declared contentType as advisory only."
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
  exact code (`getTherapistForCode` / `getOrCreateTherapistCode` — no list query
  anywhere in the client), but the rule also let any patient enumerate the whole
  collection and scrape every therapist's email — partially undoing the
  therapist-doc read restriction above. Split into `allow get` only (no `list`).
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
