# Phase 2 UI Overhaul — Design Spec

**Date**: 2026-03-25
**Scope**: Camera session, overlays, calibration, exercise detail, My Exercises, Progress, Messaging
**Aesthetic**: Warm neutral, friendly, matching Phase 1 design tokens

---

## 1. Camera Session — Hybrid Layout

### Structure
Three zones stacked vertically, centered, `max-width: 720px`:

1. **Camera viewport** — fills available height, `aspect-ratio: 16/9`, dark background (`#000`), rounded corners (`var(--radius-xl)`), `2px solid var(--border)`.
2. **HUD overlays** (on the camera):
   - Rep counter: bottom-right, frosted glass (`rgba(0,0,0,0.55)`, `backdrop-filter: blur(10px)`), shows current rep count + target.
   - Set dots: bottom-left, same frosted glass container. Dots use existing `.set-dot` styling (`.complete` = success, `.active` = accent, default = muted).
   - Back button: top-left, frosted pill.
   - Flip camera: top-right, circular frosted button (existing `.cam-flip-btn`).
   - Speed warning: centered in viewport, existing `.speed-warning`.
3. **Control card** (below camera): Single light surface card (`var(--surface)`, `1px solid var(--border)`, `var(--radius-lg)`, `var(--shadow-sm)`). Contains:
   - Row 1: Exercise name (left, `font-weight: 700`) + set label (right, muted)
   - Row 2: Progress bar (full width, existing `.progress-bar-track`/`.progress-bar-fill`)
   - Row 3: Pain slider inline strip — "Pain" label, range input, value display
   - Row 4: "End Session" text button, muted, danger on hover

### Responsive
- **Desktop (≥768px)**: `max-width: 720px`, centered. Camera `aspect-ratio: 16/9`. Control card has standard padding (`var(--space-4)`).
- **Mobile (<768px)**: Full-width, no horizontal padding on camera. Camera fills available height minus control card height. Control card pins to bottom with `padding: var(--space-3)`. Tighter spacing between rows.

### What moves vs. what stays
- **Moves out of viewport**: Set tracker, progress bar, pain slider, end button, feedback text → all into the control card.
- **Stays in viewport**: Rep counter, set dots, back button, flip camera, speed warning.
- **Removed from current layout**: `.cam-header` element is removed. Its children migrate:
  - `#camExerciseName` → moves into the control card Row 1 (left side). Same element ID, new parent.
  - `#camSetLabel` → moves into the control card Row 1 (right side). Same element ID, new parent.
  - `.cam-back-btn` → becomes a HUD overlay button (top-left of viewport). Same onclick, new position/styling.
  - All existing JS references to `camExerciseName` and `camSetLabel` by ID continue to work — the elements are relocated, not removed.

---

## 2. Calibration — Camera Overlay

Calibration is NOT a separate screen. It is an overlay state within the camera session.

### Behavior
1. Session starts → camera opens → calibration overlay appears on the viewport.
2. Overlay shows a semi-transparent hand outline guide (SVG, `rgba(255,255,255,0.25)`) centered in the viewport.
3. Pulsing text prompt below the guide: "Position your hand in frame" — white text, subtle pulse animation (opacity 0.6 → 1.0, 1.5s loop).
4. Once MediaPipe detects the hand, the entire overlay fades out (300ms ease-out).
5. Session begins — rep counting starts, HUD elements appear.

### Styling
- Overlay background: `rgba(0,0,0,0.4)` — enough to dim the camera but still show the feed.
- Hand outline: thin white stroke SVG matching the target hand position.
- Prompt text: `font-size: 1rem`, `font-weight: 600`, white, centered below the hand outline.
- Control card is visible during calibration. The "End Session" button explicitly acts as cancel during calibration — clicking it returns to the previous screen (My Exercises or patient home), same as the HUD back button.

### Error & Timeout Handling
- **Camera fails to open**: Show a centered error message in the viewport ("Camera unavailable — check permissions") with a "Go Back" button. No calibration overlay appears.
- **MediaPipe fails to load**: Same error pattern — "Hand tracking unavailable" with a "Go Back" button.
- **Hand not detected after 15 seconds**: Show a subtle hint below the prompt — "Try moving your hand closer to the camera". No forced timeout — the user can stay in calibration as long as needed or tap "End Session" / back to exit.

---

## 3. Congrats Overlay

Enhances the existing `#congratsOverlay` element (index.html line 238) and its existing CSS (styles.css lines 517-537). This is a CSS-layer restyle + responsive enhancement, not a new element. The existing HTML structure and child elements (`#currentSetDisplay`, `#totalSetsDisplay`, `#targetDisplay`, `#allSetsComplete`, `#painSliderCongrats`, `#painValueCongrats`, `#nextSetBtn`) are preserved.

### Desktop (≥768px) — In-Viewport
- Overlays the camera viewport only (control card stays visible beneath).
- Background: `rgba(0,0,0,0.88)`, `backdrop-filter: blur(8px)`.
- Animate in: scale(0.9→1) + opacity(0→1), 350ms ease-out.
- Content (centered, stacked, `gap: 14px`):
  - "Great work!" — `font-size: 2.2rem`, `font-weight: 900`, gradient text (`var(--gradient-text)`).
  - "Set X of Y complete!" — `rgba(255,255,255,0.65)`, `0.95rem`.
  - "Z reps completed" — `rgba(255,255,255,0.55)`, `0.9rem`.
  - "All sets complete for today!" — `var(--success)`, shown only on final set.
  - "How much pain are you in right now?" — `rgba(255,255,255,0.5)`, `0.85rem`.
  - Pain slider — `width: 200px`, `accent-color: var(--accent)`.
  - Pain value — `rgba(255,255,255,0.7)`, `0.9rem`.
  - "Start Next Set" button — `var(--accent)` bg, white text, standard `.reset-btn`. Changes to "Finish Session" on last set.

### Mobile (<768px) — Full-Screen Takeover
- Replaces both camera viewport and control card.
- Background: `var(--bg)` (warm neutral, not dark glass).
- Content centered vertically on screen:
  - "Great work!" — `font-size: 2rem`, `font-weight: 900`, `var(--accent)` color (not gradient, since light bg).
  - Set/rep info — `var(--muted)`, standard sizing.
  - Pain slider — full-width with more padding, larger touch target.
  - CTA button — full-width, `var(--accent)` bg, `padding: var(--space-4)`.
- Animate in: slide-up from bottom, 300ms ease-out.

---

## 4. Rest Timer Overlay

Enhances the existing `#restTimerOverlay` element (index.html line 248) and its CSS (styles.css lines 1205-1237). CSS restyle + responsive enhancement — existing HTML structure and IDs (`#restTimerCount`, `#restTimerFill`) preserved.

### Desktop (≥768px) — In-Viewport
- Same viewport overlay pattern as congrats.
- Background: `rgba(0,0,0,0.88)`, `backdrop-filter: blur(8px)`.
- Content (centered):
  - "Rest Period" label — `rgba(255,255,255,0.5)`, `0.9rem`, `font-weight: 600`.
  - Countdown number — `font-size: 3rem`, `font-weight: 900`, white.
  - "Next set starts automatically" — `rgba(255,255,255,0.4)`, `0.82rem`.
  - Progress bar — linear fill depleting over rest duration. Track: `rgba(255,255,255,0.15)`. Fill: `var(--accent)`.
  - "Skip Rest →" button — standard `.reset-btn` styling.

### Mobile (<768px) — Full-Screen Takeover
- Same pattern as mobile congrats: `var(--bg)` background, centered, larger elements.
- Countdown number: `font-size: 4rem`, `var(--text)` color.
- Skip button: full-width.

### Transition Flow
Congrats (pain submitted) → rest timer starts → countdown ends OR user skips → camera resumes with calibration guide if hand moved out of frame, otherwise session continues directly.

---

## 5. Exercise Detail — Bottom Sheet

### Trigger
Patient taps an exercise card on My Exercises screen.

### Structure
- **Backdrop**: `rgba(0,0,0,0.3)` behind the sheet. Tapping it dismisses.
- **Sheet**: Slides up from bottom. `var(--surface)` background, `border-radius: var(--radius-xl) var(--radius-xl) 0 0`, `var(--shadow-lg)`.
- **Drag handle**: Small centered pill at the top (`40px × 4px`, `var(--border)` color, `border-radius: 99px`).
- **Content** (padded `var(--space-4)` all sides):
  - Exercise name — `font-size: 1.2rem`, `font-weight: 700`, `var(--text)`.
  - Prescription row — inline: "3 sets × 10 reps · 30s rest". `font-size: 0.9rem`, `var(--muted)`.
  - Therapist notes (if any) — `font-size: 0.85rem`, `var(--placeholder)`, italic, `margin-top: var(--space-3)`. Omitted entirely if no notes.
  - "Begin Session" button — full-width, `var(--accent)` bg, white text, `padding: var(--space-3)`, `border-radius: var(--radius-md)`, `font-weight: 600`.

### Behavior
- Slides up: 250ms ease-out, `translateY(100%) → translateY(0)`.
- Dismiss: tap backdrop OR swipe down. 200ms ease-in.
- "Begin Session": navigates to camera screen, calibration guide appears.

---

## 6. My Exercises Screen

### Header
- Title: "My Exercises" — `font-size: 1.3rem`, `font-weight: 700`, `var(--text)`.
- Subtitle: "X exercises assigned" — `font-size: 0.85rem`, `var(--muted)`.
- Container: `max-width: 480px`, centered (matching patient home from Phase 1).

### Exercise Cards
Each exercise is a card in a vertical stack (`gap: var(--space-3)`):
- Card: `var(--surface)` bg, `1px solid var(--border)`, `border-radius: var(--radius-lg)`, `padding: var(--space-4)`, `cursor: pointer`.
- Hover: `border-color: var(--accent)`, `background: var(--surface-alt)`.
- **Left content**:
  - Exercise name — `font-size: 1rem`, `font-weight: 600`, `var(--text)`.
  - Prescription — `font-size: 0.82rem`, `var(--muted)`. e.g., "3 sets × 10 reps".
- **Right content**:
  - Completion indicator:
    - Not started: no indicator, just a right chevron (`var(--muted)`).
    - In progress: pill badge "2 of 3 sets" — `var(--accent-dim)` bg, `var(--accent)` text, `font-size: 0.72rem`.
    - Complete: checkmark circle — `var(--success)` bg, white check, `24px`.
  - Right chevron: `>` character or SVG, `var(--muted)`, `font-size: 0.9rem`.
- Layout: flexbox, `justify-content: space-between`, `align-items: center`.

### Empty State
- Centered in container, `padding: var(--space-8) 0`.
- Icon: muted clipboard or dumbbell SVG, `48px`, `var(--border)` stroke.
- Text: "No exercises yet — your therapist will assign them soon." — `var(--muted)`, `font-size: 0.9rem`, `text-align: center`.

---

## 7. Progress Screen

### Header
- Title: "Your Progress" — `font-size: 1.3rem`, `font-weight: 700`, `var(--text)`.
- Container: `max-width: 480px`, centered.

### Summary Stats Row
Horizontal row of 2-3 stat cards (`display: flex`, `gap: var(--space-3)`, scrollable on mobile with `overflow-x: auto`):

Each stat card:
- `var(--surface)` bg, `1px solid var(--border)`, `border-radius: var(--radius-lg)`, `padding: var(--space-3) var(--space-4)`.
- `flex: 1`, `min-width: 120px`.
- Value: `font-size: 1.3rem`, `font-weight: 700`, `var(--text)`.
- Label: `font-size: 0.75rem`, `var(--muted)`, `margin-top: 2px`.

Stats shown:
1. **Sessions this week**: value = "5 / 7", label = "Sessions"
2. **Pain trend**: value = "↓ 2.3" (with `var(--success)` color if decreasing, `var(--danger)` if increasing), label = "Avg Pain"
3. **Best ROM**: value = "142°", label = "Best ROM"

### ROM Chart Card
- Surface card wrapping the existing Chart.js canvas.
- Chart line color: `#0B6CB0` (consistent with Phase 1).
- Chart grid: light, using `var(--border)` at low opacity.
- Card: `var(--surface)`, `1px solid var(--border)`, `border-radius: var(--radius-lg)`, `padding: var(--space-4)`.
- `margin-top: var(--space-4)`.

### Session History
- Uses the `.sh-grid-*` visual pattern from Phase 1 but with **new patient-specific classes** (`.prog-grid-header`, `.prog-grid-row`) to avoid modifying the therapist's 6-column grid.
- Patient grid: 4 columns — Date, Exercise, Sets, Pain. `grid-template-columns: 100px 1fr 80px 60px`.
- Header row: `var(--muted)`, `font-size: 0.75rem`, `font-weight: 600`.
- Data rows: `font-size: 0.85rem`, `var(--text)`. Alternating row bg optional.
- Dates use `timeAgo()` for relative timestamps. This is rendered by a **new** `buildPatientSessionHistory()` function — separate from the therapist's `buildSessionHistoryCard()` to avoid cross-contaminating the therapist dashboard.
- `margin-top: var(--space-4)`.

### Empty State
- Same pattern as My Exercises empty state.
- Text: "Complete your first session to start tracking progress."

---

## 8. Messaging Screen

### Chat Header
- Fixed top bar: `var(--surface)` bg, `border-bottom: 1px solid var(--border)`, `padding: var(--space-3) var(--space-4)`.
- Back button (left): `←` arrow or SVG, `var(--muted)`, tappable.
- Name (center or left-of-center): `font-size: 1rem`, `font-weight: 600`, `var(--text)`.

### Message Area
- Scrollable container, `flex: 1`, `padding: var(--space-4)`.
- Background: `var(--bg)`.

### Message Bubbles
**Sent (right-aligned)**:
- `background: var(--accent)`, `color: #fff`.
- `border-radius: var(--radius-lg) var(--radius-lg) 4px var(--radius-lg)` (squared bottom-right).
- `max-width: 75%`, `margin-left: auto`.
- `padding: var(--space-2) var(--space-3)`.
- `font-size: 0.9rem`, `line-height: 1.5`.

**Received (left-aligned)**:
- `background: var(--surface)`, `color: var(--text)`, `border: 1px solid var(--border)`.
- `border-radius: var(--radius-lg) var(--radius-lg) var(--radius-lg) 4px` (squared bottom-left).
- `max-width: 75%`.
- Same padding and font as sent.

### Timestamps
- Shown below the last message in a cluster from the same sender.
- `font-size: 0.72rem`, `var(--placeholder)`, `margin-top: 2px`.
- Uses `timeAgo()` for relative time.

### Read Indicator
- Below the last sent message that's been read.
- "Read" text or double-check icon, `font-size: 0.7rem`, `var(--placeholder)`.
- Only shown on the most recent read message, not on every message.

### Message Input Bar
- Fixed bottom: `var(--surface)` bg, `border-top: 1px solid var(--border)`, `padding: var(--space-3)`.
- Input field: `flex: 1`, `var(--surface-alt)` bg, `1px solid var(--border)`, `border-radius: var(--radius-full)`, `padding: var(--space-2) var(--space-3)`, `font-size: 0.9rem`.
- Send button: replaces the existing text "Send" button (`.msg-send-btn`) with a circular icon button. Requires HTML change: replace `<button class="msg-send-btn">Send</button>` with `<button class="msg-send-btn" ...>` containing an SVG arrow-up icon. Size: `40px × 40px`, `border-radius: var(--radius-full)`.
  - Active (text present): `var(--accent)` bg, white arrow icon. Enabled.
  - Inactive (empty input): `var(--surface-alt)` bg, `var(--muted)` arrow. `pointer-events: none`.
  - Toggle logic: add `input` event listener on the text field to toggle `.msg-send-btn--active` class.
- `gap: var(--space-2)` between input and button.

### Empty State
- Centered in message area.
- Text: "Send a message to your therapist" (patient) or "Send a message to [patient name]" (therapist).
- `var(--muted)`, `font-size: 0.9rem`.

---

## CSS Architecture Notes

- All new components use existing `:root` design tokens from Phase 1. No new color tokens needed.
- New class prefixes: `.cam-hud-*` (camera HUD overlays), `.ex-*` (exercise cards/detail), `.prog-*` (progress screen), `.sheet-*` (bottom sheet).
- Existing `.msg-*` classes are **restyled in place** — same class names, updated CSS values. The one structural change is `.msg-send-btn` becoming a circular icon button (see §8).
- Responsive breakpoint: `768px` (single breakpoint, mobile-first with `@media (min-width: 768px)` for desktop).
- Calibration overlay classes: `.cal-overlay`, `.cal-hand-guide`, `.cal-prompt`.
- Congrats/rest mobile variants: `.congrats-mobile`, `.rest-mobile` activated via media query.

## JS Architecture Notes

- Bottom sheet: new `showExerciseDetail(exerciseId)` and `dismissExerciseDetail()` functions.
- Calibration: modify existing calibration logic to overlay within camera screen rather than separate screen navigation.
- Congrats/rest: add media query check (`window.matchMedia('(max-width: 767px)')`) to toggle between in-viewport and full-screen rendering.
- Messaging: modify `buildMessagePanel()` to render bubble layout with timestamp clustering and read indicators.
- Session history: new `buildPatientSessionHistory()` function for the patient Progress screen, separate from the therapist's `buildSessionHistoryCard()`.
- Camera session: relocate `#camExerciseName` and `#camSetLabel` elements from `.cam-header` into the control card. All `getElementById` references remain valid.
- No new dependencies. No new libraries.
