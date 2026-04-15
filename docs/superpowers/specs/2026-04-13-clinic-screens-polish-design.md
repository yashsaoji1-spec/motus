# Clinic Screens Polish — Design Spec

**Date:** 2026-04-13
**Author:** Oliver Huelsbeck
**Status:** Approved

---

## Problem

The four clinic screens (`clinicScreen`, `joinClinicScreen`, `createClinicScreen`, `clinicLibraryScreen`) were built before Oliver's design system rollout and were not updated. They have three categories of issues:

1. **Broken CSS tokens** — 6 tokens used throughout the stylesheet have no `:root` definition (`--text-xs` through `--text-2xl`, `--font-semibold`, `--surface-alt`). Additionally, clinic-specific usages of `--text-secondary`, `--input-bg`, `--input-border`, `--border-light` reference undefined tokens.
2. **Wrong button system** — clinic screens use `auth-btn` / `auth-btn-secondary` (auth screen buttons) instead of `tp-btn` (therapist panel button system).
3. **Inline styles in HTML** — padding, font-size, color, and margin set via `style=""` attributes instead of CSS classes.

As a result, the screens look visually inconsistent with the therapist dashboard Oliver built.

---

## Goal

Option C: technical cleanup + targeted visual polish. Bring clinic screens into visual consistency with the therapist dashboard without redesigning their layout.

---

## Scope

### 1. Token additions to `:root` (`styles.css`)

Add to the `:root` block (after existing tokens):

```css
--text-xs:       0.75rem;
--text-sm:       0.875rem;
--text-base:     1rem;
--text-lg:       1.125rem;
--text-xl:       1.25rem;
--text-2xl:      1.5rem;
--font-semibold: 600;
--surface-alt:   var(--th-surface-hover);
```

These fix the silent degradation across the entire stylesheet — not just clinic screens.

### 2. CSS updates to clinic block (`styles.css` lines ~4519–4844)

Replace broken/inconsistent tokens at their usage sites within the clinic CSS section. No new classes; only token replacements and two layout fixes.

**Token replacements:**
- `var(--bg)` → `var(--th-surface)` (background of `.clinic-screen-layout`, `.clinic-full-input`)
- `var(--border)` → `var(--th-border)` (all border rules within clinic block)
- `var(--text-secondary)` → `var(--muted)` (`.clinic-screen-subtitle`)
- `var(--input-bg)` → `var(--th-surface-hover)` (`.clinic-invite-input`)
- `var(--input-border)` → `var(--th-border)` (`.clinic-invite-input`)
- `var(--border-light)` → `var(--th-border)` (any usage in clinic block)
- `var(--accent)` → `var(--th-primary)` (`.clinic-join-code` color, `.clinic-invite-input:focus` border)
- `var(--accent-dim)` → `var(--th-surface-active)` (`.clinic-owner-tag` background)

**Layout fixes:**
- `.clinic-screen-layout`: add `display: flex; flex-direction: column;` so the body scrolls correctly
- `.clinic-bottom-actions`: change `flex-direction: column` → `flex-direction: row` so action buttons sit side by side

### 3. HTML changes (`index.html` lines 558–650)

**Button replacements (static HTML):**
- `class="auth-btn"` → `class="tp-btn tp-btn-primary"`
- `class="auth-btn auth-btn-secondary"` → `class="tp-btn tp-btn-secondary"`

Affected buttons: Create Clinic, Cancel (createClinicScreen), Join (joinClinicScreen), Create New Clinic (joinClinicScreen), + Share from My Library (clinicLibraryScreen).

**Inline style removals:**
- `style="white-space:nowrap"` on Join button → remove (tp-btn handles this naturally)
- `style="padding:0.45rem 1rem;font-size:0.85rem;margin:0"` on Share button → remove (tp-btn provides these)
- `style="font-size:var(--text-sm);color:var(--text-secondary);margin:0 0 0.75rem"` on subtitle `<p>` → remove; the element already has `class="clinic-screen-subtitle"` in CSS
- `style="margin-top:0.5rem"` on pending invites card → move to a modifier in the existing `.clinic-section-card` CSS rule or add inline to the CSS block

### 4. JS changes (`app.js` Section 5c, lines 666–1018)

The `clinicScreenContent` container is filled by JS template strings. Scan all HTML strings in Section 5c for:
- `auth-btn` → replace with `tp-btn tp-btn-primary` or `tp-btn tp-btn-secondary` as appropriate
- `auth-btn-secondary` → `tp-btn tp-btn-secondary`
- Any inline `style=""` attributes using the broken tokens → replace with the correct tokens or remove if redundant

---

## Success Criteria

- No undefined CSS variable warnings in DevTools (check computed styles on clinic screens)
- Clinic screen buttons visually match the `tp-btn` style used in the therapist panel
- No inline `style=""` attributes remain in `index.html` clinic screen HTML (lines 558–650)
- No `auth-btn` class appears in clinic screen HTML or JS-generated clinic HTML
- `.clinic-bottom-actions` buttons display in a row, not a column
- Clinic screens load without layout breaks on mobile (test at 375px)

---

## Out of Scope

- Redesigning the clinic screen layout structure
- Adding new clinic features or screens
- Changing the `clinic-screen-layout` top bar beyond token fixes
- Touching non-clinic CSS or HTML
