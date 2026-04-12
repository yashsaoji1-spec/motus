Run the ULP sequence (Update, Log, Push) in full without asking for confirmation at each step. Only stop if something is genuinely ambiguous.

**Step 1 — Understand what changed**
Run in parallel: `git branch` (confirm NOT on main — stop if we are), `git status`, `git diff HEAD`, `git log --oneline -5`. Read the diff carefully to understand what features or fixes are present and why.

**Step 2 — Update deployment files if needed**
Check `wiki/motus/DEPLOYMENT/index.md`. For any item whose status changed based on what was done, update `status` and `updated` in that item's individual file frontmatter, and update the row in `index.md`. Only update items you are confident about.

**Step 3 — Write the Obsidian log entry**
Log file: `~/Library/Mobile Documents/iCloud~md~obsidian/Documents/Yash2/wiki/motus/log/YYYY-MM-DD.md` (today's date). If the file does not exist, create it with frontmatter `type: commit-log` and `date: YYYY-MM-DD`. Append one callout block per logical chunk of work:
```
> [!note]- [Short descriptive title]
> **Files:** [comma-separated relative paths]
> **Why:** [1–2 sentences — product perspective, not implementation]
>
> **What changed:**
> - [one bullet per meaningful change — specific, no filler]
>
> **Deployment checklist:** [only if a checklist item changed status. Omit if nothing changed.]
```
No emojis, no filler words ("successfully", "now works correctly"). Title descriptive enough to find by skimming.

**Step 4 — Commit and push**
Stage all changed files (code files first, then wiki files). Do NOT stage: build artifacts, test-results/, report.html, report.json, .firebase/hosting.*.cache, .env.production, .env.staging. Commit message: one line, present tense, imperative mood, feature/fix level. No emojis. Push to current branch — never main. Confirm with `git log --oneline -3`.

**Step 5 — Report back**
3–5 bullets: what was committed, log entry written, deployment items updated (if any), branch pushed to, any open questions.
