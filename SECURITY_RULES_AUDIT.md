# Firestore Security Rules Audit

Generated with the `firebase-security-rules-auditor` skill
(firebase/agent-skills). Scope: `firestore.rules`, `storage.rules`.

## Assessment (JSON)

```json
{
  "score": 2,
  "summary": "The rules are thoughtfully structured with DB-sourced roles, immutable role fields, and per-collection ownership checks. However two authenticated-therapist privilege/integrity bypasses were found: a clinic member could escalate to clinic owner during a join/leave write, and any therapist could hijack another therapist's connect-by-code mapping. Both are fixed in this change. Remaining lower-severity items (co-patient roster PII exposure, sparse type checks, unbounded writes on trusted-role collections) are documented below.",
  "findings": [
    {
      "check": "Field-Level vs. Identity-Level Security",
      "severity": "major",
      "issue": "clinics/{clinicId} update: the non-owner therapist branch validated only the `therapists` array transition and placed no restriction on other keys. A member could add their own email (a legal join) while simultaneously setting ownerEmail to themselves in the same write, escalating to clinic owner and gaining full update/delete plus clinicLibrary control.",
      "recommendation": "Require request.resource.data.diff(resource.data).affectedKeys().hasOnly(['therapists']) on the non-owner branch so join/leave can touch nothing but the membership array. FIXED."
    },
    {
      "check": "Field-Level vs. Identity-Level Security",
      "severity": "major",
      "issue": "therapistCodes/{code} used a single `allow write` gated only on request.resource.data.email == myEmail(). Because the check is on the NEW value, any therapist could overwrite an EXISTING code document owned by another therapist and point it at themselves, hijacking connect-by-code so a patient intending to connect to therapist A is connected to the attacker.",
      "recommendation": "Split write into create/update/delete. On update require resource.data.email == myEmail() (ownership of the existing doc) as well. FIXED."
    },
    {
      "check": "Business Logic vs. Rules / PII exposure",
      "severity": "moderate",
      "issue": "connections/{therapistEmail} read allows any patient listed in resource.data.patients to read the whole document, exposing the full roster of co-patients' emails for that therapist. In a health app, revealing who else is a patient of a given therapist is a PHI-adjacent disclosure.",
      "recommendation": "Do not expose the roster to patients. Serve the patient's own connection status via a Cloud Function or a per-patient mirror doc, and restrict connections reads to the owning therapist + admin. Not changed here (would require a client read-path change)."
    },
    {
      "check": "PII exposure",
      "severity": "moderate",
      "issue": "users/{email} read allows any patient to read the full user document of anyone whose role == 'therapist', including all therapist demographic/profile fields, not just name.",
      "recommendation": "Expose only display fields needed for discovery (name, code) via a projected public profile doc, keeping the full user doc private. Accepted trade-off for connect-by-code today; documented."
    },
    {
      "check": "Type Safety",
      "severity": "minor",
      "issue": "Most fields are not type-checked (no `is string` / `is int` / `is timestamp`). Only a few size limits exist (messages.text <= 2000, sessions.notes <= 1000).",
      "recommendation": "Add is-type assertions on security-relevant fields (role, participants, patientEmail, email) and on writable clinical fields."
    },
    {
      "check": "Storage Abuse / Resource Exhaustion",
      "severity": "minor",
      "issue": "protocols, calibration, clinicalNotes, jointTracking, therapistLibrary, clinicLibrary, trainingChunks use `allow write` with no size/shape validation. Writers are trusted roles (therapist/admin), limiting exposure, but there is no document-size or array-length ceiling.",
      "recommendation": "Add size/length bounds to bulk-writable collections to cap resource-exhaustion risk from a compromised therapist account."
    },
    {
      "check": "Storage rules review",
      "severity": "minor",
      "issue": "storage.rules correctly locks session videos to the owner and enforces a 200MB / video-content-type ceiling; therapist access to patient videos relies on the tokenized download URL stored in the Firestore session doc. contentType.matches trusts the client-declared MIME type.",
      "recommendation": "Proceed with the planned getSignedVideoUrl Cloud Function (noted in storage.rules) so direct reads can be denied entirely; treat declared contentType as advisory only."
    }
  ]
}
```

## What was fixed in this change

- **clinics ownerEmail escalation (major)** — join/leave now constrained to
  `hasOnly(['therapists'])`.
- **therapistCodes hijack (major)** — `write` split into `create`/`update`/`delete`;
  `update`/`delete` now require ownership of the existing doc.

Both fixes were verified against `code/app.js` to confirm they do not break the
legitimate join/leave and code-generation flows (those only ever mutate the
`therapists` array and only ever write the therapist's own code doc).

## Not changed (documented, needs a client-side change or product decision)

- Co-patient roster PII exposure via `connections` reads (moderate).
- Full therapist-doc read access for patients (moderate).
- Sparse type checks and unbounded trusted-role writes (minor).
