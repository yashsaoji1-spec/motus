# Motus — Production Load-Speed Pass

**Date:** 2026-06-26
**Branch:** `perf/load-speed` (based on `feature/ui-clarity-audit-on-main` @ `e6f6e7e`, the deployed production code)
**Scope:** Reduce first-load time of the Motus web app without changing behavior. Low-risk, high-ROI only — no Firebase compat→modular migration.

## Problem

Every visit to the production site downloads, parses, and executes a single monolithic JS chunk before the login screen is interactive. Measured from `vite build` on the production code:

| Asset | Raw | Gzip |
|---|---|---|
| `index.html` (all screens inline) | 95.3 KB | 19.1 KB |
| `index-*.css` (one stylesheet) | 159.6 KB | 26.7 KB |
| `index-*.js` (**single chunk, no splitting**) | **1,040.8 KB** | **318.2 KB** |

Initial payload ≈ **364 KB gzip**, dominated by the 318 KB-gzip JS chunk. That chunk eagerly contains:

- **`firebase/compat/*`** — all 7 modules (`app`, `auth`, `firestore`, `app-check`, `analytics`, `storage`, `functions`). `analytics`/`storage`/`functions` are not needed for first paint.
- **`chart.js/auto`** — registers every chart type; used only by the progress screen.
- **`@sentry/browser`** — error monitoring; does not need to block first paint.

Additional issues: **no `Cache-Control` headers** in `firebase.json` (repeat visitors re-download everything), **no build chunking** in `vite.config.mjs`, render-blocking Google Fonts, and a render-blocking DOMPurify CDN `<script>`.

Note: the MediaPipe + TensorFlow CDN stack in `index.html` is already commented out (`ANGLE_TRACKING_ENABLED = false`), so it is **not** a current load cost.

## Approach (low-risk, high-ROI)

Keep `firebase/compat` (stable, no call-site rewrites). Remove non-critical code from the critical path via dynamic imports, fix caching, and split vendor chunks. Each change is independently revertable. The only real regression surface is lazy Firebase modules, de-risked by auditing every call site.

### Work items (highest-ROI first)

1. **Dynamic-import Chart.js.** Replace top-level `import Chart from 'chart.js/auto'` with a lazy `await import('chart.js/auto')` inside the progress-screen render path. Cache the resolved module so repeated renders don't re-import. (~70 KB gzip off critical path.)

2. **Defer Sentry.** Move `import * as Sentry from '@sentry/browser'` + `Sentry.init(...)` to a dynamic import that runs after first paint (`requestIdleCallback`, fallback `setTimeout`). Preserve the existing `stripPHI` `beforeSend` and prod/staging-only gating. (~25 KB gzip off critical path.)

3. **Lazy-load non-critical Firebase modules.** Keep `app`, `auth`, `firestore`, `app-check` eager (needed for the auth gate). Move:
   - `analytics` → loaded post-paint on idle (analytics calls no-op/queue until ready).
   - `storage` → loaded on first use (file upload / avatar / data export).
   - `functions` → loaded on first use (first callable invocation).

   With compat, the side-effect import (`import 'firebase/compat/storage'`) registers the namespace; lazying means moving that import into an `await`ed loader at each first-use site. **Audit every `firebase.storage()`, `firebase.functions()`, and `firebase.analytics()` call site** and gate each behind its loader.

4. **`Cache-Control` headers in `firebase.json`.** Add to `hosting.headers`:
   - `/assets/**` (Vite content-hashed) → `Cache-Control: public, max-age=31536000, immutable`
   - `index.html` and `/sw.js` → `Cache-Control: no-cache` so updates ship immediately.

5. **Vite `manualChunks`.** Add `build.rollupOptions.output.manualChunks` splitting `firebase`, `chart.js`, and `@sentry` into separate vendor chunks so app-code changes don't bust their long-lived cache.

6. **Font preconnect.** Add `<link rel="preconnect" href="https://fonts.googleapis.com">` and `<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>` in `index.html`. `display=swap` is already present. Optionally trim unused weights.

7. **(Stretch) Defer DOMPurify.** Add `defer` to the DOMPurify CDN `<script>` so it stops blocking the parser. Verify nothing reads `DOMPurify` synchronously before app code runs.

## Verification

- **Bundle:** `npm run build` before/after; record initial-JS gzip and chunk breakdown.
- **Preview channel:** deploy `perf/load-speed` to a Firebase Hosting preview channel (`firebase hosting:channel:deploy perf-preview`) — temporary non-prod URL.
- **Lighthouse (mobile):** before/after on login + patient home; capture LCP / TTI / Total Blocking Time.
- **Smoke test (no regressions):** login → navigate every screen → progress charts render (lazy Chart.js) → file upload (lazy storage) → any callable function (lazy functions) → analytics fires.

User reviews preview-channel results and **promotes to production** when satisfied. No direct prod deploy by the agent.

## Success criteria

- Critical-path JS gzip cut from **318 KB toward ~150–180 KB**.
- Improved LCP / TTI / TBT in mobile Lighthouse on login + patient home.
- Hashed assets served `immutable`; repeat visits avoid re-download.
- No functional regressions across the smoke-test flow.

## Risks & mitigations

- **Lazy Firebase module not loaded before use** → audit all call sites; each first-use path `await`s its loader; smoke-test upload/functions/analytics explicitly.
- **Chart.js race on fast navigation to progress screen** → cache the import promise; guard render until resolved.
- **Sentry misses an early error** → defer is by design (a few hundred ms); acceptable for first-paint gain.
- **Stale base** → branch is off the deployed feature branch, not stale `main`.
