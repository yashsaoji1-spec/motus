# Motus UI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement the full Motus UI design system — dual visual identities (patient warm/fitness + therapist clinical/EHR) — across all screens in `index.html` and `styles.css`.

**Architecture:** Design system first (tokens → components → screens). All styling lives in `code/styles.css`. All HTML structure lives in `code/index.html`. No new files. No JS changes. Two CSS scope classes (`.patient-scope`, `.therapist-scope`) wrap screens to isolate the two visual systems.

**Tech Stack:** Vanilla CSS (custom properties), Google Fonts (Nunito + IBM Plex Sans + DM Mono), existing Vite dev server (`npm run dev`), Playwright for visual verification.

---

## Task 1: Token System

**Files:**
- Modify: `code/styles.css:1-97` (replace `:root` block)

- [ ] **Step 1: Start dev server**

```bash
cd /Users/mini/phalanX && npm run dev
```

Open http://localhost:5173 in browser. Leave running throughout all tasks.

- [ ] **Step 2: Replace the entire `:root` block** (lines 1–97 in `styles.css`)

Find this opening:
```css
/* ═══════════════════════════════════════════════════════════════════════════
   Motus — Merged Stylesheet
```

Replace the full `:root { ... }` block (lines 6–97) with:

```css
:root {
  /* ── Shared globals ── */
  --danger:        #CC2936;
  --success:       #10B981;
  --gold:          #F59E0B;
  --gold-dim:      rgba(245,158,11,0.12);
  --font-mono:     'DM Mono', monospace;

  /* ── Legacy aliases (used by JS-injected HTML and remaining old CSS) ── */
  --bg:            #F0F9FF;
  --surface:       #FFFFFF;
  --border:        #E0F2FE;
  --accent:        #0EA5E9;
  --accent-hover:  #0284C7;
  --accent-dim:    rgba(14,165,233,0.08);
  --accent-glow:   rgba(14,165,233,0.25);
  --text:          #0C4A6E;
  --muted:         #475569;
  --placeholder:   #94A3B8;
  --gradient-cta:  linear-gradient(135deg, #0EA5E9, #059669);
  --gradient-cta-hover: linear-gradient(135deg, #0284C7, #047857);

  /* ── Spacing (unchanged) ── */
  --space-1:4px; --space-2:8px; --space-3:12px; --space-4:16px;
  --space-5:20px; --space-6:24px; --space-7:28px; --space-8:32px;

  /* ── Radii (unchanged) ── */
  --radius-sm:6px; --radius-md:10px; --radius-lg:14px;
  --radius-xl:20px; --radius-full:99px;

  /* ── Shadows ── */
  --shadow-sm: 0 2px 8px rgba(0,0,0,0.04);
  --shadow-md: 0 4px 16px rgba(0,0,0,0.08);
  --shadow-cta: 0 4px 20px rgba(14,165,233,0.2), 0 2px 8px rgba(5,150,105,0.12);

  /* ── Transitions ── */
  --ease-default: 0.2s ease;
  --ease-spring:  0.3s cubic-bezier(0.34,1.56,0.64,1);
}

/* ── Patient scope ──────────────────────────────────────────────────────── */
.patient-scope {
  --pt-primary:       #0EA5E9;
  --pt-accent:        #059669;
  --pt-text:          #0C4A6E;
  --pt-muted:         #475569;
  --pt-bg:            #F0F9FF;
  --pt-surface:       #FFFFFF;
  --pt-border:        #E0F2FE;
  --pt-border-input:  #BAE6FD;
  --pt-shadow:        0 2px 12px rgba(14,165,233,0.12);
  --pt-cta-gradient:  linear-gradient(135deg, #0EA5E9, #059669);
  --pt-radius:        14px;
  --pt-radius-pill:   50px;
  --pt-font:          'Nunito', sans-serif;
}

/* ── Therapist scope ────────────────────────────────────────────────────── */
.therapist-scope {
  --th-primary:       #2563EB;
  --th-text:          #334155;
  --th-text-strong:   #0F172A;
  --th-muted:         #94A3B8;
  --th-bg:            #FFFFFF;
  --th-surface:       #FAFAFA;
  --th-border:        #E2E8F0;
  --th-sidebar-bg:    #1E293B;
  --th-radius:        6px;
  --th-font:          'IBM Plex Sans', sans-serif;
}
```

- [ ] **Step 3: Verify**

Browser at http://localhost:5173 should still render — login screen may look slightly different (blue shifted), no broken layout. Check console for CSS errors.

- [ ] **Step 4: Commit**

```bash
git add code/styles.css
git commit -m "Replace CSS token system with dual patient/therapist scopes"
```

---

## Task 2: Fonts + Scope Wrappers

**Files:**
- Modify: `code/index.html:9` (font link)
- Modify: `code/index.html` (add scope classes to screen divs)

- [ ] **Step 1: Replace the Google Fonts link tag** at line 9

Old:
```html
  <link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@300;400;500;600;700&family=DM+Mono:wght@400;500&family=Space+Mono:wght@400;700&display=swap" rel="stylesheet"/>
```

New:
```html
  <link href="https://fonts.googleapis.com/css2?family=Nunito:wght@400;600;700;800&family=IBM+Plex+Sans:wght@400;500;600&family=DM+Mono:wght@400;500&display=swap" rel="stylesheet"/>
```

- [ ] **Step 2: Add `.patient-scope` to all patient screens**

For each of these divs, add `patient-scope` to the class attribute:

```
id="loginScreen"      → class="screen active patient-scope"
id="signupScreen"     → class="screen patient-scope"
id="forgotScreen"     → class="screen patient-scope"
id="consentScreen"    → class="screen patient-scope"
id="connectScreen"    → class="screen patient-scope"
id="pendingScreen"    → class="screen patient-scope"
id="patientScreen"    → class="screen patient-scope"
id="exercisesScreen"  → class="screen patient-scope"
id="cameraScreen"     → class="screen patient-scope"
id="manualCamScreen"  → class="screen patient-scope"
id="progressScreen"   → class="screen patient-scope"
id="messagingScreen"  → class="screen patient-scope"
```

- [ ] **Step 3: Add `.therapist-scope` to all therapist screens**

```
id="adminScreen"           → class="screen therapist-scope"
id="therapistScreen"       → class="screen therapist-scope"
id="clinicScreen"          → class="screen therapist-scope clinic-screen-layout"
id="createClinicScreen"    → class="screen therapist-scope clinic-screen-layout"
id="joinClinicScreen"      → class="screen therapist-scope clinic-screen-layout"
id="clinicLibraryScreen"   → class="screen therapist-scope clinic-screen-layout"
id="mlTrainerScreen"       → class="screen therapist-scope"
```

- [ ] **Step 4: Update `body` font in `styles.css`**

Find:
```css
  font-family: 'DM Sans', sans-serif;
```

Replace with:
```css
  font-family: 'Nunito', sans-serif;
```

- [ ] **Step 5: Verify**

Refresh http://localhost:5173. Login screen should now render in Nunito. Text should look rounder and slightly larger.

- [ ] **Step 6: Commit**

```bash
git add code/index.html code/styles.css
git commit -m "Add font imports and patient/therapist scope wrappers to all screens"
```

---

## Task 3: Auth Screen HTML

**Files:**
- Modify: `code/index.html:18-92` (login, signup, forgot screens)

- [ ] **Step 1: Replace the loginScreen div** (lines 18–35)

```html
<div id="loginScreen" class="screen active patient-scope">
  <div class="auth-gradient-header">
    <div class="auth-logo-block">
      <div class="auth-logo-icon">
        <svg width="26" height="26" viewBox="0 0 20 20" fill="none"><path d="M10 1C9.4 1 9 1.5 9 2v7c0 .5.4 1 1 1s1-.5 1-1V2c0-.5-.4-1-1-1ZM7 3C6.4 3 6 3.5 6 4v6c0 .5.4 1 1 1s1-.5 1-1V4c0-.5-.4-1-1-1ZM13 3c-.6 0-1 .5-1 1v6c0 .5.4 1 1 1s1-.5 1-1V4c0-.5-.4-1-1-1ZM4.5 6c-.6 0-1 .5-1 1v4c0 3 2.5 7 6.5 7s6.5-4 6.5-7V7c0-.5-.4-1-1-1s-1 .5-1 1v3c0 .5-.4 1-1 1" fill="white" opacity="0.95"/></svg>
      </div>
      <div class="auth-logo-text">Motus</div>
      <div class="auth-logo-tagline">Physical Rehabilitation</div>
    </div>
    <svg class="auth-wave" viewBox="0 0 390 24" preserveAspectRatio="none"><path d="M0,12 Q97,0 195,12 Q293,24 390,12 L390,24 L0,24 Z" fill="#F0F9FF"/></svg>
  </div>
  <div class="auth-form-area">
    <div id="loginError" class="auth-error" style="display:none" aria-live="polite"></div>
    <div class="auth-field">
      <label>Email</label>
      <input type="email" id="loginEmail" placeholder="you@mayoclinic.org" onkeydown="if(event.key==='Enter') handleLogin()" />
    </div>
    <div class="auth-field">
      <label>Password</label>
      <input type="password" id="loginPassword" placeholder="Password" onkeydown="if(event.key==='Enter') handleLogin()" />
    </div>
    <button class="pt-btn-hero" style="margin-top:8px" onclick="handleLogin()">Sign In</button>
    <button class="pt-btn-outline" onclick="showScreen('signupScreen')">Create Account</button>
    <p class="auth-link-row"><span onclick="showScreen('forgotScreen')">Forgot password?</span></p>
  </div>
</div>
```

- [ ] **Step 2: Replace the signupScreen div** (lines 40–70)

```html
<div id="signupScreen" class="screen patient-scope">
  <div class="auth-gradient-header auth-gradient-header--short">
    <div class="auth-header-title">Create Account</div>
    <div class="auth-header-sub">Join Motus to start your recovery</div>
    <svg class="auth-wave" viewBox="0 0 390 24" preserveAspectRatio="none"><path d="M0,12 Q97,0 195,12 Q293,24 390,12 L390,24 L0,24 Z" fill="#F0F9FF"/></svg>
  </div>
  <div class="auth-form-area">
    <div id="signupError" class="auth-error" style="display:none" aria-live="polite"></div>
    <div class="role-segmented">
      <button id="rolePatientBtn" class="role-seg-btn active" onclick="selectRole('patient')">Patient</button>
      <button id="roleTherapistBtn" class="role-seg-btn" onclick="selectRole('therapist')">Therapist</button>
    </div>
    <div class="auth-field">
      <label>Full Name</label>
      <input type="text" id="signupName" placeholder="Your name" maxlength="80" onkeydown="if(event.key==='Enter') handleSignup()" />
    </div>
    <div class="auth-field">
      <label>Email</label>
      <input type="email" id="signupEmail" placeholder="you@example.com" onkeydown="if(event.key==='Enter') handleSignup()" />
    </div>
    <div class="auth-field">
      <label>Password</label>
      <input type="password" id="signupPassword" placeholder="Min. 8 characters" onkeydown="if(event.key==='Enter') handleSignup()" />
    </div>
    <button class="pt-btn-hero" onclick="handleSignup()">Create Account</button>
    <p class="auth-link-row">Already have an account? <span onclick="showScreen('loginScreen')">Sign in</span></p>
    <p class="auth-legal">By creating an account you agree to our <a href="/tos" target="_blank">Terms of Service</a> and <a href="/privacy" target="_blank">Privacy Policy</a>.</p>
  </div>
</div>
```

- [ ] **Step 3: Replace the forgotScreen div** (lines 75–92)

```html
<div id="forgotScreen" class="screen patient-scope">
  <div class="auth-gradient-header auth-gradient-header--short">
    <div class="auth-header-title">Reset Password</div>
    <div class="auth-header-sub">We'll send you a reset link</div>
    <svg class="auth-wave" viewBox="0 0 390 24" preserveAspectRatio="none"><path d="M0,12 Q97,0 195,12 Q293,24 390,12 L390,24 L0,24 Z" fill="#F0F9FF"/></svg>
  </div>
  <div class="auth-form-area">
    <div id="forgotError" class="auth-error" style="display:none" aria-live="polite"></div>
    <div id="forgotSuccess" class="auth-success" style="display:none"></div>
    <div class="auth-field">
      <label>Email address</label>
      <input type="email" id="forgotEmail" placeholder="you@example.com" />
    </div>
    <div class="auth-field" id="newPasswordField" style="display:none">
      <label>New Password</label>
      <input type="password" id="forgotNewPassword" placeholder="Min. 8 characters" />
    </div>
    <button class="pt-btn-hero" id="forgotBtn" onclick="handleForgot()">Find Account</button>
    <p class="auth-link-row"><span onclick="showScreen('loginScreen')">Back to sign in</span></p>
  </div>
</div>
```

- [ ] **Step 4: Commit**

```bash
git add code/index.html
git commit -m "Restructure auth screen HTML for new design system"
```

---

## Task 4: Auth Screen CSS

**Files:**
- Modify: `code/styles.css:161-215` (auth section)

- [ ] **Step 1: Replace the auth CSS block** (from `/* ── Auth screens ──` to end of `.auth-success`)

Find the line `/* ── Auth screens ─────────────────────────────────────────────────────────── */` and replace everything through `.auth-success { ... }` with:

```css
/* ── Auth screens ─────────────────────────────────────────────────────────── */
#loginScreen, #signupScreen, #forgotScreen, #consentScreen, #connectScreen,
#pendingScreen {
  min-height: 100vh;
  flex-direction: column;
  background: var(--pt-bg);
}

.auth-gradient-header {
  flex-shrink: 0;
  background: linear-gradient(160deg, #0C4A6E 0%, #0EA5E9 100%);
  padding: 48px 24px 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  position: relative;
}

.auth-gradient-header--short {
  padding: 24px 24px 0;
}

.auth-logo-block {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  margin-bottom: 20px;
}

.auth-logo-icon {
  width: 52px;
  height: 52px;
  background: rgba(255,255,255,0.15);
  border-radius: 14px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.auth-logo-text {
  font-family: var(--pt-font);
  font-size: 1.6rem;
  font-weight: 800;
  color: #fff;
  letter-spacing: -0.5px;
}

.auth-logo-tagline {
  font-family: var(--pt-font);
  font-size: 0.72rem;
  color: rgba(255,255,255,0.65);
  font-weight: 600;
}

.auth-header-title {
  font-family: var(--pt-font);
  font-size: 1.3rem;
  font-weight: 800;
  color: #fff;
  margin-bottom: 4px;
}

.auth-header-sub {
  font-family: var(--pt-font);
  font-size: 0.78rem;
  color: rgba(255,255,255,0.7);
  margin-bottom: 16px;
}

.auth-wave {
  display: block;
  width: 100%;
  height: 24px;
  margin-top: 4px;
}

.auth-form-area {
  flex: 1;
  background: var(--pt-bg);
  padding: 24px 24px 32px;
  display: flex;
  flex-direction: column;
  gap: 12px;
  max-width: 440px;
  width: 100%;
  align-self: center;
}

.auth-field {
  display: flex;
  flex-direction: column;
  gap: 5px;
}

.auth-field label {
  font-family: var(--pt-font);
  font-size: 0.72rem;
  font-weight: 700;
  color: var(--pt-primary);
  text-transform: uppercase;
  letter-spacing: 0.06em;
}

.auth-field input {
  background: var(--pt-surface);
  border: 1.5px solid var(--pt-border-input);
  border-radius: 10px;
  padding: 11px 13px;
  font-family: var(--pt-font);
  font-size: 0.9rem;
  color: var(--pt-text);
  outline: none;
  transition: border-color 0.2s;
}

.auth-field input:focus { border-color: var(--pt-primary); }
.auth-field input::placeholder { color: var(--pt-muted); opacity: 0.6; }

/* Patient hero button */
.pt-btn-hero {
  width: 100%;
  padding: 13px;
  background: var(--pt-cta-gradient);
  color: #fff;
  font-family: var(--pt-font);
  font-size: 0.9rem;
  font-weight: 800;
  border: none;
  border-radius: 12px;
  cursor: pointer;
  box-shadow: var(--shadow-cta);
  transition: opacity 0.2s, transform 0.15s;
  min-height: 48px;
}
.pt-btn-hero:hover { opacity: 0.92; }
.pt-btn-hero:active { transform: scale(0.98); }

/* Patient outline button */
.pt-btn-outline {
  width: 100%;
  padding: 12px;
  background: var(--pt-surface);
  color: var(--pt-primary);
  font-family: var(--pt-font);
  font-size: 0.88rem;
  font-weight: 700;
  border: 1.5px solid var(--pt-border-input);
  border-radius: 12px;
  cursor: pointer;
  transition: border-color 0.2s, background 0.2s;
  min-height: 48px;
}
.pt-btn-outline:hover { border-color: var(--pt-primary); background: var(--pt-border); }

/* Patient accent button (solid emerald) */
.pt-btn-accent {
  width: 100%;
  padding: 12px;
  background: var(--pt-accent);
  color: #fff;
  font-family: var(--pt-font);
  font-size: 0.88rem;
  font-weight: 700;
  border: none;
  border-radius: 12px;
  cursor: pointer;
  transition: opacity 0.2s;
  min-height: 48px;
}
.pt-btn-accent:hover { opacity: 0.9; }

.auth-link-row {
  text-align: center;
  font-family: var(--pt-font);
  font-size: 0.82rem;
  color: var(--pt-muted);
}
.auth-link-row span, .auth-link-row a {
  color: var(--pt-primary);
  font-weight: 700;
  cursor: pointer;
  text-decoration: none;
}
.auth-link-row span:hover, .auth-link-row a:hover { text-decoration: underline; }

.auth-legal {
  font-family: var(--pt-font);
  font-size: 0.72rem;
  color: var(--pt-muted);
  text-align: center;
  line-height: 1.5;
}
.auth-legal a { color: var(--pt-primary); }

.auth-error {
  background: #FEE2E2;
  border: 1px solid var(--danger);
  color: #991B1B;
  font-family: var(--pt-font);
  font-size: 0.82rem;
  padding: 10px 14px;
  border-radius: 8px;
}

.auth-success {
  background: #D1FAE5;
  border: 1px solid var(--success);
  color: #065F46;
  font-family: var(--pt-font);
  font-size: 0.82rem;
  padding: 10px 14px;
  border-radius: 8px;
}

/* Role segmented control */
.role-segmented {
  display: flex;
  background: var(--pt-border);
  border-radius: 10px;
  padding: 3px;
  gap: 0;
}

.role-seg-btn {
  flex: 1;
  padding: 8px;
  border: none;
  background: transparent;
  font-family: var(--pt-font);
  font-size: 0.82rem;
  font-weight: 700;
  color: var(--pt-muted);
  border-radius: 8px;
  cursor: pointer;
  transition: all 0.15s;
  min-height: 36px;
}

.role-seg-btn.active {
  background: var(--pt-primary);
  color: #fff;
}
```

- [ ] **Step 2: Verify**

Navigate to login, signup, and forgot screens in the browser. Verify:
- Login shows gradient navy→sky header with logo, white form area below
- Signup shows shorter header with title, role segmented control
- No horizontal scroll, no layout break

- [ ] **Step 3: Commit**

```bash
git add code/styles.css
git commit -m "Implement new auth screen CSS with patient scope tokens"
```

---

## Task 5: Consent + Connect + Pending Screens HTML

**Files:**
- Modify: `code/index.html:97-195` (consent, pending, admin, connect)

- [ ] **Step 1: Replace consentScreen div** (lines 97–139)

```html
<div id="consentScreen" class="screen patient-scope">
  <div class="auth-gradient-header auth-gradient-header--short">
    <div class="auth-header-title">Before we begin</div>
    <div class="auth-header-sub">Please review and accept to continue</div>
    <svg class="auth-wave" viewBox="0 0 390 24" preserveAspectRatio="none"><path d="M0,12 Q97,0 195,12 Q293,24 390,12 L390,24 L0,24 Z" fill="#F0F9FF"/></svg>
  </div>
  <div class="auth-form-area">
    <div class="consent-card">
      <div class="consent-section-title">Privacy &amp; Data Use</div>
      <ul class="consent-list">
        <li>Movement data captured via your device camera</li>
        <li>Exercise performance shared with your assigned therapist</li>
        <li>Session videos stored securely, removed after 30 days</li>
        <li>All data encrypted in transit and at rest</li>
      </ul>
    </div>
    <label class="consent-checkbox-row">
      <input type="checkbox" id="consentCheckbox" style="accent-color:var(--pt-primary);width:18px;height:18px;flex-shrink:0;" />
      <span>I understand how my health data will be used and consent to participate in Motus rehabilitation.</span>
    </label>
    <label class="consent-checkbox-row">
      <input type="checkbox" id="nppCheckbox" style="accent-color:var(--pt-primary);width:18px;height:18px;flex-shrink:0;" />
      <span>I have received the <a href="/hipaa-npp" target="_blank">HIPAA Notice of Privacy Practices</a>.</span>
    </label>
    <div id="consentError" class="auth-error" style="display:none" aria-live="polite">Please check both boxes before continuing.</div>
    <button class="pt-btn-hero" onclick="acceptConsent()">I Agree — Continue</button>
    <p class="auth-legal">Questions? Email <a href="mailto:privacy@motus.app">privacy@motus.app</a></p>
  </div>
</div>
```

- [ ] **Step 2: Replace pendingScreen div** (lines 144–158)

```html
<div id="pendingScreen" class="screen patient-scope">
  <div class="auth-gradient-header auth-gradient-header--short">
    <div class="auth-header-title">Account Pending</div>
    <div class="auth-header-sub">Your therapist account is awaiting approval</div>
    <svg class="auth-wave" viewBox="0 0 390 24" preserveAspectRatio="none"><path d="M0,12 Q97,0 195,12 Q293,24 390,12 L390,24 L0,24 Z" fill="#F0F9FF"/></svg>
  </div>
  <div class="auth-form-area" style="align-items:center;text-align:center;">
    <p style="font-family:var(--pt-font);color:var(--pt-muted);line-height:1.6;font-size:0.9rem;">
      A clinic admin will review and approve your account. Check back soon.
    </p>
    <button class="pt-btn-outline" onclick="logout()">Sign Out</button>
  </div>
</div>
```

- [ ] **Step 3: Replace connectScreen div** (lines 175–195)

Find `<div id="connectScreen" class="screen">` and replace through its closing `</div>`:

```html
<div id="connectScreen" class="screen patient-scope">
  <div class="auth-gradient-header auth-gradient-header--short">
    <div class="auth-header-title">Connect to a Therapist</div>
    <div class="auth-header-sub">Enter your clinic code to get started</div>
    <svg class="auth-wave" viewBox="0 0 390 24" preserveAspectRatio="none"><path d="M0,12 Q97,0 195,12 Q293,24 390,12 L390,24 L0,24 Z" fill="#F0F9FF"/></svg>
  </div>
  <div class="auth-form-area">
    <div class="auth-field">
      <label>Clinic Code</label>
      <input type="text" id="connectCode" class="clinic-code-input" placeholder="------" maxlength="6"
             oninput="this.value=this.value.toUpperCase()"
             onkeydown="if(event.key==='Enter') handleConnect()" />
    </div>
    <div id="connectError" class="auth-error" style="display:none" aria-live="polite"></div>
    <button class="pt-btn-hero" onclick="handleConnect()">Connect</button>
    <button class="pt-btn-outline" onclick="skipConnect()">Skip for now</button>
  </div>
</div>
```

- [ ] **Step 4: Add consent card CSS to `styles.css`** (append after the auth CSS block from Task 4)

```css
/* ── Consent screen extras ────────────────────────────────────────────────── */
.consent-card {
  background: var(--pt-surface);
  border-radius: var(--pt-radius);
  border: 1px solid var(--pt-border);
  box-shadow: var(--pt-shadow);
  padding: 14px 16px;
}

.consent-section-title {
  font-family: var(--pt-font);
  font-size: 0.72rem;
  font-weight: 700;
  color: var(--pt-primary);
  text-transform: uppercase;
  letter-spacing: 0.07em;
  margin-bottom: 8px;
}

.consent-list {
  font-family: var(--pt-font);
  font-size: 0.8rem;
  color: var(--pt-muted);
  line-height: 1.7;
  padding-left: 18px;
}

.consent-checkbox-row {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  cursor: pointer;
  font-family: var(--pt-font);
  font-size: 0.82rem;
  color: var(--pt-text);
  line-height: 1.5;
}

.consent-checkbox-row a { color: var(--pt-primary); }

.clinic-code-input {
  text-align: center;
  font-family: var(--font-mono);
  font-size: 2rem;
  letter-spacing: 10px;
  font-weight: 700;
  color: var(--pt-text);
}
```

- [ ] **Step 5: Commit**

```bash
git add code/index.html code/styles.css
git commit -m "Implement consent, pending, and connect screens with new design"
```

---

## Task 6: Patient Home Screen HTML

**Files:**
- Modify: `code/index.html:196-254` (patientScreen)

- [ ] **Step 1: Replace the patientScreen div** (lines 196–254)

```html
<div id="patientScreen" class="screen patient-scope">
  <!-- Zone 1: Header -->
  <div class="pt-home-header">
    <div class="pt-home-header-inner">
      <div>
        <div class="pt-greeting-label" id="patientGreeting">Good morning</div>
        <div class="pt-greeting-name" id="patientDisplayName">Welcome back</div>
      </div>
      <div class="pt-streak-badge" id="streakBadge" style="display:none;">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="#F59E0B"><path d="M12 2c0 0-7 8-7 13a7 7 0 0 0 14 0c0-5-7-13-7-13z"/></svg>
        <span class="pt-streak-count" id="streakCount">0</span>
        <span class="pt-streak-label" id="streakLabel">day streak</span>
      </div>
    </div>
    <svg class="pt-home-wave" viewBox="0 0 390 20" preserveAspectRatio="none">
      <path d="M0,10 Q97,0 195,10 Q293,20 390,10 L390,20 L0,20 Z" fill="#F0F9FF"/>
    </svg>
  </div>

  <!-- Zone 2: Hero CTA -->
  <div class="pt-home-cta-zone">
    <button class="pt-hero-session-btn" id="patientHeroBtn" onclick="startScanSession()">
      <div class="pt-hero-session-text">
        <div class="pt-hero-session-title">Start a Session</div>
        <div class="pt-hero-session-sub" id="myExercisesSub">Tap to begin today's exercise</div>
      </div>
      <div class="pt-hero-session-play">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="white"><polygon points="5,3 19,12 5,21"/></svg>
      </div>
    </button>
  </div>

  <!-- Zone 3: Nav Grid -->
  <div class="pt-home-grid-zone">
    <div class="pt-nav-grid">
      <button class="pt-nav-card" onclick="showProgressScreen()">
        <span class="pt-nav-icon"><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg></span>
        <span class="pt-nav-label">My Progress</span>
      </button>
      <button class="pt-nav-card" id="therapistContactBtn" onclick="openPatientMessaging()">
        <span class="pt-nav-icon" style="position:relative;">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
          <span class="msg-unread-badge" id="patientUnreadBadge" style="display:none"></span>
        </span>
        <span class="pt-nav-label"><span id="therapistBtnLabel">Messages</span></span>
        <span class="pt-nav-sub" id="therapistContactName"></span>
      </button>
      <button class="pt-nav-card" onclick="showExercisesScreen()">
        <span class="pt-nav-icon"><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M14.5 10c-.83 0-1.5-.67-1.5-1.5v-5c0-.83.67-1.5 1.5-1.5s1.5.67 1.5 1.5v5c0 .83-.67 1.5-1.5 1.5z"/><path d="M20.5 10H19V8.5c0-.83.67-1.5 1.5-1.5s1.5.67 1.5 1.5-.67 1.5-1.5 1.5z"/><path d="M9.5 14c.83 0 1.5.67 1.5 1.5v5c0 .83-.67 1.5-1.5 1.5S8 21.33 8 20.5v-5c0-.83.67-1.5 1.5-1.5z"/><path d="M3.5 14H5v1.5c0 .83-.67 1.5-1.5 1.5S2 16.33 2 15.5 2.67 14 3.5 14z"/><path d="M14 14.5c0-.83.67-1.5 1.5-1.5h5c.83 0 1.5.67 1.5 1.5s-.67 1.5-1.5 1.5h-5c-.83 0-1.5-.67-1.5-1.5z"/><path d="M15.5 19H14v1.5c0 .83.67 1.5 1.5 1.5s1.5-.67 1.5-1.5-.67-1.5-1.5-1.5z"/><path d="M10 9.5C10 8.67 9.33 8 8.5 8h-5C2.67 8 2 8.67 2 9.5S2.67 11 3.5 11h5c.83 0 1.5-.67 1.5-1.5z"/><path d="M8.5 5H10V3.5C10 2.67 9.33 2 8.5 2S7 2.67 7 3.5 7.67 5 8.5 5z"/></svg></span>
        <span class="pt-nav-label">My Exercises</span>
      </button>
      <button class="pt-nav-card" onclick="requestLogout()">
        <span class="pt-nav-icon"><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg></span>
        <span class="pt-nav-label">Sign Out</span>
      </button>
    </div>
    <!-- hidden elements JS still references -->
    <div style="display:none">
      <div id="todaysPlanCard"><div id="todaysPlanList"></div><span id="completionStatus"></span></div>
      <div id="xpBarContainer"><span id="xpLevel"></span><span id="xpProgressText"></span><div id="xpBarFill"></div></div>
      <div id="streakBest"></div>
      <button id="downloadMyDataBtn" onclick="downloadMyData()"></button>
      <button id="disconnectTherapistBtn" onclick="disconnectFromTherapist()"></button>
      <button class="delete-account-btn" onclick="deleteMyAccount()"></button>
    </div>
  </div>
</div>
```

- [ ] **Step 2: Commit**

```bash
git add code/index.html
git commit -m "Restructure patient home screen HTML to 3-zone no-scroll layout"
```

---

## Task 7: Patient Home Screen CSS

**Files:**
- Modify: `code/styles.css` — replace patient home section (lines 343–535)

- [ ] **Step 1: Find the patient home CSS section**

Locate `/* ── Patient home ─────────────────────────────────────────────────────────── */` at around line 343.

Replace everything from that comment through the end of `/* ── My Exercises card button ──────────────────────────────────────────── */` (through approximately line 535) with:

```css
/* ── Patient home ─────────────────────────────────────────────────────────── */
#patientScreen {
  min-height: 100vh;
  background: var(--pt-bg);
  flex-direction: column;
}

.pt-home-header {
  flex-shrink: 0;
  background: #0C4A6E;
  padding: 48px 20px 0;
}

.pt-home-header-inner {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  margin-bottom: 12px;
}

.pt-greeting-label {
  font-family: var(--pt-font);
  font-size: 0.72rem;
  font-weight: 700;
  color: #7DD3FC;
  text-transform: uppercase;
  letter-spacing: 0.07em;
  margin-bottom: 2px;
}

.pt-greeting-name {
  font-family: var(--pt-font);
  font-size: 1.6rem;
  font-weight: 800;
  color: #fff;
  line-height: 1.15;
}

.pt-home-wave {
  display: block;
  width: 100%;
  height: 20px;
}

/* Streak badge */
.pt-streak-badge {
  display: flex;
  align-items: center;
  gap: 5px;
  background: var(--gold-dim);
  border: 1px solid rgba(245,158,11,0.3);
  border-radius: 20px;
  padding: 5px 10px;
  flex-shrink: 0;
}

.pt-streak-count {
  font-family: var(--font-mono);
  font-size: 0.85rem;
  font-weight: 500;
  color: var(--gold);
}

.pt-streak-label {
  font-family: var(--pt-font);
  font-size: 0.65rem;
  font-weight: 700;
  color: var(--gold);
}

/* Hero CTA zone */
.pt-home-cta-zone {
  flex-shrink: 0;
  background: var(--pt-bg);
  padding: 14px 16px 10px;
}

.pt-hero-session-btn {
  width: 100%;
  background: var(--pt-cta-gradient);
  border: none;
  border-radius: var(--pt-radius);
  padding: 14px 16px;
  display: flex;
  justify-content: space-between;
  align-items: center;
  cursor: pointer;
  box-shadow: var(--shadow-cta);
  transition: opacity 0.2s, transform 0.15s;
  min-height: 64px;
}

.pt-hero-session-btn:hover { opacity: 0.93; }
.pt-hero-session-btn:active { transform: scale(0.99); }

.pt-hero-session-text { text-align: left; }

.pt-hero-session-title {
  font-family: var(--pt-font);
  font-size: 1rem;
  font-weight: 800;
  color: #fff;
  margin-bottom: 2px;
}

.pt-hero-session-sub {
  font-family: var(--pt-font);
  font-size: 0.72rem;
  color: rgba(255,255,255,0.8);
}

.pt-hero-session-play {
  width: 36px;
  height: 36px;
  background: rgba(255,255,255,0.18);
  border-radius: 10px;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

/* Nav grid zone */
.pt-home-grid-zone {
  flex: 1;
  background: var(--pt-bg);
  padding: 0 16px 20px;
  min-height: 0;
  display: flex;
  flex-direction: column;
}

.pt-nav-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 10px;
  flex: 1;
}

.pt-nav-card {
  background: var(--pt-surface);
  border-radius: var(--pt-radius);
  border: 1px solid var(--pt-border);
  box-shadow: var(--pt-shadow);
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 6px;
  padding: 12px 8px;
  cursor: pointer;
  transition: transform 0.15s, box-shadow 0.15s;
  min-height: 80px;
}

.pt-nav-card:hover {
  transform: translateY(-1px);
  box-shadow: 0 4px 16px rgba(14,165,233,0.15);
}

.pt-nav-card:active { transform: scale(0.97); }

.pt-nav-icon {
  color: var(--pt-primary);
  display: flex;
  align-items: center;
  justify-content: center;
  position: relative;
}

.pt-nav-label {
  font-family: var(--pt-font);
  font-size: 0.75rem;
  font-weight: 700;
  color: var(--pt-text);
  text-align: center;
}

.pt-nav-sub {
  font-family: var(--pt-font);
  font-size: 0.62rem;
  color: var(--pt-muted);
}

/* Unread message badge */
.msg-unread-badge {
  position: absolute;
  top: -4px;
  right: -6px;
  width: 10px;
  height: 10px;
  background: var(--pt-accent);
  border-radius: 50%;
  border: 2px solid var(--pt-surface);
}
```

- [ ] **Step 2: Verify**

Log in as patient (james.park@gmail.com / demo123). Patient home should show:
- Dark navy header with greeting and streak badge
- Sky→emerald gradient "Start a Session" hero button
- 2×2 grid of white cards filling remaining height
- No scrollbar visible on a 390×844 viewport

- [ ] **Step 3: Commit**

```bash
git add code/styles.css
git commit -m "Implement patient home screen CSS — 3-zone no-scroll layout"
```

---

## Task 8: Exercise Select + Session Recording CSS

**Files:**
- Modify: `code/index.html:259-402` (exercisesScreen, manualCamScreen, setInputModal)
- Modify: `code/styles.css` — exercise + camera sections

- [ ] **Step 1: Replace exercisesScreen div** (lines 259–268)

```html
<div id="exercisesScreen" class="screen patient-scope">
  <div class="pt-subscreen">
    <div class="pt-subscreen-header">
      <button class="pt-back-btn" onclick="showScreen('patientScreen')">← Back</button>
      <h2 class="pt-subscreen-title">My Exercises</h2>
      <p class="pt-subscreen-sub" id="exSubtitle"></p>
    </div>
    <div id="exercisesScreenInner" class="ex-list pt-subscreen-content"></div>
  </div>
</div>
```

- [ ] **Step 2: Replace manualCamScreen div** (lines 355–374)

```html
<div id="manualCamScreen" class="screen patient-scope">
  <div class="manual-cam-viewport">
    <video id="manualCamVideo" autoplay playsinline muted aria-label="Camera preview"></video>
    <!-- HUD top -->
    <div class="cam-hud-top">
      <button class="cam-hud-back" onclick="manualCamExit()">← Back</button>
      <div id="manualCamRecording" class="recording-indicator" style="display:none;">
        <span class="rec-dot"></span>
        <span class="rec-label" id="manualCamTimer">REC 0:00</span>
      </div>
    </div>
    <!-- Set progress bar -->
    <div class="cam-set-progress" id="camSetProgress"></div>
  </div>
  <div class="manual-cam-ctrl">
    <div class="manual-cam-header">
      <div>
        <span class="manual-cam-exname" id="manualCamExName">Exercise</span>
        <span class="manual-cam-setinfo" id="manualCamSetInfo">Set 1 of 3</span>
      </div>
      <span class="manual-cam-elapsed" id="manualCamElapsed" style="display:none;font-family:var(--font-mono);color:#fff;font-size:1rem;">0:00</span>
    </div>
    <p class="manual-cam-prompt" id="manualCamPrompt">Tap Start when ready</p>
    <div class="manual-cam-btns" id="manualCamBtns">
      <button class="pt-btn-accent manual-cam-start-btn" id="manualCamStartBtn" onclick="manualCamStartRecording()">Start</button>
    </div>
  </div>
</div>
```

- [ ] **Step 3: Replace setInputModal div** (lines 377–402)

```html
<div id="setInputModal" class="pt-bottom-sheet-overlay" style="display:none;">
  <div class="pt-bottom-sheet" onclick="event.stopPropagation()">
    <div class="pt-bottom-sheet-handle"></div>
    <h3 class="pt-bottom-sheet-title" id="setInputTitle">Set complete</h3>
    <div class="set-input-field">
      <div class="pt-field-label">Reps completed</div>
      <input type="number" id="setInputReps" min="0" max="100" value="10"
             style="font-family:var(--font-mono);font-size:1.4rem;font-weight:500;text-align:center;width:100%;padding:10px;border:1.5px solid var(--pt-border-input);border-radius:10px;background:var(--pt-bg);color:var(--pt-text);" />
    </div>
    <div class="set-input-field">
      <div class="pt-field-label">Pain level (1–10)</div>
      <div class="pain-bar-track">
        <input type="range" id="setInputPain" min="1" max="10" value="1"
               aria-label="Pain level 1 to 10"
               oninput="updatePainBar(this.value)" />
        <div class="pain-bar-segments" id="painBarSegments"></div>
      </div>
      <div style="text-align:center;font-family:var(--font-mono);font-size:0.85rem;color:var(--pt-muted);margin-top:4px;" id="setInputPainVal">1 / 10</div>
    </div>
    <div class="set-input-field">
      <div class="pt-field-label">Notes (optional)</div>
      <textarea id="setInputNotes" placeholder="How did it feel?" maxlength="1000"
                style="width:100%;border:1.5px solid var(--pt-border-input);border-radius:10px;padding:10px;font-family:var(--pt-font);font-size:0.85rem;background:var(--pt-bg);color:var(--pt-text);resize:none;height:60px;"></textarea>
    </div>
    <div style="display:flex;gap:8px;margin-top:4px;">
      <button class="pt-btn-outline" style="flex:1;" onclick="manualCamCancelSet()">Cancel</button>
      <button class="pt-btn-hero" style="flex:2;" onclick="manualCamSaveSet()">Save Set</button>
    </div>
  </div>
</div>
```

- [ ] **Step 4: Add CSS for exercise select, camera, and set input**

Find `/* ── Camera screen ────────────────────────────────────────────────────────── */` in `styles.css` and prepend this block before it:

```css
/* ── Patient sub-screen shell ─────────────────────────────────────────────── */
.pt-subscreen {
  display: flex;
  flex-direction: column;
  min-height: 100vh;
  background: var(--pt-bg);
}

.pt-subscreen-header {
  flex-shrink: 0;
  background: #0C4A6E;
  padding: 48px 20px 16px;
}

.pt-back-btn {
  font-family: var(--pt-font);
  font-size: 0.82rem;
  font-weight: 700;
  color: #7DD3FC;
  background: none;
  border: none;
  cursor: pointer;
  padding: 0;
  margin-bottom: 6px;
  min-height: auto;
  display: block;
}

.pt-subscreen-title {
  font-family: var(--pt-font);
  font-size: 1.3rem;
  font-weight: 800;
  color: #fff;
}

.pt-subscreen-sub {
  font-family: var(--pt-font);
  font-size: 0.75rem;
  color: #7DD3FC;
  margin-top: 2px;
}

.pt-subscreen-content {
  flex: 1;
  padding: 16px;
  overflow-y: auto;
}

/* ── Camera screen ─────────────────────────────────────────────────────────── */
#manualCamScreen {
  flex-direction: column;
  background: #0F172A;
  min-height: 100vh;
}

.manual-cam-viewport {
  flex: 1;
  position: relative;
  overflow: hidden;
  min-height: 0;
  background: #0F172A;
}

.manual-cam-viewport video {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.cam-hud-top {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 14px 16px;
  z-index: 10;
}

.cam-hud-back {
  font-family: var(--pt-font);
  font-size: 0.82rem;
  font-weight: 700;
  color: rgba(255,255,255,0.8);
  background: rgba(0,0,0,0.3);
  border: none;
  border-radius: 8px;
  padding: 6px 12px;
  cursor: pointer;
  min-height: auto;
  backdrop-filter: blur(4px);
}

.recording-indicator {
  display: flex;
  align-items: center;
  gap: 6px;
  background: rgba(5,150,105,0.25);
  border: 1px solid #059669;
  border-radius: 8px;
  padding: 5px 10px;
  backdrop-filter: blur(4px);
}

.rec-dot {
  width: 7px;
  height: 7px;
  background: #6EE7B7;
  border-radius: 50%;
  animation: pulse 1.2s ease-in-out infinite;
}

.rec-label {
  font-family: var(--font-mono);
  font-size: 0.7rem;
  color: #6EE7B7;
}

.cam-set-progress {
  position: absolute;
  bottom: 0;
  left: 0;
  right: 0;
  display: flex;
  gap: 4px;
  padding: 0 16px 12px;
  z-index: 10;
}

.cam-set-segment {
  flex: 1;
  height: 4px;
  border-radius: 2px;
  background: rgba(255,255,255,0.2);
  transition: background 0.3s;
}

.cam-set-segment.done { background: #059669; }

.manual-cam-ctrl {
  flex-shrink: 0;
  background: #0C4A6E;
  padding: 16px 18px 20px;
}

.manual-cam-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 12px;
}

.manual-cam-exname {
  font-family: var(--pt-font);
  font-size: 0.9rem;
  font-weight: 800;
  color: #fff;
  display: block;
}

.manual-cam-setinfo {
  font-family: var(--pt-font);
  font-size: 0.7rem;
  color: #7DD3FC;
  display: block;
  margin-top: 2px;
}

.manual-cam-prompt {
  font-family: var(--pt-font);
  font-size: 0.82rem;
  color: rgba(255,255,255,0.7);
  margin-bottom: 12px;
}

.manual-cam-btns { display: flex; gap: 8px; }

.manual-cam-start-btn { flex: 1; }

/* ── Set input bottom sheet ───────────────────────────────────────────────── */
.pt-bottom-sheet-overlay {
  position: fixed;
  inset: 0;
  background: rgba(12,74,110,0.65);
  z-index: 200;
  display: flex;
  align-items: flex-end;
}

.pt-bottom-sheet {
  background: var(--pt-surface);
  border-radius: 20px 20px 0 0;
  padding: 16px 20px 32px;
  width: 100%;
  display: flex;
  flex-direction: column;
  gap: 14px;
  max-height: 85vh;
  overflow-y: auto;
}

.pt-bottom-sheet-handle {
  width: 36px;
  height: 4px;
  background: var(--pt-border-input);
  border-radius: 2px;
  margin: 0 auto 4px;
}

.pt-bottom-sheet-title {
  font-family: var(--pt-font);
  font-size: 1.1rem;
  font-weight: 800;
  color: var(--pt-text);
}

.pt-field-label {
  font-family: var(--pt-font);
  font-size: 0.7rem;
  font-weight: 700;
  color: var(--pt-primary);
  text-transform: uppercase;
  letter-spacing: 0.07em;
  margin-bottom: 6px;
}

.set-input-field { display: flex; flex-direction: column; }

/* Pain bar */
.pain-bar-track { position: relative; height: 32px; }
.pain-bar-track input[type=range] {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  opacity: 0;
  z-index: 2;
  cursor: pointer;
  margin: 0;
}
.pain-bar-segments {
  display: flex;
  gap: 3px;
  height: 28px;
  align-items: flex-end;
  pointer-events: none;
}
.pain-seg {
  flex: 1;
  border-radius: 3px 3px 0 0;
  transition: height 0.15s, background 0.15s;
  height: 18px;
  background: var(--pt-border);
}
.pain-seg.active-green  { background: var(--pt-accent); height: 28px; }
.pain-seg.active-amber  { background: var(--gold); height: 28px; }
.pain-seg.active-red    { background: var(--danger); height: 28px; }
.pain-seg.filled-green  { background: #6EE7B7; }
.pain-seg.filled-amber  { background: #FCD34D; }
.pain-seg.filled-red    { background: #FCA5A5; }
```

- [ ] **Step 5: Add `updatePainBar` helper to `app.js` window exports**

Append to `app.js` before the `Object.assign(window, {...})` line:

```js
function updatePainBar(val) {
  const v = parseInt(val);
  document.getElementById('setInputPainVal').textContent = v + ' / 10';
  const segs = document.querySelectorAll('.pain-seg');
  segs.forEach((seg, i) => {
    const n = i + 1;
    const color = n <= 3 ? 'green' : n <= 6 ? 'amber' : 'red';
    seg.className = 'pain-seg';
    if (n < v) seg.classList.add('filled-' + color);
    else if (n === v) seg.classList.add('active-' + color);
  });
}
```

Then add `updatePainBar` to the `Object.assign(window, {...})` block.

- [ ] **Step 6: Initialize pain bar segments in `app.js`**

Find `function manualCamShowSetInput(` in `app.js`. After the line that shows the modal (`setInputModal.style.display`), add:

```js
  // Build pain bar segments
  const track = document.getElementById('painBarSegments');
  if (track && !track.children.length) {
    for (let i = 1; i <= 10; i++) {
      const s = document.createElement('div');
      s.className = 'pain-seg';
      track.appendChild(s);
    }
  }
  document.getElementById('setInputPain').value = 1;
  updatePainBar(1);
```

- [ ] **Step 7: Verify**

Log in as patient. Start a session. Verify:
- Camera screen: dark viewport, navy control card at bottom, "Start" emerald button
- After tapping "End Set": bottom sheet slides up from below, pain bar visible with colored segments

- [ ] **Step 8: Commit**

```bash
git add code/index.html code/styles.css code/app.js
git commit -m "Implement exercise select, session recording, and set input bottom sheet"
```

---

## Task 9: Progress + Messaging Screens CSS

**Files:**
- Modify: `code/styles.css` — progress and messaging sections

- [ ] **Step 1: Add patient subscreen header to progressScreen HTML**

Find `<div id="progressScreen" class="screen">` and replace through its first inner div:

```html
<div id="progressScreen" class="screen patient-scope">
  <div class="pt-subscreen">
    <div class="pt-subscreen-header">
      <button class="pt-back-btn" onclick="showScreen('patientScreen')">← Back</button>
      <h2 class="pt-subscreen-title">My Progress</h2>
    </div>
    <div id="progressContent" class="pt-subscreen-content"></div>
  </div>
</div>
```

- [ ] **Step 2: Replace messagingScreen HTML**

Find `<div id="messagingScreen" class="screen">` and replace through closing `</div>`:

```html
<div id="messagingScreen" class="screen patient-scope">
  <div class="pt-msg-screen">
    <div class="pt-msg-header">
      <button class="pt-back-btn" onclick="showScreen('patientScreen')" style="color:#7DD3FC;">← Back</button>
      <span class="pt-msg-title" id="msgHeaderTitle">Therapist</span>
    </div>
    <div class="msg-thread" id="msgThread"></div>
    <div class="pt-msg-input-row">
      <input type="text" id="msgInput" class="pt-msg-input" placeholder="Type a message..."
             maxlength="2000"
             onkeydown="if(event.key==='Enter'&&!document.getElementById('msgSendBtn').disabled)sendMessageFromPatient()"
             oninput="toggleMsgSend()" />
      <button class="pt-msg-send-btn" id="msgSendBtn" onclick="sendMessageFromPatient()" disabled>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="19" x2="12" y2="5"/><polyline points="5 12 12 5 19 12"/></svg>
      </button>
    </div>
  </div>
</div>
```

- [ ] **Step 3: Replace messaging CSS**

Find `/* ── Messaging Screen ──────────────────────────────────────────── */` in `styles.css` (around line 2829) and replace its block with:

```css
/* ── Messaging Screen ─────────────────────────────────────────────────────── */
.pt-msg-screen {
  display: flex;
  flex-direction: column;
  min-height: 100vh;
  background: var(--pt-bg);
}

.pt-msg-header {
  flex-shrink: 0;
  background: #0C4A6E;
  padding: 48px 20px 14px;
  display: flex;
  flex-direction: column;
}

.pt-msg-title {
  font-family: var(--pt-font);
  font-size: 1.1rem;
  font-weight: 700;
  color: #fff;
  margin-top: 4px;
}

.msg-thread {
  flex: 1;
  overflow-y: auto;
  padding: 14px 16px;
  display: flex;
  flex-direction: column;
  gap: 10px;
}

/* Message bubbles — JS-generated, must use these classes */
.msg-bubble-out {
  align-self: flex-end;
  max-width: 78%;
  background: var(--pt-cta-gradient);
  border-radius: 14px 14px 4px 14px;
  padding: 9px 13px;
}

.msg-bubble-out .msg-text {
  font-family: var(--pt-font);
  font-size: 0.85rem;
  color: #fff;
}

.msg-bubble-out .msg-meta {
  font-family: var(--pt-font);
  font-size: 0.6rem;
  color: rgba(255,255,255,0.65);
  margin-top: 3px;
  text-align: right;
}

.msg-bubble-in {
  align-self: flex-start;
  max-width: 78%;
  background: var(--pt-surface);
  border: 1px solid var(--pt-border);
  border-radius: 14px 14px 14px 4px;
  padding: 9px 13px;
}

.msg-bubble-in .msg-text {
  font-family: var(--pt-font);
  font-size: 0.85rem;
  color: var(--pt-text);
}

.msg-bubble-in .msg-meta {
  font-family: var(--pt-font);
  font-size: 0.6rem;
  color: var(--pt-muted);
  margin-top: 3px;
}

.pt-msg-input-row {
  flex-shrink: 0;
  display: flex;
  gap: 8px;
  align-items: center;
  padding: 10px 16px 24px;
  background: var(--pt-bg);
  border-top: 1px solid var(--pt-border);
}

.pt-msg-input {
  flex: 1;
  background: var(--pt-surface);
  border: 1.5px solid var(--pt-border-input);
  border-radius: 12px;
  padding: 10px 14px;
  font-family: var(--pt-font);
  font-size: 0.88rem;
  color: var(--pt-text);
  outline: none;
}

.pt-msg-input:focus { border-color: var(--pt-primary); }
.pt-msg-input::placeholder { color: var(--pt-muted); opacity: 0.7; }

.pt-msg-send-btn {
  width: 40px;
  height: 40px;
  background: var(--pt-cta-gradient);
  border: none;
  border-radius: 10px;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  flex-shrink: 0;
  opacity: 0.4;
  transition: opacity 0.2s;
  min-height: auto;
}

.pt-msg-send-btn:not(:disabled) { opacity: 1; }
```

- [ ] **Step 4: Verify**

Navigate to Messages as patient. Verify:
- Dark navy header with back button
- Input bar pinned to bottom
- Sky→emerald gradient on outgoing messages (requires existing messages)

- [ ] **Step 5: Commit**

```bash
git add code/index.html code/styles.css
git commit -m "Implement progress and messaging screens with patient scope"
```

---

## Task 10: Therapist Dashboard

**Files:**
- Modify: `code/index.html:429-463` (therapistScreen)
- Modify: `code/styles.css` — therapist section (lines 767+)

- [ ] **Step 1: Replace therapistScreen div** (lines 408–463, including the nav drawer backdrop)

Keep the nav drawer HTML (`sidebarBackdrop`, `therapistSidebar`) unchanged. Replace only the `therapistScreen` div:

```html
<div id="therapistScreen" class="screen therapist-scope">
  <!-- Icon sidebar -->
  <div class="th-sidebar">
    <div class="th-sidebar-logo">
      <svg width="20" height="20" viewBox="0 0 20 20" fill="none"><path d="M10 1C9.4 1 9 1.5 9 2v7c0 .5.4 1 1 1s1-.5 1-1V2c0-.5-.4-1-1-1ZM7 3C6.4 3 6 3.5 6 4v6c0 .5.4 1 1 1s1-.5 1-1V4c0-.5-.4-1-1-1ZM13 3c-.6 0-1 .5-1 1v6c0 .5.4 1 1 1s1-.5 1-1V4c0-.5-.4-1-1-1ZM4.5 6c-.6 0-1 .5-1 1v4c0 3 2.5 7 6.5 7s6.5-4 6.5-7V7c0-.5-.4-1-1-1s-1 .5-1 1v3c0 .5-.4 1-1 1" fill="white" opacity="0.95"/></svg>
    </div>
    <button class="th-sidebar-icon th-sidebar-icon--active" title="Patients" aria-label="Patients">
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>
    </button>
    <button class="th-sidebar-icon" title="Messages" aria-label="Messages" onclick="openSidebar()">
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
    </button>
    <button class="th-sidebar-icon" title="Protocol Library" aria-label="Library" onclick="openProtocolLibrary()">
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/></svg>
    </button>
    <button class="th-sidebar-icon" title="Clinic" aria-label="Clinic" onclick="showMyClinicOrJoin()">
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>
      <span class="clinic-invite-badge" id="clinicInviteBadge" style="display:none">0</span>
    </button>
    <div style="flex:1"></div>
    <button class="th-sidebar-icon" title="Sign Out" aria-label="Sign Out" onclick="requestLogout()">
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>
    </button>
  </div>

  <!-- Patient list column (was .sidebar) -->
  <div class="sidebar th-patient-list">
    <div class="sidebar-top">
      <div class="th-list-header">
        <span class="th-section-label">Patients</span>
        <button class="th-add-btn" onclick="openBulkAssign()" title="Bulk Assign">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
        </button>
      </div>
      <div class="clinic-badge" onclick="copyClinicCode()" title="Click to copy">
        <span>Code:</span>
        <span class="clinic-badge-code" id="therapistCode">------</span>
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
      </div>
      <div class="sidebar-search-wrap">
        <svg class="sidebar-search-icon" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
        <input type="text" id="patientSearch" class="sidebar-search" placeholder="Search patients..."
               oninput="filterPatients(this.value)" />
      </div>
      <div class="sidebar-footer">
        <span class="sidebar-switch-user" onclick="requestLogout()">Switch user</span>
        <span class="sidebar-switch-user delete-account-btn" onclick="deleteMyAccount()" style="color:#e05c5c;margin-left:1rem">Delete account</span>
      </div>
    </div>
  </div>

  <!-- Main detail panel -->
  <div class="main-panel" id="mainPanel">
    <div class="tp-header">
      <button class="th-btn" onclick="openBulkAssign()">Bulk Assign</button>
    </div>
    <div class="empty-state">
      <p>Select a patient to view their details</p>
    </div>
  </div>
</div>
```

- [ ] **Step 2: Replace therapist CSS block** in `styles.css`

Find `/* ── Therapist screen ─────────────────────────────────────────────────────── */` (around line 767) and replace the full therapist section through `/* ── Protocol card & form ──` with:

```css
/* ── Therapist screen ─────────────────────────────────────────────────────── */
#therapistScreen {
  flex-direction: row;
  min-height: 100vh;
  background: var(--th-bg);
}

/* Icon sidebar */
.th-sidebar {
  width: 52px;
  flex-shrink: 0;
  background: var(--th-sidebar-bg);
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 14px 0;
  gap: 6px;
}

.th-sidebar-logo {
  width: 34px;
  height: 34px;
  background: linear-gradient(135deg, #0EA5E9, #059669);
  border-radius: 10px;
  display: flex;
  align-items: center;
  justify-content: center;
  margin-bottom: 10px;
}

.th-sidebar-icon {
  width: 36px;
  height: 36px;
  border-radius: 8px;
  background: rgba(255,255,255,0.08);
  border: none;
  color: rgba(255,255,255,0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  transition: background 0.15s, color 0.15s;
  position: relative;
  min-height: auto;
  padding: 0;
}

.th-sidebar-icon:hover {
  background: rgba(255,255,255,0.15);
  color: #fff;
}

.th-sidebar-icon--active {
  background: var(--th-primary);
  color: #fff;
}

/* Patient list column */
.th-patient-list {
  width: 220px;
  flex-shrink: 0;
  background: var(--th-bg);
  border-right: 1px solid var(--th-border);
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.th-list-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 10px;
}

.th-section-label {
  font-family: var(--th-font);
  font-size: 0.65rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.09em;
  color: var(--th-muted);
}

.th-add-btn {
  width: 24px;
  height: 24px;
  border-radius: 6px;
  background: var(--th-primary);
  border: none;
  color: #fff;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  min-height: auto;
  padding: 0;
}

.th-btn {
  background: var(--th-primary);
  color: #fff;
  font-family: var(--th-font);
  font-size: 0.78rem;
  font-weight: 600;
  border: none;
  border-radius: var(--th-radius);
  padding: 7px 14px;
  cursor: pointer;
  transition: opacity 0.15s;
  min-height: auto;
}

.th-btn:hover { opacity: 0.88; }

/* Patient rows in sidebar */
.sidebar {
  display: flex;
  flex-direction: column;
  overflow: hidden;
  background: var(--th-bg);
}

.sidebar-top {
  flex-shrink: 0;
  padding: 14px 12px 10px;
  border-bottom: 1px solid var(--th-border);
}

.clinic-badge {
  display: flex;
  align-items: center;
  gap: 5px;
  padding: 5px 8px;
  background: #EFF6FF;
  border: 1px solid #BFDBFE;
  border-radius: var(--th-radius);
  cursor: pointer;
  font-family: var(--th-font);
  font-size: 0.68rem;
  font-weight: 500;
  color: var(--th-primary);
  margin-bottom: 8px;
}

.clinic-badge-code {
  font-family: var(--font-mono);
  font-weight: 500;
  letter-spacing: 2px;
}

.sidebar-search-wrap {
  position: relative;
}

.sidebar-search-icon {
  position: absolute;
  left: 8px;
  top: 50%;
  transform: translateY(-50%);
  color: var(--th-muted);
  pointer-events: none;
}

.sidebar-search {
  width: 100%;
  background: #F1F5F9;
  border: 1px solid var(--th-border);
  border-radius: var(--th-radius);
  padding: 7px 10px 7px 28px;
  font-family: var(--th-font);
  font-size: 0.78rem;
  color: var(--th-text);
  outline: none;
}

.sidebar-search:focus { border-color: var(--th-primary); }

.sidebar-footer {
  padding: 8px 0 0;
  font-family: var(--th-font);
  font-size: 0.68rem;
}

.sidebar-switch-user {
  color: var(--th-muted);
  cursor: pointer;
}

.sidebar-switch-user:hover { color: var(--th-text); }

/* Patient list items — JS generated, must match these classes */
.tp-patient-item {
  display: flex;
  align-items: center;
  padding: 9px 12px;
  border-left: 3px solid transparent;
  cursor: pointer;
  transition: background 0.1s;
  border-bottom: 1px solid var(--th-border);
  gap: 8px;
}

.tp-patient-item:hover { background: #F8FAFC; }

.tp-patient-item.active {
  background: #EFF6FF;
  border-left-color: var(--th-primary);
}

.tp-patient-name {
  font-family: var(--th-font);
  font-size: 0.82rem;
  font-weight: 600;
  color: var(--th-text-strong);
}

.tp-patient-meta {
  font-family: var(--th-font);
  font-size: 0.65rem;
  color: var(--th-muted);
  margin-top: 1px;
}

/* Main panel */
.main-panel {
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  background: var(--th-bg);
  min-width: 0;
}

.tp-header {
  flex-shrink: 0;
  display: flex;
  justify-content: flex-end;
  align-items: center;
  padding: 10px 16px;
  border-bottom: 1px solid var(--th-border);
  background: var(--th-bg);
  gap: 8px;
}

.empty-state {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  font-family: var(--th-font);
  font-size: 0.88rem;
  color: var(--th-muted);
}

/* Patient detail panel header (JS-rendered) */
.tp-patient-header {
  flex-shrink: 0;
  padding: 14px 16px 10px;
  border-bottom: 1px solid var(--th-border);
  background: var(--th-bg);
}

.tp-patient-header-name {
  font-family: var(--th-font);
  font-size: 1.05rem;
  font-weight: 600;
  color: var(--th-text-strong);
}

.tp-patient-header-meta {
  font-family: var(--th-font);
  font-size: 0.72rem;
  color: var(--th-muted);
  margin-top: 2px;
}

/* Detail panel tabs */
.tp-tabs {
  display: flex;
  border-bottom: 1px solid var(--th-border);
  flex-shrink: 0;
  padding: 0 16px;
  background: var(--th-bg);
}

.tp-tab {
  font-family: var(--th-font);
  font-size: 0.75rem;
  font-weight: 600;
  color: var(--th-muted);
  padding: 10px 0;
  margin-right: 20px;
  border: none;
  background: none;
  cursor: pointer;
  border-bottom: 2px solid transparent;
  transition: color 0.15s, border-color 0.15s;
  min-height: auto;
}

.tp-tab.active {
  color: var(--th-primary);
  border-bottom-color: var(--th-primary);
}

/* Session row cards (JS rendered) */
.session-card {
  background: var(--th-surface);
  border-radius: var(--th-radius);
  border: 1px solid var(--th-border);
  border-left: 3px solid var(--th-primary);
  padding: 9px 12px;
  margin-bottom: 6px;
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.session-card-date {
  font-family: var(--th-font);
  font-size: 0.78rem;
  font-weight: 600;
  color: var(--th-text-strong);
}

.session-card-meta {
  font-family: var(--th-font);
  font-size: 0.65rem;
  color: var(--th-muted);
  margin-top: 2px;
}

.session-card-pain {
  font-family: var(--font-mono);
  font-size: 0.72rem;
  font-weight: 500;
}
```

- [ ] **Step 3: Verify**

Log in as therapist (sarah.chen@mayoclinic.org / demo123). Verify:
- Dark slate icon sidebar on far left (52px)
- Patient list column next to it with search
- Main panel shows "Select a patient" empty state
- Clicking a patient shows detail in main panel

- [ ] **Step 4: Commit**

```bash
git add code/index.html code/styles.css
git commit -m "Implement therapist dashboard with icon sidebar and 3-column layout"
```

---

## Task 11: Admin Screen + Final Cleanup

**Files:**
- Modify: `code/index.html` (adminScreen)
- Modify: `code/styles.css` (admin, cleanup)

- [ ] **Step 1: Replace adminScreen HTML**

Find `<div id="adminScreen" class="screen">` and replace:

```html
<div id="adminScreen" class="screen therapist-scope">
  <div class="th-admin-wrap">
    <div class="th-admin-header">
      <div>
        <div class="th-section-label">Admin</div>
        <div style="font-family:var(--th-font);font-size:1.1rem;font-weight:600;color:var(--th-text-strong);">Pending Therapists</div>
      </div>
      <button class="th-btn" onclick="logout()">Sign Out</button>
    </div>
    <div id="adminPendingList" class="th-admin-list"></div>
  </div>
</div>
```

- [ ] **Step 2: Add admin CSS to `styles.css`**

Replace `/* ── Admin panel ─────────────────────────────────────────────────────────── */` block with:

```css
/* ── Admin panel ─────────────────────────────────────────────────────────── */
#adminScreen {
  min-height: 100vh;
  background: var(--th-bg);
  align-items: center;
  justify-content: center;
}

.th-admin-wrap {
  width: 100%;
  max-width: 560px;
  padding: 40px 24px;
}

.th-admin-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  margin-bottom: 24px;
}

.th-admin-list { display: flex; flex-direction: column; gap: 8px; }

.pending-therapist-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 12px 14px;
  background: var(--th-surface);
  border-radius: var(--th-radius);
  border: 1px solid var(--th-border);
}

.pending-therapist-row:last-child { border-bottom: 1px solid var(--th-border); }
```

- [ ] **Step 3: Run Playwright visual check**

```bash
cd /Users/mini/phalanX && npx playwright test tests/e2e/ --headed --project=chromium 2>&1 | tail -20
```

Note which tests pass/fail. Failing tests due to selector changes from HTML restructure are expected — do not fix app logic.

- [ ] **Step 4: Final visual sweep in browser**

Open http://localhost:5173 and manually check each screen:
- Login: gradient header, Nunito font, gradient CTA button
- Patient home: navy header, hero button, 2×2 grid filling height
- Therapist: slate sidebar, patient list, detail panel
- No horizontal scroll on any screen at 390px width

- [ ] **Step 5: Commit**

```bash
git add code/index.html code/styles.css
git commit -m "Implement admin screen and complete UI design system rollout"
```

---

## Self-Review Checklist

**Spec coverage:**
- [x] Token system (Task 1) — all `:root`, `.patient-scope`, `.therapist-scope` vars
- [x] Font import update (Task 2)
- [x] Scope wrappers on all screens (Task 2)
- [x] Auth screens — login, signup, forgot (Tasks 3–4)
- [x] Consent, pending, connect screens (Task 5)
- [x] Patient home — 3-zone layout (Tasks 6–7)
- [x] Exercise select screen (Task 8)
- [x] Session recording + set input bottom sheet (Task 8)
- [x] Progress screen (Task 9)
- [x] Messaging screen (Task 9)
- [x] Therapist dashboard — icon sidebar + 3-column (Task 10)
- [x] Admin screen (Task 11)
- [x] No-scroll rules enforced via flex layout in all patient screens

**Not covered (out of scope per spec):**
- Clinic screens (clinicScreen, createClinicScreen, joinClinicScreen, clinicLibraryScreen) — styled by `.therapist-scope` token inheritance, full HTML redesign deferred
- mlTrainerScreen — dormant, token inheritance only
- Pain bar tap interaction beyond range slider (requires JS changes — out of scope)
