# Obsidian Wiki Optimization — Design Spec

**Date:** 2026-04-13
**Author:** Oliver Huelsbeck
**Status:** Approved

---

## Problem

The Motus Obsidian wiki was scaffolded but is largely empty. Three map files (`app-js-map.md`, `index-html-map.md`, `styles-css-map.md`) are blank. The index has broken paths. The DEPLOYMENT folder referenced in CLAUDE.md doesn't exist. Recent UI work from the `oliver` branch is not logged. This means every Claude Code session wastes tokens reading full source files instead of navigating by map.

---

## Goal

Fully populate the wiki so that Claude Code can navigate the codebase efficiently — reading only the relevant section of a file, not the whole thing.

---

## Scope

Seven deliverables, in priority order:

### 1. Fix `index.md` paths

**File:** `/Users/mini/Documents/Obsidian Vault/index.md`

All links currently point to `app/overview.md` etc. Actual paths are `wiki/motus/app/overview.md`. Remove rows for `DEPLOYMENT/index.md` and `raw/` since those paths don't exist yet (DEPLOYMENT will be created in step 5).

### 2. Fill `app-js-map.md`

**File:** `/Users/mini/Documents/Obsidian Vault/wiki/motus/app/app-js-map.md`

Read `code/app.js` (6,311 lines) and produce a table of all sections (1–17, plus 5b, 8b) with:
- Section number and name
- Line range (start–end)
- Key functions defined in that section (name only, not signatures)

Also note the `window exports` block location and the `ANGLE_TRACKING_ENABLED` flag line.

Format: one table per section, or a single consolidated table — whichever fits best after reading.

### 3. Fill `index-html-map.md`

**File:** `/Users/mini/Documents/Obsidian Vault/wiki/motus/app/index-html-map.md`

Read `code/index.html` (1,147 lines) and catalog every screen and modal:
- Element ID
- Type (screen / modal / overlay / component)
- Line range
- One-line description

### 4. Fill `styles-css-map.md`

**File:** `/Users/mini/Documents/Obsidian Vault/wiki/motus/app/styles-css-map.md`

Read `code/styles.css` (4,875 lines) and catalog all named sections:
- Section name / comment header
- Line range
- Screens or components it covers

### 5. Create `DEPLOYMENT/` folder and index

**File:** `/Users/mini/Documents/Obsidian Vault/wiki/motus/DEPLOYMENT/index.md`

The CLAUDE.md ULP sequence reads this file. Create it with a 5-phase checklist matching the pre-launch items in CLAUDE.md `maintenance.md`:
- Phase A: Code Fixes
- Phase B: Testing
- Phase C: Compliance (BAAs + audit logging — blocks PHI-touching features from production)
- Phase D: Deployment
- Phase E: Business

Each item: status (`done` / `pending` / `blocked`), updated date, one-line description.

Add a row for the DEPLOYMENT index to `index.md`.

### 6. Update `history.md`

**File:** `/Users/mini/Documents/Obsidian Vault/wiki/motus/app/history.md`

Add an entry for Oliver's `oliver` branch work (10 commits, ~2026-04-11 to 2026-04-13):
- Patient home screen 3-zone layout
- Exercise select screen
- Session recording + set input bottom sheet
- Progress and messaging screens
- Therapist dashboard (icon sidebar, 3-column layout)
- Admin screen
- Design system rollout + CSS quality fixes

Reference the relevant files: `code/index.html`, `code/styles.css`, `code/app.js`.

### 7. Append to `log.md`

**File:** `/Users/mini/Documents/Obsidian Vault/log.md`

Add one entry:
```
## [2026-04-13] mapping | Wiki optimization session
Files: index.md, app-js-map.md, index-html-map.md, styles-css-map.md, DEPLOYMENT/index.md, history.md
What: Filled all three empty map files from source. Created DEPLOYMENT checklist. Updated history with Oliver branch work. Fixed broken index.md paths.
```

---

## Success Criteria

- Claude Code can navigate to any function in `app.js` without reading the full file
- Claude Code can find any screen in `index.html` by ID without scanning
- Claude Code can find any CSS section without scanning `styles.css`
- ULP sequence can read `DEPLOYMENT/index.md` without error
- `index.md` links all resolve correctly

---

## Out of Scope

- `college_application/` folder — no content available
- `raw/` folder — no source documents to ingest
- Obsidian plugin configuration, templates, or graph view setup
