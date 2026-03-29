# Maintenance

When Yash says "update CLAUDE.md" or similar — update the relevant sections of `CLAUDE.md` directly (Screen System table, Section Map, etc.). Audit app.js, index.html, styles.css for changes. Never commit unless explicitly asked.

## Branch Merge Framework

When the user says anything like "merge", "Oliver is done", "integrate Oliver's changes", or pastes this section — follow this framework exactly. **Check in with Yash or Oliver at every step before proceeding.**

### When Yash merges feature/functionality → main

1. **Ask:** "Are you sure your branch is ready to merge? Any uncommitted changes?"
2. `git fetch origin`
3. `git checkout main && git merge --no-commit --no-ff origin/feature/functionality`
4. Show a summary of what changed. **Ask:** "Does this look right? Anything unexpected?"
5. If yes — `git add` + `git commit` + `git push origin main`
6. **Confirm:** "Pushed to main. Ready for Oliver to merge when he's done."

---

### When Oliver merges feature/ui → main

**Phase 1 — Confirm Oliver is ready**
- **Ask Oliver/Yash:** "Has Oliver pushed all his changes to `origin/feature/ui`? Should I fetch now?"
- `git fetch origin`
- Show the latest commits on `feature/ui`. **Ask:** "Are these the changes you expected?"

**Phase 2 — Preview conflicts**
- `git merge-tree $(git merge-base main origin/feature/ui) main origin/feature/ui > /tmp/merge_dry_run.txt`
- Present every conflict in a clear table: Yash's version vs Oliver's version, with a plain-English description of what each side does
- **Ask for each conflict:** "For [conflict #N], do you want to keep Yash's version, Oliver's version, or both?"
- Do not proceed until every conflict has a decision

**Phase 3 — Do the merge**
- `git checkout main`
- `git merge --no-commit --no-ff origin/feature/ui`
- Apply each resolution as decided — one conflict at a time
- After each file is resolved, **confirm:** "I've resolved [filename]. Here's what it looks like now — does this match what you expected?"
- After all files resolved, grep for critical functionality (key functions, constants, HTML elements that must be preserved). **Ask:** "Everything looks intact — should I commit?"
- `git add` + `git commit` + `git push origin main`
- **Confirm:** "Merged and pushed. Ready to test."

**Phase 4 — Test**
- `cd phalanX-test && git pull origin main && npm run dev`
- **Ask Yash:** "Dev server is running. Please test both your features and Oliver's. Let me know what you find."
- Only deploy after Yash confirms everything works

---

**Rules Claude must follow during merges:**
- Never let git auto-resolve — always use `--no-commit`
- Never move to the next phase without explicit confirmation from Yash
- If anything looks unexpected after any step, stop and ask before continuing
- After every push, verify critical code wasn't silently dropped before declaring done

## SWEEP CALIBRATION — Rule Tuning Workflow

Rules apply universally to any patient — they describe camera geometry (which angles give accurate MediaPipe readings), not patient-specific anatomy.

**Setup**
1. Open app on phone, log in as therapist, open any patient, tap "Sweep Calibration"
2. METRICS panel and live angle grid must be visible (`SWEEP_DEBUG = true`)

**For each joint:**
3. Hold your own finger at a known angle using a goniometer or reference (e.g. flat = 0°, right angle = 90°)
4. Keep the finger still — move the camera until the live angle reading on screen matches the true angle
5. Screenshot the screen (must show METRICS panel + angle grid)
6. Move camera to another position where it still reads correctly — screenshot again
7. Repeat 3–5 times from different valid positions
8. Send all screenshots to Claude with: which joint, what true angle

**Claude derives the rule:**
- Reads all 7 metric values from each screenshot
- Identifies which metric is consistently high across all valid frames
- Sets `min` = lowest observed value − 0.05 tolerance, `max` = 1.0
- Writes rule into `SWEEP_JOINT_RULES` in `app.js`, builds + deploys to Firebase

**Testing after deploy:**
- Dot turns yellow (in-range) when orientation satisfies the rule
- Dot turns green (captured) after 5 consecutive valid frames
- Start with `index-pip` — most clinically important, easiest to measure

**`SWEEP_JOINT_RULES` location:** `code/app.js` line ~3072

---

## Pre-Launch Checklist

- [ ] **Tighten Firestore security rules** — current rules allow any authenticated user to read/write everything. Before launch, scope rules so patients can only read/write their own data, therapists can only access their connected patients, and admins can only access the `users` collection.
- [ ] **Delete demo accounts** — remove `sarah.chen@mayoclinic.org` and `james.park@gmail.com` from Firebase Auth and Firestore, or change their passwords.
- [ ] **Create first real admin account** — follow the manual steps in the Firestore Role Values section above.
- [x] **Test on HTTPS / mobile** — tested via ngrok + VS Code port forwarding on iOS Safari and Chrome. Mobile uses direct `getUserMedia` path (not MediaPipe `Camera` class). `startCamera()` must be called before any `await` in session-start functions to preserve iOS gesture context. iOS Safari requires `hands.send({ image: canvas })` — passing the video element directly does not work; video must be drawn to a canvas first.
- [ ] **Review Firebase Auth settings** — disable any sign-in providers you're not using.
- [ ] **Set up video expiry Cloud Function** — currently the 30-day expiry is UI-only (files remain on Cloudinary but are inaccessible through the app). For actual deletion at launch: (1) upgrade Firebase project `phalanx-firebase-database` to Blaze plan at https://console.firebase.google.com/project/phalanx-firebase-database/usage/details — free in practice, just requires a billing account attached; (2) tell Claude "set up the video expiry Cloud Function" — it will create `functions/index.js` with a daily scheduled job that deletes Cloudinary videos older than 30 days and clears `videoUrl` from Firestore. Cloudinary credentials: cloud `dslbugsdg`, API key `853184729123867`, API secret in Yash's password manager.
