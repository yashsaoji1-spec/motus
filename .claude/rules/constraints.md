# Key Constraints

- **Single file per layer** — all HTML in `index.html`, all JS in `app.js`, all CSS in `styles.css`. Do not create new files or split into modules.
- **Window exports block** — app.js ends with `Object.assign(window, {...})`. Any new function called from an HTML `onclick` must be added here, or it will be undefined at runtime.
- **MediaPipe stays on CDN** — do not npm install MediaPipe. It's loaded via script tag and accessed as `window.Hands`, `window.Camera`, etc.
