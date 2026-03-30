# Key Constraints

- **Vite build step** — run `npm run dev` for local dev; `npm run build` before deploy. No other bundler/compiler.
- **No linter or formatter** — no enforced style rules
- **No test framework** — manual browser testing only
- **MediaPipe stays on CDN** — WASM model files make bundling fragile; accessed via `window.Hands`, `window.Camera`, etc. directly at call sites (not at module init — avoids CDN timing race on mobile)
- **Firebase + Chart.js via npm** — imported at top of `app.js` using `firebase/compat` API
- **Cloudinary via plain fetch** — unsigned upload POST to Cloudinary API; no SDK; deletion is server-side only (signed API call)
- **Window exports block** — app.js ends with `Object.assign(window, {...})` exposing all functions called from HTML `onclick` attrs (required because app.js is an ES module)
- **Firebase backend** — all user data in Firestore; no localStorage keys remain
- **Single file per layer** — keep all HTML in `index.html`, all JS in `app.js`, all CSS in `styles.css`
