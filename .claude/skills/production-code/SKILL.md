---
name: production-code
description: >
  Enforce production-grade code output for PhalanX. Auto-triggers whenever
  writing or modifying app.js, index.html, or styles.css. Ensures every line
  is deployment-ready — no TODOs, no placeholders, no shortcuts, no demo stubs.
---

# Production-Grade Code — PhalanX

Every piece of code you write will be deployed to real patients and therapists
at https://phalanx-firebase-database.web.app. Treat every edit as production.

## Hard Rules

1. **No placeholders** — never write `// TODO`, `// FIXME`, `/* implement later */`,
   `placeholder`, `lorem ipsum`, or stub functions that return hardcoded values.
   If something needs implementing, implement it now.

2. **No demo/mock data** — never insert fake data inline. All data comes from
   Firestore. If you need seed data, say so — don't embed it in app.js.

3. **Complete error handling** — every `async` Firestore call gets `try/catch`.
   Errors show user-facing feedback (set `.textContent` on an error div), not
   just `console.error`. Network failures, missing docs, auth expiry — handle
   them all.

4. **Edge cases first** — before writing the happy path, list edge cases:
   - What if the Firestore doc doesn't exist?
   - What if the array is empty?
   - What if the user navigates away mid-operation?
   - What if the device is offline?
   Handle each one explicitly.

5. **Real loading states** — show a spinner or "Loading..." text during async
   operations. Never leave the user staring at a blank screen.

6. **No dead code** — don't leave commented-out blocks, unused variables, or
   functions that nothing calls. If it's not needed, delete it.

7. **Defensive DOM access** — check `document.getElementById()` results before
   using them. The single-page app means elements may not be in the DOM when
   you expect.

8. **Proper cleanup** — if you add event listeners, intervals, or MediaPipe
   instances, ensure they're cleaned up on screen transitions via `showScreen()`.

9. **Mobile-first** — PhalanX is used on phones during rehab sessions. Every
   UI must work on 375px width. Touch targets minimum 44px. No hover-only
   interactions.

10. **Atomic operations** — Firestore writes that update multiple docs should
    use batched writes. Never leave data in an inconsistent state if one write
    fails.

## Async & Performance Patterns

### Parallel Firestore Reads
When fetching independent data, use `Promise.all` — never sequential awaits:
```js
// BAD — sequential, slow
const sessions = await getSessions(email);
const protocols = await getProtocols(email);
const joints = await loadTrackedJoints(email);

// GOOD — parallel, fast
const [sessions, protocols, joints] = await Promise.all([
  getSessions(email),
  getProtocols(email),
  loadTrackedJoints(email)
]);
```

### Avoid Redundant Reads
Don't fetch data you already have in scope. Pass data through function parameters
rather than re-querying Firestore:
```js
// BAD — refetches data already loaded by caller
async function renderCharts(email) {
  const sessions = await getSessions(email); // already loaded above!
  ...
}

// GOOD — accept data as parameter
function renderCharts(sessions) {
  ...
}
```

### Debounce Expensive Operations
For user-triggered actions that hit Firestore (search, joint selection, form input),
debounce to avoid hammering the database:
```js
let debounceTimer;
function onUserInput() {
  clearTimeout(debounceTimer);
  debounceTimer = setTimeout(() => saveToFirestore(), 800);
}
```

### DOM Batch Updates
When building large HTML strings (therapist panel, exercise list), build the
complete HTML first, then set `.innerHTML` once — not in a loop:
```js
// BAD — multiple reflows
items.forEach(item => {
  container.innerHTML += `<div>${item.name}</div>`;
});

// GOOD — single reflow
container.innerHTML = items.map(item => `<div>${item.name}</div>`).join('');
```

### Chart.js Cleanup
Always destroy existing Chart.js instances before creating new ones to prevent
memory leaks:
```js
if (chartInstance) chartInstance.destroy();
chartInstance = new Chart(ctx, config);
```

### MediaPipe Resource Management
`showScreen()` already stops `mpCamera` when leaving `cameraScreen`. If adding
new camera-using screens, ensure the same cleanup pattern. Never leave
`getUserMedia` streams running when not visible.

## Quality Checklist (self-verify before finishing)

- [ ] No `// TODO` or `// FIXME` anywhere in the diff
- [ ] Every async call has try/catch with user-visible error feedback
- [ ] Every new function is exported in the `Object.assign(window, {...})` block if called from HTML
- [ ] Loading states shown during network requests
- [ ] Empty states handled (no data yet, no patients connected, etc.)
- [ ] Works on mobile viewport (375px)
- [ ] No console.log left (use console.error for actual errors only)
- [ ] Screen transitions clean up resources (camera, timers, listeners)
- [ ] Independent Firestore reads use Promise.all, not sequential awaits
- [ ] No redundant Firestore reads — pass data through parameters
- [ ] Chart.js instances destroyed before re-creation
