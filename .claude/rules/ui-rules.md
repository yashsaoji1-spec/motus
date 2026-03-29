# UI Rules

**No emojis — ever.** Not in HTML, JS strings, CSS content, button labels, messages, icons, or favicons. Use plain text or ASCII symbols (`+`, `-`, `x`) instead.

## CSS Variables (styles.css `:root`)

```css
--bg             #F0F7F4                    /* page background (light green-tinted) */
--surface        #FFFFFF                    /* card/panel background */
--border         #C8D8D4                    /* borders and grid lines */
--accent         #0B6CB0                    /* blue — primary interactive color */
--accent-dim     rgba(11, 108, 176, 0.08)
--accent-glow    rgba(11, 108, 176, 0.25)
--text           #1A2744                    /* primary text */
--muted          #6B7A99                    /* secondary/disabled text */
--danger         #CC2936                    /* error states, pain indicator */
--green          #10B981                    /* success / positive states */
--green-dark     #059669
--green-dim      rgba(16, 185, 129, 0.08)
--green-glow     rgba(16, 185, 129, 0.25)
--gold           #F59E0B                    /* streaks / achievement highlights */
--gold-dim       rgba(245, 158, 11, 0.1)
--gradient-cta          linear-gradient(135deg, #0B6CB0, #10B981)
--gradient-cta-hover    linear-gradient(135deg, #0960A0, #059669)
--gradient-hero         linear-gradient(135deg, #0B6CB0 0%, #0A5DA0 40%, #10B981 100%)
--gradient-surface      linear-gradient(180deg, #E8F4FD, #F0F7F4)
```

## Plugin Triggers

Only invoke when the request clearly matches. Invoke BEFORE responding.

| Skill | Trigger |
|---|---|
| `frontend-design` | UI layout, styling, visual changes, spacing, colors |
| `auto-style` | New HTML elements/screens being added to index.html |
| `code-review` | User explicitly asks for a review |
| `simplify` | Clean up, refactor, or improve existing code |
| `commit-commands` | Commit, stage, or save changes |
| `github` | PRs, issues, branches, anything GitHub beyond basic git |
| `firebase` | Firebase config, Firestore, Auth, rules, deployment |
| `superpowers` | Complex multi-step autonomous tasks |
| `context7` | Library/framework docs, API references |
| `chrome-devtools-mcp` | Inspect DOM, debug console, profile browser |
| `no-slop` | AUTO — all code generation and modification |
| `production-code` | AUTO — any edit to app.js, index.html, or styles.css |
