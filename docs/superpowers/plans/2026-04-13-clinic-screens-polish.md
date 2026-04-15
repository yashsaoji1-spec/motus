# Clinic Screens Polish — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix broken CSS tokens, replace auth-btn with the tp-btn system, and remove inline styles from the four clinic screens.

**Architecture:** Four independent edits across three files. Task 1 (`:root` tokens) benefits the whole stylesheet. Tasks 2–4 are scoped to the clinic block in `styles.css`, lines 558–650 of `index.html`, and lines 666–1018 of `app.js`. No new classes except one helper (`clinic-section-label-mt`) added in Task 2 and used in Task 4.

**Tech Stack:** Vanilla CSS, HTML, JavaScript (ES module). Dev server: `npm run dev` at `http://localhost:5173`. No build step needed for verification.

---

## File Map

| File | Lines | What changes |
|---|---|---|
| `code/styles.css` | 6–44 (`:root`) | Add 8 missing tokens |
| `code/styles.css` | 4519–4844 (clinic block) | Token replacements, layout fixes, new helper class |
| `code/index.html` | 558–650 (clinic screens) | Replace auth-btn, remove inline styles |
| `code/app.js` | 666–1018 (Section 5c) | Replace auth-btn and logout-btn, remove inline styles in JS template strings |

---

## Task 1: Add missing tokens to `:root`

**Files:**
- Modify: `code/styles.css:6–44`

- [ ] **Step 1: Read lines 6–44 of `code/styles.css`**

Confirm the `:root` block ends at line 44 with `}` and the last token before it is `--ease-spring`.

- [ ] **Step 2: Add tokens inside the `:root` block**

Edit `code/styles.css` — replace:
```css
  /* ── Transitions ── */
  --ease-default: 0.2s ease;
  --ease-spring:  0.3s cubic-bezier(0.34,1.56,0.64,1);
}
```
with:
```css
  /* ── Transitions ── */
  --ease-default: 0.2s ease;
  --ease-spring:  0.3s cubic-bezier(0.34,1.56,0.64,1);

  /* ── Typography scale ── */
  --text-xs:       0.75rem;
  --text-sm:       0.875rem;
  --text-base:     1rem;
  --text-lg:       1.125rem;
  --text-xl:       1.25rem;
  --text-2xl:      1.5rem;
  --font-semibold: 600;
  --surface-alt:   var(--th-surface-hover);
}
```

- [ ] **Step 3: Verify**

Run: `npm run dev`
Open DevTools on any screen. In the Elements panel, inspect `<html>` computed styles and confirm `--text-sm` resolves to `0.875rem`.

- [ ] **Step 4: Commit**

```bash
git add code/styles.css
git commit -m "Add missing CSS token definitions to :root"
```

---

## Task 2: Update clinic CSS block

**Files:**
- Modify: `code/styles.css:4519–4844`

Seventeen token replacements, two layout fixes, one new helper class. Make all changes, then verify once at the end.

- [ ] **Step 1: Fix `.clinic-screen-layout`** (line 4544)

Replace:
```css
.clinic-screen-layout {
  background: var(--bg);
  min-height: 100dvh;
}
```
with:
```css
.clinic-screen-layout {
  display: flex;
  flex-direction: column;
  background: var(--th-surface);
  min-height: 100dvh;
}
```

- [ ] **Step 2: Fix `.clinic-top-bar`** (lines 4548–4555)

Replace:
```css
.clinic-top-bar {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  padding: 1rem 1.5rem;
  border-bottom: 1px solid var(--border);
  background: var(--surface);
}
```
with:
```css
.clinic-top-bar {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  padding: 1rem 1.5rem;
  border-bottom: 1px solid var(--th-border);
  background: var(--th-surface);
}
```

- [ ] **Step 3: Fix `.clinic-section-card`** (lines 4580–4586)

Replace:
```css
.clinic-section-card {
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  padding: 1.1rem 1.25rem;
  margin-bottom: 1rem;
}
```
with:
```css
.clinic-section-card {
  background: var(--th-surface);
  border: 1px solid var(--th-border);
  border-radius: var(--radius-md);
  padding: 1.1rem 1.25rem;
  margin-bottom: 1rem;
}
```

- [ ] **Step 4: Fix `.clinic-join-code` and `.clinic-text-btn`** (lines 4603–4623)

Replace:
```css
.clinic-join-code {
  font-family: var(--font-mono, monospace);
  font-size: var(--text-2xl);
  font-weight: 700;
  color: var(--accent);
  letter-spacing: 0.12em;
}
.clinic-text-btn {
  background: transparent;
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  color: var(--muted);
  font-size: var(--text-xs);
  padding: 0.25rem 0.6rem;
  cursor: pointer;
  transition: color var(--ease-default), border-color var(--ease-default);
}
```
with:
```css
.clinic-join-code {
  font-family: var(--font-mono, monospace);
  font-size: var(--text-2xl);
  font-weight: 700;
  color: var(--th-primary);
  letter-spacing: 0.12em;
}
.clinic-text-btn {
  background: transparent;
  border: 1px solid var(--th-border);
  border-radius: var(--radius-sm);
  color: var(--muted);
  font-size: var(--text-xs);
  padding: 0.25rem 0.6rem;
  cursor: pointer;
  transition: color var(--ease-default), border-color var(--ease-default);
}
```

- [ ] **Step 5: Fix `.clinic-invite-input` and focus state** (lines 4631–4643)

Replace:
```css
.clinic-invite-input {
  flex: 1;
  background: var(--input-bg);
  border: 1px solid var(--input-border);
  border-radius: var(--radius-sm);
  padding: 0.45rem 0.7rem;
  font-size: var(--text-sm);
  color: var(--text);
  outline: none;
}
.clinic-invite-input:focus {
  border-color: var(--accent);
}
```
with:
```css
.clinic-invite-input {
  flex: 1;
  background: var(--th-surface-hover);
  border: 1px solid var(--th-border);
  border-radius: var(--radius-sm);
  padding: 0.45rem 0.7rem;
  font-size: var(--text-sm);
  color: var(--text);
  outline: none;
}
.clinic-invite-input:focus {
  border-color: var(--th-primary);
}
```

- [ ] **Step 6: Fix `.clinic-owner-tag`** (lines 4677–4680)

Replace:
```css
.clinic-owner-tag {
  background: var(--accent-dim);
  color: var(--accent);
}
```
with:
```css
.clinic-owner-tag {
  background: var(--th-surface-active);
  color: var(--th-primary);
}
```

- [ ] **Step 7: Fix `.clinic-bottom-actions`** (lines 4687–4692)

Replace:
```css
.clinic-bottom-actions {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  margin-top: 1.25rem;
}
```
with:
```css
.clinic-bottom-actions {
  display: flex;
  flex-direction: row;
  gap: 0.5rem;
  margin-top: 1.25rem;
}
```

- [ ] **Step 8: Fix `.clinic-screen-subtitle`** (lines 4808–4813)

Replace:
```css
.clinic-screen-subtitle {
  font-size: var(--text-sm);
  color: var(--text-secondary);
  margin: 0 0 1.25rem;
  line-height: 1.6;
}
```
with:
```css
.clinic-screen-subtitle {
  font-size: var(--text-sm);
  color: var(--muted);
  margin: 0 0 1.25rem;
  line-height: 1.6;
}
```

- [ ] **Step 9: Fix `.clinic-full-input` and focus state** (lines 4826–4839)

Replace:
```css
.clinic-full-input {
  width: 100%;
  padding: 0.55rem 0.75rem;
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  background: var(--bg);
  color: var(--text);
  font-size: var(--text-sm);
  box-sizing: border-box;
}
.clinic-full-input:focus {
  outline: none;
  border-color: var(--accent);
}
```
with:
```css
.clinic-full-input {
  width: 100%;
  padding: 0.55rem 0.75rem;
  border: 1px solid var(--th-border);
  border-radius: var(--radius-sm);
  background: var(--th-surface-hover);
  color: var(--text);
  font-size: var(--text-sm);
  box-sizing: border-box;
}
.clinic-full-input:focus {
  outline: none;
  border-color: var(--th-primary);
}
```

- [ ] **Step 10: Add `.clinic-section-label-mt` helper class**

Append this rule after the `.clinic-section-label` block (after line 4594):
```css
.clinic-section-label-mt {
  margin-top: 1.2rem;
}
```

- [ ] **Step 11: Verify**

Run `npm run dev`. Navigate to a clinic screen (log in as sarah.chen@mayoclinic.org / demo123, click the Clinic button in the therapist sidebar).

Check:
- Background is `#FAFAFA` (th-surface), not the old light blue `#F0F9FF`
- Clinic code text is `#2563EB` blue
- Section card borders are `#E2E8F0` (th-border), not the old blue-tinted border
- Bottom action buttons (Library / Leave Clinic) display side by side, not stacked

- [ ] **Step 12: Commit**

```bash
git add code/styles.css
git commit -m "Update clinic CSS to therapist token system"
```

---

## Task 3: Update clinic HTML in `index.html`

**Files:**
- Modify: `code/index.html:558–650`

- [ ] **Step 1: Fix createClinicScreen buttons** (lines 585–586)

Replace:
```html
      <button class="auth-btn" onclick="createClinic()">Create Clinic</button>
      <button class="auth-btn auth-btn-secondary" onclick="showScreen('therapistScreen')">Cancel</button>
```
with:
```html
      <button class="tp-btn tp-btn-primary" onclick="createClinic()">Create Clinic</button>
      <button class="tp-btn tp-btn-secondary" onclick="showScreen('therapistScreen')">Cancel</button>
```

- [ ] **Step 2: Fix joinClinicScreen — Join button and subtitle p** (lines 610, 615–616)

Replace:
```html
          <button class="auth-btn" style="white-space:nowrap" onclick="joinClinicByCode()">Join</button>
```
with:
```html
          <button class="tp-btn tp-btn-primary" onclick="joinClinicByCode()">Join</button>
```

Replace:
```html
        <p style="font-size:var(--text-sm);color:var(--text-secondary);margin:0 0 0.75rem">Create a clinic and invite your colleagues.</p>
        <button class="auth-btn auth-btn-secondary" onclick="showCreateClinicScreen()">Create New Clinic</button>
```
with:
```html
        <p class="clinic-screen-subtitle">Create a clinic and invite your colleagues.</p>
        <button class="tp-btn tp-btn-secondary" onclick="showCreateClinicScreen()">Create New Clinic</button>
```

- [ ] **Step 3: Fix joinClinicScreen — pending invites card inline margin** (line 619)

Replace:
```html
    <div class="clinic-section-card" style="margin-top:0.5rem">
```
with:
```html
    <div class="clinic-section-card">
```

- [ ] **Step 4: Fix clinicLibraryScreen — Share button** (line 636)

Replace:
```html
      <button class="auth-btn" style="padding:0.45rem 1rem;font-size:0.85rem;margin:0" onclick="showShareExerciseModal()">+ Share from My Library</button>
```
with:
```html
      <button class="tp-btn tp-btn-primary" onclick="showShareExerciseModal()">+ Share from My Library</button>
```

- [ ] **Step 5: Verify**

Run `npm run dev`. Navigate to:
- `createClinicScreen`: buttons should show as solid blue (primary) and ghost (secondary) matching the therapist panel style
- `joinClinicScreen`: Join button solid blue, Create New Clinic ghost; subtitle text is `--muted` color (not broken)
- `clinicLibraryScreen`: Share button solid blue

No `auth-btn` class should appear in the rendered DOM for any clinic screen button — confirm in DevTools Elements panel.

- [ ] **Step 6: Commit**

```bash
git add code/index.html
git commit -m "Replace auth-btn with tp-btn in clinic screen HTML"
```

---

## Task 4: Update JS-rendered clinic HTML in `app.js`

**Files:**
- Modify: `code/app.js:666–1018` (Section 5c)

All changes are inside template string literals within `_renderInvitesList()` and `_renderClinicScreen()`.

- [ ] **Step 1: Fix Accept/Decline invite buttons** (lines 770–771 in `_renderInvitesList`)

Replace:
```js
        <button class="auth-btn" style="padding:0.35rem 0.8rem;font-size:0.8rem;margin:0" onclick="acceptInvite('${inv.id}')">Accept</button>
        <button class="logout-btn" style="font-size:0.8rem" onclick="declineInvite('${inv.id}')">Decline</button>
```
with:
```js
        <button class="tp-btn tp-btn-sm tp-btn-primary" onclick="acceptInvite('${inv.id}')">Accept</button>
        <button class="tp-btn tp-btn-sm tp-btn-secondary" onclick="declineInvite('${inv.id}')">Decline</button>
```

- [ ] **Step 2: Fix Remove member button** (line 869 in `_renderClinicScreen`)

Replace:
```js
      ${isOwner && !isMe ? `<button class="logout-btn" style="font-size:0.75rem;padding:0.2rem 0.6rem" onclick="removeClinicMember('${email}')">Remove</button>` : ''}
```
with:
```js
      ${isOwner && !isMe ? `<button class="tp-btn tp-btn-sm tp-btn-danger" onclick="removeClinicMember('${email}')">Remove</button>` : ''}
```

- [ ] **Step 3: Fix Invite by Email label inline margin and Invite button** (lines 882, 885 in `codeSection` template)

Replace:
```js
      <div class="clinic-section-label" style="margin-top:1.2rem">Invite by Email</div>
      <div class="clinic-invite-input-row">
        <input type="email" id="clinicInviteEmail" class="clinic-invite-input" placeholder="colleague@clinic.com" />
        <button class="auth-btn" style="padding:0.4rem 0.9rem;font-size:0.85rem;margin:0" onclick="sendClinicInvite()">Invite</button>
      </div>
```
with:
```js
      <div class="clinic-section-label clinic-section-label-mt">Invite by Email</div>
      <div class="clinic-invite-input-row">
        <input type="email" id="clinicInviteEmail" class="clinic-invite-input" placeholder="colleague@clinic.com" />
        <button class="tp-btn tp-btn-sm tp-btn-primary" onclick="sendClinicInvite()">Invite</button>
      </div>
```

- [ ] **Step 4: Fix Library and Leave/Disband buttons in `.clinic-bottom-actions`** (lines 899–900)

Replace:
```js
    <div class="clinic-bottom-actions">
      <button class="auth-btn" onclick="showClinicLibraryScreen()">Shared Exercise Library</button>
      <button class="logout-btn" onclick="confirmLeaveClinic()">${isOwner && members.length === 1 ? 'Disband Clinic' : 'Leave Clinic'}</button>
    </div>
```
with:
```js
    <div class="clinic-bottom-actions">
      <button class="tp-btn tp-btn-primary" onclick="showClinicLibraryScreen()">Shared Exercise Library</button>
      <button class="tp-btn tp-btn-secondary" onclick="confirmLeaveClinic()">${isOwner && members.length === 1 ? 'Disband Clinic' : 'Leave Clinic'}</button>
    </div>
```

- [ ] **Step 5: Verify**

Run `npm run dev`. Log in as sarah.chen@mayoclinic.org / demo123, open the clinic screen.

Check:
- Clinic screen bottom actions: "Shared Exercise Library" (solid blue) and "Leave Clinic" (ghost) sit side by side
- Invite button inside the code card is a small solid blue button
- No `logout-btn` or `auth-btn` classes appear in the clinic screen DOM (confirm in DevTools)
- Join screen: Accept (solid blue small) and Decline (ghost small) for pending invite rows

Run: `grep -n "auth-btn\|logout-btn" code/app.js | awk -F: '$1>=666 && $1<=1018'`
Expected: no output (all replaced)

- [ ] **Step 6: Commit**

```bash
git add code/app.js
git commit -m "Replace auth-btn/logout-btn with tp-btn in JS-rendered clinic HTML"
```

---

## Self-Review

**Spec coverage:**
- `:root` token additions (8 tokens) → Task 1 ✓
- CSS token replacements in clinic block → Task 2 (17 replacements across 9 steps) ✓
- `.clinic-screen-layout` flex layout fix → Task 2 Step 1 ✓
- `.clinic-bottom-actions` row direction fix → Task 2 Step 7 ✓
- `.clinic-section-label-mt` helper class → Task 2 Step 10 ✓
- `index.html` button replacements (5 buttons) → Task 3 ✓
- `index.html` inline style removals (3 occurrences) → Task 3 ✓
- `app.js` button replacements (6 buttons) → Task 4 ✓
- `app.js` inline style removals (4 occurrences) → Task 4 ✓

**Placeholder scan:** None found. All steps have exact old/new content.

**Consistency check:** `clinic-section-label-mt` class is defined in Task 2 Step 10 and used in Task 4 Step 3. Tasks must be done in order (2 before 4).
