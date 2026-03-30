Firestore task for phalanX: $ARGUMENTS

Reference the Firestore collections table in CLAUDE.md for schema.
Reference firestore.rules for permission context.

If reading data: use the existing async Firestore helpers in Section 1 of app.js — do not write raw Firestore calls.
If writing data: check what fields already exist on the document before adding new ones.
If schema is changing: note the backward-compat pattern (old docs must still work).
