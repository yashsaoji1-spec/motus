# Plugin Usage Guide

At the start of every session, read this file to understand which plugins/skills are available and when to use them.

## Rules

- Do NOT invoke a plugin/skill on every prompt — only when the request clearly matches the trigger conditions below.
- When a trigger condition is met, invoke the corresponding skill BEFORE generating any response about the task.

---

## Plugin Trigger Map

### frontend-design
**Trigger when:** User asks about UI layout, styling, formatting, moving elements around, changing how something looks, redesigning a screen or component, spacing, alignment, colors, or visual polish.
**Examples:** "move the button to the right", "make this look better", "format the layout", "center this", "redesign the capture screen"

### auto-style
**Trigger when:** New HTML elements, screens, or components are being added to index.html and need styling.
**Examples:** "add a new panel", "create a new section", "add a card component"

### code-review
**Trigger when:** User explicitly asks for a review of code quality, structure, or correctness.
**Examples:** "review this", "look over my code", "what do you think of this implementation", "any issues with this?", "code review"

### simplify
**Trigger when:** User asks to clean up, simplify, refactor, or improve existing code quality.
**Examples:** "simplify this", "clean this up", "refactor", "this feels messy", "make this cleaner"

### commit-commands
**Trigger when:** User asks to commit changes, stage files, or anything git-commit related.
**Examples:** "commit this", "make a commit", "save my changes"

### github
**Trigger when:** User asks about PRs, issues, branches, or anything GitHub-related beyond basic git.
**Examples:** "create a PR", "open an issue", "check the PR status"

### firebase
**Trigger when:** User asks about Firebase config, Firestore queries, Firebase Auth, storage rules, or deployment via Firebase.
**Examples:** "deploy to Firebase", "check my Firestore rules", "Firebase auth issue"

### superpowers
**Trigger when:** User asks for advanced agentic capabilities, complex multi-step autonomous tasks, or anything that feels beyond a standard single-step response.
**Examples:** "figure this out end to end", "autonomously fix all the bugs", "take over and handle this"

### context7
**Trigger when:** User asks about library/framework documentation, API references, or "how does X work" for an external dependency.
**Examples:** "how do I use MediaPipe's pose API", "what does this Firebase method do", "look up the Chart.js docs"

### chrome-devtools-mcp
**Trigger when:** User asks to inspect, debug, or profile something in the browser — DOM, network, console errors, performance.
**Examples:** "check the console errors", "inspect the DOM", "debug why this isn't rendering"

### no-slop
**Auto-triggers on ALL code generation and modification tasks.** Ensures code looks human-written — no over-commenting, no unnecessary abstractions, no AI-coded patterns.

### production-code
**Auto-triggers whenever writing or modifying app.js, index.html, or styles.css.** Ensures every line is deployment-ready — no TODOs, no placeholders, no shortcuts.
