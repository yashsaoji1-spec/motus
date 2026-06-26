# Motus Load-Speed Pass — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Cut the Motus web app's first-load cost by moving non-critical JavaScript off the critical path, without changing behavior.

**Architecture:** Vite-bundled SPA, single entry `code/app.js` (8,231 lines), Firebase Hosting. Today everything ships in one ~1 MB (318 KB gzip) JS chunk loaded eagerly on the login screen. We keep `firebase/compat` (no modular migration) and instead (a) convert Chart.js, Sentry, and the non-critical Firebase modules (analytics, storage, functions) to dynamic `import()` so Vite splits them into separate chunks loaded on demand, (b) add `Cache-Control` headers for repeat visits, and (c) split the eager Firebase core into its own cacheable vendor chunk.

**Tech Stack:** Vite 8, Firebase compat SDK 10.x, Chart.js, @sentry/browser, Firebase Hosting.

## Global Constraints

- Base branch: `perf/load-speed`, off `feature/ui-clarity-audit-on-main` @ `e6f6e7e` (the deployed production code). Do **not** rebase onto `main` (329 commits stale).
- **No behavior changes.** Keep `firebase/compat`; do not migrate to modular. Keep eager: `app`, `auth`, `firestore`, `app-check`.
- Preserve Sentry's `stripPHI` `beforeSend` scrubbing and its prod/staging-only gating (`import.meta.env.PROD && VITE_SENTRY_DSN`).
- Preserve analytics prod-only gating (`import.meta.env.PROD`).
- **No frontend unit-test harness exists** (`npm test` is a stub). Per-task verification is `npm run build` + inspecting chunk output. Regression gate is the existing Playwright e2e (`npm run test:e2e`) + manual smoke on the preview channel. Do not fabricate unit tests.
- Agent never deploys to production. Verification deploy is a Firebase **preview channel** only.
- All commits end with the `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>` trailer.

---

### Task 1: Capture baseline build metrics

**Files:**
- Create: `docs/superpowers/plans/baseline-build.txt`

**Interfaces:**
- Produces: a committed record of pre-change chunk sizes for before/after comparison.

- [ ] **Step 1: Build and capture sizes**

Run:
```bash
cd /Users/mini/phalanX && npm run build 2>&1 | tee docs/superpowers/plans/baseline-build.txt
```
Expected output includes a single large JS chunk, approximately:
```
dist/assets/index-*.js   1,040 kB │ gzip: 318 kB
dist/assets/index-*.css    159 kB │ gzip:  26 kB
dist/index.html             95 kB │ gzip:  19 kB
```

- [ ] **Step 2: Commit the baseline**

```bash
cd /Users/mini/phalanX
git add docs/superpowers/plans/baseline-build.txt
git commit -m "chore: capture baseline build metrics for load-speed pass"
```

---

### Task 2: Dynamic-import Chart.js

**Files:**
- Modify: `code/app.js:14` (remove static import), `code/app.js:5980-5996` (`renderPainChart`)

**Interfaces:**
- Produces: `getChart()` → `Promise<typeof Chart>`, a cached loader for the Chart.js default export.

- [ ] **Step 1: Remove the static Chart import**

Delete line 14:
```js
import Chart from 'chart.js/auto';
```

- [ ] **Step 2: Add a cached lazy loader**

Add near the top of `app.js`, after the remaining imports (around line 15):
```js
// ── Chart.js: loaded on demand (progress screen only) ──
let _chartPromise;
function getChart() {
  if (!_chartPromise) _chartPromise = import('chart.js/auto').then(m => m.default);
  return _chartPromise;
}
```

- [ ] **Step 3: Make `renderPainChart` async and await the loader**

In `code/app.js`, change the signature and the `new Chart` line:
```js
async function renderPainChart(sessions, days, canvasId) {
  canvasId = canvasId || 'painChart';
  const canvas = document.getElementById(canvasId);
  if (!canvas) return;
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - days);
  cutoff.setHours(0, 0, 0, 0);
  const filtered = sessions.filter(s => new Date(s.date) >= cutoff);
  const chartSessions = filtered.length > 0 ? filtered : sessions.slice(-1);
  const painData = chartSessions.map(s => s.pain || 0);
  const labels = buildChartLabels(chartSessions);
  const cfg = buildChartConfig(painData, { type: 'pain', color: '#ef4444', fillColor: 'rgba(239,68,68,0.06)' });
  const Chart = await getChart();
  if (_painChartInstances[canvasId]) _painChartInstances[canvasId].destroy();
  _painChartInstances[canvasId] = new Chart(canvas.getContext('2d'), {
    type: 'line', data: { labels, datasets: [cfg.dataset] }, options: cfg.options
  });
}
```
Note: callers invoke `renderPainChart(...)` fire-and-forget; the chart now paints one microtask later after the dynamic import resolves. This is acceptable and requires no caller changes.

- [ ] **Step 4: Build and verify Chart.js split out**

Run:
```bash
cd /Users/mini/phalanX && npm run build 2>&1 | grep -E "assets/.*\.js"
```
Expected: a new separate chunk for Chart.js (e.g. `assets/chart*-*.js` or a hashed chunk ~70 kB gzip), and the entry `index-*.js` gzip dropped by roughly that amount.

- [ ] **Step 5: Commit**

```bash
cd /Users/mini/phalanX
git add code/app.js
git commit -m "perf: lazy-load Chart.js on progress screen render"
```

---

### Task 3: Defer Sentry to post-paint with an error queue

**Files:**
- Modify: `code/app.js:15` (remove static import), `code/app.js:29-36` (replace `Sentry.init`). Leave the 5 `Sentry.captureException(...)` call sites (lines 565, 987, 2433, 2639, 3187) and line 8148 unchanged.

**Interfaces:**
- Produces: a module-level `Sentry` stub object with `captureException(err, ctx)` that queues until the real SDK loads, so existing call sites keep working unchanged.
- Consumes: `stripPHI(event)` (already defined above the init block — keep it where it is).

- [ ] **Step 1: Remove the static Sentry import**

Delete line 15:
```js
import * as Sentry from '@sentry/browser';
```

- [ ] **Step 2: Replace the `Sentry.init({...})` block (lines 29-36) with a lazy stub + deferred init**

```js
// ── Sentry: deferred to post-paint. A stub queues any early exceptions
//    so the existing Sentry.captureException(...) call sites work unchanged. ──
const _sentryQueue = [];
let _sentry = null;
const Sentry = {
  captureException(err, ctx) {
    if (_sentry) _sentry.captureException(err, ctx);
    else _sentryQueue.push([err, ctx]);
  },
};
(function initSentryDeferred() {
  if (!(import.meta.env.PROD && import.meta.env.VITE_SENTRY_DSN)) return;
  const idle = window.requestIdleCallback || (cb => setTimeout(cb, 1));
  idle(() => {
    import('@sentry/browser').then((S) => {
      S.init({
        dsn: import.meta.env.VITE_SENTRY_DSN,
        environment: import.meta.env.MODE,
        beforeSend(event) { return stripPHI(event); },
      });
      _sentry = S;
      for (const [err, ctx] of _sentryQueue) S.captureException(err, ctx);
      _sentryQueue.length = 0;
    }).catch(() => {});
  });
})();
```
Note: `stripPHI` must remain defined above this block (it currently is, ~line 19). The existing `window.Sentry = Sentry` at line 8148 now exposes the stub in DEV — harmless.

- [ ] **Step 3: Build and verify Sentry split out**

Run:
```bash
cd /Users/mini/phalanX && npm run build 2>&1 | grep -E "assets/.*\.js"
```
Expected: a separate `@sentry`/`browser` chunk (~25 kB gzip) and a further reduced entry chunk.

- [ ] **Step 4: Commit**

```bash
cd /Users/mini/phalanX
git add code/app.js
git commit -m "perf: defer Sentry init to post-paint with early-error queue"
```

---

### Task 4: Lazy-load Firebase analytics on idle

**Files:**
- Modify: `code/app.js:11` (remove static import), `code/app.js:612-615` (analytics setup + `logAnalyticsEvent`)

**Interfaces:**
- Produces: `logAnalyticsEvent(name, params)` unchanged in signature; analytics instance is `null` until loaded post-idle, so early events before load are dropped (acceptable — they were minimal and PHI-free).

- [ ] **Step 1: Remove the static analytics import**

Delete line 11:
```js
import 'firebase/compat/analytics';
```

- [ ] **Step 2: Replace the analytics setup (lines 612-615)**

```js
// ── Analytics — production only, loaded post-idle, no PHI in event params ──
let analytics = null;
function logAnalyticsEvent(name, params = {}) {
  if (analytics) analytics.logEvent(name, params);
}
if (import.meta.env.PROD) {
  const idle = window.requestIdleCallback || (cb => setTimeout(cb, 1));
  idle(() => {
    import('firebase/compat/analytics')
      .then(() => { analytics = firebase.analytics(); })
      .catch(() => {});
  });
}
```

- [ ] **Step 3: Build and verify**

Run:
```bash
cd /Users/mini/phalanX && npm run build 2>&1 | grep -E "assets/.*\.js"
```
Expected: an additional dynamic chunk for analytics; entry chunk unchanged-or-smaller. Build must succeed with no unresolved-import errors.

- [ ] **Step 4: Commit**

```bash
cd /Users/mini/phalanX
git add code/app.js
git commit -m "perf: lazy-load Firebase analytics on idle"
```

---

### Task 5: Lazy-load Firebase storage on first use

**Files:**
- Modify: `code/app.js:8` (remove static import), `code/app.js:634` (remove eager `const storage`), `code/app.js:551` (`uploadVideoToStorage`)

**Interfaces:**
- Produces: `getStorage()` → `Promise<firebase.storage.Storage>`, cached loader. Removes the module-level `storage` binding.
- Consumes: nothing new. Sole `storage.` use is line 551 inside the already-`async` `uploadVideoToStorage`.

- [ ] **Step 1: Remove the static storage import**

Delete line 8:
```js
import 'firebase/compat/storage';
```

- [ ] **Step 2: Remove the eager module-level binding**

Delete line 634:
```js
const storage = firebase.storage();
```

- [ ] **Step 3: Add a cached lazy loader**

Add immediately after the `const db = ...; const auth = ...;` lines (around line 633):
```js
// ── Storage: loaded on first upload (not needed for first paint) ──
let _storagePromise;
function getStorage() {
  if (!_storagePromise) {
    _storagePromise = import('firebase/compat/storage').then(() => firebase.storage());
  }
  return _storagePromise;
}
```

- [ ] **Step 4: Await the loader at the call site (line 551)**

Change:
```js
    const ref = storage.ref(storagePath);
```
to:
```js
    const ref = (await getStorage()).ref(storagePath);
```
(`uploadVideoToStorage` is already `async`, so `await` is valid here.)

- [ ] **Step 5: Build and verify no other storage references remain**

Run:
```bash
cd /Users/mini/phalanX
grep -nE "\bstorage\.|firebase\.storage\(" code/app.js
npm run build 2>&1 | tail -5
```
Expected: the only remaining match is inside `getStorage()` / the awaited call; build succeeds; a dynamic storage chunk appears.

- [ ] **Step 6: Commit**

```bash
cd /Users/mini/phalanX
git add code/app.js
git commit -m "perf: lazy-load Firebase storage on first upload"
```

---

### Task 6: Lazy-load Firebase functions on first call

**Files:**
- Modify: `code/app.js:9` (remove static import), `code/app.js:5928`, `code/app.js:6503`

**Interfaces:**
- Produces: `getFunctions()` → `Promise<firebase.functions.Functions>`, cached loader.
- Consumes: both call sites are inside `async` contexts (line 5928 already uses `await`; line 6503 already uses `await`).

- [ ] **Step 1: Remove the static functions import**

Delete line 9:
```js
import 'firebase/compat/functions';
```

- [ ] **Step 2: Add a cached lazy loader**

Add next to `getStorage()` (around line 633):
```js
// ── Cloud Functions: loaded on first callable invocation ──
let _functionsPromise;
function getFunctions() {
  if (!_functionsPromise) {
    _functionsPromise = import('firebase/compat/functions').then(() => firebase.functions());
  }
  return _functionsPromise;
}
```

- [ ] **Step 3: Update call site at line 5928**

Change:
```js
  const res = await firebase.functions().httpsCallable('getSignedVideoUrl')({ path: storagePath });
```
to:
```js
  const res = await (await getFunctions()).httpsCallable('getSignedVideoUrl')({ path: storagePath });
```

- [ ] **Step 4: Update call site at line 6503**

Change:
```js
    await firebase.functions().httpsCallable('deleteMyAccount')();
```
to:
```js
    await (await getFunctions()).httpsCallable('deleteMyAccount')();
```

- [ ] **Step 5: Build and verify no eager functions references remain**

Run:
```bash
cd /Users/mini/phalanX
grep -nE "firebase\.functions\(" code/app.js
npm run build 2>&1 | tail -5
```
Expected: matches only inside `getFunctions()`; build succeeds; dynamic functions chunk appears.

- [ ] **Step 6: Commit**

```bash
cd /Users/mini/phalanX
git add code/app.js
git commit -m "perf: lazy-load Firebase functions on first callable"
```

---

### Task 7: Add Cache-Control headers to Firebase Hosting

**Files:**
- Modify: `firebase.json` (`hosting.headers` array)

**Interfaces:**
- Produces: long-lived immutable caching for hashed assets; `no-cache` for the HTML shell and service worker so deploys ship instantly.

- [ ] **Step 1: Add two header entries**

In `firebase.json`, inside `hosting.headers` (the array currently holding the `**` security-headers entry), add these two entries to the same array:
```json
{
  "source": "**/assets/**",
  "headers": [
    { "key": "Cache-Control", "value": "public, max-age=31536000, immutable" }
  ]
},
{
  "source": "/@(index.html|sw.js)",
  "headers": [
    { "key": "Cache-Control", "value": "no-cache" }
  ]
}
```
Keep the existing security-headers entry (CSP, HSTS, etc.) intact — these are additional entries, not a replacement.

- [ ] **Step 2: Validate JSON**

Run:
```bash
cd /Users/mini/phalanX && python3 -c "import json; json.load(open('firebase.json')); print('valid json')"
```
Expected: `valid json`

- [ ] **Step 3: Commit**

```bash
cd /Users/mini/phalanX
git add firebase.json
git commit -m "perf: immutable cache for hashed assets, no-cache for shell"
```

---

### Task 8: Split Firebase core into its own vendor chunk (with anti-regression gate)

**Files:**
- Modify: `vite.config.mjs` (`build.rollupOptions.output.manualChunks`)

**Interfaces:**
- Produces: a `firebase-core` chunk holding the eagerly-imported Firebase code (`app`, `auth`, `firestore`, `app-check`), separated from app code for cache stability. **Must not** absorb the lazy storage/functions/analytics submodules.

- [ ] **Step 1: Add `manualChunks` to the Vite build config**

Replace the `build` block in `vite.config.mjs` with:
```js
  build: {
    outDir: '../dist',
    emptyOutDir: true,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes('node_modules')) return;
          // Keep lazy Firebase submodules in their own dynamic chunks — never group.
          if (/firebase\/compat\/(storage|functions|analytics)/.test(id)) return;
          if (/@firebase\/(storage|functions|analytics)/.test(id)) return;
          if (id.includes('firebase') || id.includes('@firebase') ||
              id.includes('@grpc') || id.includes('protobufjs')) return 'firebase-core';
        },
      },
    },
  },
```

- [ ] **Step 2: Build and GATE on lazy chunks staying separate**

Run:
```bash
cd /Users/mini/phalanX && npm run build 2>&1 | grep -E "assets/.*\.js"
```
Required (the anti-regression gate):
- A `firebase-core-*.js` chunk exists.
- Separate dynamic chunks for chart.js, @sentry, and the firebase storage/functions/analytics submodules still exist (from Tasks 2-6).
- The entry `index-*.js` chunk did **not** grow back.

If `manualChunks` pulled storage/functions/analytics into `firebase-core` (entry-side bloat returns), **revert this task** — the dynamic imports already deliver the core win and the vendor split is only a caching refinement.

- [ ] **Step 3: Commit**

```bash
cd /Users/mini/phalanX
git add vite.config.mjs
git commit -m "perf: split eager Firebase core into cacheable vendor chunk"
```

---

### Task 9: Preconnect to Google Fonts origins

**Files:**
- Modify: `code/index.html` (head, near the existing `fonts.googleapis.com` stylesheet link)

**Interfaces:**
- Produces: earlier TCP/TLS setup to font origins, reducing font-fetch latency. `display=swap` is already present on the font URL.

- [ ] **Step 1: Add preconnect links**

In `code/index.html`, immediately **before** the existing `<link href="https://fonts.googleapis.com/css2?...">` line, add:
```html
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
```

- [ ] **Step 2: Build and verify the links survive into dist**

Run:
```bash
cd /Users/mini/phalanX && npm run build >/dev/null 2>&1 && grep -c "preconnect" dist/index.html
```
Expected: `2`

- [ ] **Step 3: Commit**

```bash
cd /Users/mini/phalanX
git add code/index.html
git commit -m "perf: preconnect to Google Fonts origins"
```

---

### Task 10 (stretch): Defer the DOMPurify CDN script

**Files:**
- Modify: `code/index.html` (the DOMPurify `<script>` near line 1326)

**Interfaces:**
- Produces: non-blocking parse for DOMPurify. Safe only because `app.js` is itself a deferred `type="module"` (executes after parse), so `DOMPurify` is available by the time app code reads it.

- [ ] **Step 1: Add `defer` to the DOMPurify script tag**

Change the opening tag from:
```html
<script src="https://cdn.jsdelivr.net/npm/dompurify@3.1.6/dist/purify.min.js"
        integrity="sha384-+VfUPEb0PdtChMwmBcBmykRMDd+v6D/oFmB3rZM/puCMDYcIvF968OimRh4KQY9a"
        crossorigin="anonymous"></script>
```
to the same tag with `defer` added:
```html
<script defer src="https://cdn.jsdelivr.net/npm/dompurify@3.1.6/dist/purify.min.js"
        integrity="sha384-+VfUPEb0PdtChMwmBcBmykRMDd+v6D/oFmB3rZM/puCMDYcIvF968OimRh4KQY9a"
        crossorigin="anonymous"></script>
```

- [ ] **Step 2: Confirm no synchronous pre-app DOMPurify use**

Run:
```bash
cd /Users/mini/phalanX && grep -nE "DOMPurify" code/index.html code/app.js
```
Expected: only the app.js usage at ~line 4162 (inside a function, runs after load) and the script tag. No inline `<script>` in index.html calling DOMPurify at parse time. If an inline pre-app use exists, **skip this task**.

- [ ] **Step 3: Commit**

```bash
cd /Users/mini/phalanX
git add code/index.html
git commit -m "perf: defer DOMPurify CDN script"
```

---

### Task 11: Final verification — build delta, preview channel, Lighthouse, smoke

**Files:**
- Create: `docs/superpowers/plans/after-build.txt`

**Interfaces:**
- Consumes: all prior tasks.
- Produces: a committed before/after record and a preview-channel URL for the user to review and promote.

- [ ] **Step 1: Capture the after-build metrics**

Run:
```bash
cd /Users/mini/phalanX && npm run build 2>&1 | tee docs/superpowers/plans/after-build.txt
```
Compare entry-chunk gzip against `baseline-build.txt`. Target: critical-path JS gzip down from ~318 KB toward ~150-180 KB. Record the delta in the commit message.

- [ ] **Step 2: Run the existing e2e smoke suite (regression gate)**

Run:
```bash
cd /Users/mini/phalanX && npm run test:e2e 2>&1 | tail -20
```
Expected: pre-existing pass rate is maintained (per session memory, Firebase Auth may be blocked locally — note any test that was already failing for that reason and is unrelated to these changes). No NEW failures introduced by lazy-loading.

- [ ] **Step 3: Deploy to a Firebase preview channel (NOT production)**

Run:
```bash
cd /Users/mini/phalanX && firebase hosting:channel:deploy perf-preview --expires 7d
```
Capture the temporary preview URL from the output.

- [ ] **Step 4: Lighthouse before/after (mobile) on the preview URL**

On the preview URL, run mobile Lighthouse on the login screen and patient home. Record LCP, TTI, and Total Blocking Time. (Use Chrome DevTools Lighthouse or `npx lighthouse <url> --preset=mobile`.) Smoke-test on the preview manually: login → navigate every screen → open progress (charts render via lazy Chart.js) → trigger a video upload (lazy storage) → trigger a callable / account-data path (lazy functions). Confirm no console errors and all features work.

- [ ] **Step 5: Commit the metrics record**

```bash
cd /Users/mini/phalanX
git add docs/superpowers/plans/after-build.txt
git commit -m "chore: record post-optimization build metrics + preview deploy"
```

- [ ] **Step 6: Hand off for promotion**

Report to the user: baseline vs after gzip numbers, Lighthouse deltas, the preview URL, and smoke-test result. The user reviews and promotes the preview channel to production (`firebase hosting:clone` / Console "Promote", or merge + deploy). The agent does **not** deploy to production.

---

## Self-Review

**Spec coverage:** Every spec work item maps to a task — Chart.js (T2), Sentry (T3), analytics (T4), storage (T5), functions (T6), Cache-Control (T7), manualChunks (T8), font preconnect (T9), DOMPurify stretch (T10), preview-channel + Lighthouse + smoke verification (T11), baseline (T1). Success-criteria measurement is in T1/T11.

**Placeholder scan:** No TBD/TODO; every code step shows exact code; every command shows expected output.

**Type/name consistency:** Loader names consistent across tasks — `getChart()`, `getStorage()`, `getFunctions()`, the `Sentry` stub with `captureException`, `logAnalyticsEvent`. Cached-promise vars `_chartPromise` / `_storagePromise` / `_functionsPromise` are each defined once and reused.

**Known project realities reflected:** no frontend unit-test harness (verification is build + e2e + manual smoke); App Check / auth / firestore stay eager; preview-channel-only deploy; base branch is the production feature branch, not stale `main`.
