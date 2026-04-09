Build this feature in Motus end to end: $ARGUMENTS

Before reading any files or writing any code:
1. List every assumption you're making about this feature — what triggers it, what it does, where data goes, how it looks, edge cases
2. List any questions where you're uncertain
3. Ask those questions as a numbered list and wait for answers
4. Do not proceed until you have at least 95% confidence you understand what to build

Once you have answers, read the relevant code:
1. Read the relevant sections of app.js (use the Section Map in CLAUDE.md)
2. Read the relevant screens in index.html
3. Check if any Firestore collections are involved — reference the schema in CLAUDE.md

Then build in this order:
1. HTML structure in index.html (if UI needed)
2. CSS in styles.css using existing variables from .claude/rules/ui-rules.md
3. JS logic in the correct section of app.js
4. Add any new functions to the window exports block at the bottom of app.js
5. If Firestore is involved, note any new fields added to the schema

No emojis. No hardcoded colors. Stay in the relevant sections.

After completing:
- Check if any functions were added, removed, or moved in app.js, index.html, or styles.css
- If yes, update the line numbers in the relevant map page in the wiki (app-js-map.md, index-html-map.md, styles-css-map.md)
