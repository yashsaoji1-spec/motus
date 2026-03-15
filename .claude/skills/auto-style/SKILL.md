---
name: auto-style
description: >
  Automatically produce polished, on-brand CSS for any new PhalanX UI. Triggers
  whenever new HTML elements, screens, or components are added to index.html.
  Ensures consistent styling without manual CSS tweaking. Complements the
  built-in frontend-design skill with PhalanX-specific design tokens and patterns.
---

# Auto-Style — PhalanX Design System

When you add or modify any HTML in index.html, you MUST also write the
corresponding styles in styles.css. Never leave unstyled elements. Never
rely on browser defaults. Every new piece of UI ships polished.

## Design Tokens (use these, never hardcode)

### Colors
```
Primary:      var(--accent)       #0B6CB0  — primary interactive color
              var(--accent-hover) #0960A0  — hover state
              var(--accent-dim)   rgba(11,108,176,0.08) — subtle tint
              var(--accent-glow)  rgba(11,108,176,0.25) — focus rings
              var(--accent-active) #D6E4FF — selected/active backgrounds

Green:        var(--green)        #10B981  — action, growth, healing
              var(--green-dark)   #059669  — hover state
              var(--green-dim)    rgba(16,185,129,0.08) — subtle tint

Semantic:     var(--success)      #22c55e  — completion
              var(--success-dim)  #D1FAE5
              var(--danger)       #CC2936  — errors, pain
              var(--danger-dim)   #FEE2E2
              var(--warning)      #f59e0b  — caution
              var(--warning-dim)  #fef9c3

Surfaces:     var(--bg)           #F0F7F4  — page background
              var(--bg-secondary) #E8F0ED  — secondary bg
              var(--surface)      #FFFFFF  — card/panel
              var(--surface-hover) #F8FAF9 — card hover
              var(--border)       #C8D8D4  — borders
              var(--border-light) #E0E8E5  — subtle borders

Text:         var(--text)         #1A2744  — primary
              var(--text-secondary) #475569 — secondary
              var(--muted)        #6B7A99  — disabled/tertiary
              var(--placeholder)  #8A9AB0  — placeholder text

Gamification: var(--gold)         #F59E0B  — streaks, XP
              var(--gold-dim)     rgba(245,158,11,0.1)

Inputs:       var(--input-bg)     #F4F6F9
              var(--input-border) #8A9AB0
```

### Gradients
```
var(--gradient-cta)         linear-gradient(135deg, #0B6CB0, #10B981)
var(--gradient-cta-hover)   linear-gradient(135deg, #0960A0, #059669)
var(--gradient-hero)        linear-gradient(135deg, #0B6CB0 0%, #0A5DA0 40%, #10B981 100%)
var(--gradient-surface)     linear-gradient(180deg, #E8F4FD, #F0F7F4)
var(--gradient-patient-bg)  linear-gradient(180deg, #DBEAFE 0%, #E8F4FD 30%, #F0F7F4 70%, #F0F7F4 100%)
var(--gradient-text)        linear-gradient(135deg, var(--accent), var(--green))
```

### Spacing (4px base)
```
var(--space-1)  4px     var(--space-2)  8px     var(--space-3)  12px
var(--space-4)  16px    var(--space-5)  20px    var(--space-6)  24px
var(--space-7)  28px    var(--space-8)  32px    var(--space-10) 40px
var(--space-12) 48px    var(--space-16) 64px
```

### Typography
```
Font:          'DM Sans' — weights 400, 500, 600, 700, 800
Mono:          'DM Mono' or 'Space Mono' — for data/numbers

var(--text-xs)   0.75rem    var(--text-sm)   0.875rem
var(--text-base) 1rem       var(--text-lg)   1.125rem
var(--text-xl)   1.25rem    var(--text-2xl)  1.5rem
var(--text-3xl)  1.875rem

var(--font-normal)    400    var(--font-medium)    500
var(--font-semibold)  600    var(--font-bold)      700
var(--font-extrabold) 800
```

### Shadows
```
var(--shadow-xs)  0 1px 2px rgba(0,0,0,0.04)
var(--shadow-sm)  0 2px 8px rgba(0,0,0,0.04)
var(--shadow-md)  0 4px 16px rgba(0,0,0,0.08)
var(--shadow-lg)  0 8px 32px rgba(0,0,0,0.12)
var(--shadow-cta) 0 6px 24px rgba(11,108,176,0.2), 0 2px 8px rgba(16,185,129,0.15)
```

### Radii
```
var(--radius-sm)   6px     — small inputs, tags
var(--radius-md)   10px    — buttons, inputs
var(--radius-lg)   14px    — cards, panels
var(--radius-xl)   20px    — hero cards, modals
var(--radius-full) 99px    — pills, avatars, dots
```

### Transitions
```
var(--ease-default) 0.2s ease          — standard interactions
var(--ease-spring)  0.3s cubic-bezier(0.34, 1.56, 0.64, 1) — bouncy feedback
```

### Layout
```
var(--max-content)    680px   — content max-width
var(--max-auth)       400px   — auth forms max-width
var(--sidebar-width)  260px   — therapist sidebar
```

## Component Patterns (copy these exactly for consistency)

### Cards
```css
.new-card {
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--radius-lg);
  padding: var(--space-5);
  box-shadow: var(--shadow-xs);
}
```

### Buttons — Primary (gradient CTA)
```css
.new-btn {
  background: var(--gradient-cta);
  color: #fff;
  border: none;
  border-radius: var(--radius-md);
  padding: var(--space-3) var(--space-6);
  font-family: 'DM Sans', sans-serif;
  font-weight: var(--font-semibold);
  font-size: var(--text-sm);
  cursor: pointer;
  transition: opacity var(--ease-default);
  box-shadow: var(--shadow-cta);
}
.new-btn:hover { background: var(--gradient-cta-hover); }
.new-btn:disabled { opacity: 0.5; cursor: not-allowed; }
```

### Buttons — Secondary (outline)
```css
.new-btn-secondary {
  background: transparent;
  color: var(--accent);
  border: 1.5px solid var(--accent);
  border-radius: var(--radius-md);
  padding: var(--space-3) var(--space-5);
  font-weight: var(--font-medium);
  cursor: pointer;
  transition: background var(--ease-default);
}
.new-btn-secondary:hover { background: var(--accent-dim); }
```

### Form inputs
```css
.new-input {
  width: 100%;
  padding: var(--space-3) var(--space-4);
  border: 1.5px solid var(--border);
  border-radius: var(--radius-md);
  font-family: 'DM Sans', sans-serif;
  font-size: var(--text-sm);
  color: var(--text);
  background: var(--surface);
  transition: border-color var(--ease-default);
}
.new-input:focus {
  outline: none;
  border-color: var(--accent);
  box-shadow: 0 0 0 3px var(--accent-dim);
}
```

### Status badges
```css
.badge-done { background: var(--success-dim); color: var(--success-dark); }
.badge-pending { background: var(--accent-dim); color: var(--accent); }
.badge-warning { background: var(--warning-dim); color: var(--warning-dark); }
.badge-error { background: var(--danger-dim); color: var(--danger); }
```

## Responsive Breakpoints (mobile-first)

```css
/* Base styles = mobile (< 640px) */

@media (min-width: 640px) { /* tablet — multi-column grids, roomier padding */ }
@media (min-width: 1024px) { /* desktop — sidebar + main panel side-by-side */ }
```

Every new element MUST have mobile styles as the base. Only add complexity at
larger breakpoints. Touch targets minimum 44px on all sizes.

## Auto-Style Rules

1. **Every new HTML element gets CSS** — no exceptions. If you add a `<div>`,
   it gets styled. If you add a `<button>`, it gets hover + focus states.

2. **Use existing classes first** — check styles.css for an existing class
   that does what you need before creating a new one. Reuse `.auth-btn`,
   `.tp-card`, `.protocol-card` patterns.

3. **Never use inline styles** — everything goes in styles.css. The only
   exception is `display:none` for JS-toggled visibility.

4. **Use design token variables** — never hardcode hex colors, pixel spacing,
   font sizes, shadows, or radii. Always use the `var(--...)` tokens above.

5. **Consistent spacing** — use the spacing scale. Padding 12-24px for cards,
   8-16px for compact elements. Margin between sections: 16-24px.

6. **Interactive feedback** — every clickable element needs:
   - `cursor: pointer`
   - A `:hover` state (background or opacity change)
   - A `:focus-visible` state (already global, but custom if needed)
   - A `:disabled` state if it can be disabled
   - `transition` on the changing property

7. **Text hierarchy** — headings use weight 600-700, body 400, muted text
   uses `color: var(--muted)`. Never go below var(--text-xs) on mobile.

8. **Empty states** — new data displays must style the "no data" case.
   Centered text, `var(--muted)` color, var(--text-sm), with adequate padding.

9. **Color usage** — blue (`--accent`) for primary actions, green (`--green`)
   for success/completion/healing, red (`--danger`) for errors only, gold
   (`--gold`) for streaks/gamification. Never introduce new brand colors.

10. **No raw hex values** — always use CSS variables. If a color isn't in
    `:root`, add it there first.
