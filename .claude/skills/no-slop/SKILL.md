---
name: no-slop
description: >
  Prevent generic AI-generated code patterns. Auto-triggers on ALL code
  generation and modification tasks. Eliminates over-commenting, over-engineering,
  unnecessary abstractions, and patterns that scream "an AI wrote this."
  Code must look like Yash or Oliver wrote it.
---

# Anti-Slop — Write Like a Human

PhalanX was built by two developers (Yash and Oliver) with a clear, direct
coding style. Match it exactly. Every line you write should be indistinguishable
from what they'd write.

## What AI Slop Looks Like (NEVER do these)

### Over-commenting
```js
// BAD — AI slop
// Get the user's email from the current user object
const email = currentUser.email;
// Check if the email exists
if (email) {
  // Query the database for the user's connections
  const snap = await db.collection('connections').doc(email).get();
}
```
```js
// GOOD — PhalanX style
const email = currentUser.email;
if (email) {
  const snap = await db.collection('connections').doc(email).get();
}
```

**Rule:** Only comment *why*, never *what*. If the code needs a comment to
explain what it does, the code itself is unclear — fix the code instead.

### Unnecessary abstractions
```js
// BAD — AI slop
class FirestoreRepository {
  constructor(collectionName) { this.collection = collectionName; }
  async getById(id) { return db.collection(this.collection).doc(id).get(); }
  async save(id, data) { return db.collection(this.collection).doc(id).set(data); }
}
const userRepo = new FirestoreRepository('users');
```
```js
// GOOD — PhalanX style (direct Firestore calls, no wrapper)
const snap = await db.collection('users').doc(email).get();
```

**Rule:** PhalanX has zero classes. Don't introduce them. Use plain functions
and direct Firestore calls — the firebase SDK is already the abstraction layer.

### Over-engineering
```js
// BAD — AI slop
const BUTTON_STATES = Object.freeze({ IDLE: 'idle', LOADING: 'loading', ERROR: 'error' });
const createStateMachine = (initialState) => { /* 40 lines of state machine */ };
```
```js
// GOOD — PhalanX style
btn.disabled = true;
btn.textContent = 'Saving...';
```

**Rule:** Use the simplest approach that works. PhalanX toggles CSS classes
and sets `.textContent`. That's the pattern. Follow it.

### Sycophantic variable naming
```js
// BAD — AI slop
const elegantlyFormattedDateString = new Date().toISOString().slice(0, 10);
const comprehensivePatientDataObject = { name, email, role };
```
```js
// GOOD — PhalanX style
const today = new Date().toISOString().slice(0, 10);
const patient = { name, email, role };
```

### Feature creep
**Rule:** Implement exactly what was asked. Nothing extra. Don't add:
- Undo functionality nobody requested
- Confirmation dialogs for non-destructive actions
- Analytics tracking
- Accessibility features beyond what already exists (unless asked)
- Loading skeletons when a simple "Loading..." works
- Transition animations nobody asked for

### Filler phrases in UI text
```html
<!-- BAD -->
<p>It looks like you haven't connected with a therapist yet. Get started by entering your therapist's code below!</p>
<!-- GOOD — PhalanX style -->
<p>No therapist connected. Enter your therapist's code below.</p>
```

## PhalanX Code DNA (match this)

Study these patterns from the actual codebase:

- **Terse function bodies** — most functions are 5-20 lines
- **No semicolon debates** — semicolons everywhere, be consistent
- **`let`/`const`** — never `var`
- **Template literals** for HTML generation — backtick strings with `${}`
- **Direct DOM manipulation** — `getElementById`, `.innerHTML`, `.textContent`
- **Flat structure** — no nesting beyond 3 levels
- **Section banners** — `/* ══ SECTION N: ... ══ */` for organization
- **Arrow functions** for short callbacks, `function` keyword for named exports
- **Async/await** everywhere — zero `.then()` chains

## Output Efficiency

These rules apply to both code AND text responses:

### Be Direct
- Lead with the answer or action, not reasoning
- Don't restate what the user said — just do it
- If you can say it in one sentence, don't use three
- Skip filler: "Let me...", "I'll go ahead and...", "Sure, I can..."

### Minimize Token Waste
- Don't echo back code you just read — reference by file:line instead
- Don't explain changes that are obvious from the diff
- Don't enumerate every file you're about to read — just read them
- When multiple tool calls are independent, run them in parallel

### Avoid Redundant Work
- Don't re-read files you read earlier in the same session
- Don't search for things you already know the location of
- Use Glob/Grep directly for simple searches, not subagents
- Use `@file` references when the user provides them — don't re-read manually

### Progressive Disclosure
- For large tasks, plan first (plan mode), then implement
- Don't dump 200 lines of explanation before writing code
- Status updates at milestones only, not every step
- Focus text on: decisions needing input, blockers, and results

## Self-Check

Before finishing ANY code edit, verify:
- [ ] No comment explains what the next line does
- [ ] No new class, enum, or type system introduced
- [ ] No wrapper/utility function that's called from only one place
- [ ] No feature beyond what was explicitly requested
- [ ] Variable names are short and obvious (not "descriptive essay" names)
- [ ] UI text is direct — no filler words, no exclamation marks, no emoji
- [ ] The diff would pass as human-written in a blind review
- [ ] Response text is concise — no unnecessary preamble or restating
