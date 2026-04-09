Fix this bug in Motus: $ARGUMENTS

Before reading any files or touching any code:
1. List every assumption you're making about what's causing this bug
2. List anything you're uncertain about — what triggers it, what the expected vs. actual behavior is, which function is responsible
3. Ask those as a numbered list and wait for answers
4. Do not proceed until you have at least 95% confidence you understand the root cause

Once you have answers, read the relevant code:
1. Find the relevant section in app.js using the Section Map in CLAUDE.md
2. Read only the functions involved — no more
3. Confirm the root cause matches your hypothesis

Then implement the minimal fix. No refactoring, no cleanup, just the fix.

After completing:
- Check if any functions were added, removed, or moved in app.js, index.html, or styles.css
- If yes, update the line numbers in the relevant map page in the wiki (app-js-map.md, index-html-map.md, styles-css-map.md)
