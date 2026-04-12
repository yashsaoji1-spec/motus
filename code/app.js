/* ═══════════════════════════════════════════════════════════════════════════
   Motus — Merged Script
   Combines: dashboard.html inline JS + script.js (calibration tracker)
   ═══════════════════════════════════════════════════════════════════════════ */

// ── npm imports (replaces CDN globals for Firebase + Chart.js) ──
import firebase from 'firebase/compat/app';
import 'firebase/compat/auth';
import 'firebase/compat/firestore';
import 'firebase/compat/app-check';
import Chart from 'chart.js/auto';

// ── MediaPipe stays on CDN — accessed via window at call time (not init time)
//    to avoid race conditions on mobile where CDN scripts may load slowly ──

/* ══════════════════════════════════════════════════════════════════════════
   SECTION 1: AUTH & STATE  (Firebase)
   ══════════════════════════════════════════════════════════════════════════ */

let currentRole = null;
let currentUser = null;
let selectedRole = 'patient';
let selectedProtocol = null;
let _exercisesProtocols = [];
let editingProtocolId = null;  // non-null when therapist is editing an existing protocol
let editingPatientEmail = null;
var activeSheetProtocol = null;
let _protoPatientEmail = null;
let _apmNewExCat = false;
let _bulkAssignMode = false;
let _exercisesDoneById = {};  // sets completed today per protocolId, set in showExercisesScreen

// ── Protocol Library state ──
let _plLibrary = [];
let _plSelectedId = null;
let _plCreateMode = false;
let _plTherapistData = null;
let _plHiddenOpen = false;

// ── Clinic state ──
let _msgBadgeUnsub         = null;  // unsubscribe fn for patient unread badge listener
let _msgThreadUnsub        = null;  // unsubscribe fn for active message thread listener
let _msgPatientBadgesUnsub = null;  // unsubscribe fn for therapist sidebar unread badges
let _myClinic      = null;   // clinic doc data or null
let _myClinicId    = null;   // Firestore clinic document ID or null
let _clinicInvites = [];     // pending invites for current user
let _clinicLibrary = [];     // shared exercises in clinic library

// ── Video recording state ──
let mediaRecorder        = null;   // active MediaRecorder during a session
let recordedChunks       = [];     // Blob chunks accumulated from MediaRecorder
let recordingSupported   = false;  // false on iOS/unsupported browsers — skip all recording logic
let _pendingSessionDocId = null;   // Firestore doc ID to patch with videoUrl after upload completes
let _recordingTimeout    = null;   // setTimeout handle for max-duration enforcement
let _micStream           = null;   // audio-only stream for session recording

// ── Demo recording state (Add Protocol modal) ──
let _demoStream          = null;   // getUserMedia stream for demo camera
let _demoMediaRecorder   = null;   // MediaRecorder for demo recording
let _demoChunks          = [];     // accumulated chunks for demo
let _demoBlob            = null;   // final demo blob (recorded or uploaded)
let _demoThumbnailUrl     = null;   // thumbnail from uploaded video
let _demoFacingMode      = 'environment'; // rear camera default
let _demoTimerInterval   = null;   // countdown timer interval
let _demoTimerSec        = 0;      // elapsed seconds
let _demoAnimFrame       = null;   // requestAnimationFrame handle for canvas draw loop
let _demoExistingVideoUrl = null;  // preserves existing URL in edit mode
let _pendingDemoProtocol  = null;  // protocol awaiting demo auto-play on patient side
let _manualCamProtocol    = null;  // current protocol for manual camera session
let _manualCamSetData    = [];    // array of {reps, pain, notes, videoUrl} for each set
let _manualCamCurrentSet = 1;     // current set number (1-indexed)
let _manualCamTotalSets = 3;      // total sets for this session
let _manualCamStream    = null;  // getUserMedia stream
let _manualCamRecorder  = null;  // MediaRecorder for manual camera
let _manualCamChunks    = [];    // recorded chunks for current set
let _manualCamVideoUrl  = null;   // uploaded video URL for current set
let _manualCamCurrentBlob = null; // video blob from current set

const CLOUDINARY_CLOUD  = 'dslbugsdg';
const CLOUDINARY_PRESET = 'phalanx-videos';
async function uploadVideoToCloudinary(blob) {
  if (!blob || blob.size === 0) return null;
  try {
    const form = new FormData();
    form.append('file', blob);
    form.append('upload_preset', CLOUDINARY_PRESET);
    form.append('resource_type', 'video');
    const res = await fetch(`https://api.cloudinary.com/v1_1/${CLOUDINARY_CLOUD}/video/upload`, {
      method: 'POST',
      body: form
    });
    const data = await res.json();
    return data.secure_url || null;
  } catch(e) {
    console.warn('[Motus] Video upload error:', e);
    return null;
  }
}

// ── Video tiers — bitrate (bps), max duration (sec), expiry (days, null = permanent) ──
const VIDEO_TIERS = {
  demo:    { bitrate: 800_000, maxDurationSec: 120, expireDays: null },
  session: { bitrate: 500_000, maxDurationSec: 600, expireDays: 14  },
  message: { bitrate: 300_000, maxDurationSec:  60, expireDays:  7  }
};

// ── Feature flags — set to false to disable without deleting code ──
const ANGLE_TRACKING_ENABLED = false;

// ── Firebase config — replace all REPLACE_* values with your project's config ──
// Get these from: Firebase console → Project Settings → Your apps → SDK setup
// Required Firestore composite indexes (create in Firebase console → Firestore → Indexes):
//   sessions:  patientEmail ASC, date ASC
//   messages:  participants ARRAY, timestamp ASC
//   messages:  to ASC, from ASC, read ASC
const FIREBASE_CONFIG = {
  apiKey:            import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain:        import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId:         import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket:     import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId:             import.meta.env.VITE_FIREBASE_APP_ID,
};

firebase.initializeApp(FIREBASE_CONFIG);

// App Check — dev uses a debug token printed to console; prod uses reCAPTCHA v3.
// To activate: Firebase Console → App Check → register web app with site key below,
// then enable enforcement on Firestore once staging confirms everything works.
// Skip App Check entirely in E2E test runs (VITE_E2E_TEST=true) — fresh Playwright
// contexts generate unregistered debug tokens which cause 403 errors.
if (import.meta.env.DEV) {
  self.FIREBASE_APPCHECK_DEBUG_TOKEN = true;
}
if (import.meta.env.VITE_RECAPTCHA_SITE_KEY && !import.meta.env.VITE_E2E_TEST) {
  firebase.appCheck().activate(import.meta.env.VITE_RECAPTCHA_SITE_KEY, true);
}

const db   = firebase.firestore();
const auth = firebase.auth();

db.enablePersistence({ synchronizeTabs: true }).catch(err => {
  if (err.code === 'failed-precondition') console.warn('Persistence failed: multiple tabs open');
  else if (err.code === 'unimplemented') console.warn('Persistence not available in this browser');
});

// Restore session on page reload and route on sign-in / sign-out
auth.onAuthStateChanged(async (firebaseUser) => {
  if (!firebaseUser) {
    currentUser = null;
    currentRole = null;
    _stopInactivityTimer();
    showScreen('loginScreen');
    return;
  }
  try {
    const snap = await db.collection('users').doc(firebaseUser.email).get();
    currentUser = { email: firebaseUser.email, ...snap.data() };
    currentRole = currentUser.role;
    // Require email verification for non-admin accounts (demo accounts exempt)
    const DEMO_EMAILS = new Set(['sarah.chen@mayoclinic.org', 'james.park@gmail.com', 'mike.torres@mayoclinic.org', 'test.patient@motus.com']);
    if (!firebaseUser.emailVerified && currentRole !== 'admin' && !DEMO_EMAILS.has(firebaseUser.email)) {
      await auth.signOut();
      showScreen('loginScreen');
      showError('loginError', 'Please verify your email before signing in. Check your inbox for the verification link.');
      return;
    }
    await loginSuccess();
    loadMLModels();
    resetInactivityTimer();
  } catch (e) {
    console.error('onAuthStateChanged error:', e);
    showScreen('loginScreen');
  }
});

// ── Session timeout ────────────────────────────────────────────────────────
const TIMEOUT_MS = 20 * 60 * 1000;
const WARNING_MS =  2 * 60 * 1000;

let _inactivityTimer = null;
let _warningTimer    = null;

function resetInactivityTimer() {
  clearTimeout(_inactivityTimer);
  clearTimeout(_warningTimer);
  dismissTimeoutWarning();
  _warningTimer    = setTimeout(showTimeoutWarning, TIMEOUT_MS - WARNING_MS);
  _inactivityTimer = setTimeout(autoLogout, TIMEOUT_MS);
}

function _stopInactivityTimer() {
  clearTimeout(_inactivityTimer);
  clearTimeout(_warningTimer);
  dismissTimeoutWarning();
}

function showTimeoutWarning() {
  const el = document.getElementById('timeoutWarning');
  if (el) el.style.display = 'flex';
}

function dismissTimeoutWarning() {
  const el = document.getElementById('timeoutWarning');
  if (el) el.style.display = 'none';
}

function autoLogout() {
  const isRecording = (mediaRecorder && mediaRecorder.state !== 'inactive') ||
                      (_manualCamRecorder && _manualCamRecorder.state !== 'inactive');
  if (isRecording) {
    _inactivityTimer = setTimeout(autoLogout, 30 * 1000);
    return;
  }
  dismissTimeoutWarning();
  auth.signOut();
  sessionStorage.clear();
}

['click', 'keydown', 'touchstart', 'scroll'].forEach(ev =>
  document.addEventListener(ev, () => { if (currentUser) resetInactivityTimer(); }, { passive: true })
);

function generateCodeForEmail(email) {
  let hash = 0;
  for (let i = 0; i < email.length; i++) {
    hash = ((hash << 5) - hash) + email.charCodeAt(i);
    hash |= 0;
  }
  return String(Math.abs(hash) % 900000 + 100000);
}

async function getConnectedPatients(therapistEmail) {
  const doc = await db.collection('connections').doc(therapistEmail).get();
  const emails = doc.exists ? (doc.data().patients || []) : [];
  const snaps = await Promise.all(emails.map(e => db.collection('users').doc(e).get()));
  return snaps.filter(d => d.exists).map(d => ({ email: d.id, ...d.data() }));
}

async function saveConnection(therapistEmail, patientEmail) {
  await Promise.all([
    db.collection('connections').doc(therapistEmail)
      .set({ patients: firebase.firestore.FieldValue.arrayUnion(patientEmail) }, { merge: true }),
    db.collection('users').doc(patientEmail)
      .update({ therapistEmail }),
  ]);
}

async function getConnectedTherapist() {
  if (!currentUser) return null;
  return currentUser.therapistEmail || null;
}

async function getTherapistForCode(code) {
  const snap = await db.collection('users').where('role', '==', 'therapist').get();
  for (const doc of snap.docs) {
    if (generateCodeForEmail(doc.id) === code) return { email: doc.id, ...doc.data() };
  }
  return null;
}

/* ══════════════════════════════════════════════════════════════════════════
   SECTION 2: NAVIGATION
   ══════════════════════════════════════════════════════════════════════════ */

const screenTitles = {
  loginScreen:         'Motus — Sign In',
  signupScreen:        'Motus — Create Account',
  forgotScreen:        'Motus — Reset Password',
  connectScreen:       'Motus — Connect to Therapist',
  patientScreen:       'Motus — Home',
  cameraScreen:        'Motus — Session',
  therapistScreen:     'Motus — Therapist Dashboard',
  exercisesScreen:     'Motus — My Exercises',
  progressScreen:      'Motus — My Progress',
  pendingScreen:       'Motus — Pending Approval',
  adminScreen:         'Motus — Admin Panel',
  clinicScreen:        'Motus — My Clinic',
  createClinicScreen:  'Motus — Create Clinic',
  joinClinicScreen:    'Motus — Join Clinic',
  clinicLibraryScreen: 'Motus — Clinic Library',
};

const AUTH_SCREENS = new Set(['loginScreen', 'signupScreen', 'forgotScreen', 'roleScreen', 'connectScreen', 'pendingScreen', 'consentScreen']);

function showScreen(screenId) {
  closeSidebar();
  const prevActive = document.querySelector('.screen.active');
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  const next = document.getElementById(screenId);
  next.classList.add('active');
  next.scrollTop = 0;
  if (screenTitles[screenId]) document.title = screenTitles[screenId];
  // Move focus to the new screen's first heading or first focusable element
  const focusTarget = next.querySelector('h1, h2, [tabindex="0"], button, input, a[href]');
  if (focusTarget) focusTarget.focus({ preventScroll: true });
  if (!AUTH_SCREENS.has(screenId)) sessionStorage.setItem('motus_screen', screenId);

  // Clean up message thread listener when leaving messaging screen
  if (prevActive && prevActive.id === 'messagingScreen' && screenId !== 'messagingScreen') {
    if (_msgThreadUnsub) { _msgThreadUnsub(); _msgThreadUnsub = null; }
  }

  // Stop session camera when leaving camera screen
  if (prevActive && prevActive.id === 'cameraScreen' && screenId !== 'cameraScreen') {
    if (mediaRecorder && mediaRecorder.state !== 'inactive') {
      mediaRecorder.stop();
      recordedChunks = [];
      mediaRecorder = null;
      hideRecordingIndicator();
    }
    if (mpCamera) { mpCamera.stop(); mpCamera = null; }
    if (_micStream) { _micStream.getTracks().forEach(t => t.stop()); _micStream = null; }
    currentFacingMode = 'user';
  }


  // Reset forgot-password form if navigating away mid-flow
  if (screenId !== 'forgotScreen') {
    const fe = document.getElementById('forgotEmail');
    const fp = document.getElementById('forgotNewPassword');
    const npf = document.getElementById('newPasswordField');
    const fb = document.getElementById('forgotBtn');
    const fs = document.getElementById('forgotSuccess');
    if (fe)  { fe.value = ''; fe.disabled = false; }
    if (fp)  fp.value = '';
    if (npf) npf.style.display = 'none';
    if (fb)  fb.textContent = 'Find Account';
    if (fs)  fs.style.display = 'none';
    hideError('forgotError');
  }
}

function selectRole(role) {
  selectedRole = role;
  document.getElementById('rolePatientBtn').classList.toggle('active',    role === 'patient');
  document.getElementById('roleTherapistBtn').classList.toggle('active', role === 'therapist');
}

function showError(id, msg) { const el = document.getElementById(id); el.textContent = msg; el.style.display = 'block'; }
function hideError(id)      { document.getElementById(id).style.display = 'none'; }

/* ══════════════════════════════════════════════════════════════════════════
   SECTION 3: LOGIN / SIGNUP / FORGOT
   ══════════════════════════════════════════════════════════════════════════ */

const LOGIN_MAX_ATTEMPTS = 5;
const LOGIN_LOCKOUT_MS   = 15 * 60 * 1000; // 15 minutes
let _loginAttempts  = 0;
let _loginLockedUntil = 0;

async function handleLogin() {
  hideError('loginError');

  const now = Date.now();
  if (now < _loginLockedUntil) {
    const secsLeft = Math.ceil((_loginLockedUntil - now) / 1000);
    showError('loginError', `Too many failed attempts. Try again in ${secsLeft} seconds.`);
    return;
  }

  const email    = document.getElementById('loginEmail').value.trim().toLowerCase();
  const password = document.getElementById('loginPassword').value;
  if (!email || !password) { showError('loginError', 'Please enter your email and password.'); return; }
  try {
    await auth.signInWithEmailAndPassword(email, password);
    _loginAttempts = 0;
    // onAuthStateChanged handles routing
  } catch (e) {
    const isCredError = (e.code === 'auth/wrong-password' || e.code === 'auth/user-not-found' || e.code === 'auth/invalid-credential');

    if (isCredError) {
      _loginAttempts++;
      if (_loginAttempts >= LOGIN_MAX_ATTEMPTS) {
        _loginLockedUntil = Date.now() + LOGIN_LOCKOUT_MS;
        _loginAttempts = 0;
        showError('loginError', 'Too many failed attempts. Account locked for 15 minutes.');
        return;
      }
    }
    showError('loginError',
      isCredError
        ? `Incorrect email or password. ${LOGIN_MAX_ATTEMPTS - _loginAttempts} attempt(s) remaining.`
        : (e.message || 'Sign in failed. Please try again.'));
  }
}

async function handleSignup() {
  hideError('signupError');
  const name     = document.getElementById('signupName').value.trim();
  const email    = document.getElementById('signupEmail').value.trim().toLowerCase();
  const password = document.getElementById('signupPassword').value;
  if (!name || !email || !password) { showError('signupError', 'Please fill in all fields.'); return; }
  if (name.length < 2) { showError('signupError', 'Please enter your full name.'); return; }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { showError('signupError', 'Please enter a valid email address.'); return; }
  if (password.length < 8) { showError('signupError', 'Password must be at least 8 characters.'); return; }
  try {
    const cred = await auth.createUserWithEmailAndPassword(email, password);
    const roleToSave = selectedRole === 'therapist' ? 'therapist_pending' : 'patient';
    await db.collection('users').doc(cred.user.email).set({ name, role: roleToSave });
    await cred.user.sendEmailVerification();
    await auth.signOut();
    showScreen('loginScreen');
    showError('loginError', 'Account created. Check your email to verify before signing in.');
  } catch (e) {
    showError('signupError',
      e.code === 'auth/email-already-in-use'
        ? 'An account with that email already exists.'
        : (e.message || 'Sign up failed. Please try again.'));
  }
}

async function handleForgot() {
  hideError('forgotError');
  const email = document.getElementById('forgotEmail').value.trim().toLowerCase();
  if (!email) { showError('forgotError', 'Please enter your email.'); return; }
  try {
    await auth.sendPasswordResetEmail(email);
    const successEl = document.getElementById('forgotSuccess');
    successEl.textContent = 'Password reset email sent! Check your inbox.';
    successEl.style.display = 'block';
    setTimeout(() => {
      successEl.style.display = 'none';
      document.getElementById('forgotEmail').value = '';
      showScreen('loginScreen');
    }, 3000);
  } catch (e) {
    // Don't distinguish user-not-found — prevents account enumeration
    showError('forgotError', 'If an account exists with that email, a reset link has been sent.');
  }
}

/* ══════════════════════════════════════════════════════════════════════════
   SECTION 4: CONNECT
   ══════════════════════════════════════════════════════════════════════════ */

async function handleConnect() {
  hideError('connectError');
  const code = document.getElementById('clinicCodeInput').value.trim();
  if (code.length !== 6 || isNaN(code)) { showError('connectError', 'Please enter a valid 6-digit clinic code.'); return; }
  const therapist = await getTherapistForCode(code);
  if (!therapist) { showError('connectError', 'No therapist found with that code. Double-check with your therapist.'); return; }
  await saveConnection(therapist.email, currentUser.email);
  const successEl = document.getElementById('connectSuccess');
  successEl.textContent = `Connected to ${therapist.name}! Loading your exercises...`;
  successEl.style.display = 'block';
  setTimeout(async () => {
    showScreen('patientScreen');
    await updatePatientHomeScreen();
    await initSetTracker();
  }, 1800);
}

async function skipConnect() {
  showScreen('patientScreen');
  await updatePatientHomeScreen();
  await initSetTracker();
}

/* ══════════════════════════════════════════════════════════════════════════
   SECTION 5: LOGIN SUCCESS / LOGOUT
   ══════════════════════════════════════════════════════════════════════════ */

async function loginSuccess() {
  const savedScreen = sessionStorage.getItem('motus_screen');

  if (currentRole === 'admin') {
    showScreen('adminScreen');
    await loadAdminScreen();
  } else if (currentRole === 'therapist') {
    showScreen('therapistScreen');
    document.getElementById('therapistCode').textContent = generateCodeForEmail(currentUser.email);
    await loadConnectedPatients();
    await loadMyClinic();
    await loadMyInvites();
  } else if (currentRole === 'therapist_pending') {
    showScreen('pendingScreen');
  } else {
    // patient -- require consent before any PHI screen
    if (!currentUser.consentGiven) {
      showScreen('consentScreen');
      return;
    }
    await routePatient();
  }

  await restoreScreen(savedScreen);
}

async function routePatient() {
  const therapistEmail = await getConnectedTherapist().catch(() => null);
  if (therapistEmail) {
    showScreen('patientScreen');
    await updatePatientHomeScreen().catch(e => console.error('updatePatientHomeScreen:', e));
    await initSetTracker().catch(e => console.error('initSetTracker:', e));
  } else {
    showScreen('connectScreen');
  }
}

async function acceptConsent() {
  const timestamp = new Date().toISOString();
  try {
    await db.collection('users').doc(currentUser.email).update({
      consentGiven: true,
      consentTimestamp: timestamp,
    });
  } catch (e) {
    const err = document.getElementById('consentError');
    if (err) {
      err.textContent = 'Failed to save consent. Please check your connection and try again.';
      err.style.display = 'block';
    }
    return;
  }
  currentUser.consentGiven = true;
  currentUser.consentTimestamp = timestamp;
  await routePatient();
}

async function restoreScreen(saved) {
  if (!saved) return;

  // cameraScreen session state is gone on refresh — can't restore
  // messagingScreen needs currentPatient set — can't restore
  if (currentRole === 'therapist') {
    if (saved === 'mlTrainerScreen' && ANGLE_TRACKING_ENABLED) { await startMLTrainer(); }
    else if (saved === 'clinicScreen') { await showClinicScreen(); }
    else if (saved === 'joinClinicScreen') { showJoinClinicScreen(); }
    else if (saved === 'clinicLibraryScreen' && _myClinicId) { await showClinicLibraryScreen(); }
    // therapistScreen is already shown by loginSuccess — nothing to do
  } else if (currentRole === 'patient') {
    if (saved === 'exercisesScreen') { await showExercisesScreen(); }
    else if (saved === 'progressScreen') { await showProgressScreen(); }
    // patientScreen already shown by loginSuccess — nothing to do
  }
}

function logout() {
  if (mpCamera) { mpCamera.stop(); mpCamera = null; }
  if (restTimerInterval) { clearInterval(restTimerInterval); restTimerInterval = null; }
  sessionStorage.removeItem('motus_screen');
  auth.signOut();
  // onAuthStateChanged resets currentUser/currentRole and shows loginScreen
}

function requestLogout() {
  document.getElementById('logoutWarning').textContent = repCount > 0
    ? `You have ${repCount} unsaved reps. Leaving now will lose this set's data.`
    : 'You will be signed out of Motus.';
  document.getElementById('logoutModal').style.display = 'flex';
}

function closeLogoutModal() { document.getElementById('logoutModal').style.display = 'none'; }
function confirmLogout()    { closeLogoutModal(); logout(); }

/* ══════════════════════════════════════════════════════════════════════════
   SECTION 5b: ADMIN PANEL
   ══════════════════════════════════════════════════════════════════════════ */

async function loadAdminScreen() {
  const snap = await db.collection('users').where('role', '==', 'therapist_pending').get();
  const list = document.getElementById('pendingTherapistList');
  if (snap.empty) {
    list.innerHTML = '<p style="color:var(--muted)">No pending therapist approvals.</p>';
    return;
  }
  list.innerHTML = snap.docs.map(d => {
    const u = d.data();
    return `<div class="pending-therapist-row">
      <div>
        <strong>${u.name}</strong><br>
        <span style="color:var(--muted);font-size:0.85rem">${d.id}</span>
      </div>
      <div style="display:flex;gap:0.5rem">
        <button class="auth-btn" style="padding:0.4rem 0.9rem;font-size:0.85rem;margin:0" onclick="approveTherapist('${d.id}')">Approve</button>
        <button class="logout-btn" onclick="rejectTherapist('${d.id}')">Reject</button>
      </div>
    </div>`;
  }).join('');
}

async function approveTherapist(email) {
  await db.collection('users').doc(email).update({ role: 'therapist' });
  await loadAdminScreen();
}

async function rejectTherapist(email) {
  if (!confirm(`Remove ${email}'s account entirely?`)) return;
  await db.collection('users').doc(email).delete();
  await loadAdminScreen();
}

/* ══════════════════════════════════════════════════════════════════════════
   SECTION 5c: CLINICS
   ══════════════════════════════════════════════════════════════════════════ */

function generateClinicCode() {
  return String(Math.floor(100000 + Math.random() * 900000));
}

async function loadMyClinic() {
  _myClinic = null;
  _myClinicId = null;
  if (!currentUser) return;
  const userDoc = await db.collection('users').doc(currentUser.email).get();
  const clinicId = userDoc.exists ? userDoc.data().clinicId : null;
  if (!clinicId) return;
  const clinicDoc = await db.collection('clinics').doc(clinicId).get();
  if (clinicDoc.exists) {
    _myClinic = clinicDoc.data();
    _myClinicId = clinicDoc.id;
  } else {
    // Stale clinicId — clear it
    await db.collection('users').doc(currentUser.email).update({ clinicId: firebase.firestore.FieldValue.delete() });
  }
}

async function loadMyInvites() {
  _clinicInvites = [];
  if (!currentUser) return;
  const snap = await db.collection('clinicInvites')
    .where('inviteeEmail', '==', currentUser.email)
    .where('status', '==', 'pending')
    .get();
  _clinicInvites = snap.docs.map(d => ({ id: d.id, ...d.data() }));
  _updateClinicBadge();
}

function _updateClinicBadge() {
  const badge = document.getElementById('clinicInviteBadge');
  if (!badge) return;
  const count = _clinicInvites.length;
  badge.textContent = count;
  badge.style.display = count > 0 ? 'inline-flex' : 'none';
}

function showMyClinicOrJoin() {
  if (_myClinicId) {
    showClinicScreen();
  } else {
    showJoinClinicScreen();
  }
}

function showCreateClinicScreen() {
  document.getElementById('createClinicName').value = '';
  document.getElementById('createClinicError').style.display = 'none';
  showScreen('createClinicScreen');
}

async function createClinic() {
  const name = document.getElementById('createClinicName').value.trim();
  const errEl = document.getElementById('createClinicError');
  if (!name) { errEl.textContent = 'Enter a clinic name.'; errEl.style.display = 'block'; return; }
  if (_myClinicId) { errEl.textContent = 'You are already in a clinic. Leave it first.'; errEl.style.display = 'block'; return; }

  const joinCode = generateClinicCode();
  const clinicRef = db.collection('clinics').doc();
  await clinicRef.set({
    name,
    ownerEmail: currentUser.email,
    therapists: [currentUser.email],
    joinCode,
    joinCodeEnabled: true,
    createdAt: new Date().toISOString(),
  });
  await db.collection('users').doc(currentUser.email).update({ clinicId: clinicRef.id });
  await db.collection('clinicLibrary').doc(clinicRef.id).set({ sharedExercises: [] });

  _myClinicId = clinicRef.id;
  _myClinic = { name, ownerEmail: currentUser.email, therapists: [currentUser.email], joinCode, joinCodeEnabled: true };
  showClinicScreen();
}

function showJoinClinicScreen() {
  document.getElementById('joinClinicCodeInput').value = '';
  document.getElementById('joinClinicError').style.display = 'none';
  document.getElementById('joinClinicSuccess').style.display = 'none';
  _renderInvitesList();
  showScreen('joinClinicScreen');
}

function _renderInvitesList() {
  const list = document.getElementById('clinicInvitesList');
  if (!list) return;
  if (_clinicInvites.length === 0) {
    list.innerHTML = '<p class="clinic-empty-text">No pending invites.</p>';
    return;
  }
  list.innerHTML = _clinicInvites.map(inv => `
    <div class="clinic-invite-row">
      <div>
        <strong>${inv.clinicName}</strong>
        <div class="clinic-invite-from">Invited by ${inv.invitedBy}</div>
      </div>
      <div class="clinic-invite-actions">
        <button class="auth-btn" style="padding:0.35rem 0.8rem;font-size:0.8rem;margin:0" onclick="acceptInvite('${inv.id}')">Accept</button>
        <button class="logout-btn" style="font-size:0.8rem" onclick="declineInvite('${inv.id}')">Decline</button>
      </div>
    </div>
  `).join('');
}

async function joinClinicByCode() {
  const code = document.getElementById('joinClinicCodeInput').value.trim();
  const errEl = document.getElementById('joinClinicError');
  const succEl = document.getElementById('joinClinicSuccess');
  errEl.style.display = 'none';
  succEl.style.display = 'none';

  if (code.length !== 6) { errEl.textContent = 'Enter a 6-digit code.'; errEl.style.display = 'block'; return; }
  if (_myClinicId) { errEl.textContent = 'You are already in a clinic. Leave it first.'; errEl.style.display = 'block'; return; }

  const snap = await db.collection('clinics')
    .where('joinCode', '==', code)
    .where('joinCodeEnabled', '==', true)
    .get();

  if (snap.empty) {
    errEl.textContent = 'Invalid or disabled code. Ask the clinic owner for a valid code.';
    errEl.style.display = 'block';
    return;
  }

  const clinicDoc = snap.docs[0];
  if ((clinicDoc.data().therapists || []).includes(currentUser.email)) {
    errEl.textContent = 'You are already a member of this clinic.';
    errEl.style.display = 'block';
    return;
  }

  await clinicDoc.ref.update({ therapists: firebase.firestore.FieldValue.arrayUnion(currentUser.email) });
  await db.collection('users').doc(currentUser.email).update({ clinicId: clinicDoc.id });

  _myClinicId = clinicDoc.id;
  _myClinic = { ...clinicDoc.data(), therapists: [...(clinicDoc.data().therapists || []), currentUser.email] };
  showClinicScreen();
}

async function acceptInvite(inviteId) {
  const invite = _clinicInvites.find(i => i.id === inviteId);
  if (!invite) return;
  if (_myClinicId) { alert('You are already in a clinic. Leave it first.'); return; }

  const clinicDoc = await db.collection('clinics').doc(invite.clinicId).get();
  if (!clinicDoc.exists) {
    await db.collection('clinicInvites').doc(inviteId).update({ status: 'declined' });
    _clinicInvites = _clinicInvites.filter(i => i.id !== inviteId);
    _renderInvitesList();
    _updateClinicBadge();
    return;
  }

  await clinicDoc.ref.update({ therapists: firebase.firestore.FieldValue.arrayUnion(currentUser.email) });
  await db.collection('users').doc(currentUser.email).update({ clinicId: invite.clinicId });
  await db.collection('clinicInvites').doc(inviteId).update({ status: 'accepted' });

  _myClinicId = invite.clinicId;
  _myClinic = { ...clinicDoc.data() };
  if (!(_myClinic.therapists || []).includes(currentUser.email)) {
    _myClinic = { ..._myClinic, therapists: [...(_myClinic.therapists || []), currentUser.email] };
  }
  _clinicInvites = _clinicInvites.filter(i => i.id !== inviteId);
  _updateClinicBadge();
  showClinicScreen();
}

async function declineInvite(inviteId) {
  await db.collection('clinicInvites').doc(inviteId).update({ status: 'declined' });
  _clinicInvites = _clinicInvites.filter(i => i.id !== inviteId);
  _renderInvitesList();
  _updateClinicBadge();
}

async function showClinicScreen() {
  await loadMyClinic();
  if (!_myClinic) { showJoinClinicScreen(); return; }
  _renderClinicScreen();
  showScreen('clinicScreen');
}

function _renderClinicScreen() {
  if (!_myClinic) return;
  const isOwner = _myClinic.ownerEmail === currentUser.email;
  const members = _myClinic.therapists || [];

  const memberRows = members.map(email => {
    const isMe = email === currentUser.email;
    const isMemberOwner = email === _myClinic.ownerEmail;
    return `<div class="clinic-member-row">
      <div class="clinic-member-info">
        <span class="clinic-member-email">${email}</span>
        ${isMemberOwner ? '<span class="clinic-role-tag clinic-owner-tag">Owner</span>' : ''}
        ${isMe ? '<span class="clinic-role-tag clinic-you-tag">You</span>' : ''}
      </div>
      ${isOwner && !isMe ? `<button class="logout-btn" style="font-size:0.75rem;padding:0.2rem 0.6rem" onclick="removeClinicMember('${email}')">Remove</button>` : ''}
    </div>`;
  }).join('');

  const codeSection = isOwner ? `
    <div class="clinic-section-card">
      <div class="clinic-section-label">Join Code</div>
      <div class="clinic-code-row">
        <span class="clinic-join-code">${_myClinic.joinCodeEnabled ? _myClinic.joinCode : '——————'}</span>
        <button class="clinic-text-btn" onclick="copyClinicJoinCode()">Copy</button>
        <button class="clinic-text-btn" onclick="regenerateClinicCode()">Regenerate</button>
        <button class="clinic-text-btn" onclick="toggleClinicCode()">${_myClinic.joinCodeEnabled ? 'Disable' : 'Enable'}</button>
      </div>
      <div class="clinic-section-label" style="margin-top:1.2rem">Invite by Email</div>
      <div class="clinic-invite-input-row">
        <input type="email" id="clinicInviteEmail" class="clinic-invite-input" placeholder="colleague@clinic.com" />
        <button class="auth-btn" style="padding:0.4rem 0.9rem;font-size:0.85rem;margin:0" onclick="sendClinicInvite()">Invite</button>
      </div>
      <div id="clinicInviteMsg" class="clinic-msg" style="display:none"></div>
    </div>
  ` : '';

  document.getElementById('clinicScreenContent').innerHTML = `
    <div class="clinic-name-header">${_myClinic.name}</div>
    ${codeSection}
    <div class="clinic-section-card">
      <div class="clinic-section-label">Members (${members.length})</div>
      <div class="clinic-members-list">${memberRows}</div>
    </div>
    <div class="clinic-bottom-actions">
      <button class="auth-btn" onclick="showClinicLibraryScreen()">Shared Exercise Library</button>
      <button class="logout-btn" onclick="confirmLeaveClinic()">${isOwner && members.length === 1 ? 'Disband Clinic' : 'Leave Clinic'}</button>
    </div>
  `;
}

function copyClinicJoinCode() {
  if (!_myClinic || !_myClinic.joinCodeEnabled) return;
  navigator.clipboard.writeText(_myClinic.joinCode).catch(() => {});
}

async function regenerateClinicCode() {
  if (!_myClinicId || !_myClinic || _myClinic.ownerEmail !== currentUser.email) return;
  if (!confirm('Regenerate join code? The old code will stop working immediately.')) return;
  const newCode = generateClinicCode();
  await db.collection('clinics').doc(_myClinicId).update({ joinCode: newCode });
  _myClinic.joinCode = newCode;
  _renderClinicScreen();
}

async function toggleClinicCode() {
  if (!_myClinicId || !_myClinic || _myClinic.ownerEmail !== currentUser.email) return;
  const newVal = !_myClinic.joinCodeEnabled;
  await db.collection('clinics').doc(_myClinicId).update({ joinCodeEnabled: newVal });
  _myClinic.joinCodeEnabled = newVal;
  _renderClinicScreen();
}

async function sendClinicInvite() {
  const email = (document.getElementById('clinicInviteEmail').value || '').trim().toLowerCase();
  const msgEl = document.getElementById('clinicInviteMsg');
  msgEl.style.display = 'none';
  if (!email || !email.includes('@')) {
    msgEl.textContent = 'Enter a valid email.';
    msgEl.style.display = 'block';
    msgEl.style.color = 'var(--danger)';
    return;
  }
  if (!_myClinicId || !_myClinic || _myClinic.ownerEmail !== currentUser.email) return;
  if ((_myClinic.therapists || []).includes(email)) {
    msgEl.textContent = `${email} is already in the clinic.`;
    msgEl.style.display = 'block';
    msgEl.style.color = 'var(--danger)';
    return;
  }

  const existing = await db.collection('clinicInvites')
    .where('clinicId', '==', _myClinicId)
    .where('inviteeEmail', '==', email)
    .where('status', '==', 'pending')
    .get();
  if (!existing.empty) {
    msgEl.textContent = 'Invite already pending for that email.';
    msgEl.style.display = 'block';
    msgEl.style.color = 'var(--muted)';
    return;
  }

  await db.collection('clinicInvites').add({
    clinicId: _myClinicId,
    clinicName: _myClinic.name,
    inviteeEmail: email,
    invitedBy: currentUser.email,
    status: 'pending',
    createdAt: new Date().toISOString(),
  });
  msgEl.textContent = `Invite sent to ${email}.`;
  msgEl.style.display = 'block';
  msgEl.style.color = 'var(--green)';
  document.getElementById('clinicInviteEmail').value = '';
}

async function removeClinicMember(email) {
  if (!_myClinicId || !_myClinic || _myClinic.ownerEmail !== currentUser.email) return;
  if (!confirm(`Remove ${email} from the clinic?`)) return;
  await db.collection('clinics').doc(_myClinicId).update({
    therapists: firebase.firestore.FieldValue.arrayRemove(email),
  });
  await db.collection('users').doc(email).update({ clinicId: firebase.firestore.FieldValue.delete() });
  _myClinic.therapists = (_myClinic.therapists || []).filter(e => e !== email);
  _renderClinicScreen();
}

async function confirmLeaveClinic() {
  if (!_myClinicId || !_myClinic) return;
  const isOwner = _myClinic.ownerEmail === currentUser.email;
  const members = _myClinic.therapists || [];

  if (isOwner && members.length === 1) {
    if (!confirm('Disband this clinic? The clinic and its shared exercise library will be permanently deleted.')) return;
    await db.collection('clinicLibrary').doc(_myClinicId).delete();
    await db.collection('clinics').doc(_myClinicId).delete();
    await db.collection('users').doc(currentUser.email).update({ clinicId: firebase.firestore.FieldValue.delete() });
    _myClinic = null;
    _myClinicId = null;
    showScreen('therapistScreen');
    return;
  }

  if (isOwner) {
    const newOwner = members.find(e => e !== currentUser.email);
    if (!confirm(`Leaving will transfer ownership to ${newOwner}. Continue?`)) return;
    await db.collection('clinics').doc(_myClinicId).update({
      ownerEmail: newOwner,
      therapists: firebase.firestore.FieldValue.arrayRemove(currentUser.email),
    });
  } else {
    if (!confirm('Leave this clinic?')) return;
    await db.collection('clinics').doc(_myClinicId).update({
      therapists: firebase.firestore.FieldValue.arrayRemove(currentUser.email),
    });
  }

  await db.collection('users').doc(currentUser.email).update({ clinicId: firebase.firestore.FieldValue.delete() });
  _myClinic = null;
  _myClinicId = null;
  showScreen('therapistScreen');
}

/* ══════════════════════════════════════════════════════════════════════════
   SECTION 5d: CLINIC LIBRARY
   ══════════════════════════════════════════════════════════════════════════ */

async function loadClinicLibrary() {
  _clinicLibrary = [];
  if (!_myClinicId) return;
  try {
    const doc = await db.collection('clinicLibrary').doc(_myClinicId).get();
    if (doc.exists) _clinicLibrary = doc.data().sharedExercises || [];
  } catch (e) {
    _clinicLibrary = [];
  }
}

async function showClinicLibraryScreen() {
  if (!_myClinicId) return;
  await loadClinicLibrary();
  _renderClinicLibrary();
  showScreen('clinicLibraryScreen');
}

function _renderClinicLibrary() {
  const list = document.getElementById('clinicLibraryList');
  if (!list) return;
  const nameEl = document.getElementById('clinicLibName');
  if (nameEl && _myClinic) nameEl.textContent = _myClinic.name;

  if (_clinicLibrary.length === 0) {
    list.innerHTML = '<p class="clinic-empty-text">No exercises shared yet. Use the button above to share from your Protocol Library.</p>';
    return;
  }

  const isOwner = _myClinic && _myClinic.ownerEmail === currentUser.email;
  list.innerHTML = _clinicLibrary.map(ex => {
    const isSharer = ex.sharedBy === currentUser.email;
    const canRemove = isOwner || isSharer;
    const date = ex.sharedAt ? new Date(ex.sharedAt).toLocaleDateString() : '';
    return `<div class="clinic-lib-row">
      <div class="clinic-lib-info">
        <div class="clinic-lib-name">${ex.name}</div>
        <div class="clinic-lib-meta">${ex.cat ? ex.cat + ' · ' : ''}Shared by ${ex.sharedBy}${date ? ' · ' + date : ''}</div>
      </div>
      <div class="clinic-lib-btns">
        ${!isSharer ? `<button class="auth-btn" style="padding:0.3rem 0.7rem;font-size:0.8rem;margin:0" onclick="pullExerciseFromClinic('${ex.shareId}')">Pull to Mine</button>` : ''}
        ${canRemove ? `<button class="logout-btn" style="font-size:0.8rem" onclick="removeSharedExercise('${ex.shareId}')">Remove</button>` : ''}
      </div>
    </div>`;
  }).join('');
}

async function shareExerciseToClinic(exerciseId) {
  if (!_myClinicId) return;
  if (!_plTherapistData) await loadTherapistLibrary();
  const ex = (_plTherapistData.customExercises || []).find(e => e.id === exerciseId);
  if (!ex) { alert('Exercise not found in your library.'); return; }

  const shareId = exerciseId + '_' + currentUser.email.replace(/[^a-z0-9]/gi, '_');
  if (_clinicLibrary.find(e => e.shareId === shareId)) {
    alert('This exercise is already in the clinic library.'); return;
  }

  const shareEntry = {
    ...ex,
    shareId,
    sharedBy: currentUser.email,
    sharedAt: new Date().toISOString(),
  };
  await db.collection('clinicLibrary').doc(_myClinicId).update({
    sharedExercises: firebase.firestore.FieldValue.arrayUnion(shareEntry),
  });
  _clinicLibrary.push(shareEntry);
  _renderClinicLibrary();
  closeShareExerciseModal();
}

async function pullExerciseFromClinic(shareId) {
  if (!_myClinicId) return;
  const ex = _clinicLibrary.find(e => e.shareId === shareId);
  if (!ex) return;
  if (!_plTherapistData) await loadTherapistLibrary();

  const existing = (_plTherapistData.customExercises || []).find(e => e.id === ex.id || e.id === ex.id + '_clinic');
  if (existing) { alert('You already have this exercise in your library.'); return; }

  const copy = { ...ex };
  delete copy.shareId;
  delete copy.sharedBy;
  delete copy.sharedAt;
  copy.createdAt = new Date().toISOString();

  if (!_plTherapistData.customExercises) _plTherapistData.customExercises = [];
  _plTherapistData.customExercises.push(copy);
  exerciseLabels[copy.id] = copy.name;
  await _saveTherapistLibrary();
  buildProtocolLibrary();
  alert(`"${ex.name}" added to your Protocol Library.`);
}

async function removeSharedExercise(shareId) {
  if (!_myClinicId) return;
  const ex = _clinicLibrary.find(e => e.shareId === shareId);
  if (!ex) return;
  const isOwner = _myClinic && _myClinic.ownerEmail === currentUser.email;
  if (!isOwner && ex.sharedBy !== currentUser.email) return;
  if (!confirm(`Remove "${ex.name}" from the clinic library?`)) return;

  await db.collection('clinicLibrary').doc(_myClinicId).update({
    sharedExercises: firebase.firestore.FieldValue.arrayRemove(ex),
  });
  _clinicLibrary = _clinicLibrary.filter(e => e.shareId !== shareId);
  _renderClinicLibrary();
}

function showShareExerciseModal() {
  if (!_plTherapistData) {
    loadTherapistLibrary().then(() => _renderShareModal());
  } else {
    _renderShareModal();
  }
}

function _renderShareModal() {
  const customs = (_plTherapistData && _plTherapistData.customExercises) || [];
  const modal = document.getElementById('shareExerciseModal');
  const list = document.getElementById('shareExerciseList');
  if (!modal || !list) return;
  if (customs.length === 0) {
    list.innerHTML = '<p class="clinic-empty-text">No custom exercises yet. Create some in Protocol Library first.</p>';
  } else {
    list.innerHTML = customs.map(ex => `
      <div class="clinic-share-row">
        <span>${ex.name}</span>
        <button class="auth-btn" style="padding:0.3rem 0.7rem;font-size:0.8rem;margin:0" onclick="shareExerciseToClinic('${ex.id}')">Share</button>
      </div>
    `).join('');
  }
  modal.style.display = 'flex';
}

function closeShareExerciseModal() {
  const modal = document.getElementById('shareExerciseModal');
  if (modal) modal.style.display = 'none';
}

/* ══════════════════════════════════════════════════════════════════════════
   SECTION 6: PATIENT HOME
   ══════════════════════════════════════════════════════════════════════════ */

async function updatePatientHomeScreen() {
  if (!currentUser) return;
  const hour     = new Date().getHours();
  const greeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';
  document.getElementById('patientGreeting').textContent    = greeting;
  document.getElementById('patientDisplayName').textContent = currentUser.name;

  const [protocols, sessions, therapistEmail] = await Promise.all([
    getProtocols(currentUser.email).catch(() => []),
    getPatientSessions(currentUser.email).catch(() => []),
    getConnectedTherapist().catch(() => null),
  ]);



  // Today's Plan card
  const planCard = document.getElementById('todaysPlanCard');
  const planList = document.getElementById('todaysPlanList');
  const completionStatus = document.getElementById('completionStatus');
  if (planCard && planList && protocols.length > 0) {
    planCard.style.display = 'block';
    planList.innerHTML = protocols.map(p => {
      const name = exerciseLabels[p.exerciseType] || p.exerciseType;
      const dose = `${p.sets || 3} × ${p.reps || 10} reps`;
      return `<div class="todays-plan-item"><span class="todays-plan-name">${name}</span><span class="todays-plan-dose">${dose}</span></div>`;
    }).join('');
    
    // Calculate completion
    const today = new Date().toDateString();
    const todaySessions = sessions.filter(s => s.protocolId && new Date(s.date).toDateString() === today);
    const currentIds = new Set(protocols.map(p => p.id).filter(Boolean));
    let totalSets = 0;
    todaySessions.forEach(s => {
      if (s.protocolId && currentIds.has(s.protocolId)) {
        if (s.setData && s.setData.length > 0) {
          totalSets += s.setData.length;
        } else {
          totalSets += 1;
        }
      }
    });
    const required = protocols.reduce((sum, p) => sum + (p.sets || 3), 0);
    
    if (completionStatus) {
      if (totalSets >= required) {
        completionStatus.textContent = 'Done';
        completionStatus.className = 'todays-plan-status done';
      } else {
        completionStatus.textContent = `${totalSets}/${required}`;
        completionStatus.className = 'todays-plan-status';
      }
    }
  } else if (planCard) {
    planCard.style.display = 'none';
  }

  // My Exercises card subtitle
  const exSub = document.getElementById('myExercisesSub');
  if (exSub) {
    if (protocols.length > 0) {
      const firstEx = exerciseLabels[protocols[0].exerciseType] || protocols[0].exerciseType;
      const firstDose = `${protocols[0].sets || 3} sets × ${protocols[0].reps || 10} reps`;
      exSub.textContent = `${firstEx} — ${firstDose}`;
    } else {
      exSub.textContent = 'No exercises assigned yet';
    }
  }

  if (therapistEmail) {
    const tSnap = await db.collection('users').doc(therapistEmail).get();
    if (tSnap.exists) document.getElementById('therapistContactName').textContent = 'Message ' + tSnap.data().name;
  }

  // Streak
  const streak  = calcStreak(sessions);
  const badgeEl = document.getElementById('streakBadge');
  const countEl = document.getElementById('streakCount');
  const labelEl = document.getElementById('streakLabel');
  const bestEl  = document.getElementById('streakBest');
  if (badgeEl && streak.current > 0) {
    badgeEl.style.display = 'flex';
    if (!badgeEl.querySelector('.streak-flame')) badgeEl.insertAdjacentHTML('afterbegin', '<span class="streak-flame"><svg width="12" height="12" viewBox="0 0 24 24" fill="#f59e0b" stroke="none"><path d="M12 23c-3.6 0-8-2.4-8-8.5C4 9.8 9 4.3 11.4 2c.4-.3.9 0 .9.5-.2 3 1.6 5.2 3.2 6.8 1.5 1.5 3.5 3 3.5 5.2 0 4.5-3 8.5-7 8.5z"/></svg></span>');
    countEl.textContent   = streak.current;
    labelEl.textContent   = 'day streak';
    if (streak.best > 1) bestEl.textContent = `Best: ${streak.best} days`;
  } else if (badgeEl) {
    badgeEl.style.display = 'none';
  }

  // XP / Level system (visual, based on total sessions)
  const xpContainer = document.getElementById('xpBarContainer');
  if (xpContainer && sessions.length > 0) {
    xpContainer.style.display = 'block';
    const thresholds = [0, 10, 25, 50, 100, 200];
    let level = 1;
    for (let i = 1; i < thresholds.length; i++) { if (sessions.length >= thresholds[i]) level = i + 1; }
    const nextThreshold = thresholds[level] || thresholds[thresholds.length - 1];
    const prevThreshold = thresholds[level - 1] || 0;
    const progress = Math.min(100, ((sessions.length - prevThreshold) / (nextThreshold - prevThreshold)) * 100);
    document.getElementById('xpLevel').textContent = `Level ${level}`;
    document.getElementById('xpProgressText').textContent = `${sessions.length} / ${nextThreshold} sessions`;
    document.getElementById('xpBarFill').style.width = `${Math.round(progress)}%`;
  } else if (xpContainer) {
    xpContainer.style.display = 'none';
  }

  if (therapistEmail) {
    if (_msgBadgeUnsub) { _msgBadgeUnsub(); _msgBadgeUnsub = null; }
    _msgBadgeUnsub = db.collection('messages')
      .where('to', '==', currentUser.email)
      .where('from', '==', therapistEmail)
      .where('read', '==', false)
      .onSnapshot(snap => {
        const badge = document.getElementById('patientUnreadBadge');
        if (!badge) return;
        const n = snap.size;
        badge.textContent = n;
        badge.style.display = n > 0 ? 'inline' : 'none';
      }, () => {});
  }
}

function calcStreak(sessions) {
  if (sessions.length === 0) return { current: 0, best: 0 };
  const days = [...new Set(sessions.map(s => new Date(s.date).toDateString()))];
  days.sort((a, b) => new Date(b) - new Date(a));

  let current = 0;
  let best    = 0;
  let temp    = 1;
  const today     = new Date().toDateString();
  const yesterday = new Date(Date.now() - 86400000).toDateString();

  if (days[0] === today || days[0] === yesterday) {
    current = 1;
    for (let i = 1; i < days.length; i++) {
      const diff = (new Date(days[i-1]) - new Date(days[i])) / 86400000;
      if (diff === 1) current++;
      else break;
    }
  }
  for (let i = 1; i < days.length; i++) {
    const diff = (new Date(days[i-1]) - new Date(days[i])) / 86400000;
    if (diff === 1) { temp++; if (temp > best) best = temp; }
    else temp = 1;
  }
  best = Math.max(best, current);
  return { current, best };
}

let _demoSourceScreen = null; // 'patientScreen' or 'exercisesScreen'

async function startSessionByIndex(i) {
  _demoSourceScreen = 'exercisesScreen';
  await startSessionWithProtocol(_exercisesProtocols[i]);
}

async function startSessionWithProtocol(protocol) {
  selectedProtocol = protocol;
  if (!ANGLE_TRACKING_ENABLED) {
    // Always show demo overlay if demo video exists
    if (protocol.demoVideoUrl) {
      _pendingDemoProtocol = protocol;
      const overlay = document.getElementById('demoVideoOverlay');
      const player  = document.getElementById('demoVideoPlayer');
      const nameEl  = document.getElementById('demoVideoExName');
      const skipBtn = document.getElementById('demoSkipBtn');
      if (overlay && player) {
        if (nameEl) nameEl.textContent = exerciseLabels[protocol.exerciseType] || protocol.exerciseType;
        player.src = protocol.demoVideoUrl;
        player.poster = protocol.demoVideoUrl.replace('/video/upload/', '/video/upload/so_1,w_400,h_225,c_fill/').replace('.mp4', '.jpg').replace('.webm', '.jpg');

        // Button state: while playing show only Skip; on ended show Rewatch + Start
        const startBtn  = document.getElementById('demoStartBtn');
        if (startBtn) startBtn.style.display = 'none';

        player.onended = () => {
          if (skipBtn) skipBtn.style.display = 'none';
          if (startBtn) startBtn.style.display = '';
          // Swap skip for rewatch
          const rewatchBtn = document.getElementById('demoRewatchBtn');
          if (rewatchBtn) rewatchBtn.style.display = '';
        };

        // Enable skip only if already watched (stored in user doc)
        db.collection('users').doc(currentUser.email).get().then(snap => {
          const watched = snap.exists ? (snap.data().demoWatched || []) : [];
          if (skipBtn) {
            skipBtn.style.display = '';
            skipBtn.disabled = !watched.includes(protocol.id);
          }
        }).catch(() => {
          if (skipBtn) { skipBtn.style.display = ''; skipBtn.disabled = false; }
        });
        overlay.style.display = 'flex';
        return;
      }
    }
    openManualCameraSession(protocol);
    return;
  }
  trackedJoints  = await loadTrackedJoints(currentUser.email);
  jointMaxAngles = {};
  showScreen('cameraScreen');
  await loadPatientProtocol();
  await initSetTracker();
  if (!mpCamera) startCamera();
}

async function startScanSession() {
  _demoSourceScreen = 'patientScreen';
  const protocols = await getProtocols(currentUser.email);
  if (protocols.length !== 1) {
    // 0 protocols: exercises screen shows "no protocol" message
    // 2+ protocols: exercises screen lets patient pick
    showExercisesScreen();
    return;
  }
  selectedProtocol = protocols[0];
  if (!ANGLE_TRACKING_ENABLED) { openManualCameraSession(protocols[0]); return; }
  trackedJoints  = await loadTrackedJoints(currentUser.email);
  jointMaxAngles = {};
  showScreen('cameraScreen');
  await loadPatientProtocol();
  await initSetTracker();
  if (!mpCamera) startCamera();
}

// ── Manual session logging (used when ANGLE_TRACKING_ENABLED = false) ──────

function openManualSession(protocol) {
  selectedProtocol = protocol;
  const label  = exerciseLabels[protocol.exerciseType] || protocol.exerciseType || 'Exercise';
  const target = protocol.reps || 10;
  const sets   = protocol.sets || 3;
  document.getElementById('manualSessionTitle').textContent    = label;
  document.getElementById('manualSessionSubtitle').textContent = `${sets} sets \u00d7 ${target} reps`;
  document.getElementById('manualRepsInput').value             = target;
  document.getElementById('manualPainSlider').value            = 1;
  document.getElementById('manualPainValue').textContent       = '1';
  const demoBtn = document.getElementById('manualSessionDemoBtn');
  if (demoBtn) demoBtn.style.display = protocol.demoVideoUrl ? 'block' : 'none';
  document.getElementById('manualSessionModal').style.display  = 'flex';
}

function closeManualSession() {
  document.getElementById('manualSessionModal').style.display = 'none';
}

// ── Manual Camera Session (patient with video recording) ──

async function openManualCameraSession(protocol) {
  _manualCamProtocol = protocol;
  _manualCamSetData = [];
  _manualCamTotalSets = protocol.sets || 3;
  // Count sets already completed today for this protocol (works from any entry path)
  const _todaySessions = await getPatientSessions(currentUser.email).catch(() => []);
  const _today = new Date().toDateString();
  const _alreadyDone = _todaySessions
    .filter(s => s.protocolId === protocol.id && new Date(s.date).toDateString() === _today)
    .reduce((sum, s) => sum + (s.setData?.length > 0 ? s.setData.length : 1), 0);
  _manualCamCurrentSet = Math.min(_alreadyDone + 1, _manualCamTotalSets);
  _manualCamVideoUrl = null;

  const video = document.getElementById('manualCamVideo');
  if (video) video.style.transform = 'scaleX(1)';

  const nameEl = document.getElementById('manualCamExName');
  const setInfoEl = document.getElementById('manualCamSetInfo');
  const promptEl = document.getElementById('manualCamPrompt');
  const btnsEl = document.getElementById('manualCamBtns');

  if (nameEl) nameEl.textContent = exerciseLabels[protocol.exerciseType] || protocol.exerciseType || 'Exercise';
  if (setInfoEl) setInfoEl.textContent = `Set ${_manualCamCurrentSet} of ${_manualCamTotalSets}`;
  if (promptEl) promptEl.textContent = 'Tap Start when ready to begin';
  if (btnsEl) btnsEl.innerHTML = `<button class="manual-cam-start-btn" id="manualCamStartBtn" onclick="manualCamStartRecording()">Start</button>`;

  showScreen('manualCamScreen');
  await manualCamStartCamera();
}

async function manualCamStartCamera() {
  const video = document.getElementById('manualCamVideo');
  if (!video) return;

  try {
    const stream = await navigator.mediaDevices.getUserMedia({ 
      video: { facingMode: 'environment' }, 
      audio: true 
    });
    _manualCamStream = stream;
    video.srcObject = stream;
    await video.play();
  } catch(e) {
    console.error('[Motus] Manual camera error:', e);
    alert('Could not access camera. Please allow camera permissions.');
  }
}

function manualCamStartRecording() {
  if (!_manualCamStream) return;
  
  const video = document.getElementById('manualCamVideo');
  const promptEl = document.getElementById('manualCamPrompt');
  const btnsEl = document.getElementById('manualCamBtns');
  const recEl = document.getElementById('manualCamRecording');

  _manualCamChunks = [];
  const mimeType = getRecordingMimeType();
  _manualCamRecorder = new MediaRecorder(_manualCamStream, { mimeType, videoBitsPerSecond: 400000 });
  
  _manualCamRecorder.ondataavailable = e => { 
    if (e.data && e.data.size > 0) _manualCamChunks.push(e.data); 
  };
  
  _manualCamRecorder.start(1000);
  
  if (promptEl) promptEl.textContent = 'Recording... Tap End Set when done';
  if (btnsEl) btnsEl.innerHTML = `
    <button class="manual-cam-exit-btn" onclick="manualCamExit()">Exit</button>
    <button class="manual-cam-end-btn" onclick="manualCamEndSet()">End Set</button>
  `;
  if (recEl) recEl.style.display = 'flex';
}

function manualCamEndSet() {
  if (!_manualCamRecorder || _manualCamRecorder.state === 'inactive') return;
  
  const recEl = document.getElementById('manualCamRecording');
  if (recEl) recEl.style.display = 'none';
  
  const mimeType = _manualCamRecorder.mimeType;
  
  _manualCamRecorder.onstop = async () => {
    _manualCamRecorder = null;
    _manualCamCurrentBlob = new Blob(_manualCamChunks, { type: mimeType });
    _manualCamChunks = [];
    
    // Show input modal
    const setInput = document.getElementById('setInputModal');
    const repsInput = document.getElementById('setInputReps');
    const painInput = document.getElementById('setInputPain');
    const painVal = document.getElementById('setInputPainVal');
    const notesInput = document.getElementById('setInputNotes');
    
    if (repsInput) repsInput.value = _manualCamProtocol?.reps || 10;
    if (painInput) painInput.value = 1;
    if (painVal) painVal.textContent = '1 / 10';
    if (notesInput) notesInput.value = '';
    
    if (setInput) setInput.style.display = 'flex';
  };
  
  _manualCamRecorder.stop();
}

function manualCamCancelSet() {
  document.getElementById('setInputModal').style.display = 'none';
  const promptEl = document.getElementById('manualCamPrompt');
  const btnsEl = document.getElementById('manualCamBtns');
  if (promptEl) promptEl.textContent = 'Tap Start when ready to begin';
  if (btnsEl) btnsEl.innerHTML = `<button class="manual-cam-start-btn" id="manualCamStartBtn" onclick="manualCamStartRecording()">Start</button>`;
}

async function manualCamSaveSet() {
  const reps = Math.max(0, Math.min(100, parseInt(document.getElementById('setInputReps').value) || 0));
  const pain = Math.max(1, Math.min(10, parseInt(document.getElementById('setInputPain').value) || 1));
  const notes = (document.getElementById('setInputNotes').value || '').trim();
  
  document.getElementById('setInputModal').style.display = 'none';
  
  // Upload video and get URL from saved blob
  let videoUrl = null;
  const blob = _manualCamCurrentBlob;
  _manualCamCurrentBlob = null;
  
  if (blob && blob.size > 0) {
    videoUrl = await uploadVideoToCloudinary(blob);
  }

  _manualCamSetData.push({ reps, pain, notes, videoUrl });
  
  if (_manualCamCurrentSet >= _manualCamTotalSets) {
    await finishManualCamSession();
  } else {
    _manualCamCurrentSet++;
    const setInfoEl = document.getElementById('manualCamSetInfo');
    const promptEl = document.getElementById('manualCamPrompt');
    const btnsEl = document.getElementById('manualCamBtns');
    if (setInfoEl) setInfoEl.textContent = `Set ${_manualCamCurrentSet} of ${_manualCamTotalSets}`;
    if (promptEl) promptEl.textContent = 'Tap Start when ready to begin';
    if (btnsEl) btnsEl.innerHTML = `<button class="manual-cam-start-btn" id="manualCamStartBtn" onclick="manualCamStartRecording()">Start</button>`;
  }
}

async function finishManualCamSession() {
  if (!_manualCamProtocol) return;
  
  // Stop camera
  if (_manualCamStream) {
    _manualCamStream.getTracks().forEach(t => t.stop());
    _manualCamStream = null;
  }
  
  const totalReps = _manualCamSetData.reduce((sum, s) => sum + s.reps, 0);
  const avgPain = _manualCamSetData.length > 0 
    ? Math.round(_manualCamSetData.reduce((sum, s) => sum + s.pain, 0) / _manualCamSetData.length) 
    : 1;
  
  try {
    const therapistEmail = await getConnectedTherapist();
    const docRef = await db.collection('sessions').add({
      patientEmail: currentUser.email,
      date: new Date().toISOString(),
      reps: totalReps,
      pain: avgPain,
      exerciseType: _manualCamProtocol.exerciseType,
      protocolId: _manualCamProtocol.id,
      therapistEmail: therapistEmail || null,
      setData: _manualCamSetData
    });
  } catch(e) {
    console.error('[Motus] Session save error:', e);
  }
  
  _manualCamProtocol = null;
  _manualCamSetData = [];
  await updatePatientHomeScreen();
  showScreen('patientScreen');
}

function manualCamExit() {
  // If recording in progress, stop and save
  if (_manualCamRecorder && _manualCamRecorder.state !== 'inactive') {
    _manualCamRecorder.onstop = async () => {
      _manualCamRecorder = null;
      if (_manualCamCurrentBlob) {
        await saveCurrentSetAndExit();
      }
      finishAndExit();
    };
    _manualCamRecorder.stop();
    return;
  }

  // Handle potential unsaved data and then exit
  if (_manualCamCurrentBlob) {
    saveCurrentSetAndExit().then(() => finishAndExit());
  } else if (_manualCamSetData.length > 0) {
    finishAndExit();
  } else {
    doCleanExit();
  }
}

function finishAndExit() {
  if (_manualCamSetData.length > 0) {
    finishManualCamSession().then(() => {
      doCleanExit();
      showExercisesScreen();
    });
  } else {
    doCleanExit();
  }
}

function doCleanExit() {
  if (_manualCamStream) {
    _manualCamStream.getTracks().forEach(t => t.stop());
    _manualCamStream = null;
  }
  _manualCamProtocol = null;
  _manualCamSetData = [];
  updatePatientHomeScreen();
  showScreen('patientScreen');
}

async function saveCurrentSetAndExit() {
  const blob = _manualCamCurrentBlob;
  _manualCamCurrentBlob = null;
  
  let videoUrl = null;
  if (blob && blob.size > 0) {
    videoUrl = await uploadVideoToCloudinary(blob);
  }
  
  // Add with default reps/pain since user didn't fill modal
  _manualCamSetData.push({ reps: _manualCamProtocol?.reps || 10, pain: 1, notes: 'Exited early', videoUrl });
  
  // Now save the session
  await finishManualCamSession();
}

async function submitManualSession() {
  const reps = Math.max(0, Math.min(100, parseInt(document.getElementById('manualRepsInput').value) || 0));
  const pain = Math.max(1, Math.min(10, parseInt(document.getElementById('manualPainSlider').value) || 1));
  const btn  = document.querySelector('.manual-session-submit');
  btn.disabled    = true;
  btn.textContent = 'Saving...';
  try {
    const therapistEmail = await getConnectedTherapist();
    await db.collection('sessions').add({
      patientEmail:  currentUser.email,
      date:          new Date().toISOString(),
      reps,
      pain,
      rom:           0,
      tam:           0,
      therapistEmail,
      exerciseType:  selectedProtocol?.exerciseType || '',
      protocolId:    selectedProtocol?.id || '',
      expireAt:      new Date(Date.now() + 90 * 86400000)
    });
    closeManualSession();
    showScreen('patientScreen');
    updatePatientHomeScreen();
  } catch (e) {
    console.error('submitManualSession:', e);
    btn.disabled    = false;
    btn.textContent = 'Log Session';
  }
}

/* ══════════════════════════════════════════════════════════════════════════
   SECTION 7: PROTOCOL SYSTEM
   ══════════════════════════════════════════════════════════════════════════ */

const exerciseLabels = {
  full_fist:              'Full Fist',
  hook_fist:              'Hook Fist',
  tabletop_position:      'Tabletop Position',
  index_flexion:          'Index Finger Flexion',
  middle_flexion:         'Middle Finger Flexion',
  ring_flexion:           'Ring Finger Flexion',
  pinky_flexion:          'Pinky Flexion',
  thumb_flexion:          'Thumb Flexion',
  thumb_index_opposition: 'Thumb to Index Opposition',
  thumb_opposition:       'Thumb Opposition',
  finger_flexion:         'Finger Flexion',
  finger_extension:       'Finger Extension',
  grip_squeeze:           'Grip Squeeze',
  finger_abduction:       'Finger Abduction',
  wrist_flexion:          'Wrist Flexion',
  wrist_extension:        'Wrist Extension',
  straight_fist:          'Straight Fist',
  pip_blocking:           'PIP Blocking',
  dip_blocking:           'DIP Blocking',
  thumb_ring_opposition:  'Thumb to Ring Pinch',
  thumb_little_opposition:'Thumb to Little Pinch',
  index_middle_spread:    'Index-Middle Spread',
};

const frequencyLabels = {
  daily:       'Daily',
  twice_daily: 'Twice Daily',
  every_other: 'Every Other Day',
  three_week:  '3x Per Week'
};

// Thresholds use calibration convention: 0° = straight, higher = more bent.
// flexAt: joint must bend TO or PAST this angle to count as flexed.
// extendAt: joint must straighten TO or BELOW this angle to complete the rep.
const EXERCISE_DEFAULTS = {
  full_fist:         { metric:'angle', conditions:[{finger:'index',joint:'pip',flexAt:60,extendAt:15},{finger:'middle',joint:'pip',flexAt:60,extendAt:15},{finger:'ring',joint:'pip',flexAt:60,extendAt:15},{finger:'pinky',joint:'pip',flexAt:60,extendAt:15}], requireAll:true  },
  hook_fist:         { metric:'angle', conditions:[{finger:'index',joint:'dip',flexAt:45,extendAt:15},{finger:'middle',joint:'dip',flexAt:45,extendAt:15},{finger:'ring',joint:'dip',flexAt:45,extendAt:15},{finger:'pinky',joint:'dip',flexAt:45,extendAt:15}], requireAll:true  },
  tabletop_position: { metric:'angle', conditions:[{finger:'index',joint:'mcp',flexAt:50,extendAt:15},{finger:'middle',joint:'mcp',flexAt:50,extendAt:15},{finger:'ring',joint:'mcp',flexAt:50,extendAt:15},{finger:'pinky',joint:'mcp',flexAt:50,extendAt:15}], requireAll:true  },
  index_flexion:     { metric:'angle', conditions:[{finger:'index', joint:'pip',flexAt:60,extendAt:15}], requireAll:false },
  middle_flexion:    { metric:'angle', conditions:[{finger:'middle',joint:'pip',flexAt:60,extendAt:15}], requireAll:false },
  ring_flexion:      { metric:'angle', conditions:[{finger:'ring',  joint:'pip',flexAt:60,extendAt:15}], requireAll:false },
  pinky_flexion:     { metric:'angle', conditions:[{finger:'pinky', joint:'pip',flexAt:60,extendAt:15}], requireAll:false },
  thumb_flexion:     { metric:'angle', conditions:[{finger:'thumb', joint:'mcp',flexAt:40,extendAt:12}], requireAll:false },
  finger_flexion:    { metric:'angle', conditions:[{finger:'index',joint:'pip',flexAt:60,extendAt:15},{finger:'middle',joint:'pip',flexAt:60,extendAt:15},{finger:'ring',joint:'pip',flexAt:60,extendAt:15},{finger:'pinky',joint:'pip',flexAt:60,extendAt:15}], requireAll:false },
  finger_extension:  { metric:'angle', conditions:[{finger:'index',joint:'mcp',flexAt:40,extendAt:10},{finger:'middle',joint:'mcp',flexAt:40,extendAt:10},{finger:'ring',joint:'mcp',flexAt:40,extendAt:10},{finger:'pinky',joint:'mcp',flexAt:40,extendAt:10}], requireAll:false },
  grip_squeeze:      { metric:'angle', conditions:[{finger:'index',joint:'pip',flexAt:60,extendAt:15},{finger:'middle',joint:'pip',flexAt:60,extendAt:15},{finger:'ring',joint:'pip',flexAt:60,extendAt:15},{finger:'pinky',joint:'pip',flexAt:60,extendAt:15}], requireAll:true  },
  thumb_index_opposition: { metric:'distance',  tipA:4,  tipB:8,  closeAt:0.08, openAt:0.25 },
  thumb_opposition:       { metric:'distance',  tipA:4,  tipB:12, closeAt:0.08, openAt:0.25 },
  finger_abduction:       { metric:'abduction', tipA:8,  tipB:20, spreadAt:0.30, closedAt:0.15 },
  // New library exercises
  straight_fist:         { metric:'angle', conditions:[{finger:'index',joint:'mcp',flexAt:50,extendAt:15},{finger:'index',joint:'pip',flexAt:60,extendAt:15},{finger:'middle',joint:'mcp',flexAt:50,extendAt:15},{finger:'middle',joint:'pip',flexAt:60,extendAt:15},{finger:'ring',joint:'mcp',flexAt:50,extendAt:15},{finger:'ring',joint:'pip',flexAt:60,extendAt:15},{finger:'pinky',joint:'mcp',flexAt:50,extendAt:15},{finger:'pinky',joint:'pip',flexAt:60,extendAt:15}], requireAll:true },
  pip_blocking:          { metric:'angle', conditions:[{finger:'index',joint:'pip',flexAt:60,extendAt:15},{finger:'middle',joint:'pip',flexAt:60,extendAt:15},{finger:'ring',joint:'pip',flexAt:60,extendAt:15},{finger:'pinky',joint:'pip',flexAt:60,extendAt:15}], requireAll:false },
  dip_blocking:          { metric:'angle', conditions:[{finger:'index',joint:'dip',flexAt:30,extendAt:10},{finger:'middle',joint:'dip',flexAt:30,extendAt:10}], requireAll:false },
  thumb_ring_opposition:   { metric:'distance', tipA:4, tipB:16, closeAt:0.08, openAt:0.25 },
  thumb_little_opposition: { metric:'distance', tipA:4, tipB:20, closeAt:0.08, openAt:0.25 },
  index_middle_spread:     { metric:'abduction', tipA:8, tipB:12, spreadAt:0.20, closedAt:0.10 },
};

const PROTOCOL_CATALOG = [
  { id:'hook_fist',              cat:'Tendon Gliding',       dr:10, ds:3, df:'daily',   desc:'Middle and tip knuckles flex while base knuckles stay straight.' },
  { id:'straight_fist',          cat:'Tendon Gliding',       dr:10, ds:3, df:'daily',   desc:'All knuckles flex except the tip joint; fingertips point straight down.' },
  { id:'tabletop_position',      cat:'Tendon Gliding',       dr:10, ds:3, df:'daily',   desc:'Base knuckles 90°, middle and tip joints stay straight.' },
  { id:'full_fist',              cat:'Tendon Gliding',       dr:10, ds:3, df:'daily',   desc:'Complete fist then full open. All four fingers flex together.' },
  { id:'finger_extension',       cat:'Tendon Gliding',       dr:10, ds:3, df:'daily',   desc:'Straighten and spread all fingers from a loosely bent position.' },
  { id:'index_flexion',          cat:'Individual Finger',    dr:15, ds:3, df:'daily',   desc:'Flex and extend the index finger through its full available range.' },
  { id:'middle_flexion',         cat:'Individual Finger',    dr:15, ds:3, df:'daily',   desc:'Flex and extend the middle finger through its full available range.' },
  { id:'ring_flexion',           cat:'Individual Finger',    dr:15, ds:3, df:'daily',   desc:'Flex and extend the ring finger through its full available range.' },
  { id:'pinky_flexion',          cat:'Individual Finger',    dr:15, ds:3, df:'daily',   desc:'Flex and extend the little finger through its full available range.' },
  { id:'thumb_flexion',          cat:'Individual Finger',    dr:15, ds:3, df:'daily',   desc:'Flex thumb across the palm toward the little finger and return.' },
  { id:'pip_blocking',           cat:'Blocking & Isolation', dr:10, ds:3, df:'daily',   desc:'Stabilize base knuckle; flex and extend only the middle joint.' },
  { id:'dip_blocking',           cat:'Blocking & Isolation', dr:10, ds:3, df:'daily',   desc:'Stabilize middle joint; flex and extend only the tip joint.' },
  { id:'thumb_index_opposition', cat:'Opposition & Pinch',   dr:12, ds:3, df:'daily',   desc:'Thumb tip meets index fingertip, then returns open.' },
  { id:'thumb_opposition',       cat:'Opposition & Pinch',   dr:12, ds:3, df:'daily',   desc:'Thumb tip meets middle fingertip and returns.' },
  { id:'thumb_ring_opposition',  cat:'Opposition & Pinch',   dr:12, ds:3, df:'daily',   desc:'Thumb tip meets ring fingertip and returns.' },
  { id:'thumb_little_opposition',cat:'Opposition & Pinch',   dr:12, ds:3, df:'daily',   desc:'Thumb tip meets little fingertip and returns.' },
  { id:'finger_abduction',       cat:'Spreading & Abduction',dr:12, ds:2, df:'daily',   desc:'Spread all four fingers wide apart, then return together.' },
  { id:'index_middle_spread',    cat:'Spreading & Abduction',dr:15, ds:2, df:'daily',   desc:'Spread only the index and middle finger apart, then close.' },
  { id:'grip_squeeze',           cat:'Grip & Composite',     dr:10, ds:3, df:'daily',   desc:'All fingers flex simultaneously into a full fist. Builds grip strength.' },
  { id:'finger_flexion',         cat:'Grip & Composite',     dr:10, ds:3, df:'daily',   desc:'Any finger completing a full flex-extend cycle counts as a rep.' },
];

// b is pivot. pip uses [MCP, PIP, TIP] = composite flexion, matching legacy middle-finger behavior.
const FINGER_LANDMARK_MAP = {
  thumb:  { mcp:[0,2,3],   pip:[2,3,4],    dip:null        },
  index:  { mcp:[0,5,6],   pip:[5,6,8],    dip:[6,7,8]     },
  middle: { mcp:[0,9,10],  pip:[9,10,12],  dip:[10,11,12]  },
  ring:   { mcp:[0,13,14], pip:[13,14,16], dip:[14,15,16]  },
  pinky:  { mcp:[0,17,18], pip:[17,18,20], dip:[18,19,20]  },
};

// {a,b,c} format used by TAM calc
const CALIB_FINGERS = Object.fromEntries(
  Object.entries(FINGER_LANDMARK_MAP).map(([finger, joints]) => [
    finger,
    Object.fromEntries(
      Object.entries(joints).map(([joint, arr]) => [
        joint,
        arr ? { a: arr[0], b: arr[1], c: arr[2] } : null,
      ])
    ),
  ])
);

const SWEEP_JOINTS = Object.entries(CALIB_FINGERS).flatMap(([finger, joints]) =>
  Object.entries(joints)
    .filter(([, def]) => def)
    .map(([joint, def]) => ({
      key: `${finger}-${joint}`,
      finger,
      joint,
      def,
    }))
);

async function getProtocols(patientEmail) {
  const doc = await db.collection('protocols').doc(patientEmail).get();
  if (!doc.exists) return [];
  const data = doc.data();
  if (data.items) return data.items;
  return [{ id: 'legacy', ...data }]; // old flat format
}

async function getExistingProtocol(patientEmail) {
  const protocols = await getProtocols(patientEmail);
  return protocols.length > 0 ? protocols[0] : null;
}

async function deleteProtocol(patientEmail, protocolId) {
  if (!confirm(`Remove this exercise from the patient's protocol?`)) return;
  const existing = await getProtocols(patientEmail);
  // Note: if the deleted item has a demoVideoUrl, the Cloudinary file becomes orphaned.
  // Client-side deletion requires a signed API call — deferred to future Cloud Function cleanup.
  const updated = existing.filter(p => p.id !== protocolId);
  if (updated.length === 0) {
    await db.collection('protocols').doc(patientEmail).delete();
  } else {
    await db.collection('protocols').doc(patientEmail).set({ items: updated });
  }
  const refreshed = await getProtocols(patientEmail);
  const protoBody = document.querySelector('#tps-protocol .tp-colsec-body');
  if (protoBody) {
    protoBody.innerHTML = buildProtocolForm(patientEmail, refreshed);
    updateExerciseParamsUI('full_fist', null);
  } else {
    const snap = await db.collection('users').doc(patientEmail).get();
    if (snap.exists) showRealPatient({ email: patientEmail, ...snap.data() });
  }
}

async function editProtocol(patientEmail, protocolId) {
  const protocols = await getProtocols(patientEmail);
  const p = protocols.find(x => x.id === protocolId);
  if (!p) return;

  editingProtocolId = protocolId;
  editingPatientEmail = patientEmail;
  _protoPatientEmail = patientEmail;

  const modal = document.getElementById('addProtocolModal');
  if (!modal) return;
  const panelHeader = document.querySelector('.patient-panel-hdr h3');
  document.getElementById('apmPatientName').textContent = panelHeader ? panelHeader.textContent : patientEmail;
  document.getElementById('apmTitle').textContent = 'Edit Exercise';
  document.getElementById('apmSubmitBtn').textContent = 'Save Changes';
  const searchEl = document.getElementById('apmSearch');
  if (searchEl) searchEl.value = '';
  modal.style.display = 'flex';
  document.body.style.overflow = 'hidden';
  _apmRenderLibrary('');

  const typeEl = document.getElementById('exerciseType');
  if (typeEl) typeEl.value = p.exerciseType;
  updateExerciseParamsUI(p.exerciseType, p.exerciseParams || null);
  _apmHighlightSelected(p.exerciseType);

  const repsEl = document.getElementById('protocolReps');
  const setsEl = document.getElementById('protocolSets');
  const freqEl = document.getElementById('protocolFrequency');
  const notesEl = document.getElementById('protocolNotes');
  if (repsEl) repsEl.value = p.reps || 10;
  if (setsEl) setsEl.value = p.sets || 3;
  if (freqEl) freqEl.value = p.frequency || 'daily';
  if (notesEl) notesEl.value = p.notes || '';

  // Populate demo col with existing demo if present
  _demoBlob = null;
  _demoExistingVideoUrl = p.demoVideoUrl || null;
  if (p.demoVideoUrl) {
    const playback = document.getElementById('demoPlayback');
    if (playback) {
      playback.src = p.demoVideoUrl;
      playback.controls = true;
      playback.poster = _getThumbnailUrl(p.demoVideoUrl);
      playback.load();
    }
    _demoSetState('confirmed');
  } else {
    _demoSetState('initial');
  }
}

function cancelEditProtocol() {
  closeAddProtocol();
}

async function loadTrackedJoints(patientEmail) {
  const doc = await db.collection('jointTracking').doc(patientEmail).get();
  return doc.exists ? (doc.data().joints || []) : [];
}

async function saveTrackedJoints(patientEmail, joints) {
  await db.collection('jointTracking').doc(patientEmail).set({
    joints: [...joints],
    updatedBy: currentUser?.email || ''
  });
}

// ── Demo video recording (Add Protocol modal) ─────────────────────────────

function _getThumbnailUrl(videoUrl) {
  if (!videoUrl || !videoUrl.includes('cloudinary.com')) return '';
  return videoUrl
    .replace('/video/upload/', '/video/upload/w_320,h_568,c_fill,so_1.2/')
    .replace('.webm', '.jpg')
    .replace('.mp4', '.jpg');
}

function _demoSetState(state) {
  const els = {
    preview:   document.getElementById('demoCameraPreview'),
    playback:  document.getElementById('demoPlayback'),
    thumbOverlay: document.getElementById('demoThumbOverlay'),
    empty:     document.getElementById('demoEmptyState'),
    recBadge:  document.getElementById('demoRecordingBadge'),
    confBadge: document.getElementById('demoConfirmedBadge'),
    btnInit:   document.getElementById('apmDemoBtnsInitial'),
    btnRec:    document.getElementById('apmDemoBtnsRecording'),
    btnPrev:   document.getElementById('apmDemoBtnsPreview'),
    btnConf:   document.getElementById('apmDemoBtnsConfirmed'),
  };
  if (!els.empty) return; // demo col not in DOM
  Object.values(els).forEach(el => { if (el) el.style.display = 'none'; });
  if (state === 'initial') {
    els.empty.style.display = 'flex';
    if (els.btnInit) els.btnInit.style.display = 'flex';
  } else if (state === 'recording') {
    if (els.preview) els.preview.style.display = 'block';
    if (els.recBadge) els.recBadge.style.display = 'flex';
    if (els.btnRec) els.btnRec.style.display = 'flex';
  } else if (state === 'preview') {
    if (els.playback) {
      els.playback.style.display = 'block';
      els.playback.controls = true;
      if (_demoThumbnailUrl) {
        els.playback.poster = _demoThumbnailUrl;
      }
    }
    if (els.btnPrev) els.btnPrev.style.display = 'flex';
  } else if (state === 'confirmed') {
    if (els.playback) {
      els.playback.style.display = 'block';
      els.playback.controls = true;
      if (_demoExistingVideoUrl) {
        els.playback.poster = _getThumbnailUrl(_demoExistingVideoUrl);
      } else if (_demoThumbnailUrl) {
        els.playback.poster = _demoThumbnailUrl;
      }
    }
    if (els.confBadge) els.confBadge.style.display = 'flex';
    if (els.btnConf) els.btnConf.style.display = 'flex';
  }
}

function _demoStopCamera() {
  if (_demoAnimFrame) { cancelAnimationFrame(_demoAnimFrame); _demoAnimFrame = null; }
  if (_demoStream) {
    _demoStream.getTracks().forEach(t => t.stop());
    _demoStream = null;
  }
  const preview = document.getElementById('demoCameraPreview');
  if (preview) preview.srcObject = null;
}

function _demoCleanup() {
  clearInterval(_demoTimerInterval);
  _demoTimerInterval = null;
  _demoStopCamera();
  if (_demoMediaRecorder && _demoMediaRecorder.state !== 'inactive') {
    try { _demoMediaRecorder.stop(); } catch(e) {}
  }
  _demoMediaRecorder = null;
  _demoChunks = [];
  _demoBlob = null;
  _demoThumbnailUrl = null;
  _demoExistingVideoUrl = null;
  const playback = document.getElementById('demoPlayback');
  if (playback && playback.src) { URL.revokeObjectURL(playback.src); playback.removeAttribute('src'); }
}

async function _demoStartCameraAndRecord() {
  _demoStopCamera();
  if (_demoMediaRecorder && _demoMediaRecorder.state !== 'inactive') {
    try { _demoMediaRecorder.stop(); } catch(e) {}
  }
  _demoChunks = [];

  const preview = document.getElementById('demoCameraPreview');
  const canvas  = document.getElementById('demoRecordCanvas');
  if (!preview || !canvas) return;

  try {
    _demoStream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: _demoFacingMode }, audio: true
    });
  } catch(e) {
    console.error('[Motus] demo camera:', e);
    alert('Could not access camera. Please check permissions.');
    return;
  }

  preview.srcObject = _demoStream;
  preview.style.transform = 'none';
  await preview.play().catch(() => {});

  // Wait for metadata so we get real dimensions
  await new Promise(res => {
    if (preview.readyState >= 1) { res(); return; }
    preview.onloadedmetadata = res;
    setTimeout(res, 1500);
  });

  const w = Math.min(preview.videoWidth || 1280, 1280);
  const h = Math.round(w * (preview.videoHeight || 720) / (preview.videoWidth || 1280));
  canvas.width  = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');

  function drawFrame() {
    if (_demoStream && _demoStream.active) {
      ctx.drawImage(preview, 0, 0, canvas.width, canvas.height);
      _demoAnimFrame = requestAnimationFrame(drawFrame);
    }
  }
  drawFrame();

  const mimeType = getRecordingMimeType();
  if (!mimeType) {
    _demoStopCamera();
    alert('Video recording is not supported on this browser.');
    _demoSetState('initial');
    return;
  }

  let captureStream;
  try { captureStream = canvas.captureStream(30); } catch(e) {
    _demoStopCamera();
    _demoSetState('initial');
    return;
  }

  let recordStream = captureStream;
  if (_demoStream.getAudioTracks().length > 0) {
    recordStream = new MediaStream([
      ...captureStream.getVideoTracks(),
      ..._demoStream.getAudioTracks()
    ]);
  }

  _demoMediaRecorder = new MediaRecorder(recordStream, {
    mimeType,
    videoBitsPerSecond: VIDEO_TIERS.demo.bitrate
  });
  _demoMediaRecorder.ondataavailable = e => {
    if (e.data && e.data.size > 0) _demoChunks.push(e.data);
  };
  _demoMediaRecorder.start(1000);

  // Timer + auto-stop at max duration
  _demoTimerSec = 0;
  const timerEl = document.getElementById('demoTimerText');
  if (timerEl) timerEl.textContent = '0:00';
  _demoTimerInterval = setInterval(() => {
    _demoTimerSec++;
    const m = Math.floor(_demoTimerSec / 60);
    const s = _demoTimerSec % 60;
    const el = document.getElementById('demoTimerText');
    if (el) el.textContent = `${m}:${s.toString().padStart(2, '0')}`;
    if (_demoTimerSec >= VIDEO_TIERS.demo.maxDurationSec) demoEndDemo();
  }, 1000);

  _demoSetState('recording');
}

async function demoStartDemo() {
  _demoFacingMode = 'environment';
  await _demoStartCameraAndRecord();
}

async function demoEndDemo() {
  clearInterval(_demoTimerInterval);
  _demoTimerInterval = null;

  // Capture thumbnail from live preview before stopping (bright frame)
  const preview = document.getElementById('demoCameraPreview');
  const thumbCanvas = document.createElement('canvas');
  thumbCanvas.width = preview.videoWidth || 320;
  thumbCanvas.height = preview.videoHeight || 568;
  const thumbCtx = thumbCanvas.getContext('2d');
  if (preview && preview.videoWidth > 0) {
    thumbCtx.drawImage(preview, 0, 0);
    _demoThumbnailUrl = thumbCanvas.toDataURL('image/jpeg', 0.7);
  }

  if (_demoAnimFrame) { cancelAnimationFrame(_demoAnimFrame); _demoAnimFrame = null; }

  if (_demoMediaRecorder && _demoMediaRecorder.state !== 'inactive') {
    await new Promise(resolve => {
      _demoMediaRecorder.onstop = resolve;
      _demoMediaRecorder.stop();
    });
  }
  _demoStopCamera();

  if (!_demoChunks.length) { _demoSetState('initial'); return; }

  const mimeType = _demoMediaRecorder?.mimeType || 'video/webm';
  _demoBlob = new Blob(_demoChunks, { type: mimeType });
  _demoChunks = [];

  const playback = document.getElementById('demoPlayback');
  if (playback) {
    if (playback.src) URL.revokeObjectURL(playback.src);
    playback.src = URL.createObjectURL(_demoBlob);
    playback.load();
  }
  _demoSetState('preview');
}

async function demoFlipCamera() {
  _demoFacingMode = _demoFacingMode === 'environment' ? 'user' : 'environment';
  clearInterval(_demoTimerInterval);
  _demoTimerInterval = null;
  await _demoStartCameraAndRecord();
}

function demoUseThis() {
  _demoExistingVideoUrl = null;
  _demoSetState('confirmed');
}

async function demoReRecord() {
  const playback = document.getElementById('demoPlayback');
  if (playback && playback.src) { URL.revokeObjectURL(playback.src); playback.removeAttribute('src'); }
  _demoBlob = null;
  _demoThumbnailUrl = null;
  _demoExistingVideoUrl = null;
  await _demoStartCameraAndRecord();
}

function demoClearVideo() {
  _demoCleanup();
  _demoSetState('initial');
}

function demoUploadFile() {
  const input = document.getElementById('demoFileInput');
  if (input) input.click();
}

async function demoHandleFileSelect(input) {
  const file = input.files && input.files[0];
  if (!file) return;
  input.value = '';
  try {
    _demoBlob = await compressVideo(file, 'demo');
    const playback = document.getElementById('demoPlayback');
    if (playback) {
      if (playback.src) URL.revokeObjectURL(playback.src);
      playback.src = URL.createObjectURL(_demoBlob);
      playback.load();
    }
    _demoSetState('preview');
  } catch(e) {
    console.error('[Motus] demoHandleFileSelect:', e);
    alert('Could not process the selected video file.');
  }
}

// ── Protocol card demo actions ──

function playProtocolDemo(videoUrl, exerciseName) {
  closeAddProtocol();
  setTimeout(() => openVideoModal(videoUrl, 'Demo', exerciseName), 50);
}

async function removeProtocolDemo(patientEmail, protocolId) {
  if (!confirm('Remove the demo video from this exercise?')) return;
  try {
    const protocols = await getProtocols(patientEmail);
    const updated = protocols.map(p => {
      if (p.id !== protocolId) return p;
      const copy = { ...p };
      delete copy.demoVideoUrl;
      return copy;
    });
    await db.collection('protocols').doc(patientEmail).set({ items: updated });
    const refreshed = await getProtocols(patientEmail);
    const protoBody = document.querySelector('#tps-protocol .tp-colsec-body');
    if (protoBody) {
      protoBody.innerHTML = buildProtocolForm(patientEmail, refreshed);
    } else {
      const snap = await db.collection('users').doc(patientEmail).get();
      if (snap.exists) showRealPatient({ email: patientEmail, ...snap.data() });
    }
  } catch(e) {
    console.error('[Motus] removeProtocolDemo:', e);
    alert('Could not remove the demo video. Please try again.');
  }
}

// ── Patient-side demo auto-play ──

async function closeDemoAndStart() {
  const overlay = document.getElementById('demoVideoOverlay');
  const player  = document.getElementById('demoVideoPlayer');
  if (overlay) overlay.style.display = 'none';
  if (player)  { player.pause(); player.removeAttribute('src'); }

  if (_pendingDemoProtocol) {
    try {
      await db.collection('users').doc(currentUser.email).update({
        demoWatched: firebase.firestore.FieldValue.arrayUnion(_pendingDemoProtocol.id)
      });
    } catch(e) {
      // Non-critical — don't block the session
    }
  }

  const protocol = _pendingDemoProtocol;
  _pendingDemoProtocol = null;
  if (!protocol) return;
  
  if (ANGLE_TRACKING_ENABLED) {
    selectedProtocol = protocol;
    trackedJoints = await loadTrackedJoints(currentUser.email);
    jointMaxAngles = {};
    showScreen('cameraScreen');
    await loadPatientProtocol();
    await initSetTracker();
    if (!mpCamera) startCamera();
  } else {
    openManualCameraSession(protocol);
  }
}

async function skipDemoVideo() {
  // Skipping also counts as watched to avoid auto-play on next visit
  await closeDemoAndStart();
}

function exitDemoNoSave() {
  const overlay = document.getElementById('demoVideoOverlay');
  const player  = document.getElementById('demoVideoPlayer');
  if (overlay) overlay.style.display = 'none';
  if (player)  { player.pause(); player.removeAttribute('src'); }
  if (_demoSourceScreen === 'exercisesScreen') {
    _demoSourceScreen = null;
    showExercisesScreen();
  } else {
    _demoSourceScreen = null;
    showScreen('patientScreen');
  }
}

function onDemoVideoProgress() {
  // Progress handler for demo video
}

function replayDemoInSession() {
  if (selectedProtocol?.demoVideoUrl) {
    const label = exerciseLabels[selectedProtocol.exerciseType] || selectedProtocol.exerciseType;
    openVideoModal(selectedProtocol.demoVideoUrl, 'Demo', label);
  }
}

// ─────────────────────────────────────────────────────────────────────────────

async function assignProtocol() {
  const patientEmail = _protoPatientEmail;
  if (!patientEmail) return;
  const exerciseType = document.getElementById('exerciseType').value;
  if (!exerciseType) { alert('Please select an exercise.'); return; }
  const defaults = EXERCISE_DEFAULTS[exerciseType];

  // Collect exerciseParams from the UI
  let exerciseParams = null;
  if (ANGLE_TRACKING_ENABLED) {
    if (defaults && defaults.metric === 'angle') {
      const conditionRows = document.querySelectorAll('#epConditionsList .ep-condition-row');
      if (conditionRows.length === 0) { alert('Please add at least one joint condition.'); return; }
      const conditions = Array.from(conditionRows).map(row => ({
        finger:   row.querySelector('.ep-finger-select').value,
        joint:    row.querySelector('.ep-joint-select').value,
        flexAt:   parseFloat(row.querySelector('.ep-flex-at').value),
        extendAt: parseFloat(row.querySelector('.ep-extend-at').value),
      }));
      const requireAllEl = document.getElementById('epRequireAll');
      const requireAll   = requireAllEl ? requireAllEl.checked : (conditions.length > 1);
      exerciseParams = { metric: 'angle', conditions, requireAll };
    } else if (defaults && (defaults.metric === 'distance' || defaults.metric === 'abduction')) {
      exerciseParams = { ...defaults };
    }
  }

  const reps = parseInt(document.getElementById('protocolReps').value);
  const sets = parseInt(document.getElementById('protocolSets').value);
  if (isNaN(reps) || reps < 1) { alert('Please enter a valid rep count.'); return; }
  if (isNaN(sets) || sets < 1) { alert('Please enter a valid set count.'); return; }

  // Upload demo video if a new blob was recorded/selected
  const submitBtn = document.getElementById('apmSubmitBtn');
  let demoVideoUrl = _demoExistingVideoUrl || null;
  if (_demoBlob) {
    if (submitBtn) { submitBtn.disabled = true; submitBtn.textContent = 'Uploading demo...'; }
    demoVideoUrl = await uploadVideoToCloudinary(_demoBlob);
    if (demoVideoUrl) {
      _demoThumbnailUrl = _getThumbnailUrl(demoVideoUrl);
    } else {
      console.warn('[Motus] Demo upload failed');
    }
    if (submitBtn) submitBtn.disabled = false;
  }

  const existing = await getProtocols(patientEmail);

  if (editingProtocolId) {
    // Edit mode — update the existing protocol item in place
    const updated = existing.map(p => {
      if (p.id !== editingProtocolId) return p;
      const edited = {
        ...p,
        exerciseType,
        reps,
        sets,
        frequency:  document.getElementById('protocolFrequency').value,
        notes:      document.getElementById('protocolNotes').value.trim(),
        assignedBy: currentUser.name,
        editedAt:   new Date().toISOString()
      };
      if (demoVideoUrl !== undefined) edited.demoVideoUrl = demoVideoUrl;
      if (exerciseParams) edited.exerciseParams = exerciseParams;
      else delete edited.exerciseParams;
      return edited;
    });
    await db.collection('protocols').doc(patientEmail).set({ items: updated });
    editingProtocolId = null;
    editingPatientEmail = null;
  } else {
    // Add mode — append a new protocol item
    const newItem = {
      id:           Date.now().toString(),
      exerciseType,
      reps,
      sets,
      frequency:    document.getElementById('protocolFrequency').value,
      notes:        document.getElementById('protocolNotes').value.trim(),
      assignedBy:   currentUser.name,
      assignedAt:   new Date().toISOString()
    };
    if (demoVideoUrl) newItem.demoVideoUrl = demoVideoUrl;
    if (exerciseParams) newItem.exerciseParams = exerciseParams;
    await db.collection('protocols').doc(patientEmail).set({ items: [...existing, newItem] });
  }
  closeAddProtocol();
  const snap = await db.collection('users').doc(patientEmail).get();
  if (snap.exists) showRealPatient({ email: patientEmail, ...snap.data() });
}

function formatProtocol(p) {
  const dateStr = p.assignedAt ? new Date(p.assignedAt).toLocaleDateString('en-US', { month:'short', day:'numeric', year:'numeric' }) : '';
  const editedStr = p.editedAt ? ` · Edited ${new Date(p.editedAt).toLocaleDateString('en-US', { month:'short', day:'numeric', year:'numeric' })}` : '';

  // Build exercise params summary
  let paramsHTML = '';
  const ep = p.exerciseParams;
  if (ep && ep.metric === 'angle' && ep.conditions) {
    const condStrs = ep.conditions.map(c =>
      `<div class="proto-cond-row">
        <span class="proto-cond-finger">${c.finger.charAt(0).toUpperCase() + c.finger.slice(1)}</span>
        <span class="proto-cond-joint">${c.joint.toUpperCase()}</span>
        <span class="proto-cond-range"><span class="proto-range-flex">${c.flexAt}°</span> → <span class="proto-range-ext">${c.extendAt}°</span></span>
      </div>`
    );
    paramsHTML = `<div class="proto-params-box">
      <div class="proto-params-title">Joint Conditions</div>
      ${condStrs.join('')}
      ${ep.conditions.length > 1 ? `<div class="proto-require-note">${ep.requireAll ? 'All joints required simultaneously' : 'Any single joint counts'}</div>` : ''}
    </div>`;
  } else if (ep && ep.metric === 'distance') {
    paramsHTML = `<div class="proto-params-box"><div class="proto-params-title">Distance-based rep counting</div></div>`;
  } else if (ep && ep.metric === 'abduction') {
    paramsHTML = `<div class="proto-params-box"><div class="proto-params-title">Abduction / spread measurement</div></div>`;
  }

  return `
    <div class="proto-detail-line">${p.reps} reps × ${p.sets} sets · ${frequencyLabels[p.frequency] || p.frequency}</div>
    ${paramsHTML}
    ${p.notes ? `<p class="proto-notes">"${escapeHtml(p.notes)}"</p>` : ''}
    <p class="proto-meta">${p.assignedBy}${dateStr ? ` · ${dateStr}` : ''}${editedStr}</p>`;
}

async function loadPatientProtocol() {
  if (!currentUser) return;
  const protocol  = selectedProtocol || await getExistingProtocol(currentUser.email);
  if (!protocol) return;
  TARGET_REPS = protocol.reps;
  totalSets   = protocol.sets || 3;
  // Populate camera header with exercise info
  const nameEl = document.getElementById('camExerciseName');
  const setEl  = document.getElementById('camSetLabel');
  if (nameEl) nameEl.textContent = exerciseLabels[protocol.exerciseType] || protocol.exerciseType;
  if (setEl)  setEl.textContent  = `Set 1 of ${totalSets}`;
}

async function showExercisesScreen() {
  const [protocols, allSessions] = currentUser
    ? await Promise.all([getProtocols(currentUser.email), getPatientSessions(currentUser.email)])
    : [[], []];
  const inner = document.getElementById('exercisesScreenInner');
  if (!inner) return;

  if (protocols.length === 0) {
    inner.innerHTML = `
      <div class="exs-empty">
        <div class="exs-empty-icon"></div>
        <p class="exs-empty-title">No protocol yet</p>
        <p class="exs-empty-sub">Your therapist has not assigned any exercises for you.</p>
      </div>`;
    showScreen('exercisesScreen');
    return;
  }

  // Count today's completed sets per protocolId
  const today = new Date().toDateString();
  const doneById = {};
  allSessions
    .filter(s => s.protocolId && new Date(s.date).toDateString() === today)
    .forEach(s => { 
      if (s.setData && s.setData.length > 0) {
        doneById[s.protocolId] = (doneById[s.protocolId] || 0) + s.setData.length;
      } else {
        doneById[s.protocolId] = (doneById[s.protocolId] || 0) + 1;
      }
    });

  _exercisesProtocols = protocols;
  _exercisesDoneById = doneById;

  const EXS_COLLAPSED_MAX = 3;
  const cards = protocols.map((p, i) => {
    const doneSets = doneById[p.id] || 0;
    const totalSetsNeeded = p.sets || 3;
    const isDone = doneSets >= totalSetsNeeded;
    const statusCls = isDone ? 'exs-status-done' : doneSets > 0 ? 'exs-status-partial' : '';
    const badge = isDone ? '<span class="exs-row-badge done">Done</span>'
      : `<span class="exs-row-badge partial">${doneSets}/${totalSetsNeeded}</span>`;
    return `<div class="exs-row ${statusCls}" onclick="startSessionByIndex(${i})">
      <div class="exs-row-left">
        <span class="exs-row-name">${exerciseLabels[p.exerciseType] || p.exerciseType}</span>
        <span class="exs-row-meta">${p.reps} reps × ${p.sets} sets · ${frequencyLabels[p.frequency] || p.frequency}</span>
      </div>
      <div class="exs-row-right">
        ${badge}
        <svg class="exs-row-arrow" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M9 18l6-6-6-6"/></svg>
      </div>
    </div>`;
  });
  const showToggle = protocols.length > EXS_COLLAPSED_MAX;
  inner.innerHTML = `<div class="exs-list" id="exsList">
    ${cards.map((c, i) => i >= EXS_COLLAPSED_MAX ? c.replace('class="exs-row', 'class="exs-row exs-hidden') : c).join('')}
  </div>
  ${showToggle ? `<button class="exs-toggle-btn" onclick="toggleExerciseList()">Show all ${protocols.length} exercises</button>` : ''}`;

  showScreen('exercisesScreen');
}

function toggleExerciseList() {
  const list = document.getElementById('exsList');
  const btn = document.querySelector('.exs-toggle-btn');
  if (!list || !btn) return;
  const hidden = list.querySelectorAll('.exs-hidden');
  if (hidden.length) {
    hidden.forEach(el => el.classList.remove('exs-hidden'));
    btn.textContent = 'Show less';
  } else {
    list.querySelectorAll('.exs-row').forEach((el, i) => { if (i >= 3) el.classList.add('exs-hidden'); });
    btn.textContent = `Show all ${list.querySelectorAll('.exs-row').length} exercises`;
  }
}

/* ══════════════════════════════════════════════════════════════════════════
   SECTION 8: THERAPIST PANEL
   ══════════════════════════════════════════════════════════════════════════ */

function openSidebar() {
  document.getElementById('therapistSidebar').classList.add('open');
  document.getElementById('sidebarBackdrop').classList.add('open');
  document.querySelector('.tp-hamburger')?.setAttribute('aria-expanded', 'true');
}

function closeSidebar() {
  document.getElementById('therapistSidebar')?.classList.remove('open');
  document.getElementById('sidebarBackdrop')?.classList.remove('open');
  document.querySelector('.tp-hamburger')?.setAttribute('aria-expanded', 'false');
}

async function loadConnectedPatients() {
  document.querySelectorAll('.patient-item').forEach(el => el.remove());
  const existing = document.getElementById('noPatientsMsg');
  if (existing) existing.remove();
  const patients = await getConnectedPatients(currentUser.email);
  if (patients.length === 0) {
    const msg = document.createElement('div');
    msg.id = 'noPatientsMsg';
    msg.className = 'no-patients';
    msg.innerHTML = `No patients connected yet.<br/>Share your clinic code above<br/>with your patients to get started.`;
    document.querySelector('.sidebar-footer').before(msg);
    return;
  }
  for (const patient of patients) {
    const item      = document.createElement('div');
    item.className  = 'patient-item';
    item.dataset.patientEmail = patient.email;
    const [sessions, unread] = await Promise.all([
      getPatientSessions(patient.email),
      unreadCount(currentUser.email, patient.email).catch(() => 0),
    ]);
    const compliance = calcCompliance(sessions);
    const statusColor = compliance >= 80 ? 'var(--success)' : compliance >= 50 ? '#f59e0b' : 'var(--danger)';
    const statusText  = compliance >= 80 ? 'On track' : compliance >= 50 ? 'At risk' : sessions.length === 0 ? 'No sessions yet' : 'Non-compliant';
    const unreadBadge = unread > 0 ? `<span class="msg-unread-badge" style="margin-left:0.4rem">${unread}</span>` : '';
    item.innerHTML = `
      <div class="patient-name">${escapeHtml(patient.name)}${unreadBadge}</div>
      <div class="patient-connected">
        <span class="sh-indicator" style="background:${statusColor}"></span> ${statusText}${sessions.length > 0 ? ` — ${compliance}% compliance` : ''}
      </div>`;
    item.onclick = () => {
      document.querySelectorAll('.patient-item').forEach(i => i.classList.remove('selected'));
      item.classList.add('selected');
      closeSidebar();
      showRealPatient(patient);
    };
    document.querySelector('.sidebar-footer').before(item);
  }
  subscribeTherapistBadges(currentUser.email);
}

function subscribeTherapistBadges(therapistEmail) {
  if (_msgPatientBadgesUnsub) { _msgPatientBadgesUnsub(); _msgPatientBadgesUnsub = null; }
  _msgPatientBadgesUnsub = db.collection('messages')
    .where('to', '==', therapistEmail)
    .where('read', '==', false)
    .onSnapshot(snap => {
      // Count unread per sender (patient)
      const counts = {};
      snap.forEach(d => {
        const from = d.data().from;
        counts[from] = (counts[from] || 0) + 1;
      });
      document.querySelectorAll('.patient-item').forEach(item => {
        const pEmail = item.dataset.patientEmail;
        if (!pEmail) return;
        const nameEl = item.querySelector('.patient-name');
        if (!nameEl) return;
        // Remove existing badge
        const existing = nameEl.querySelector('.msg-unread-badge');
        if (existing) existing.remove();
        const n = counts[pEmail] || 0;
        if (n > 0) {
          const badge = document.createElement('span');
          badge.className = 'msg-unread-badge';
          badge.style.marginLeft = '0.4rem';
          badge.textContent = n;
          nameEl.appendChild(badge);
        }
      });
    }, () => {});
}

// ── Mobile therapist panel helpers ────────────────────────────────────────────
function backToPatientList() {
  if (_msgThreadUnsub) { _msgThreadUnsub(); _msgThreadUnsub = null; }
  document.getElementById('therapistScreen').classList.remove('tp-mobile-detail');
  document.querySelectorAll('.patient-item').forEach(i => i.classList.remove('selected'));
  const panel = document.getElementById('mainPanel');
  panel.innerHTML = `
    <div class="tp-header">
      <button class="tp-header-add-btn" onclick="openBulkAssign()">Bulk Assign</button>
    </div>
    <div class="empty-state">
      <p>← Select a patient to view their progress</p>
    </div>`;
}

function filterPatients(query) {
  const q = query.toLowerCase().trim();
  document.querySelectorAll('.patient-item').forEach(item => {
    const name = item.querySelector('.patient-name')?.textContent.toLowerCase() || '';
    item.style.display = !q || name.includes(q) ? '' : 'none';
  });
}

function enableMobilePatientDetail(panel) {
  if (window.innerWidth >= 1024) return;
  document.getElementById('therapistScreen').classList.add('tp-mobile-detail');
  panel.insertAdjacentHTML('afterbegin', '<div style="margin-bottom:16px;"><button class="tp-mobile-back-btn" style="padding:0" onclick="backToPatientList()">← All Patients</button></div>');
}

// No fake demo data - real sessions only
function getDemoSessions(patientEmail) {
  return [];
}

async function getPatientSessions(patientEmail) {
  const cutoff = new Date(Date.now() - 90 * 86400000).toISOString();
  const snap = await db.collection('sessions')
    .where('patientEmail', '==', patientEmail).get();
  const stored = snap.docs.map(d => d.data()).filter(s => s.date >= cutoff);
  return [...getDemoSessions(patientEmail), ...stored]
    .sort((a, b) => new Date(a.date) - new Date(b.date));
}

function calcCompliance(sessions) {
  if (sessions.length === 0) return 0;
  const now          = new Date();
  const sevenDaysAgo = new Date(now - 7 * 24 * 60 * 60 * 1000);
  const recentDays   = new Set(
    sessions.filter(s => new Date(s.date) > sevenDaysAgo).map(s => new Date(s.date).toDateString())
  );
  return Math.round((recentDays.size / 7) * 100);
}

function makeCollapsible(id, title, bodyHTML, open) {
  return `
    <div class="tp-colsec${open ? '' : ' collapsed'}" id="tps-${id}">
      <div class="tp-colsec-hdr" onclick="toggleTpSection('tps-${id}')">
        <span class="tp-colsec-title">${title}</span>
        <span class="tp-colsec-arrow">▾</span>
      </div>
      <div class="tp-colsec-body">${bodyHTML}</div>
    </div>`;
}

function toggleTpSection(id) {
  const el = document.getElementById(id);
  if (!el) return;
  el.classList.toggle('collapsed');
  // Let Chart.js redraw if a chart section was just revealed
  window.dispatchEvent(new Event('resize'));
  // Scroll message thread to bottom when Messages section is expanded
  if (id === 'tps-messages' && !el.classList.contains('collapsed')) {
    const thread = document.getElementById('therapistMsgThread');
    if (thread) requestAnimationFrame(() => { thread.scrollTop = thread.scrollHeight; });
  }
}

async function showRealPatient(patient) {
  const [sessions, protocols] = await Promise.all([
    getPatientSessions(patient.email),
    getProtocols(patient.email)
  ]);
  const panel = document.getElementById('mainPanel');

  if (sessions.length === 0) {
    panel.innerHTML = `
      <div class="patient-panel-hdr">
        <div class="patient-panel-hdr-left">
          <button class="tp-back-btn" onclick="backToPatientList()" title="Back to patients list">←</button>
          <div><h3>${escapeHtml(patient.name)}</h3><p class="subtitle">Connected Patient</p></div>
        </div>
        <button class="apm-add-btn" data-email="${patient.email}" data-name="${patient.name.replace(/"/g, '&quot;')}" onclick="openAddProtocol(this.dataset.email, this.dataset.name)">Add Protocol</button>
      </div>
      <div class="chart-card" style="text-align:center; color:#475569; padding:40px;">
        No session data yet. Data will appear here once ${patient.name.split(' ')[0]} completes their first session.
      </div>
      ${makeCollapsible('history', 'Session History', buildSessionHistory(sessions, patient.name), false)}
      ${makeCollapsible('protocol', 'Current Protocol', buildProtocolList(patient.email, protocols), false)}
      ${makeCollapsible('messages', 'Messages', buildMessagePanel(patient.email), false)}`;
    await markRead(currentUser.email, patient.email);
    document.getElementById('therapistMsgSend').onclick = async () => {
      const input = document.getElementById('therapistMsgInput');
      await sendMessage(currentUser.email, patient.email, input.value);
      input.value = '';
    };
    subscribeThread('therapistMsgThread', currentUser.email, patient.email, `Send a message to ${patient.name.split(' ')[0]}`);
    enableMobilePatientDetail(panel);
    return;
  }

  const compliance      = calcCompliance(sessions);
  const lastSession = sessions.length > 0 ? sessions[sessions.length - 1] : null;
  let lastPain = '-';
  if (lastSession) {
    if (lastSession.setData && lastSession.setData.length > 0) {
      const setPains = lastSession.setData.map(s => s.pain || 0);
      lastPain = (setPains.reduce((a, b) => a + b, 0) / setPains.length).toFixed(1);
    } else {
      lastPain = (lastSession.pain || 1).toFixed(1);
    }
  }
  const totalReps       = sessions.reduce((s, x) => s + (x.reps || 0), 0);
  const complianceColor = compliance >= 80 ? '#22c55e' : compliance >= 50 ? '#f59e0b' : '#ef4444';
  const recent          = sessions.slice(-8);
  const painData        = recent.map(s => s.pain || 0);
  const labels          = buildChartLabels(recent);

  panel.innerHTML = `
    <div class="patient-panel-hdr">
      <div class="patient-panel-hdr-left">
        <button class="tp-back-btn" onclick="backToPatientList()" title="Back to patients list">←</button>
        <div><h3>${escapeHtml(patient.name)}</h3><p class="subtitle">Connected Patient — ${sessions.length} session${sessions.length !== 1 ? 's' : ''} recorded</p></div>
      </div>
      <button class="apm-add-btn" data-email="${patient.email}" data-name="${patient.name.replace(/"/g, '&quot;')}" onclick="openAddProtocol(this.dataset.email, this.dataset.name)">Add Protocol</button>
    </div>
    <div class="stats-row">
      <div class="stat-card"><div class="stat-value"><span class="sh-indicator" style="background:${complianceColor}"></span>${compliance}%</div><div class="stat-label">7-Day Compliance</div></div>
      <div class="stat-card"><div class="stat-value">${lastPain}</div><div class="stat-label">Last Session's Avg Pain Rating</div></div>
    </div>
    <div class="tp-charts-grid">
    ${makeCollapsible('pain',    'Pain Rating Over Time',     '<canvas id="painChart" height="160"></canvas>', false)}
    </div>
    ${makeCollapsible('history', 'Session History', buildSessionHistory(sessions, patient.name), false)}
    ${makeCollapsible('protocol', 'Current Protocol', buildProtocolList(patient.email, protocols), false)}
    ${makeCollapsible('messages','Messages',                  buildMessagePanel(patient.email), false)}`;

  const tPainCfg = buildChartConfig(painData, { type: 'pain', color: '#ef4444', fillColor: 'rgba(239,68,68,0.06)' });
  new Chart(document.getElementById('painChart').getContext('2d'), {
    type: 'line', data: { labels, datasets: [tPainCfg.dataset] }, options: tPainCfg.options
  });

  await markRead(currentUser.email, patient.email);
  document.getElementById('therapistMsgSend').onclick = async () => {
    const input = document.getElementById('therapistMsgInput');
    await sendMessage(currentUser.email, patient.email, input.value);
    input.value = '';
  };
  subscribeThread('therapistMsgThread', currentUser.email, patient.email, `Send a message to ${patient.name.split(' ')[0]}`);
  enableMobilePatientDetail(panel);
  updateExerciseParamsUI(null, null);
}

function toggleShExpand(id) {
  document.getElementById(id)?.classList.toggle('sh-expanded');
}

const SH_PAGE_SIZE = 15;
let shVisibleCount = SH_PAGE_SIZE;

function shLoadMore() {
  shVisibleCount += SH_PAGE_SIZE;
  const body = document.querySelector('#tps-history .tp-colsec-body');
  if (body && window._lastHistorySessions) {
    body.innerHTML = buildSessionHistory(window._lastHistorySessions, window._lastHistoryPatientName);
  }
}

function buildSessionHistory(sessions, patientName) {
  window._lastHistorySessions   = sessions;
  window._lastHistoryPatientName = patientName || '';
  window._setNotesData = [];
  if (sessions.length === 0) {
    return `<div class="session-history-card"><h4>Session history</h4><div style="color:var(--muted); font-size:0.85rem; text-align:center; padding:20px;">No sessions recorded yet.</div></div>`;
  }
  const byDay = groupSessionsByDay(sessions);
  const days = Object.keys(byDay).sort((a, b) => new Date(b) - new Date(a));
  let html = '<div class="session-history-card"><h4>Session history</h4><div class="prog-days-list">';
  days.forEach(day => {
    const daySessions = byDay[day];
    const dayDate = new Date(day);
    const dayLabel = dayDate.toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' });
    const todayStr = new Date().toISOString().split('T')[0];
    const isToday = day === todayStr;
    const exercisesMap = {};
    daySessions.forEach(s => {
      const exType = s.exerciseType || 'General';
      if (!exercisesMap[exType]) exercisesMap[exType] = [];
      exercisesMap[exType].push(s);
    });
    const exCount = Object.keys(exercisesMap).length;
    const totalSets = daySessions.length;
    const totalReps = daySessions.reduce((sum, s) => sum + (s.reps || 0), 0);
    const avgPain = totalSets > 0
      ? (daySessions.reduce((sum, s) => sum + (s.pain || 0), 0) / totalSets).toFixed(1)
      : '-';
    html += `<div class="prog-day-card">
      <div class="prog-day-header" onclick="toggleProgDay(this.parentElement)">
        <div class="prog-day-title-row">
          <span class="prog-day-expand-icon">▾</span>
          <span class="prog-day-title">${isToday ? 'Today' : dayLabel}</span>
          <span class="prog-day-badge">${exCount} exercise${exCount !== 1 ? 's' : ''}, ${totalSets} set${totalSets !== 1 ? 's' : ''}</span>
        </div>
        <div class="prog-day-summary">
          <span class="prog-day-stat">${totalReps} reps</span>
          <span class="prog-day-stat">Avg pain: ${avgPain}</span>
        </div>
      </div>
      <div class="prog-day-body">`;
    Object.keys(exercisesMap).forEach(exType => {
      const exSessions = exercisesMap[exType];
      const exLabel = exerciseLabels[exType] || exType;
      html += `<div class="prog-exercise-block">
        <div class="prog-exercise-header">${exLabel}</div>
        <div class="prog-sets-list">
          <div class="prog-sets-header">
            <span class="prog-hdr-label"></span>
            <span class="prog-hdr-video">Video</span>
            <span class="prog-hdr-reps">Reps</span>
            <span class="prog-hdr-pain">Pain</span>
            <span class="prog-hdr-notes"></span>
          </div>`;
      exSessions.forEach((s, idx) => {
        const setNum = idx + 1;
        const hasVideo = !!s.videoUrl;
        const exitedEarly = s.notes && s.notes.toLowerCase().includes('exited');
        let videoBtn = '<span class="prog-set-empty">—</span>';
        if (hasVideo) {
          const safeUrl = (s.videoUrl || '').replace(/'/g, '%27');
          const safeDate = (s.parentDate || s.date || '').replace(/'/g, '');
          const pName = (window._lastHistoryPatientName || '').replace(/'/g, '');
          videoBtn = `<button class="prog-set-video-btn" onclick="event.stopPropagation(); openVideoModal('${safeUrl}', '${safeDate}', '${pName}')" title="Watch Set ${setNum}">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><polygon points="5,3 19,12 5,21"/></svg>
          </button>`;
        }
        const notesIdx = s.notes && s.notes.trim()
          ? (window._setNotesData.push(s.notes) - 1)
          : -1;
        const notesBtn = notesIdx >= 0
          ? `<button class="prog-set-notes-btn" onclick="event.stopPropagation(); showSetNotes(${notesIdx})">
              Comments
            </button>`
          : '<span class="prog-set-empty">—</span>';
        const exitBadge = exitedEarly
          ? `<span class="prog-set-exit-badge" title="Patient exited early">Exited</span>`
          : '';
        html += `<div class="prog-set-row">
          <div class="prog-set-info">
            <span class="prog-set-label">Set ${setNum}</span>
            ${exitBadge}
          </div>
          <div class="prog-set-data">
            ${videoBtn}
            <span class="prog-set-reps">${s.reps || 0} reps</span>
            <span class="prog-set-pain">${s.pain || 1}/10</span>
            ${notesBtn}
          </div>
        </div>`;
      });
      html += `</div></div>`;
    });
    html += `</div></div>`;
  });
  html += '</div></div>';
  return html;
}

function buildProtocolForm(patientEmail, protocols) {
  return buildProtocolList(patientEmail, protocols);
}

function buildProtocolList(patientEmail, protocols) {
  if (!protocols.length) {
    return '<div class="proto-empty">No exercises assigned yet.</div>';
  }
  return `
    <div class="proto-existing-section">
      ${protocols.map(p => {
        const exLabel = (exerciseLabels[p.exerciseType] || p.exerciseType).replace(/'/g, "\\'");
        const demoUrl = p.demoVideoUrl ? p.demoVideoUrl.replace(/'/g, "\\'") : '';
        const demoBtns = p.demoVideoUrl
          ? `<button class="protocol-demo-btn" onclick="playProtocolDemo('${demoUrl}', '${exLabel}')">Play Demo</button>
             <button class="protocol-remove-demo-btn" onclick="removeProtocolDemo('${patientEmail}', '${p.id}')">Remove Demo</button>`
          : '';
        return `
        <div class="proto-card">
          <div class="proto-card-header">
            <span class="proto-card-name">${exerciseLabels[p.exerciseType] || p.exerciseType}</span>
            <div class="protocol-action-btns">
              ${demoBtns}
              <button class="protocol-edit-btn" onclick="editProtocol('${patientEmail}', '${p.id}')">Edit</button>
              <button class="protocol-delete-btn" onclick="deleteProtocol('${patientEmail}', '${p.id}')">Remove</button>
            </div>
          </div>
          ${formatProtocol(p)}
        </div>`;
      }).join('')}
    </div>`;
}

// ── Add Protocol Modal ─────────────────────────────────────────────────────

async function openAddProtocol(patientEmail, patientName) {
  _protoPatientEmail = patientEmail;
  editingProtocolId = null;
  editingPatientEmail = null;
  await _apmLoadCustomExercises();
  _apmNewExCat = false;
  const modal = document.getElementById('addProtocolModal');
  if (!modal) return;
  document.getElementById('apmPatientName').textContent = patientName || patientEmail;
  document.getElementById('apmTitle').textContent = 'Add Exercise';
  document.getElementById('apmSubmitBtn').textContent = 'Add to Protocol';
  const repsEl = document.getElementById('protocolReps');
  const setsEl = document.getElementById('protocolSets');
  const freqEl = document.getElementById('protocolFrequency');
  const notesEl = document.getElementById('protocolNotes');
  const typeEl = document.getElementById('exerciseType');
  if (repsEl) repsEl.value = 10;
  if (setsEl) setsEl.value = 3;
  if (freqEl) freqEl.value = 'daily';
  if (notesEl) notesEl.value = '';
  if (typeEl) typeEl.value = '';
  const searchEl = document.getElementById('apmSearch');
  if (searchEl) searchEl.value = '';
  const createFields = document.getElementById('apmCreateFields');
  if (createFields) createFields.style.display = 'none';
  const cancelBtn = document.getElementById('apmCancelBtn');
  const submitBtn = document.getElementById('apmSubmitBtn');
  cancelBtn.textContent = 'Cancel';
  cancelBtn.onclick = closeAddProtocol;
  submitBtn.onclick = assignProtocol;
  modal.style.display = 'flex';
  document.body.style.overflow = 'hidden';
  _apmRenderLibrary('');
  updateExerciseParamsUI(null, null);
  const infoEl = document.getElementById('apmSelectedExInfo');
  if (infoEl) infoEl.style.display = 'none';
  _demoBlob = null;
  _demoExistingVideoUrl = null;
  _demoSetState('initial');
}

function closeAddProtocol() {
  const modal = document.getElementById('addProtocolModal');
  if (modal) modal.style.display = 'none';
  document.body.style.overflow = '';
  editingProtocolId = null;
  editingPatientEmail = null;
  _protoPatientEmail = null;
  if (_bulkAssignMode) {
    _bulkAssignMode = false;
    const patSection = document.getElementById('bapPatientSection');
    if (patSection) patSection.style.display = 'none';
  }
  _demoCleanup();
  _demoSetState('initial');
}

async function openBulkAssign() {
  _bulkAssignMode = true;
  _protoPatientEmail = null;
  editingProtocolId = null;
  editingPatientEmail = null;
  await _apmLoadCustomExercises();
  _apmNewExCat = false;
  const modal = document.getElementById('addProtocolModal');
  if (!modal) return;
  document.getElementById('apmTitle').textContent = 'Bulk Assign Exercise';
  document.getElementById('apmPatientName').textContent = '';
  document.getElementById('apmSubmitBtn').textContent = 'Assign to Selected';
  const repsEl  = document.getElementById('protocolReps');
  const setsEl  = document.getElementById('protocolSets');
  const freqEl  = document.getElementById('protocolFrequency');
  const notesEl = document.getElementById('protocolNotes');
  const typeEl  = document.getElementById('exerciseType');
  if (repsEl)  repsEl.value  = 10;
  if (setsEl)  setsEl.value  = 3;
  if (freqEl)  freqEl.value  = 'daily';
  if (notesEl) notesEl.value = '';
  if (typeEl)  typeEl.value  = '';
  const searchEl = document.getElementById('apmSearch');
  if (searchEl) searchEl.value = '';
  const createFields = document.getElementById('apmCreateFields');
  if (createFields) createFields.style.display = 'none';
  const patSection = document.getElementById('bapPatientSection');
  if (patSection) patSection.style.display = 'block';
  await _bapLoadPatients();
  const cancelBtn = document.getElementById('apmCancelBtn');
  const submitBtn = document.getElementById('apmSubmitBtn');
  cancelBtn.textContent = 'Cancel';
  cancelBtn.onclick = closeAddProtocol;
  submitBtn.onclick = bulkAssignProtocol;
  _bapUpdateSubmitBtn();
  modal.style.display = 'flex';
  document.body.style.overflow = 'hidden';
  _apmRenderLibrary('');
  updateExerciseParamsUI(null, null);
}

async function _bapLoadPatients() {
  const listEl = document.getElementById('bapPatientsList');
  if (!listEl) return;
  const selectAll = document.getElementById('bapSelectAll');
  if (selectAll) selectAll.checked = false;
  const patients = await getConnectedPatients(currentUser.email);
  if (!patients.length) {
    listEl.innerHTML = '<div class="bap-no-patients">No connected patients</div>';
    return;
  }
  listEl.innerHTML = patients.map(p => `
    <label class="bap-patient-row">
      <input type="checkbox" class="bap-patient-cb" value="${p.email}" onchange="_bapUpdateSubmitBtn()">
      <span class="bap-patient-name">${p.name}</span>
    </label>
  `).join('');
}

function bapToggleAll(checked) {
  document.querySelectorAll('.bap-patient-cb').forEach(cb => { cb.checked = checked; });
  _bapUpdateSubmitBtn();
}

function bapFilterPatients(query) {
  const q = query.toLowerCase().trim();
  document.querySelectorAll('.bap-patient-row').forEach(row => {
    const name = row.querySelector('.bap-patient-name')?.textContent.toLowerCase() || '';
    row.style.display = !q || name.includes(q) ? '' : 'none';
  });
}

function _bapUpdateSubmitBtn() {
  const count = document.querySelectorAll('.bap-patient-cb:checked').length;
  const btn = document.getElementById('apmSubmitBtn');
  if (!btn) return;
  btn.textContent = count > 0 ? `Assign to ${count} patient${count !== 1 ? 's' : ''}` : 'Assign to Selected';
}

async function bulkAssignProtocol() {
  const selected = Array.from(document.querySelectorAll('.bap-patient-cb:checked')).map(cb => cb.value);
  if (!selected.length) { alert('Select at least one patient.'); return; }
  const exerciseType = document.getElementById('exerciseType').value;
  if (!exerciseType) { alert('Please select an exercise.'); return; }
  const defaults = EXERCISE_DEFAULTS[exerciseType];
  let exerciseParams = null;
  if (ANGLE_TRACKING_ENABLED) {
    if (defaults && defaults.metric === 'angle') {
      const conditionRows = document.querySelectorAll('#epConditionsList .ep-condition-row');
      if (conditionRows.length === 0) { alert('Please add at least one joint condition.'); return; }
      const conditions = Array.from(conditionRows).map(row => ({
        finger:   row.querySelector('.ep-finger-select').value,
        joint:    row.querySelector('.ep-joint-select').value,
        flexAt:   parseFloat(row.querySelector('.ep-flex-at').value),
        extendAt: parseFloat(row.querySelector('.ep-extend-at').value),
      }));
      const requireAllEl = document.getElementById('epRequireAll');
      exerciseParams = { metric: 'angle', conditions, requireAll: requireAllEl ? requireAllEl.checked : conditions.length > 1 };
    } else if (defaults && (defaults.metric === 'distance' || defaults.metric === 'abduction')) {
      exerciseParams = { ...defaults };
    }
  }
  const reps = parseInt(document.getElementById('protocolReps').value);
  const sets = parseInt(document.getElementById('protocolSets').value);
  if (isNaN(reps) || reps < 1) { alert('Please enter a valid rep count.'); return; }
  if (isNaN(sets) || sets < 1) { alert('Please enter a valid set count.'); return; }
  const freq  = document.getElementById('protocolFrequency').value;
  const notes = document.getElementById('protocolNotes').value.trim();
  const submitBtn = document.getElementById('apmSubmitBtn');
  if (submitBtn) submitBtn.disabled = true;

  // Upload demo once, reuse URL across all patients
  let demoVideoUrl = null;
  if (_demoBlob) {
    if (submitBtn) submitBtn.textContent = 'Uploading demo...';
    demoVideoUrl = await uploadVideoToCloudinary(_demoBlob);
    if (submitBtn) submitBtn.textContent = 'Assigning...';
  }

  let successCount = 0;
  const now = Date.now();
  for (const patientEmail of selected) {
    try {
      const existing = await getProtocols(patientEmail);
      const newItem = {
        id:           (now + successCount).toString(),
        exerciseType,
        reps,
        sets,
        frequency:    freq,
        notes,
        assignedBy:   currentUser.name,
        assignedAt:   new Date().toISOString()
      };
      if (demoVideoUrl) newItem.demoVideoUrl = demoVideoUrl;
      if (exerciseParams) newItem.exerciseParams = exerciseParams;
      await db.collection('protocols').doc(patientEmail).set({ items: [...existing, newItem] });
      successCount++;
    } catch (e) { /* skip failed patient */ }
  }
  if (submitBtn) submitBtn.disabled = false;
  closeAddProtocol();
  alert(`Exercise assigned to ${successCount} patient${successCount !== 1 ? 's' : ''}.`);
}

function _apmRenderLibrary(query) {
  const listEl = document.getElementById('apmLibList');
  if (!listEl) return;
  const q = query.toLowerCase().trim();
  const filtered = PROTOCOL_CATALOG.filter(e =>
    !q || (exerciseLabels[e.id] || '').toLowerCase().includes(q) || e.cat.toLowerCase().includes(q) || e.desc.toLowerCase().includes(q)
  );
  if (!filtered.length) {
    listEl.innerHTML = '<div class="apm-lib-empty">No exercises found</div>';
    return;
  }
  const cats = {};
  for (const e of filtered) { if (!cats[e.cat]) cats[e.cat] = []; cats[e.cat].push(e); }
  listEl.innerHTML = Object.entries(cats).map(([cat, items]) => `
    <div class="apm-lib-cat">
      <div class="apm-lib-cat-label">${cat}</div>
      ${items.map(e => `
        <div class="apm-lib-item" id="apm-item-${e.id}" onclick="apmSelectExercise('${e.id}')">
          <div class="apm-lib-item-name">${exerciseLabels[e.id] || e.id}</div>
          <div class="apm-lib-item-desc">${e.desc}</div>
        </div>
      `).join('')}
    </div>
  `).join('');
  const currentType = document.getElementById('exerciseType')?.value;
  if (currentType) _apmHighlightSelected(currentType);
}

function _apmHighlightSelected(id) {
  document.querySelectorAll('.apm-lib-item').forEach(el => el.classList.remove('apm-lib-item--active'));
  const el = document.getElementById('apm-item-' + id);
  if (el) { el.classList.add('apm-lib-item--active'); el.scrollIntoView({ block: 'nearest', behavior: 'smooth' }); }
}

function apmSelectExercise(id) {
  const typeEl = document.getElementById('exerciseType');
  if (typeEl) typeEl.value = id;
  const entry = PROTOCOL_CATALOG.find(e => e.id === id);
  if (entry) {
    const repsEl = document.getElementById('protocolReps');
    const setsEl = document.getElementById('protocolSets');
    const freqEl = document.getElementById('protocolFrequency');
    if (repsEl) repsEl.value = entry.dr;
    if (setsEl) setsEl.value = entry.ds;
    if (freqEl) freqEl.value = entry.df;
    const infoEl = document.getElementById('apmSelectedExInfo');
    const nameEl = document.getElementById('apmSelectedExName');
    const descEl = document.getElementById('apmSelectedExDesc');
    if (nameEl) nameEl.textContent = exerciseLabels[id] || id;
    if (descEl) descEl.textContent = entry.desc || '';
    if (infoEl) infoEl.style.display = 'block';
  }
  updateExerciseParamsUI(id, null);
  _apmHighlightSelected(id);
}

function apmFilter(query) { _apmRenderLibrary(query); }

async function _apmLoadCustomExercises() {
  try {
    const snap = await db.collection('customExercises').get();
    snap.forEach(doc => {
      const d = doc.data();
      if (!PROTOCOL_CATALOG.find(e => e.id === d.id)) {
        PROTOCOL_CATALOG.push({ id: d.id, cat: d.cat, dr: d.dr, ds: d.ds, df: d.df, desc: d.desc || '' });
        exerciseLabels[d.id] = d.name;
      }
    });
  } catch (e) { /* non-fatal */ }

  if (auth.currentUser?.email) {
    try {
      const doc = await db.collection('therapistLibrary').doc(auth.currentUser.email).get();
      if (doc.exists) {
        const data = doc.data();
        const hidden = new Set(data.hiddenIds || []);
        const edited = {};
        (data.editedBuiltIns || []).forEach(e => { edited[e.id] = e; });
        (data.customExercises || []).forEach(e => {
          if (!PROTOCOL_CATALOG.find(ex => ex.id === e.id) && !hidden.has(e.id)) {
            PROTOCOL_CATALOG.push({ id: e.id, cat: e.cat, dr: e.dr, ds: e.ds, df: e.df, desc: e.desc || '' });
            exerciseLabels[e.id] = e.name;
          }
        });
        Object.keys(edited).forEach(id => {
          const orig = PROTOCOL_CATALOG.find(e => e.id === id);
          if (orig && !hidden.has(id)) {
            orig.dr = edited[id].dr ?? orig.dr;
            orig.ds = edited[id].ds ?? orig.ds;
            orig.df = edited[id].df ?? orig.df;
            orig.desc = edited[id].desc ?? orig.desc;
            if (edited[id].name) exerciseLabels[id] = edited[id].name;
          }
        });
        for (let i = PROTOCOL_CATALOG.length - 1; i >= 0; i--) {
          if (hidden.has(PROTOCOL_CATALOG[i].id)) PROTOCOL_CATALOG.splice(i, 1);
        }
      }
    } catch (e) { /* non-fatal */ }
  }
}

function apmEnterCreateMode() {}
function apmExitCreateMode() {}
async function apmSaveCustomExercise() {}

/* ══════════════════════════════════════════════════════════════════════════
    PROTOCOL LIBRARY MODAL
    ══════════════════════════════════════════════════════════════════════════ */

async function loadTherapistLibrary() {
  try {
    const doc = await db.collection('therapistLibrary').doc(auth.currentUser.email).get();
    if (doc.exists) {
      _plTherapistData = doc.data();
    } else {
      _plTherapistData = { customExercises: [], hiddenIds: [], editedBuiltIns: [] };
      await db.collection('therapistLibrary').doc(auth.currentUser.email).set(_plTherapistData);
    }
  } catch (e) {
    _plTherapistData = { customExercises: [], hiddenIds: [], editedBuiltIns: [] };
  }
}

function buildProtocolLibrary() {
  const hidden = new Set(_plTherapistData.hiddenIds || []);
  const edited = {};
  (_plTherapistData.editedBuiltIns || []).forEach(e => { edited[e.id] = e; });
  const custom = (_plTherapistData.customExercises || []).map(e => ({ ...e, _isCustom: true }));

  const builtInMap = {};
  PROTOCOL_CATALOG.forEach(e => { builtInMap[e.id] = { ...e }; });

  Object.keys(edited).forEach(id => {
    if (builtInMap[id]) {
      Object.assign(builtInMap[id], edited[id], { _isEdited: true });
    }
  });

  const allBuiltIns = Object.values(builtInMap).filter(e => !hidden.has(e.id));
  const allCustom = custom.filter(e => !hidden.has(e.id));

  _plLibrary = [...allBuiltIns, ...allCustom];
  _plLibrary._hiddenIds = hidden;
  _plLibrary._editedIds = new Set(Object.keys(edited));
}

function openProtocolLibrary() {
  document.getElementById('protocolLibraryModal').style.display = 'flex';
  document.body.style.overflow = 'hidden';
  _plHiddenOpen = false;
  _plCreateMode = false;
  _plSelectedId = null;
  document.getElementById('plEmptyState').style.display = '';
  document.getElementById('plConfigFields').style.display = 'none';
  document.getElementById('plNormalConfig').style.display = '';
  document.getElementById('plCreateConfig').style.display = 'none';
  document.getElementById('plSelectedExInfo').style.display = 'none';
  document.getElementById('plResetBtn').style.display = 'none';
  const hh = document.getElementById('plHiddenHeader');
  if (hh) hh.classList.remove('open');
  const hl = document.getElementById('plHiddenList');
  if (hl) hl.style.display = 'none';
  loadTherapistLibrary().then(() => {
    buildProtocolLibrary();
    plRender();
  });
}

function closeProtocolLibrary() {
  document.getElementById('protocolLibraryModal').style.display = 'none';
  document.body.style.overflow = '';
  _plSelectedId = null;
  _plCreateMode = false;
}

function plRender() {
  const listEl = document.getElementById('plLibList');
  if (!listEl) return;
  const q = (document.getElementById('plSearch')?.value || '').toLowerCase().trim();
  const filtered = _plLibrary.filter(e =>
    !q || (exerciseLabels[e.id] || e.id).toLowerCase().includes(q) || e.cat.toLowerCase().includes(q) || (e.desc || '').toLowerCase().includes(q)
  );

  if (!filtered.length) {
    listEl.innerHTML = '<div class="apm-lib-empty">No exercises found</div>';
  } else {
    const cats = {};
    for (const e of filtered) { if (!cats[e.cat]) cats[e.cat] = []; cats[e.cat].push(e); }
    listEl.innerHTML = Object.entries(cats).map(([cat, items]) => `
      <div class="apm-lib-cat">
        <div class="apm-lib-cat-label">${cat}</div>
        ${items.map(e => {
          const label = exerciseLabels[e.id] || e.id;
          const editedClass = e._isEdited ? ' apm-lib-item--edited' : '';
          const activeClass = _plSelectedId === e.id ? ' apm-lib-item--active' : '';
          return `<div class="apm-lib-item${editedClass}${activeClass}" id="pl-item-${e.id}" onclick="plSelectExercise('${e.id}')">
            <div class="apm-lib-item-name">${label}</div>
            <div class="apm-lib-item-desc">${e.desc || ''}</div>
          </div>`;
        }).join('')}
      </div>
    `).join('');
  }

  const hiddenList = document.getElementById('plHiddenList');
  const hiddenIds = _plTherapistData?.hiddenIds || [];
  if (hiddenIds.length) {
    const allExercises = [...PROTOCOL_CATALOG, ...(_plTherapistData.customExercises || [])];
    const hiddenExercises = hiddenIds.map(id => {
      const found = allExercises.find(e => e.id === id);
      return found ? { ...found, label: exerciseLabels[id] || id } : { id, label: id };
    });
    hiddenList.innerHTML = hiddenExercises.map(e => `
      <div class="pl-hidden-item">
        <span>${e.label}</span>
        <button onclick="plUnhide('${e.id}')">Unhide</button>
      </div>
    `).join('');
  } else {
    hiddenList.innerHTML = '<div class="pl-hidden-item" style="opacity:0.4">No hidden exercises</div>';
  }
}

function plFilter(query) { plRender(); }

function plSelectExercise(id) {
  if (_plCreateMode) plExitCreateMode();
  if (_plSelectedId === id) {
    plDeselect();
    return;
  }
  _plSelectedId = id;
  const entry = _plLibrary.find(e => e.id === id);
  if (!entry) return;

  document.getElementById('plEmptyState').style.display = 'none';
  document.getElementById('plConfigFields').style.display = '';
  document.getElementById('plNormalConfig').style.display = '';
  document.getElementById('plCreateConfig').style.display = 'none';
  _plCreateMode = false;

  const repsEl = document.getElementById('plReps');
  const setsEl = document.getElementById('plSets');
  const freqEl = document.getElementById('plFrequency');
  const descEl = document.getElementById('plDesc');
  if (repsEl) repsEl.value = entry.dr;
  if (setsEl) setsEl.value = entry.ds;
  if (freqEl) freqEl.value = entry.df;
  if (descEl) descEl.value = entry.desc || '';

  const infoEl = document.getElementById('plSelectedExInfo');
  const nameEl = document.getElementById('plSelectedExName');
  const descInfoEl = document.getElementById('plSelectedExDesc');
  if (nameEl) nameEl.textContent = exerciseLabels[id] || id;
  if (descInfoEl) descInfoEl.textContent = entry.desc || '';
  if (infoEl) infoEl.style.display = 'block';

  const resetBtn = document.getElementById('plResetBtn');
  if (resetBtn) resetBtn.style.display = entry._isEdited ? '' : 'none';

  _plHighlightSelected(id);
}

function plDeselect() {
  _plSelectedId = null;
  document.getElementById('plEmptyState').style.display = '';
  document.getElementById('plConfigFields').style.display = 'none';
  document.getElementById('plSelectedExInfo').style.display = 'none';
  document.getElementById('plResetBtn').style.display = 'none';
  document.querySelectorAll('#plLibList .apm-lib-item').forEach(el => el.classList.remove('apm-lib-item--active'));
}

function _plHighlightSelected(id) {
  document.querySelectorAll('#plLibList .apm-lib-item').forEach(el => el.classList.remove('apm-lib-item--active'));
  const el = document.getElementById('pl-item-' + id);
  if (el) { el.classList.add('apm-lib-item--active'); el.scrollIntoView({ block: 'nearest', behavior: 'smooth' }); }
}

function plEnterCreateMode() {
  _plCreateMode = true;
  _plSelectedId = null;
  document.getElementById('plEmptyState').style.display = 'none';
  document.getElementById('plConfigFields').style.display = 'none';
  document.getElementById('plNormalConfig').style.display = 'none';
  document.getElementById('plCreateConfig').style.display = '';
  document.getElementById('plNewExName').value = '';
  document.getElementById('plNewExDesc').value = '';
  document.getElementById('plNewExReps').value = 10;
  document.getElementById('plNewExSets').value = 3;
  document.getElementById('plNewExFrequency').value = 'daily';
  const cats = [...new Set(PROTOCOL_CATALOG.map(e => e.cat))];
  document.getElementById('plNewExCatSelect').innerHTML = cats.map(c => `<option value="${c}">${c}</option>`).join('');
  document.querySelectorAll('#plLibList .apm-lib-item').forEach(el => el.classList.remove('apm-lib-item--active'));
}

function plExitCreateMode() {
  _plCreateMode = false;
  document.getElementById('plNormalConfig').style.display = '';
  document.getElementById('plCreateConfig').style.display = 'none';
  if (_plSelectedId) {
    document.getElementById('plEmptyState').style.display = 'none';
    document.getElementById('plConfigFields').style.display = '';
  } else {
    document.getElementById('plEmptyState').style.display = '';
    document.getElementById('plConfigFields').style.display = 'none';
  }
}

async function plSaveNewExercise() {
  const rawName = document.getElementById('plNewExName').value.trim();
  if (!rawName) { document.getElementById('plNewExName').focus(); return; }
  const desc = document.getElementById('plNewExDesc').value.trim();
  const cat = document.getElementById('plNewExCatSelect').value;
  const id = rawName.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
  if (PROTOCOL_CATALOG.find(e => e.id === id) || (_plTherapistData.customExercises || []).find(e => e.id === id)) {
    document.getElementById('plNewExName').value = '';
    document.getElementById('plNewExName').placeholder = 'Name already exists';
    return;
  }
  const dr = parseInt(document.getElementById('plNewExReps').value) || 10;
  const ds = parseInt(document.getElementById('plNewExSets').value) || 3;
  const df = document.getElementById('plNewExFrequency').value || 'daily';
  const entry = { id, name: rawName, cat, dr, ds, df, desc, createdAt: new Date().toISOString() };

  if (!_plTherapistData.customExercises) _plTherapistData.customExercises = [];
  _plTherapistData.customExercises.push(entry);
  await _saveTherapistLibrary();

  exerciseLabels[id] = rawName;
  plExitCreateMode();
  buildProtocolLibrary();
  plRender();
  plSelectExercise(id);
}

async function plSaveExercise() {
  if (!_plSelectedId) return;
  const entry = _plLibrary.find(e => e.id === _plSelectedId);
  if (!entry) return;

  const dr = parseInt(document.getElementById('plReps').value) || entry.dr;
  const ds = parseInt(document.getElementById('plSets').value) || entry.ds;
  const df = document.getElementById('plFrequency').value || entry.df;
  const desc = document.getElementById('plDesc').value.trim();

  if (entry._isCustom) {
    const idx = (_plTherapistData.customExercises || []).findIndex(e => e.id === _plSelectedId);
    if (idx >= 0) {
      _plTherapistData.customExercises[idx].dr = dr;
      _plTherapistData.customExercises[idx].ds = ds;
      _plTherapistData.customExercises[idx].df = df;
      _plTherapistData.customExercises[idx].desc = desc;
    }
  } else {
    if (!_plTherapistData.editedBuiltIns) _plTherapistData.editedBuiltIns = [];
    let existing = _plTherapistData.editedBuiltIns.find(e => e.id === _plSelectedId);
    if (!existing) {
      existing = { id: _plSelectedId };
      _plTherapistData.editedBuiltIns.push(existing);
    }
    const orig = PROTOCOL_CATALOG.find(e => e.id === _plSelectedId);
    existing.name = orig ? (exerciseLabels[_plSelectedId] || _plSelectedId) : _plSelectedId;
    existing.cat = orig ? orig.cat : entry.cat;
    existing.dr = dr;
    existing.ds = ds;
    existing.df = df;
    existing.desc = desc;
  }

  await _saveTherapistLibrary();
  buildProtocolLibrary();
  plRender();
  plSelectExercise(_plSelectedId);
}

async function plToggleHide() {
  if (!_plSelectedId) return;
  if (!_plTherapistData.hiddenIds) _plTherapistData.hiddenIds = [];
  const idx = _plTherapistData.hiddenIds.indexOf(_plSelectedId);
  if (idx >= 0) {
    _plTherapistData.hiddenIds.splice(idx, 1);
  } else {
    _plTherapistData.hiddenIds.push(_plSelectedId);
  }
  await _saveTherapistLibrary();
  buildProtocolLibrary();
  plRender();
  _plSelectedId = null;
  document.getElementById('plSelectedExInfo').style.display = 'none';
  document.getElementById('plResetBtn').style.display = 'none';
}

async function plUnhide(id) {
  if (!_plTherapistData.hiddenIds) return;
  const idx = _plTherapistData.hiddenIds.indexOf(id);
  if (idx >= 0) _plTherapistData.hiddenIds.splice(idx, 1);
  await _saveTherapistLibrary();
  buildProtocolLibrary();
  plRender();
}

async function plResetBuiltIn() {
  if (!_plSelectedId) return;
  if (!_plTherapistData.editedBuiltIns) return;
  _plTherapistData.editedBuiltIns = _plTherapistData.editedBuiltIns.filter(e => e.id !== _plSelectedId);
  await _saveTherapistLibrary();
  buildProtocolLibrary();
  plRender();
  plSelectExercise(_plSelectedId);
}

function plToggleHiddenSection() {
  _plHiddenOpen = !_plHiddenOpen;
  const header = document.getElementById('plHiddenHeader');
  const list = document.getElementById('plHiddenList');
  if (header) header.classList.toggle('open', _plHiddenOpen);
  if (list) list.style.display = _plHiddenOpen ? '' : 'none';
}

async function _saveTherapistLibrary() {
  try {
    await db.collection('therapistLibrary').doc(auth.currentUser.email).set(_plTherapistData);
  } catch (e) { /* non-fatal */ }
}

function epUpdateRequireAllVisibility() {
  const count = document.querySelectorAll('#epConditionsList .ep-condition-row').length;
  const row   = document.getElementById('epRequireAllRow');
  if (row) row.style.display = count > 1 ? 'flex' : 'none';
  document.querySelectorAll('.ep-remove-btn').forEach(btn => {
    btn.style.visibility = 'visible';
  });
}

function epAddCondition(finger = 'index', joint = 'pip', flexAt = 60, extendAt = 140) {
  const list = document.getElementById('epConditionsList');
  if (!list) return;
  const row = document.createElement('div');
  row.className = 'ep-condition-row';
  const fingers = ['index','middle','ring','pinky','thumb'];
  const fOpts = fingers.map(f => `<option value="${f}" ${f===finger?'selected':''}>${f.charAt(0).toUpperCase()+f.slice(1)}</option>`).join('');
  const jOpts = ['mcp','pip','dip'].map(j => `<option value="${j}" ${j===joint?'selected':''}>${j.toUpperCase()}</option>`).join('');
  row.innerHTML = `
    <select class="ep-select ep-finger-select">${fOpts}</select>
    <select class="ep-select ep-joint-select">${jOpts}</select>
    <input type="number" class="ep-number-input ep-flex-at"    value="${flexAt}"    min="0" max="180" placeholder="Flex°">
    <input type="number" class="ep-number-input ep-extend-at"  value="${extendAt}"  min="0" max="180" placeholder="Extend°">
    <button class="ep-remove-btn" onclick="epRemoveCondition(this)" title="Remove">×</button>`;
  list.appendChild(row);
  epUpdateRequireAllVisibility();
}

function epRemoveCondition(btn) {
  btn.closest('.ep-condition-row').remove();
  epUpdateRequireAllVisibility();
}

function updateExerciseParamsUI(exerciseType, savedParams) {
  const container = document.getElementById('exerciseParamsSection');
  if (!container) return;
  if (!ANGLE_TRACKING_ENABLED) { container.innerHTML = ''; container.style.display = 'none'; return; }
  container.style.display = '';

  const sel = document.getElementById('exerciseType');
  if (sel && exerciseType) sel.value = exerciseType;

  const defaults = EXERCISE_DEFAULTS[exerciseType];
  if (!defaults) { container.innerHTML = ''; return; }

  if (defaults.metric === 'distance') {
    const tipName = defaults.tipB === 8 ? 'index finger' : defaults.tipB === 12 ? 'middle finger' : defaults.tipB === 16 ? 'ring finger' : defaults.tipB === 20 ? 'little finger' : 'target finger';
    container.innerHTML = `<div class="ep-section"><p class="ep-desc-text">Rep counts when the thumb tip approaches the ${tipName} tip, then returns open.</p></div>`;
    return;
  }

  if (defaults.metric === 'abduction') {
    container.innerHTML = `<div class="ep-section"><p class="ep-desc-text">Rep counts when fingers spread wide, then return together.</p></div>`;
    return;
  }

  // angle metric — normalize and build condition-list UI
  const normalized = normalizeExerciseParams(savedParams ? { ...defaults, ...savedParams } : defaults);
  const requireAllChecked = normalized.requireAll ? 'checked' : '';

  container.innerHTML = `
    <div class="ep-section">
      <span class="ep-section-label">Joint Conditions</span>
      <div class="ep-condition-header">
        <span>Finger</span><span>Joint</span><span>Flex°</span><span>Extend°</span><span></span>
      </div>
      <div id="epConditionsList"></div>
      <button class="ep-add-btn" onclick="epAddCondition()">+ Add Joint</button>
    </div>
    <div class="ep-require-all-row" id="epRequireAllRow" style="display:none">
      <label class="ep-checkbox-label">
        <input type="checkbox" id="epRequireAll" ${requireAllChecked}>
        Require all joints simultaneously
      </label>
    </div>
    <p class="ep-threshold-hint">0° = straight finger. Higher values = more bent.</p>`;

  normalized.conditions.forEach(c => epAddCondition(c.finger, c.joint, c.flexAt, c.extendAt));
}

/* ══════════════════════════════════════════════════════════════════════════
   SECTION 9: REP COUNTER  (patient session camera)
   ══════════════════════════════════════════════════════════════════════════ */

let TARGET_REPS = 10;
let repCount    = 0;
let fingerState = 'unknown';
let lastROM     = 0;
let lastTAM     = 0;
let maxROMThisSession = 0;
let maxTAMThisSession = 0;
let sessionPaused = false;
let lastRepTime = null;
let setPainValues = [];
let restTimerInterval = null;
let restTimeRemaining = 30;
let currentExerciseParams = null;
let trackedJoints   = [];   // joint keys loaded at session start for per-joint angle tracking
let jointMaxAngles  = {};   // max angle per tracked joint during the current set
const REST_DURATION = 30;
function playRepSound() {}

let speedWarningTimeout = null;

function showSpeedWarning() {
  const el = document.getElementById('speedWarning');
  if (!el) return;
  el.classList.add('show');
  clearTimeout(speedWarningTimeout);
  speedWarningTimeout = setTimeout(() => el.classList.remove('show'), 2000);
}

function toggleSound() {}

function getMiddleFingerAngle(landmarks) {
  const mcp = landmarks[9];
  const pip = landmarks[10];
  const tip = landmarks[12];
  const v1  = { x: mcp.x - pip.x, y: mcp.y - pip.y };
  const v2  = { x: tip.x - pip.x, y: tip.y - pip.y };
  const dot = v1.x * v2.x + v1.y * v2.y;
  const mag1 = Math.sqrt(v1.x ** 2 + v1.y ** 2);
  const mag2 = Math.sqrt(v2.x ** 2 + v2.y ** 2);
  return 180 - Math.acos(Math.max(-1, Math.min(1, dot / (mag1 * mag2)))) * (180 / Math.PI);
}

function calibAlphaFor(cutoff, dt) {
  const tau = 1 / (2 * Math.PI * Math.max(cutoff, 1e-6));
  return 1 / (1 + tau / Math.max(dt, 1e-6));
}

function sweepIsRealHand(landmarks) {
  return Array.isArray(landmarks) && landmarks.length >= 21;
}

function calibDrawLandmarks(ctx, landmarks) {
  if (!ctx || !landmarks || !window.drawConnectors || !window.drawLandmarks || !window.HAND_CONNECTIONS) return;
  window.drawConnectors(ctx, landmarks, window.HAND_CONNECTIONS, { color: '#2D7FF9', lineWidth: 2 });
  window.drawLandmarks(ctx, landmarks, { color: '#2D7FF9', lineWidth: 1, radius: 2 });
}

// Generic 2D joint angle — 0° = straight, higher = more bent (matches calibration tool)
function getJointAngle(landmarks, triplet) {
  const A = landmarks[triplet[0]], B = landmarks[triplet[1]], C = landmarks[triplet[2]];
  const v1 = { x: A.x - B.x, y: A.y - B.y }, v2 = { x: C.x - B.x, y: C.y - B.y };
  const dot = v1.x * v2.x + v1.y * v2.y;
  const m1 = Math.sqrt(v1.x ** 2 + v1.y ** 2), m2 = Math.sqrt(v2.x ** 2 + v2.y ** 2);
  if (m1 === 0 || m2 === 0) return 0;
  return 180 - Math.acos(Math.max(-1, Math.min(1, dot / (m1 * m2)))) * (180 / Math.PI);
}

// Normalized tip-to-tip distance (wrist→middle-MCP as scale reference)
function getTipDistance(landmarks, tipA, tipB) {
  const ref = Math.sqrt((landmarks[9].x - landmarks[0].x) ** 2 + (landmarks[9].y - landmarks[0].y) ** 2);
  if (ref === 0) return 1;
  return Math.sqrt((landmarks[tipA].x - landmarks[tipB].x) ** 2 + (landmarks[tipA].y - landmarks[tipB].y) ** 2) / ref;
}

// Convert old flat exerciseParams format (fingers[]+joint) to conditions array format
function normalizeExerciseParams(ep) {
  if (!ep || ep.metric !== 'angle' || ep.conditions) return ep;
  if (!ep.fingers || !ep.fingers.length) return null; // malformed old doc — treat as no params
  return {
    metric:     'angle',
    conditions: ep.fingers.map(finger => ({ finger, joint: ep.joint, flexAt: ep.flexAt, extendAt: ep.extendAt })),
    requireAll: ep.requireAll ?? false,
  };
}

// Returns { isFlexed, isExtended, repAngle, conditions } based on currentExerciseParams
function checkExerciseState(landmarks) {
  const p = currentExerciseParams;
  if (!p) return null;

  if (p.metric === 'distance') {
    const dist = getTipDistance(landmarks, p.tipA, p.tipB);
    return { isFlexed: dist <= p.closeAt, isExtended: dist >= p.openAt, repAngle: Math.round(dist * 100), conditions: null };
  }

  if (p.metric === 'abduction') {
    const spread = getTipDistance(landmarks, p.tipA, p.tipB);
    return { isFlexed: spread >= p.spreadAt, isExtended: spread <= p.closedAt, repAngle: Math.round(spread * 100), conditions: null };
  }

  // metric === 'angle' — 0° = straight, higher = more bent
  // flexed when angle >= flexAt (bent enough), extended when angle <= extendAt (straight enough)
  if (!p.conditions || p.conditions.length === 0) return null;

  const results = p.conditions.map(cond => {
    const triplet = FINGER_LANDMARK_MAP[cond.finger]?.[cond.joint];
    if (!triplet) return null;
    const jointKey = `${cond.finger}-${cond.joint}`;
    const trained  = getTrainedAngle(jointKey, landmarks);
    const angle    = trained !== null ? trained : Math.round(getJointAngle(landmarks, triplet));
    return {
      finger:     cond.finger,
      joint:      cond.joint,
      angle,
      flexAt:     cond.flexAt,
      extendAt:   cond.extendAt,
      isFlexed:   angle >= cond.flexAt,
      isExtended: angle <= cond.extendAt,
    };
  }).filter(r => r !== null);

  if (results.length === 0) return null;

  const isFlexed   = p.requireAll ? results.every(r => r.isFlexed)   : results.some(r => r.isFlexed);
  const isExtended = p.requireAll ? results.every(r => r.isExtended) : results.some(r => r.isExtended);
  const repAngle   = Math.round(Math.max(...results.map(r => r.angle)));

  return { isFlexed, isExtended, repAngle, conditions: results };
}

let _lastFeedback = '', _feedbackTimer = null;
function updateRepFeedback(state) {
  const el = document.getElementById('repFeedback');
  if (!el) return;

  if (!currentExerciseParams || !state) {
    _lastFeedback = '';
    clearTimeout(_feedbackTimer);
    el.textContent = '';
    return;
  }

  const needBend = fingerState !== 'flexed';
  let msg;

  // Distance / abduction metrics — no per-finger conditions
  if (!state.conditions) {
    const isAbduction = currentExerciseParams.metric === 'abduction';
    if (isAbduction) {
      msg = needBend ? 'Spread your fingers' : 'Bring your fingers together';
    } else {
      msg = needBend ? 'Close your hand' : 'Open your hand';
    }
  } else {
    // Angle metric — find which fingers still need to move
    const pending = needBend
      ? state.conditions.filter(c => !c.isFlexed)
      : state.conditions.filter(c => !c.isExtended);

    const targets = pending.length > 0 ? pending : state.conditions;
    const names   = [...new Set(targets.map(c => fingerLabel(c.finger)))];
    const fingerStr = names.length === 1
      ? names[0]
      : names.slice(0, -1).join(', ') + ' and ' + names[names.length - 1];

    msg = needBend ? `Bend your ${fingerStr}` : `Straighten your ${fingerStr}`;
  }

  if (msg === _lastFeedback) return;
  _lastFeedback = msg;
  clearTimeout(_feedbackTimer);
  _feedbackTimer = setTimeout(() => {
    el.style.opacity = '0';
    setTimeout(() => { el.textContent = msg; el.style.opacity = '1'; }, 120);
  }, 300);
}

function fingerLabel(finger) {
  const map = { index: 'index finger', middle: 'middle finger', ring: 'ring finger', pinky: 'pinky', thumb: 'thumb' };
  return map[finger] || finger;
}

// ── TAM (Total Arc of Motion) — cherry-picked from feature/ui ─────────────────
function calcFingerTAM(landmarks, finger) {
  const jDefs = CALIB_FINGERS[finger];
  if (!jDefs) return 0;
  let total = 0;
  for (const joint of ['mcp', 'pip', 'dip']) {
    const j = jDefs[joint];
    if (!j) continue;
    total += getJointAngle(landmarks, [j.a, j.b, j.c]);
  }
  return total;
}

function calcTAM(landmarks) {
  let max = 0;
  for (const finger of ['index', 'middle', 'ring', 'pinky']) {
    const tam = calcFingerTAM(landmarks, finger);
    if (tam > max) max = tam;
  }
  return max;
}

function updateRepCount(landmarks) {
  if (sessionPaused) return;
  let isFlexed, isExtended, repAngle;

  if (currentExerciseParams) {
    const state = checkExerciseState(landmarks);
    if (!state) { updateRepFeedback(null); return; }
    ({ isFlexed, isExtended, repAngle } = state);
    updateRepFeedback(state);
  } else {
    // Legacy fallback — middle finger PIP (MCP→PIP→DIP), 0°=straight convention
    const angle = getMiddleFingerAngle(landmarks);
    repAngle = Math.round(angle); isFlexed = angle > 60; isExtended = angle < 15;
    updateRepFeedback(null);
  }

  if (repAngle > maxROMThisSession) { maxROMThisSession = repAngle; lastROM = repAngle; }

  // ── TAM tracking (data only, no live display) ──
  const tam = calcTAM(landmarks);
  if (tam > maxTAMThisSession) { maxTAMThisSession = tam; lastTAM = Math.round(tam); }

  // Track per-joint max angles for joint monitoring charts
  if (trackedJoints.length > 0) {
    trackedJoints.forEach(key => {
      const [finger, joint] = key.split('-');
      const triplet = FINGER_LANDMARK_MAP[finger]?.[joint];
      if (!triplet) return;
      const trained = getTrainedAngle(key, landmarks);
      const angle   = trained !== null ? trained : Math.round(getJointAngle(landmarks, triplet));
      if (angle > (jointMaxAngles[key] || 0)) jointMaxAngles[key] = angle;
    });
  }

  // Must start open-handed — entering camera with a fist won't count as a rep
  if (fingerState === 'unknown') {
    if (isExtended) fingerState = 'extended';
    // Do NOT transition to flexed from unknown
  } else if (isFlexed && fingerState === 'extended') {
    fingerState = 'flexed';
  } else if (isExtended && fingerState === 'flexed') {
    fingerState = 'extended';
    repCount++;
    const now = Date.now();
    if (lastRepTime !== null && (now - lastRepTime) < 1000) showSpeedWarning();
    lastRepTime = now;
    playRepSound();
    updateRepUI();
  }
}

function updateRepUI() {
  document.getElementById('repDisplay').textContent    = repCount;
  const repTarget = document.getElementById('repTargetDisplay');
  if (repTarget) repTarget.textContent = `/ ${TARGET_REPS}`;
  const pct = Math.min((repCount / TARGET_REPS) * 100, 100);
  document.getElementById('progressFill').style.width  = pct + '%';
  if (repCount >= TARGET_REPS) {
    document.getElementById('targetDisplay').textContent      = TARGET_REPS;
    document.getElementById('currentSetDisplay').textContent  = currentSet;
    document.getElementById('totalSetsDisplay').textContent   = totalSets;
    if (currentSet >= totalSets) {
      document.getElementById('allSetsComplete').style.display = 'block';
      document.getElementById('nextSetBtn').textContent = 'Finish Session';
    }
    document.getElementById('congratsOverlay').classList.add('show');
    const camCtrl = document.querySelector('.cam-controls');
    if (camCtrl) camCtrl.style.display = 'none';
    sessionPaused = true;
  }
}

async function saveSession() {
  const now = new Date();
  const doc = {
    patientEmail:   currentUser.email,
    date:           now.toISOString(),
    reps:           repCount,
    pain:           parseInt(document.getElementById('painSliderCongrats').value),
    rom:            lastROM,
    tam:            lastTAM,
    therapistEmail: await getConnectedTherapist(),
    exerciseType:   selectedProtocol?.exerciseType || '',
    protocolId:     selectedProtocol?.id || '',
    expireAt:       new Date(now.getTime() + 90 * 86400000)
  };
  if (Object.keys(jointMaxAngles).length > 0) doc.jointAngles = { ...jointMaxAngles };
  const ref = await db.collection('sessions').add(doc);
  _pendingSessionDocId = ref.id;
  jointMaxAngles = {}; // reset after save so each set starts fresh
}

document.addEventListener('DOMContentLoaded', () => {
  const painCongrats = document.getElementById('painSliderCongrats');
  if (painCongrats) {
    painCongrats.addEventListener('input', function() {
      document.getElementById('painValueCongrats').textContent = this.value + ' / 10';
    });
  }
});

/* ══════════════════════════════════════════════════════════════════════════
   SECTION 10: SET TRACKING
   ══════════════════════════════════════════════════════════════════════════ */

let currentSet   = 1;
let totalSets    = 3;
let setsComplete = 0;

async function initSetTracker() {
  // Reset all session state first — unconditionally, before any protocol loading
  currentSet   = 1;
  setsComplete = 0;
  repCount     = 0;
  fingerState  = 'unknown';
  lastROM      = 0;
  lastTAM      = 0;
  maxROMThisSession = 0;
  maxTAMThisSession = 0;
  sessionPaused = false;
  lastRepTime = null;
  setPainValues = [];
  jointMaxAngles = {};

  if (selectedProtocol) {
    totalSets   = selectedProtocol.sets || 3;
    TARGET_REPS = selectedProtocol.reps || 10;
    const rawEp = selectedProtocol.exerciseParams || EXERCISE_DEFAULTS[selectedProtocol.exerciseType] || null;
    currentExerciseParams = normalizeExerciseParams(rawEp);
  } else if (currentUser) {
    const protocol = await getExistingProtocol(currentUser.email);
    if (protocol) {
      totalSets   = protocol.sets || 3;
      TARGET_REPS = protocol.reps || 10;
      const rawEp = protocol.exerciseParams || EXERCISE_DEFAULTS[protocol.exerciseType] || null;
      currentExerciseParams = normalizeExerciseParams(rawEp);
    } else {
      currentExerciseParams = null;
    }
  }
  renderSetDots();
  updateRepUI();
}

function renderSetDots() {
  const tracker = document.getElementById('setTracker');
  if (!tracker) return;
  tracker.innerHTML = '';
  for (let i = 1; i <= totalSets; i++) {
    const dot = document.createElement('div');
    dot.className = 'set-dot';
    if (i < currentSet)   { dot.classList.add('complete'); dot.textContent = i; }
    else if (i === currentSet) { dot.classList.add('active'); dot.textContent = i; }
    else                  { dot.textContent = i; }
    tracker.appendChild(dot);
  }
}

async function advanceSet() {
  sessionPaused = false;
  if (repCount >= TARGET_REPS) {
    const painVal = parseInt(document.getElementById('painSliderCongrats').value);
    setPainValues.push(painVal);
    await saveSession();
  }
  setsComplete++;
  document.getElementById('congratsOverlay').classList.remove('show');
  const camCtrlRestore = document.querySelector('.cam-controls');
  if (camCtrlRestore) camCtrlRestore.style.display = '';
  document.getElementById('allSetsComplete').style.display = 'none';
  document.getElementById('nextSetBtn').textContent = 'Start Next Set';
  if (setsComplete >= totalSets) {
    if (recordingSupported) {
      const videoBlob = await stopRecording();
      if (videoBlob && videoBlob.size > 0) uploadVideo(videoBlob, _pendingSessionDocId, 'sessions', 'session');
    }
    showSessionSummary();
    return;
  }
  currentSet++;
  repCount = 0;
  fingerState = 'unknown';
  lastROM = 0;
  lastTAM = 0;
  maxROMThisSession = 0;
  maxTAMThisSession = 0;
  // Update camera header set label
  const setEl = document.getElementById('camSetLabel');
  if (setEl) setEl.textContent = `Set ${currentSet} of ${totalSets}`;
  renderSetDots();
  updateRepUI();
  startRestTimer();
}

function startRestTimer() {
  restTimeRemaining = REST_DURATION;
  sessionPaused = true;
  const overlay = document.getElementById('restTimerOverlay');
  overlay.style.display = 'flex';
  document.getElementById('restTimerCount').textContent = restTimeRemaining;
  document.getElementById('restTimerFill').style.width = '100%';
  restTimerInterval = setInterval(() => {
    restTimeRemaining--;
    document.getElementById('restTimerCount').textContent = restTimeRemaining;
    const pct = (restTimeRemaining / REST_DURATION) * 100;
    document.getElementById('restTimerFill').style.width = pct + '%';
    if (restTimeRemaining <= 0) skipRest();
  }, 1000);
}

function skipRest() {
  clearInterval(restTimerInterval);
  restTimerInterval = null;
  document.getElementById('restTimerOverlay').style.display = 'none';
  document.getElementById('restTimerFill').style.width = '100%';
  sessionPaused = false;
}

function showSessionSummary(partialReps = 0) {
  const totalRepsCompleted = setsComplete * TARGET_REPS + partialReps;
  const avgPain = setPainValues.length > 0
    ? (setPainValues.reduce((a, b) => a + b, 0) / setPainValues.length).toFixed(1)
    : '—';
  const maxROM = Math.round(maxROMThisSession);
  const maxTAM = Math.round(maxTAMThisSession);
  document.getElementById('summaryTotalReps').textContent = totalRepsCompleted;
  document.getElementById('summarySets').textContent      = setsComplete;
  document.getElementById('summaryMaxROM').textContent    = maxROM + '°';
  document.getElementById('summaryAvgPain').textContent   = avgPain;
  let message = '';
  if (avgPain !== '—' && parseFloat(avgPain) >= 7) {
    message = 'Pain was high today. Consider mentioning this to your therapist.';
  } else if (maxROM >= 120) {
    message = 'Excellent range of motion today. Keep it up.';
  } else if (maxROM >= 80) {
    message = 'Good session. Consistency is key.';
  } else if (totalRepsCompleted === 0) {
    message = 'Session recorded. Start moving to track your range of motion next time.';
  } else {
    message = 'Session logged. Every rep counts toward your recovery.';
  }
  document.getElementById('summaryMessage').textContent = message;
  document.getElementById('sessionSummaryOverlay').style.display = 'flex';
}

async function dismissSummary() {
  document.getElementById('sessionSummaryOverlay').style.display = 'none';
  if (_micStream) { _micStream.getTracks().forEach(t => t.stop()); _micStream = null; }
  await initSetTracker();
  showScreen('patientScreen');
  await updatePatientHomeScreen();
}

async function dismissSummaryToProgress() {
  document.getElementById('sessionSummaryOverlay').style.display = 'none';
  if (_micStream) { _micStream.getTracks().forEach(t => t.stop()); _micStream = null; }
  await initSetTracker();
  await showProgressScreen();
}

async function completeSessionEarly() {
  // Stop rest timer if running
  clearInterval(restTimerInterval);
  restTimerInterval = null;
  document.getElementById('restTimerOverlay').style.display = 'none';
  sessionPaused = false;

  // Hide congrats overlay if visible
  document.getElementById('congratsOverlay').classList.remove('show');
  const camCtrlEnd = document.querySelector('.cam-controls');
  if (camCtrlEnd) camCtrlEnd.style.display = '';

  // Save current partial set if any reps were completed
  if (repCount > 0) {
    const painVal = parseInt(document.getElementById('painSlider').value);
    setPainValues.push(painVal);
    const endNow = new Date();
    const doc = {
      patientEmail:   currentUser.email,
      date:           endNow.toISOString(),
      reps:           repCount,
      pain:           painVal,
      rom:            lastROM,
      tam:            lastTAM,
      therapistEmail: await getConnectedTherapist(),
      exerciseType:   selectedProtocol?.exerciseType || '',
      protocolId:     selectedProtocol?.id || '',
      expireAt:       new Date(endNow.getTime() + 90 * 86400000)
    };
    if (Object.keys(jointMaxAngles).length > 0) doc.jointAngles = { ...jointMaxAngles };
    const ref = await db.collection('sessions').add(doc);
    if (recordingSupported) {
      const videoBlob = await stopRecording();
      if (videoBlob && videoBlob.size > 0) uploadVideo(videoBlob, ref.id, 'sessions', 'session');
    }
  } else {
    // No reps — discard recording
    if (mediaRecorder && mediaRecorder.state !== 'inactive') {
      mediaRecorder.stop();
      recordedChunks = [];
      mediaRecorder = null;
      hideRecordingIndicator();
    }
  }

  showSessionSummary(repCount > 0 ? repCount : 0);
  if (_micStream) { _micStream.getTracks().forEach(t => t.stop()); _micStream = null; }
}

/* ══════════════════════════════════════════════════════════════════════════
   SECTION 11: PATIENT SESSION CAMERA  (dashboard camera)
   ══════════════════════════════════════════════════════════════════════════ */

let currentFacingMode = 'user';

function flipCamera() {
  currentFacingMode = currentFacingMode === 'user' ? 'environment' : 'user';
  if (mpCamera) { mpCamera.stop(); mpCamera = null; }
  startCamera();
}

function isMobile() {
  return /Mobi|Android|iPhone|iPad/i.test(navigator.userAgent);
}

let mpCamera = null;

var calHintTimer = null;

function showCalError(msg) {
  clearTimeout(calHintTimer);
  document.getElementById('calOverlay').style.display = 'none';
  var error = document.getElementById('calError');
  document.getElementById('calErrorMsg').textContent = msg;
  error.style.display = 'flex';
}

function updateMLStatusLine() {
  const el = document.getElementById('mlStatusLine');
  if (!el) return;
  if (!currentExerciseParams?.conditions?.length) { el.textContent = ''; return; }
  if (!_currentHandLabel) { el.textContent = 'Raw tracking'; return; }
  const active = currentExerciseParams.conditions
    .filter(c => _mlModels.has(`${c.finger}-${c.joint}-${_currentHandLabel}`))
    .map(c => `${c.finger}-${c.joint}`);
  if (active.length === 0) { el.textContent = 'Raw tracking'; return; }
  el.innerHTML = 'ML' + active.map(j => `<span class="ml-tag">${j}</span>`).join('');
}

function startCamera() {
  if (mpCamera) return;
  if (!_micStream) {
    navigator.mediaDevices.getUserMedia({ audio: true, video: false })
      .then(s => { _micStream = s; })
      .catch(() => {});
  }
  const sessionVideo  = document.getElementById('patientVideo');
  const sessionCanvas = document.getElementById('patientCanvas');
  const sessionCtx    = sessionCanvas.getContext('2d');
  let hands;
  try {
    hands = new window.Hands({ locateFile: f => `https://cdn.jsdelivr.net/npm/@mediapipe/hands/${f}` });
  } catch(e) {
    showCalError('Hand tracking unavailable');
    return;
  }
  hands.setOptions({ maxNumHands: 1, modelComplexity: isMobile() ? 0 : 1, minDetectionConfidence: 0.7, minTrackingConfidence: 0.5 });
  let prevHandLabel = null;
  hands.onResults(results => {
    sessionCtx.clearRect(0, 0, sessionCanvas.width, sessionCanvas.height);
    sessionCtx.drawImage(results.image, 0, 0, sessionCanvas.width, sessionCanvas.height);
    const _rawHand = (results.multiHandedness?.[0]?.label || '').toLowerCase();
    _currentHandLabel = _rawHand === 'left' ? 'right' : _rawHand === 'right' ? 'left' : null;
    if (_currentHandLabel !== prevHandLabel) { prevHandLabel = _currentHandLabel; updateMLStatusLine(); }
    if (results.multiHandLandmarks && results.multiHandLandmarks.length > 0) {
      extractVisualFeatures(sessionCanvas, results.multiHandLandmarks[0]).then(f => { _currentFrameFeatures = f; });
      for (const landmarks of results.multiHandLandmarks) {
        const mobile = isMobile();
        window.drawConnectors(sessionCtx, landmarks, window.HAND_CONNECTIONS, { color: '#2D7FF9', lineWidth: mobile ? 4 : 2 });
        window.drawLandmarks(sessionCtx, landmarks, { color: '#2D7FF9', lineWidth: mobile ? 2 : 1, radius: mobile ? 4 : 2 });
        updateRepCount(landmarks);
      }
    }

  });

  if (isMobile()) {
    document.getElementById('flipCameraBtn').style.display = 'inline-block';
    let active = true;
    mpCamera = { stop: () => { active = false; } };

    const doGetUserMedia = () => {
      navigator.mediaDevices.getUserMedia({ video: { facingMode: currentFacingMode }, audio: false })
        .then(stream => {
          sessionVideo.srcObject = stream;
          const processFrame = async () => {
            if (!active) return;
            if (sessionVideo.readyState >= 2) {
              sessionCtx.clearRect(0, 0, sessionCanvas.width, sessionCanvas.height);
              sessionCtx.drawImage(sessionVideo, 0, 0, sessionCanvas.width, sessionCanvas.height);
              try { await hands.send({ image: sessionCanvas }); } catch(e) {}
            }
            if (active) requestAnimationFrame(processFrame);
          };
          sessionVideo.onloadedmetadata = () => {
            sessionCanvas.width  = sessionVideo.videoWidth;
            sessionCanvas.height = sessionVideo.videoHeight;
            sessionCanvas.style.transform = currentFacingMode === 'user' ? 'scaleX(-1)' : 'none';
            document.querySelector('.cam-viewport').style.aspectRatio = sessionVideo.videoWidth + '/' + sessionVideo.videoHeight;
            processFrame();
            recordingSupported = typeof MediaRecorder !== 'undefined' && !!getRecordingMimeType();
            if (!mediaRecorder || mediaRecorder.state === 'inactive') {
              startRecording(sessionCanvas);
            }
          };
          mpCamera = {
            stop: () => {
              active = false;
              stream.getTracks().forEach(t => t.stop());
              sessionVideo.srcObject = null;
            }
          };
        })
        .catch(err => { showCalError('Camera unavailable — check permissions'); });
    };

    doGetUserMedia();
  } else {
    sessionVideo.addEventListener('loadedmetadata', () => {
      sessionCanvas.width  = sessionVideo.videoWidth;
      sessionCanvas.height = sessionVideo.videoHeight;
      document.querySelector('.cam-viewport').style.aspectRatio = sessionVideo.videoWidth + '/' + sessionVideo.videoHeight;
    }, { once: true });
    mpCamera = new window.Camera(sessionVideo, {
      onFrame: async () => {
        if (sessionVideo.readyState >= 2) await hands.send({ image: sessionVideo });
      },
      width: 1280, height: 720,
    });
    mpCamera.start();
    recordingSupported = typeof MediaRecorder !== 'undefined' && !!getRecordingMimeType();
    if (!mediaRecorder || mediaRecorder.state === 'inactive') {
      startRecording(sessionCanvas);
    }
  }
}

// ── Recording pipeline ──

function getRecordingMimeType() {
  if (typeof MediaRecorder === 'undefined') return '';
  const types = [
    'video/webm;codecs=vp9',
    'video/webm;codecs=vp8',
    'video/webm',
    'video/mp4'
  ];
  for (const t of types) {
    if (MediaRecorder.isTypeSupported(t)) return t;
  }
  return '';
}

function showRecordingIndicator() {
  const el = document.getElementById('recordingIndicator');
  if (el) el.style.display = 'flex';
}

function hideRecordingIndicator() {
  const el = document.getElementById('recordingIndicator');
  if (el) el.style.display = 'none';
}

function startRecording(canvas, tier = 'session') {
  if (!recordingSupported) return;
  recordedChunks = [];
  const mimeType = getRecordingMimeType();
  if (!mimeType) { recordingSupported = false; return; }
  let stream;
  try { stream = canvas.captureStream(); } catch(e) { recordingSupported = false; return; }
  if (_micStream && _micStream.getAudioTracks().length > 0) {
    stream = new MediaStream([
      ...stream.getVideoTracks(),
      ..._micStream.getAudioTracks()
    ]);
  }
  const bitrate = VIDEO_TIERS[tier]?.bitrate ?? VIDEO_TIERS.session.bitrate;
  try {
    mediaRecorder = new MediaRecorder(stream, { mimeType, videoBitsPerSecond: bitrate });
  } catch(e) { recordingSupported = false; return; }
  mediaRecorder.ondataavailable = e => { if (e.data && e.data.size > 0) recordedChunks.push(e.data); };
  mediaRecorder.start(1000);
  showRecordingIndicator();
  const maxDur = VIDEO_TIERS[tier]?.maxDurationSec;
  if (maxDur) {
    _recordingTimeout = setTimeout(() => {
      if (mediaRecorder && mediaRecorder.state === 'recording') {
        mediaRecorder.stop();
        hideRecordingIndicator();
      }
    }, maxDur * 1000);
  }
}

function stopRecording() {
  clearTimeout(_recordingTimeout);
  _recordingTimeout = null;
  return new Promise(resolve => {
    if (!mediaRecorder || mediaRecorder.state === 'inactive') {
      hideRecordingIndicator();
      resolve(null);
      return;
    }
    const mimeType = mediaRecorder.mimeType;
    mediaRecorder.onstop = () => {
      const blob = recordedChunks.length > 0 ? new Blob(recordedChunks, { type: mimeType }) : null;
      recordedChunks = [];
      mediaRecorder = null;
      hideRecordingIndicator();
      resolve(blob);
    };
    mediaRecorder.stop();
  });
}

// ── Compression pipeline ──

function showCompressionProgress() {
  const el = document.getElementById('compressionOverlay');
  if (el) el.style.display = 'flex';
  updateCompressionProgress(0);
}

function hideCompressionProgress() {
  const el = document.getElementById('compressionOverlay');
  if (el) el.style.display = 'none';
}

function updateCompressionProgress(fraction) {
  const fill = document.getElementById('compressionBarFill');
  if (fill) fill.style.width = `${Math.round(Math.min(fraction, 1) * 100)}%`;
}

async function compressVideo(blob, tier) {
  const tierConfig = VIDEO_TIERS[tier] || VIDEO_TIERS.session;
  const targetBitrate = tierConfig.bitrate;
  const mimeType = getRecordingMimeType();
  if (!mimeType || typeof MediaRecorder === 'undefined') return blob;

  return new Promise(resolve => {
    const video = document.createElement('video');
    video.muted = true;
    video.playsInline = true;
    const objectUrl = URL.createObjectURL(blob);
    video.src = objectUrl;

    video.onerror = () => { URL.revokeObjectURL(objectUrl); resolve(blob); };

    video.onloadedmetadata = () => {
      // Skip compression if blob is already at or below target size
      const estimatedTargetBytes = (targetBitrate / 8) * video.duration * 1.2;
      if (blob.size <= estimatedTargetBytes) {
        URL.revokeObjectURL(objectUrl);
        resolve(blob);
        return;
      }

      // Cap resolution at 1280x720
      const MAX_W = 1280, MAX_H = 720;
      let w = video.videoWidth, h = video.videoHeight;
      if (w > MAX_W || h > MAX_H) {
        const ratio = Math.min(MAX_W / w, MAX_H / h);
        w = Math.round(w * ratio);
        h = Math.round(h * ratio);
      }

      const canvas = document.createElement('canvas');
      canvas.width  = w;
      canvas.height = h;
      const ctx = canvas.getContext('2d');

      let stream, rec;
      try {
        stream = canvas.captureStream(30);
        rec    = new MediaRecorder(stream, { mimeType, videoBitsPerSecond: targetBitrate });
      } catch(e) { URL.revokeObjectURL(objectUrl); resolve(blob); return; }

      const chunks = [];
      rec.ondataavailable = e => { if (e.data && e.data.size > 0) chunks.push(e.data); };
      rec.onstop = () => {
        URL.revokeObjectURL(objectUrl);
        hideCompressionProgress();
        resolve(chunks.length > 0 ? new Blob(chunks, { type: mimeType }) : blob);
      };
      rec.start(1000);

      let animFrame;
      const drawFrame = () => {
        if (video.ended || video.paused) return;
        ctx.drawImage(video, 0, 0, w, h);
        updateCompressionProgress(video.duration > 0 ? video.currentTime / video.duration : 0);
        animFrame = requestAnimationFrame(drawFrame);
      };
      video.onplay  = () => { animFrame = requestAnimationFrame(drawFrame); };
      video.onended = () => { cancelAnimationFrame(animFrame); if (rec.state === 'recording') rec.stop(); };
      video.onerror = () => { cancelAnimationFrame(animFrame); URL.revokeObjectURL(objectUrl); resolve(blob); };

      showCompressionProgress();
      video.play().catch(() => { URL.revokeObjectURL(objectUrl); resolve(blob); });
    };
  });
}

// ── Upload pipeline ──

async function uploadVideo(blob, docId, collection = 'sessions', tier = 'session') {
  if (!blob || blob.size === 0 || !docId) return;
  const tierConfig = VIDEO_TIERS[tier] || VIDEO_TIERS.session;
  try {
    const secureUrl = await uploadVideoToCloudinary(blob);
    if (secureUrl) {
      const update = { videoUrl: secureUrl };
      if (tierConfig.expireDays !== null) {
        update.videoExpireAt = new Date(Date.now() + tierConfig.expireDays * 86400000).toISOString();
      }
      await db.collection(collection).doc(docId).update(update);
    } else {
      console.warn('[Motus] Cloudinary upload failed');
    }
  } catch(e) {
    console.warn('[Motus] Video upload error:', e);
  }
}

// ── Video modal ──

function openVideoModal(videoUrl, sessionDate, patientName) {
  const player = document.getElementById('videoModalPlayer');
  const dlBtn  = document.getElementById('videoModalDownload');
  player.src = videoUrl;
  player.poster = _getThumbnailUrl(videoUrl);
  dlBtn.onclick = () => downloadSessionVideo(videoUrl, sessionDate, patientName);
  document.getElementById('videoModal').style.display = 'flex';
}

function closeVideoModal() {
  document.getElementById('videoModal').style.display = 'none';
  const player = document.getElementById('videoModalPlayer');
  player.pause();
  player.removeAttribute('src');
  player.load();
}

function downloadSessionVideo(url, date, patientName) {
  const safeName = (patientName || 'patient').replace(/\s+/g, '-').replace(/[^a-zA-Z0-9-]/g, '');
  const dateStr  = date ? new Date(date).toISOString().slice(0, 10) : 'unknown';
  const ext      = url.includes('.mp4') ? 'mp4' : 'webm';
  const filename = `motus-session-${safeName}-${dateStr}.${ext}`;
  fetch(url)
    .then(r => r.blob())
    .then(blob => {
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = filename;
      a.click();
      URL.revokeObjectURL(a.href);
    })
    .catch(() => window.open(url, '_blank'));
}

/* ══════════════════════════════════════════════════════════════════════════
   SECTION 12: PROGRESS SCREEN
   ══════════════════════════════════════════════════════════════════════════ */

function buildChartLabels(sessions) {
  const dates = sessions.map(s => new Date(s.date));
  const uniqueDays = new Set(dates.map(d => d.toDateString()));
  if (uniqueDays.size <= 1) {
    return dates.map(d => d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }));
  }
  const dayCounts = {};
  dates.forEach(d => { const k = d.toDateString(); dayCounts[k] = (dayCounts[k] || 0) + 1; });
  return dates.map(d => {
    const dayStr = `${d.getMonth() + 1}/${d.getDate()}`;
    return dayCounts[d.toDateString()] > 1
      ? `${dayStr} ${d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}`
      : dayStr;
  });
}

function buildChartConfig(data, { type, color, fillColor }) {
  const vals = data.filter(v => v != null && v !== 0);
  const dataMin = vals.length ? Math.min(...vals) : 0;
  const dataMax = vals.length ? Math.max(...vals) : (type === 'pain' ? 10 : 180);
  const range = dataMax - dataMin || 10;
  const pad = range * 0.2;
  const yMin = Math.max(0, Math.floor((dataMin - pad) / 5) * 5);
  const yMax = type === 'pain'
    ? Math.min(10, Math.ceil((dataMax + pad)))
    : Math.ceil((dataMax + pad) / 10) * 10;
  return {
    dataset: {
      data, borderColor: color, backgroundColor: fillColor,
      borderWidth: 2, pointBackgroundColor: color,
      pointRadius: 4, pointHoverRadius: 6,
      pointBorderColor: '#fff', pointBorderWidth: 1.5,
      tension: 0.35, fill: true
    },
    options: {
      plugins: { legend: { display: false } },
      interaction: { mode: 'index', intersect: false },
      scales: {
        x: {
          ticks: { color: '#6B7A99', maxRotation: 0, autoSkip: true, maxTicksLimit: 6 },
          grid: { color: 'rgba(200,216,212,0.5)', drawBorder: false }
        },
        y: {
          min: yMin, max: yMax,
          ticks: { color: '#6B7A99', stepSize: type === 'pain' ? 1 : undefined },
          grid: { color: 'rgba(200,216,212,0.5)', drawBorder: false }
        }
      }
    }
  };
}

async function showProgressScreen() {
  if (mpCamera) { mpCamera.stop(); mpCamera = null; }
  showScreen('progressScreen');
  await renderProgressScreen();
}

function groupSessionsByDay(sessions) {
  if (!sessions || !sessions.length) return {};
  
  const expanded = [];
  sessions.forEach(s => {
    if (s.setData && s.setData.length > 0) {
      s.setData.forEach((sd, idx) => {
        expanded.push({
          ...sd,
          date: s.date,
          exerciseType: s.exerciseType,
          protocolId: s.protocolId,
          therapistEmail: s.therapistEmail,
          sessionDocId: s.id || null,
          parentDate: s.date
        });
      });
    } else {
      expanded.push({
        ...s,
        parentDate: s.date
      });
    }
  });
  
  const grouped = {};
  expanded.forEach(s => {
    const d = new Date(s.date);
    const dayKey = d.toISOString().split('T')[0];
    if (!grouped[dayKey]) grouped[dayKey] = [];
    grouped[dayKey].push(s);
  });
  
  return grouped;
}

function buildProgressByDay(sessions) {
  const byDay = groupSessionsByDay(sessions);
  const days = Object.keys(byDay).sort((a, b) => new Date(b) - new Date(a));
  
  if (days.length === 0) return '';
  
  let html = '<div class="prog-days-list">';
  
  days.forEach(day => {
    const daySessions = byDay[day];
    const dayDate = new Date(day);
    const dayLabel = dayDate.toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' });
    const todayStr = new Date().toISOString().split('T')[0];
    const isToday = day === todayStr;
    
    const exercisesMap = {};
    daySessions.forEach(s => {
      const exType = s.exerciseType || 'General';
      if (!exercisesMap[exType]) exercisesMap[exType] = [];
      exercisesMap[exType].push(s);
    });
    
    const exCount = Object.keys(exercisesMap).length;
    const totalSets = daySessions.length;
    const totalReps = daySessions.reduce((sum, s) => sum + (s.reps || 0), 0);
    const avgPain = totalSets > 0 
      ? (daySessions.reduce((sum, s) => sum + (s.pain || 0), 0) / totalSets).toFixed(1)
      : '-';
    
    html += `<div class="prog-day-card">
      <div class="prog-day-header" onclick="toggleProgDay(this.parentElement)">
        <div class="prog-day-title-row">
          <span class="prog-day-expand-icon">▾</span>
          <span class="prog-day-title">${isToday ? 'Today' : dayLabel}</span>
          <span class="prog-day-badge">${exCount} exercise${exCount !== 1 ? 's' : ''}, ${totalSets} set${totalSets !== 1 ? 's' : ''}</span>
        </div>
        <div class="prog-day-summary">
          <span class="prog-day-stat">${totalReps} reps</span>
          <span class="prog-day-stat">Avg pain: ${avgPain}</span>
        </div>
      </div>
      <div class="prog-day-body">`;
    
    Object.keys(exercisesMap).forEach(exType => {
      const exSessions = exercisesMap[exType];
      const exLabel = exerciseLabels[exType] || exType;
      
      html += `<div class="prog-exercise-block">
        <div class="prog-exercise-header">${exLabel}</div>
        <div class="prog-sets-list">
          <div class="prog-sets-header">
            <span class="prog-hdr-label"></span>
            <span class="prog-hdr-video">Video</span>
            <span class="prog-hdr-reps">Reps</span>
            <span class="prog-hdr-pain">Pain</span>
            <span class="prog-hdr-notes"></span>
          </div>`;
      
      exSessions.forEach((s, idx) => {
        const setNum = idx + 1;
        const hasVideo = !!s.videoUrl;
        const exitedEarly = s.notes && s.notes.toLowerCase().includes('exited');
        
        let videoBtn = '<span class="prog-set-empty">—</span>';
        if (hasVideo) {
          const safeUrl = (s.videoUrl || '').replace(/'/g, '%27');
          const safeDate = (s.parentDate || '').replace(/'/g, '');
          const patientName = (currentUser?.name || currentUser?.email || '').replace(/'/g, '');
          videoBtn = `<button class="prog-set-video-btn" onclick="openVideoModal('${safeUrl}', '${safeDate}', '${patientName}')" title="Watch Set ${setNum}">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><polygon points="5,3 19,12 5,21"/></svg>
          </button>`;
        }
        
        const notesIdx = s.notes && s.notes.trim()
          ? (window._setNotesData.push(s.notes) - 1)
          : -1;
        const notesBtn = notesIdx >= 0
          ? `<button class="prog-set-notes-btn" onclick="event.stopPropagation(); showSetNotes(${notesIdx})">
              Comments
            </button>`
          : '<span class="prog-set-empty">—</span>';

        const exitBadge = exitedEarly
          ? `<span class="prog-set-exit-badge" title="Patient exited early">Exited</span>`
          : '';
        
        html += `<div class="prog-set-row">
          <div class="prog-set-info">
            <span class="prog-set-label">Set ${setNum}</span>
            ${exitBadge}
          </div>
          <div class="prog-set-data">
            ${videoBtn}
            <span class="prog-set-reps">${s.reps || 0} reps</span>
            <span class="prog-set-pain">${s.pain || 1}/10</span>
            ${notesBtn}
          </div>
        </div>`;
      });
      
      html += `</div>`;
    });
    
    html += `</div></div>`;
  });
  
  html += '</div>';
  return html;
}

function toggleProgDay(card) {
  card.classList.toggle('expanded');
}

function showSetNotes(index) {
  const notes = (window._setNotesData || [])[index] || '';
  document.getElementById('setNotesText').textContent = notes;
  document.getElementById('setNotesModal').style.display = 'flex';
}

function closeSetNotesModal() {
  document.getElementById('setNotesModal').style.display = 'none';
}

async function renderProgressScreen() {
  window._setNotesData = [];
  var sessions = [];
  if (currentUser && currentUser.email) {
    sessions = await getPatientSessions(currentUser.email);
  }
  const content = document.getElementById('progressContent');

  if (!sessions.length) {
    content.innerHTML = '<div class="prog-empty">' +
      '<div class="prog-empty-icon"><svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg></div>' +
      '<p>Complete your first session to start tracking progress.</p>' +
      '</div>';
    return;
  }

  const now = Date.now();
  const msPerDay = 86400000;
  
  const expandedSessions = [];
  sessions.forEach(s => {
    if (s.setData && s.setData.length > 0) {
      s.setData.forEach(sd => {
        expandedSessions.push({ ...sd, timestamp: s.timestamp, date: s.date });
      });
    } else {
      expandedSessions.push(s);
    }
  });
  
  const last7 = expandedSessions.filter(function(s) {
    var ts = s.timestamp ? (s.timestamp.toDate ? s.timestamp.toDate() : new Date(s.timestamp)) : null;
    return ts && (now - ts.getTime()) <= 7 * msPerDay;
  });
  const prior7 = expandedSessions.filter(function(s) {
    var ts = s.timestamp ? (s.timestamp.toDate ? s.timestamp.toDate() : new Date(s.timestamp)) : null;
    if (!ts) return false;
    var age = now - ts.getTime();
    return age > 7 * msPerDay && age <= 14 * msPerDay;
  });

  const sessionsThisWeek = last7.length;

  var painTrendValue = null;
  var painTrendClass = '';
  var painTrendDisplay = '\u2014';
  if (last7.length && prior7.length) {
    const avgLast = last7.reduce(function(s, x) { return s + (x.avgPain || 0); }, 0) / last7.length;
    const avgPrior = prior7.reduce(function(s, x) { return s + (x.avgPain || 0); }, 0) / prior7.length;
    const diff = avgLast - avgPrior;
    if (diff < 0) {
      painTrendDisplay = '\u2193 ' + Math.abs(diff).toFixed(1);
      painTrendClass = 'improving';
    } else if (diff > 0) {
      painTrendDisplay = '\u2191 ' + diff.toFixed(1);
      painTrendClass = 'worsening';
    } else {
      painTrendDisplay = '\u2192 0.0';
    }
  }

  content.innerHTML =
    '<div class="prog-stats-row">' +
      '<div class="prog-stat-card"><div class="prog-stat-value">' + sessionsThisWeek + '/7</div><div class="prog-stat-label">This week</div></div>' +
      '<div class="prog-stat-card"><div class="prog-stat-value ' + painTrendClass + '">' + painTrendDisplay + '</div><div class="prog-stat-label">Pain trend</div></div>' +
    '</div>' +
    buildProgressByDay(sessions);
}

/* ══════════════════════════════════════════════════════════════════════════
   SECTION 15: MESSAGING  (patient ↔ therapist in-app thread)
   Firestore collection: messages  — documents: { from, to, participants, text, timestamp, read }
   ══════════════════════════════════════════════════════════════════════════ */

// ── XSS protection & relative time — cherry-picked from feature/ui ────────────
function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function timeAgo(isoStr) {
  const d = new Date(isoStr);
  const now = new Date();
  const diffMs = now - d;
  const diffSec = Math.floor(diffMs / 1000);
  const diffMin = Math.floor(diffSec / 60);
  const diffHr = Math.floor(diffMin / 60);
  const diffDay = Math.floor(diffHr / 24);
  if (diffSec < 60) return 'just now';
  if (diffMin < 60) return `${diffMin}m ago`;
  if (diffHr < 24) return `${diffHr}h ago`;
  if (diffDay <= 7) return `${diffDay}d ago`;
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

// ── Core helpers ──────────────────────────────────────────────────────────────

async function getThread(a, b) {
  const snap = await db.collection('messages')
    .where('participants', 'array-contains', a)
    .orderBy('timestamp', 'asc').get();
  return snap.docs.map(d => ({ id: d.id, ...d.data() }))
    .filter(m => (m.from === a && m.to === b) || (m.from === b && m.to === a));
}

async function sendMessage(from, to, text) {
  if (!text.trim()) return;
  await db.collection('messages').add({
    from, to, participants: [from, to],
    text: text.trim(), timestamp: new Date().toISOString(), read: false
  });
}

async function markRead(toEmail, fromEmail) {
  const snap = await db.collection('messages')
    .where('to', '==', toEmail).where('from', '==', fromEmail).where('read', '==', false).get();
  const batch = db.batch();
  snap.forEach(d => batch.update(d.ref, { read: true }));
  await batch.commit();
}

async function unreadCount(toEmail, fromEmail) {
  const snap = await db.collection('messages')
    .where('to', '==', toEmail).where('from', '==', fromEmail).where('read', '==', false).get();
  return snap.size;
}

// ── Shared thread renderer ────────────────────────────────────────────────────

function toggleMsgSend() {
  const input = document.getElementById('msgInput');
  const btn = document.getElementById('msgSendBtn');
  if (btn) btn.disabled = !input.value.trim();
}

function _renderThreadHtml(thread, myEmail) {
  if (!thread.length) return null;

  // Find the last sent message overall, and the last sent message that was read
  let lastSentIdx = -1;
  let lastReadSentIdx = -1;
  for (let i = thread.length - 1; i >= 0; i--) {
    if (thread[i].from === myEmail) {
      if (lastSentIdx === -1) lastSentIdx = i;
      if (thread[i].read && lastReadSentIdx === -1) lastReadSentIdx = i;
    }
    if (lastSentIdx !== -1 && lastReadSentIdx !== -1) break;
  }
  // Show "Read [time]" separately only when the last sent is unread and an earlier sent is read
  const showReadAtIdx = (lastReadSentIdx !== -1 && lastReadSentIdx !== lastSentIdx)
    ? lastReadSentIdx : -1;

  let html = '';
  for (let i = 0; i < thread.length; i++) {
    const m = thread[i];
    const mine = m.from === myEmail;
    const cls = mine ? 'sent' : 'received';
    html += `<div class="msg-bubble ${cls}">${escapeHtml(m.text)}</div>`;
    const next = thread[i + 1];
    const isLastInCluster = !next || next.from !== m.from;

    if (mine && i === lastSentIdx) {
      // Always show status on the last sent message (replaces normal timestamp)
      const status = m.read ? 'Read' : 'Delivered';
      html += `<div class="msg-timestamp sent">${status} ${timeAgo(m.timestamp)}</div>`;
    } else if (mine && i === showReadAtIdx) {
      // Show "Read [time]" below the last read sent when there are newer unread ones
      html += `<div class="msg-timestamp sent">Read ${timeAgo(m.timestamp)}</div>`;
    } else if (isLastInCluster) {
      html += `<div class="msg-timestamp ${cls}">${timeAgo(m.timestamp)}</div>`;
    }
  }
  return html;
}

function subscribeThread(containerId, myEmail, otherEmail, emptyMsg) {
  if (_msgThreadUnsub) { _msgThreadUnsub(); _msgThreadUnsub = null; }
  const el = document.getElementById(containerId);
  if (!el) return;
  _msgThreadUnsub = db.collection('messages')
    .where('participants', 'array-contains', myEmail)
    .orderBy('timestamp', 'asc')
    .onSnapshot(snap => {
      const el2 = document.getElementById(containerId);
      if (!el2) return;
      // Mark incoming messages as read — we're actively viewing the thread
      markRead(myEmail, otherEmail).catch(() => {});
      const thread = snap.docs.map(d => ({ id: d.id, ...d.data() }))
        .filter(m => (m.from === myEmail && m.to === otherEmail) || (m.from === otherEmail && m.to === myEmail));
      const html = _renderThreadHtml(thread, myEmail);
      if (!html) {
        el2.innerHTML = `<div class="msg-empty">${escapeHtml(emptyMsg || 'Send a message')}</div>`;
        return;
      }
      el2.innerHTML = html;
      el2.scrollTop = el2.scrollHeight;
    }, () => {});
}

// ── Patient-side functions ────────────────────────────────────────────────────

async function openPatientMessaging() {
  const tEmail = await getConnectedTherapist();
  if (!tEmail) { alert('You are not connected to a therapist yet.'); return; }
  await markRead(currentUser.email, tEmail);
  const tSnap = await db.collection('users').doc(tEmail).get();
  document.getElementById('msgHeaderTitle').textContent = tSnap.exists ? tSnap.data().name : 'Your Therapist';
  subscribeThread('msgThread', currentUser.email, tEmail, 'Send a message to your therapist');
  showScreen('messagingScreen');
}

async function sendMessageFromPatient() {
  const tEmail = await getConnectedTherapist();
  if (!tEmail) return;
  const input = document.getElementById('msgInput');
  if (!input.value.trim()) return;
  await sendMessage(currentUser.email, tEmail, input.value);
  input.value = '';
  toggleMsgSend();
}

// ── Therapist-side panel builder ──────────────────────────────────────────────

function buildMessagePanel(patientEmail) {
  return `<div class="therapist-msg-panel">
    <div class="therapist-msg-thread" id="therapistMsgThread"></div>
    <div class="therapist-msg-input-wrap">
      <input type="text" id="therapistMsgInput" class="therapist-msg-input" placeholder="Send a message…" />
      <button id="therapistMsgSend" class="therapist-msg-send">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>
      </button>
    </div>
  </div>`;
}

function copyClinicCode() {
  const code = document.getElementById('therapistCode').textContent;
  navigator.clipboard.writeText(code);
}

/* ══════════════════════════════════════════════════════════════════════════
   BOTTOM SHEET — Exercise detail
   ══════════════════════════════════════════════════════════════════════════ */

function showExerciseDetail(protocol) {
  activeSheetProtocol = protocol;
  document.getElementById('sheetExName').textContent = protocol.exerciseName || protocol.label || 'Exercise';
  var sets = protocol.sets || 3;
  var reps = protocol.reps || 10;
  var rest = protocol.restSeconds || 30;
  document.getElementById('sheetExRx').textContent = sets + ' sets \u00d7 ' + reps + ' reps \u00b7 ' + rest + 's rest';
  var notesEl = document.getElementById('sheetExNotes');
  if (protocol.notes) {
    notesEl.textContent = protocol.notes;
    notesEl.style.display = 'block';
  } else {
    notesEl.style.display = 'none';
  }
  document.getElementById('sheetBeginBtn').onclick = function() {
    dismissExerciseDetail();
    startSessionWithProtocol(activeSheetProtocol);
  };
  document.getElementById('sheetBackdrop').style.display = 'block';
  var sheet = document.getElementById('exerciseSheet');
  sheet.classList.remove('dismissing');
  sheet.style.display = 'block';
}

function dismissExerciseDetail() {
  var sheet = document.getElementById('exerciseSheet');
  sheet.classList.add('dismissing');
  setTimeout(function() {
    sheet.style.display = 'none';
    sheet.classList.remove('dismissing');
    document.getElementById('sheetBackdrop').style.display = 'none';
  }, 200);
  activeSheetProtocol = null;
}

/* ══════════════════════════════════════════════════════════════════════════
   SECTION 17: ML ANGLE TRAINER
   ══════════════════════════════════════════════════════════════════════════ */

const _mlModels = new Map();           // jointKey-hand → { type, model }
let   _mlTrainerCamera    = null;
let   _mlTrainerFacingMode = 'environment';
const _mlFilterStates     = {};        // One Euro filter state for ML trainer
let   _mlCurrentLandmarks = null;
let   _mlCurrentHand      = null;      // 'left' | 'right' | null — live camera detection
let   _mlSelectedHand    = null;      // 'left' | 'right' | null — persistent manual selection
let   _mlMpHands          = null;
let   _mlFeatureExtractor = null;      // MobileNetV1 α=0.25
let   _currentFrameFeatures = null;   // cached per-frame 256-dim visual vector
let   _currentHandLabel   = null;      // 'left' | 'right' | null — set by each onResults

let _mlRecording            = false;
let _mlRecordFrameCount     = 0;
let _mlRecordSampleCount    = 0;
let _mlTotalSamples         = 0;
let _mlRecordingId          = null;
let _mlLastRecordingId      = null;
let _mlLastRecordingCount   = 0;
let _mlCaptureInFlight      = false;
let _mlSamplesLoaded        = false;
let _mlSamplesCache         = null;
const ML_RECORD_FRAME_INTERVAL        = 5;
const ML_RECORD_GRID_REFRESH_INTERVAL = 10;

// ── loadMLModels (called at login, background) ─────────────────────────────
async function loadMLModels() {
  if (!window.tf) return;
  try {
    const [snap] = await Promise.all([
      db.collection('mlModels').get(),
      loadMLFeatureExtractor(),
    ]);
    for (const doc of snap.docs) {
      const data          = doc.data();
      const type          = data.type || 'landmarks';
      const model         = await window.tf.models.modelFromJSON(JSON.parse(data.topology));
      const weightTensors = data.weights.map(w => window.tf.tensor(w));
      model.setWeights(weightTensors);
      weightTensors.forEach(t => t.dispose());
      _mlModels.set(doc.id, { type, model });
    }
  } catch (e) {
    console.error('loadMLModels:', e);
  }
}

async function loadMLFeatureExtractor() {
  if (!window.mobilenet) return;
  try {
    _mlFeatureExtractor = await window.mobilenet.load({ version: 1, alpha: 0.25 });
  } catch (e) {
    console.error('loadMLFeatureExtractor:', e);
  }
}

async function extractVisualFeatures(canvas, landmarks) {
  if (!_mlFeatureExtractor || !canvas || !landmarks) return null;
  try {
    const xs  = landmarks.map(l => l.x), ys = landmarks.map(l => l.y);
    const pad = 0.12;
    const x0  = Math.max(0, Math.min(...xs) - pad);
    const y0  = Math.max(0, Math.min(...ys) - pad);
    const x1  = Math.min(1, Math.max(...xs) + pad);
    const y1  = Math.min(1, Math.max(...ys) + pad);
    const cw  = canvas.width, ch = canvas.height;

    const crop = document.createElement('canvas');
    crop.width = crop.height = 224;
    crop.getContext('2d').drawImage(
      canvas,
      x0 * cw, y0 * ch, (x1 - x0) * cw, (y1 - y0) * ch,
      0, 0, 224, 224
    );

    const tensor = _mlFeatureExtractor.infer(crop, true);
    const result = Array.from(tensor.dataSync());
    tensor.dispose();
    return result;
  } catch (e) {
    console.error('extractVisualFeatures:', e);
    return null;
  }
}

// ── getTrainedAngle — used throughout app (Sections 9, 16) ────────────────
function getTrainedAngle(jointKey, landmarks) {
  if (!_currentHandLabel) return null;
  const entry = _mlModels.get(`${jointKey}-${_currentHandLabel}`);
  if (!entry) return null;
  const flat = landmarks.map(lm => [lm.x, lm.y, lm.z || 0]).flat();

  if (entry.type === 'hybrid') {
    if (!_currentFrameFeatures) return null;
    const imgT  = window.tf.tensor2d([_currentFrameFeatures]);
    const lmT   = window.tf.tensor2d([flat]);
    const pred  = entry.model.predict([imgT, lmT]);
    const angle = Math.round(pred.dataSync()[0] * 180);
    imgT.dispose(); lmT.dispose(); pred.dispose();
    return Math.max(0, Math.min(180, angle));
  }

  const input = window.tf.tensor2d([flat]);
  const pred  = entry.model.predict(input);
  const angle = Math.round(pred.dataSync()[0] * 180);
  input.dispose(); pred.dispose();
  return Math.max(0, Math.min(180, angle));
}

// ── One Euro Filter for ML trainer landmarks ───────────────────────────────
function mlOneEuroFilter(id, rawValue, timestamp) {
  if (!_mlFilterStates[id]) {
    _mlFilterStates[id] = { prevValue: rawValue, prevDeriv: 0, prevTime: timestamp };
    return rawValue;
  }
  const state  = _mlFilterStates[id];
  const dt     = (timestamp - state.prevTime) || (1 / 60);
  const alphaD = calibAlphaFor(1.0, dt);
  const deriv  = alphaD * ((rawValue - state.prevValue) / dt) + (1 - alphaD) * state.prevDeriv;
  const cutoff = 1.0 + 0.1 * Math.abs(deriv);
  const alpha  = calibAlphaFor(cutoff, dt);
  const value  = alpha * rawValue + (1 - alpha) * state.prevValue;
  state.prevValue = value;
  state.prevDeriv = deriv;
  state.prevTime  = timestamp;
  return value;
}

// ── startMLTrainer ─────────────────────────────────────────────────────────
async function startMLTrainer() {
  if (!ANGLE_TRACKING_ENABLED) return;
  _mlTrainerFacingMode = 'environment';
  Object.keys(_mlFilterStates).forEach(k => delete _mlFilterStates[k]);
  _mlCurrentLandmarks = null;

  showScreen('mlTrainerScreen');

  const select = document.getElementById('mlJointSelect');
  if (select) {
    select.innerHTML = SWEEP_JOINTS
      .map(j => `<option value="${j.key}">${j.finger} ${j.joint.toUpperCase()}</option>`)
      .join('');
  }

  const slider   = document.getElementById('mlAngleSlider');
  const sliderEl = document.getElementById('mlSliderAngle');
  if (slider)   slider.value = 90;
  if (sliderEl) sliderEl.textContent = '90°';

  const notesEl = document.getElementById('mlSessionNotes');
  if (notesEl) notesEl.value = localStorage.getItem('ml_session_notes') || '';

  await Promise.all([mlRefreshSampleCounts(), mlRefreshModelsList()]);

  if (_mlTrainerCamera) return;

  const hands = new window.Hands({
    locateFile: file => `https://cdn.jsdelivr.net/npm/@mediapipe/hands/${file}`,
  });
  hands.setOptions({ maxNumHands: 1, modelComplexity: 1, minDetectionConfidence: 0.85, minTrackingConfidence: 0.75 });
  hands.onResults(mlOnResults);
  _mlMpHands = hands;

  mlStartCamera();
}

// ── mlStartCamera ──────────────────────────────────────────────────────────
function mlStartCamera() {
  const video      = document.getElementById('mlVideo');
  const overlay    = document.getElementById('mlOverlay');
  const overlayMsg = document.getElementById('mlOverlayMsg');

  if (isMobile()) {
    const mirror = _mlTrainerFacingMode === 'user' ? 'scaleX(-1)' : 'none';
    if (video) video.style.transform = mirror;
    const canvas = document.getElementById('mlCanvas');
    if (canvas) canvas.style.transform = mirror;
  }

  if (overlayMsg) overlayMsg.textContent = 'REQUESTING CAMERA...';

  if (isMobile()) {
    let active = true;
    _mlTrainerCamera = { stop: () => { active = false; } };

    navigator.mediaDevices.getUserMedia({
      video: { facingMode: _mlTrainerFacingMode, width: { ideal: 1280 }, height: { ideal: 720 } },
      audio: false,
    }).then(stream => {
      video.srcObject = stream;
      const offCanvas = document.createElement('canvas');
      const offCtx    = offCanvas.getContext('2d');

      const processFrame = async () => {
        if (!active) return;
        if (video.readyState >= 2) {
          const maxW = 1280, maxH = 720;
          const scale = Math.min(maxW / video.videoWidth, maxH / video.videoHeight, 1);
          offCanvas.width  = Math.round(video.videoWidth  * scale);
          offCanvas.height = Math.round(video.videoHeight * scale);
          offCtx.drawImage(video, 0, 0, offCanvas.width, offCanvas.height);
          try { await _mlMpHands.send({ image: offCanvas }); } catch(e) {}
        }
        if (active) requestAnimationFrame(processFrame);
      };

      video.onloadedmetadata = () => {
        video.play();
        if (overlay) overlay.classList.add('hidden');
        video.classList.add('ready');
        processFrame();
      };

      _mlTrainerCamera = {
        stop: () => {
          active = false;
          stream.getTracks().forEach(t => t.stop());
          video.srcObject = null;
          video.classList.remove('ready');
        }
      };
    }).catch(err => {
      if (overlay)    overlay.classList.remove('hidden');
      if (overlayMsg) overlayMsg.textContent = 'CAMERA ACCESS DENIED';
      console.error(err);
    });
  } else {
    let active = true;
    _mlTrainerCamera = { stop: () => { active = false; } };

    navigator.mediaDevices.getUserMedia({
      video: { facingMode: { ideal: _mlTrainerFacingMode }, width: { ideal: 1280 }, height: { ideal: 720 } },
      audio: false,
    }).then(stream => {
      video.srcObject = stream;

      const processFrame = async () => {
        if (!active) return;
        if (video.readyState >= 2) {
          try { await _mlMpHands.send({ image: video }); } catch(e) {}
        }
        if (active) requestAnimationFrame(processFrame);
      };

      video.onloadedmetadata = () => {
        video.play();
        if (overlay) overlay.classList.add('hidden');
        video.classList.add('ready');
        processFrame();
      };

      _mlTrainerCamera = {
        stop: () => {
          active = false;
          stream.getTracks().forEach(t => t.stop());
          video.srcObject = null;
          video.classList.remove('ready');
        }
      };
    }).catch(err => {
      if (overlay)    overlay.classList.remove('hidden');
      if (overlayMsg) overlayMsg.textContent = 'CAMERA ACCESS DENIED';
      console.error(err);
    });
  }
}

// ── mlOnResults ────────────────────────────────────────────────────────────
function mlOnResults(results) {
  const canvas   = document.getElementById('mlCanvas');
  const trackDot = document.getElementById('mlTrackDot');
  if (!canvas) return;

  const ctx  = canvas.getContext('2d');
  const srcW = results.image.width, srcH = results.image.height;
  const size = Math.min(srcW, srcH);
  const cropX = (srcW - size) / 2, cropY = (srcH - size) / 2;
  canvas.width = size; canvas.height = size;
  ctx.drawImage(results.image, cropX, cropY, size, size, 0, 0, size, size);

  const liveEl = document.getElementById('mlLiveAngle');

  const handEl = document.getElementById('mlHandLabel');

  if (!results.multiHandLandmarks || results.multiHandLandmarks.length === 0 || !sweepIsRealHand(results.multiHandLandmarks[0])) {
    _mlCurrentLandmarks = null;
    _mlCurrentHand      = null;
    _currentHandLabel   = null;
    _mlRecordFrameCount = 0;
    if (trackDot) trackDot.classList.remove('active');
    if (liveEl)   liveEl.textContent = '—';
    if (handEl)   handEl.textContent = '—';
    return;
  }

  const rawHand = (results.multiHandedness?.[0]?.label || '').toLowerCase();
  const hand = rawHand === 'left' ? 'right' : rawHand === 'right' ? 'left' : null;
  if (hand !== _mlCurrentHand) {
    _mlCurrentHand  = hand;
    _currentHandLabel = hand;
    if (hand) mlSetHand(hand);
  }
  if (handEl) handEl.textContent = hand ? hand.charAt(0).toUpperCase() + hand.slice(1) : '—';

  const t   = performance.now() / 1000;
  const raw = results.multiHandLandmarks[0];
  const landmarks = raw.map((lm, i) => ({
    ...lm,
    x: mlOneEuroFilter(`${i}-x`, lm.x, t),
    y: mlOneEuroFilter(`${i}-y`, lm.y, t),
    z: mlOneEuroFilter(`${i}-z`, lm.z || 0, t),
  }));

  _mlCurrentLandmarks = landmarks;
  if (trackDot) trackDot.classList.add('active');
  extractVisualFeatures(canvas, landmarks).then(f => { _currentFrameFeatures = f; });

  const drawLm = landmarks.map(lm => ({
    ...lm,
    x: (lm.x * srcW - cropX) / size,
    y: (lm.y * srcH - cropY) / size,
  }));
  calibDrawLandmarks(ctx, drawLm);

  const select = document.getElementById('mlJointSelect');
  if (!select || !liveEl) return;
  const jDef  = SWEEP_JOINTS.find(j => j.key === select.value);
  if (!jDef) return;

  const trained = getTrainedAngle(select.value, landmarks);
  const angle   = trained !== null
    ? trained
    : Math.round(getJointAngle(landmarks, [jDef.def.a, jDef.def.b, jDef.def.c]));

  liveEl.textContent  = angle + '°';
  liveEl.style.color  = trained !== null ? 'var(--green)' : '';

  if (_mlRecording && _mlCurrentLandmarks) {
    _mlRecordFrameCount++;
    if (_mlRecordFrameCount >= ML_RECORD_FRAME_INTERVAL) {
      _mlRecordFrameCount = 0;
      mlAutoCapture();
    }
  }
}


// ── mlSaveNotes ────────────────────────────────────────────────────────────
function mlSaveNotes() {
  const el = document.getElementById('mlSessionNotes');
  if (el) localStorage.setItem('ml_session_notes', el.value);
}

// ── mlOnJointChange ────────────────────────────────────────────────────────
async function mlOnJointChange() {
  const undoBar = document.getElementById('mlUndoBar');
  if (undoBar) undoBar.style.display = 'none';
  _mlLastRecordingId = null;
  _mlSamplesLoaded   = false;
  _mlSamplesCache    = null;
  const samplesBody    = document.getElementById('mlSamplesBody');
  const samplesChevron = document.getElementById('mlSamplesChevron');
  if (samplesBody)    samplesBody.style.display    = 'none';
  if (samplesChevron) samplesChevron.textContent   = '▸';
  const select = document.getElementById('mlJointSelect');
  if (select) await mlRefreshSampleCounts(select.value);
}

// ── mlOnSlider ─────────────────────────────────────────────────────────────
function mlOnSlider(value) {
  const el = document.getElementById('mlSliderAngle');
  if (el) el.textContent = value + '°';
}

function mlAngleBucket(angle) {
  if (angle < 0)    return 'hyp';
  if (angle === 0)  return '0';
  if (angle <= 30)  return '1';
  if (angle <= 60)  return '31';
  if (angle <= 90)  return '61';
  if (angle <= 120) return '91';
  if (angle <= 150) return '121';
  return '151';
}

// ── mlAutoCapture — called every ML_RECORD_FRAME_INTERVAL frames during recording
async function mlAutoCapture() {
  if (!_mlRecording || !_mlCurrentLandmarks || !_mlSelectedHand) return;
  if (_mlCaptureInFlight) return;
  _mlCaptureInFlight = true;

  const select = document.getElementById('mlJointSelect');
  const slider = document.getElementById('mlAngleSlider');
  if (!select || !slider) { _mlCaptureInFlight = false; return; }

  const joint      = `${select.value}-${_mlSelectedHand}`;
  const trueAngle  = parseInt(slider.value);
  const lmSnapshot = _mlCurrentLandmarks.slice();
  const landmarks  = lmSnapshot.flatMap(lm => [lm.x, lm.y, lm.z || 0]);
  const notes      = document.getElementById('mlSessionNotes')?.value?.trim() || '';
  const sample     = {
    landmarks, trueAngle,
    recordedAt:  new Date().toISOString(),
    recordedBy:  currentUser?.email || '',
    recordingId: _mlRecordingId,
    notes,
    ...(_currentFrameFeatures ? { imageFeatures: _currentFrameFeatures } : {}),
  };

  const countEl = document.getElementById('mlRecordCount');

  try {
    const chunkIdx  = Math.floor(_mlTotalSamples / 50);
    const chunkId   = `${joint}_chunk_${chunkIdx}`;
    const bucketKey = `histogram.b${Math.min(17, Math.floor(trueAngle / 10))}`;
    const orient    = mlClassifyOrientation(lmSnapshot);
    const gridKey   = `grid_${orient}_${mlAngleBucket(trueAngle)}`;

    const batch = db.batch();
    batch.set(
      db.collection('trainingChunks').doc(chunkId),
      { joint, chunk: chunkIdx, samples: firebase.firestore.FieldValue.arrayUnion(sample) },
      { merge: true }
    );
    batch.set(
      db.collection('trainingMeta').doc(joint),
      { joint, totalSamples: firebase.firestore.FieldValue.increment(1), [bucketKey]: firebase.firestore.FieldValue.increment(1), [gridKey]: firebase.firestore.FieldValue.increment(1) },
      { merge: true }
    );
    await batch.commit();

    _mlTotalSamples++;
    _mlRecordSampleCount++;
    if (countEl) countEl.textContent = _mlRecordSampleCount;

    if (_mlRecordSampleCount % ML_RECORD_GRID_REFRESH_INTERVAL === 0) {
      mlRefreshSampleCounts();
    }
  } catch (e) {
    console.error('mlAutoCapture:', e);
    if (countEl) countEl.textContent = 'err';
  } finally {
    _mlCaptureInFlight = false;
  }
}

// ── mlStartRecording / mlStopRecording ─────────────────────────────────────
async function mlStartRecording() {
  if (_mlRecording || !_mlSelectedHand) return;
  const select    = document.getElementById('mlJointSelect');
  const slider    = document.getElementById('mlAngleSlider');
  const startBtn  = document.getElementById('mlRecordStartBtn');
  const stopBtn   = document.getElementById('mlRecordStopBtn');
  const countEl   = document.getElementById('mlRecordCount');
  const indicator = document.getElementById('mlRecordingIndicator');
  const undoBar   = document.getElementById('mlUndoBar');

  if (select) {
    const joint = `${select.value}-${_mlSelectedHand}`;
    const meta  = await db.collection('trainingMeta').doc(joint).get();
    _mlTotalSamples = meta.exists ? (meta.data().totalSamples || 0) : 0;
  }

  _mlRecording         = true;
  _mlRecordFrameCount  = 0;
  _mlRecordSampleCount = 0;
  _mlRecordingId       = Date.now().toString();

  if (slider)    slider.disabled        = true;
  if (startBtn)  startBtn.style.display = 'none';
  if (stopBtn)   stopBtn.style.display  = '';
  if (countEl)   countEl.textContent    = '0';
  if (indicator) indicator.style.display = '';
  if (undoBar)   undoBar.style.display   = 'none';
  document.querySelector('.ml-capture-panel')?.classList.add('ml-recording');
}

function mlStopRecording() {
  if (!_mlRecording) return;
  const slider    = document.getElementById('mlAngleSlider');
  const startBtn  = document.getElementById('mlRecordStartBtn');
  const stopBtn   = document.getElementById('mlRecordStopBtn');
  const indicator = document.getElementById('mlRecordingIndicator');
  const undoBar   = document.getElementById('mlUndoBar');
  const undoLabel = document.getElementById('mlUndoLabel');

  _mlLastRecordingId    = _mlRecordingId;
  _mlLastRecordingCount = _mlRecordSampleCount;
  _mlRecording          = false;
  _mlRecordFrameCount   = 0;
  _mlRecordingId        = null;

  if (slider)   { slider.value = 90; slider.disabled = false; mlOnSlider(90); }
  if (startBtn) startBtn.style.display = '';
  if (stopBtn)   stopBtn.style.display  = 'none';
  if (indicator) indicator.style.display = 'none';
  document.querySelector('.ml-capture-panel')?.classList.remove('ml-recording');

  if (undoBar && _mlLastRecordingCount > 0) {
    if (undoLabel) undoLabel.textContent = `Discard last recording (${_mlLastRecordingCount} samples)`;
    undoBar.style.display = '';
  }

  mlRefreshSampleCounts();
}

// ── mlUndoLastRecording ────────────────────────────────────────────────────
async function mlUndoLastRecording() {
  if (!_mlLastRecordingId || !_mlSelectedHand) return;
  const select  = document.getElementById('mlJointSelect');
  const undoBtn = document.getElementById('mlUndoBtn');
  const undoBar = document.getElementById('mlUndoBar');
  if (!select || !undoBtn) return;

  const joint = `${select.value}-${_mlSelectedHand}`;
  undoBtn.disabled    = true;
  undoBtn.textContent = 'Removing...';

  try {
    const snap  = await db.collection('trainingChunks').where('joint', '==', joint).get();
    const batch = db.batch();
    const rid   = _mlLastRecordingId;

    for (const doc of snap.docs) {
      const kept = (doc.data().samples || []).filter(s => s.recordingId !== rid);
      if (kept.length !== (doc.data().samples || []).length) {
        batch.update(doc.ref, { samples: kept });
      }
    }
    await batch.commit();

    const remaining = snap.docs.flatMap(d => (d.data().samples || []).filter(s => s.recordingId !== rid));
    const newMeta   = { joint, totalSamples: remaining.length };
    for (const s of remaining) {
      const bk = `histogram.b${Math.min(17, Math.floor(s.trueAngle / 10))}`;
      newMeta[bk] = (newMeta[bk] || 0) + 1;
      const lm     = s.landmarks;
      const lmObjs = Array.isArray(lm[0])
        ? lm.map(([x, y, z]) => ({ x, y, z }))
        : Array.from({ length: lm.length / 3 }, (_, i) => ({ x: lm[i*3], y: lm[i*3+1], z: lm[i*3+2] }));
      const orient = mlClassifyOrientation(lmObjs);
      const gk = `grid_${orient}_${mlAngleBucket(s.trueAngle)}`;
      newMeta[gk] = (newMeta[gk] || 0) + 1;
    }
    await db.collection('trainingMeta').doc(joint).set(newMeta);

    _mlLastRecordingId    = null;
    _mlLastRecordingCount = 0;
    undoBtn.textContent = 'Removed!';
    mlRefreshSampleCounts();
    setTimeout(() => { if (undoBar) undoBar.style.display = 'none'; }, 900);
  } catch (e) {
    console.error('mlUndoLastRecording:', e);
    undoBtn.disabled    = false;
    undoBtn.textContent = 'Discard';
  }
}

// ── mlClearJoint ───────────────────────────────────────────────────────────
async function mlClearJoint() {
  const select  = document.getElementById('mlJointSelect');
  const clearBtn = document.querySelector('.ml-clear-btn');
  if (!select) return;

  if (!_mlSelectedHand) { alert('Select LEFT or RIGHT before clearing.'); return; }
  const hand = _mlSelectedHand;

  const joint = `${select.value}-${hand}`;
  if (clearBtn) { clearBtn.disabled = true; clearBtn.textContent = 'Clearing...'; }

  try {
    const snap  = await db.collection('trainingChunks').where('joint', '==', joint).get();
    const batch = db.batch();
    snap.docs.forEach(d => batch.delete(d.ref));
    batch.delete(db.collection('trainingMeta').doc(joint));
    await batch.commit();

    _mlLastRecordingId    = null;
    _mlLastRecordingCount = 0;
    const undoBar = document.getElementById('mlUndoBar');
    if (undoBar) undoBar.style.display = 'none';
    if (clearBtn) clearBtn.textContent = 'Cleared!';
    setTimeout(() => { if (clearBtn) { clearBtn.disabled = false; clearBtn.textContent = 'Clear all samples for this joint'; } }, 1200);
    mlRefreshSampleCounts();
  } catch (e) {
    console.error('mlClearJoint:', e);
    if (clearBtn) { clearBtn.disabled = false; clearBtn.textContent = 'Clear all samples for this joint'; }
  }
}

// ── trainMLModel ───────────────────────────────────────────────────────────
async function trainMLModel() {
  if (!window.tf || !_mlSelectedHand) return;
  const select       = document.getElementById('mlJointSelect');
  const trainBtn     = document.getElementById('mlTrainBtn');
  const statusEl     = document.getElementById('mlTrainStatus');
  const progressWrap = document.getElementById('mlProgressWrap');
  const progressBar  = document.getElementById('mlProgressBar');
  if (!select || !trainBtn || !statusEl) return;

  const joint = `${select.value}-${_mlSelectedHand}`;
  trainBtn.disabled    = true;
  trainBtn.textContent = 'Loading samples...';
  if (statusEl)      statusEl.textContent  = '';
  if (progressWrap)  progressWrap.style.display = 'block';
  if (progressBar)   progressBar.style.width    = '0%';

  try {
    const snap    = await db.collection('trainingChunks').where('joint', '==', joint).get();
    const samples = snap.docs.flatMap(d => d.data().samples);

    if (samples.length === 0) {
      statusEl.textContent = 'No samples found.';
      trainBtn.disabled = false; trainBtn.textContent = 'Train Model';
      return;
    }

    const hybridSamples = samples.filter(s => Array.isArray(s.imageFeatures) && s.imageFeatures.length === 256);
    const useHybrid     = hybridSamples.length >= 10;

    statusEl.textContent = useHybrid
      ? `Training hybrid model on ${hybridSamples.length} samples...`
      : `Training on ${samples.length} samples...${hybridSamples.length > 0 ? ` (${hybridSamples.length} have visual features — need 10 for hybrid)` : ''}`;

    const epochs = 100;
    let model, mae;

    if (useHybrid) {
      const imgXs = window.tf.tensor2d(hybridSamples.map(s => s.imageFeatures));
      const lmXs  = window.tf.tensor2d(hybridSamples.map(s => s.landmarks.flat()));
      const ys    = window.tf.tensor2d(hybridSamples.map(s => [s.trueAngle / 180]));

      const imgInput = window.tf.input({ shape: [256] });
      const lmInput  = window.tf.input({ shape: [63] });
      const merged   = window.tf.layers.concatenate().apply([imgInput, lmInput]);
      const d1       = window.tf.layers.dense({ units: 128, activation: 'relu' }).apply(merged);
      const d2       = window.tf.layers.dense({ units: 64,  activation: 'relu' }).apply(d1);
      const out      = window.tf.layers.dense({ units: 1 }).apply(d2);
      model          = window.tf.model({ inputs: [imgInput, lmInput], outputs: out });
      model.compile({ optimizer: window.tf.train.adam(0.001), loss: 'meanSquaredError' });

      await model.fit([imgXs, lmXs], ys, {
        epochs,
        validationSplit: 0.1,
        callbacks: { onEpochEnd: (epoch) => {
          if (progressBar) progressBar.style.width = `${Math.round((epoch + 1) / epochs * 100)}%`;
        }},
      });

      const pred       = model.predict([imgXs, lmXs]);
      const predAngles = Array.from(pred.dataSync()).map(v => v * 180);
      mae              = predAngles.reduce((s, v, i) => s + Math.abs(v - hybridSamples[i].trueAngle), 0) / predAngles.length;
      pred.dispose();

      const weights = model.getWeights().map(w => Array.from(w.dataSync()));
      await db.collection('mlModels').doc(joint).set({
        type:        'hybrid',
        topology:    JSON.stringify(model.toJSON()),
        weights,
        sampleCount: hybridSamples.length,
        trainedAt:   new Date().toISOString(),
        mae:         parseFloat(mae.toFixed(2)),
      });

      _mlModels.set(joint, { type: 'hybrid', model });
      imgXs.dispose(); lmXs.dispose(); ys.dispose();
    } else {
      const xs = window.tf.tensor2d(samples.map(s => s.landmarks.flat()));
      const ys = window.tf.tensor2d(samples.map(s => [s.trueAngle / 180]));

      model = window.tf.sequential({ layers: [
        window.tf.layers.dense({ inputShape: [63], units: 64, activation: 'relu' }),
        window.tf.layers.dense({ units: 32, activation: 'relu' }),
        window.tf.layers.dense({ units: 1 }),
      ]});
      model.compile({ optimizer: window.tf.train.adam(0.001), loss: 'meanSquaredError' });

      await model.fit(xs, ys, {
        epochs,
        validationSplit: samples.length >= 10 ? 0.1 : 0,
        callbacks: { onEpochEnd: (epoch) => {
          if (progressBar) progressBar.style.width = `${Math.round((epoch + 1) / epochs * 100)}%`;
        }},
      });

      const pred       = model.predict(xs);
      const predAngles = Array.from(pred.dataSync()).map(v => v * 180);
      mae              = predAngles.reduce((s, v, i) => s + Math.abs(v - samples[i].trueAngle), 0) / predAngles.length;
      pred.dispose();

      const weights = model.getWeights().map(w => Array.from(w.dataSync()));
      await db.collection('mlModels').doc(joint).set({
        topology:    JSON.stringify(model.toJSON()),
        weights,
        sampleCount: samples.length,
        trainedAt:   new Date().toISOString(),
        mae:         parseFloat(mae.toFixed(2)),
      });

      _mlModels.set(joint, { type: 'landmarks', model });
      xs.dispose(); ys.dispose();
    }

    statusEl.textContent = `Done — avg error: ${mae.toFixed(1)}°`;
    trainBtn.textContent = 'Train Again';
    trainBtn.disabled    = false;
    await mlRefreshModelsList();
  } catch (e) {
    statusEl.textContent = 'Training failed.';
    trainBtn.textContent = 'Train Model';
    trainBtn.disabled    = false;
    console.error(e);
  }
}

// ── mlSetHand ──────────────────────────────────────────────────────────────
function mlSetHand(hand) {
  _mlSelectedHand  = hand;
  _mlSamplesLoaded = false;
  _mlSamplesCache  = null;
  const samplesBody    = document.getElementById('mlSamplesBody');
  const samplesChevron = document.getElementById('mlSamplesChevron');
  if (samplesBody)    samplesBody.style.display    = 'none';
  if (samplesChevron) samplesChevron.textContent   = '▸';
  const leftBtn  = document.getElementById('mlHandBtnLeft');
  const rightBtn = document.getElementById('mlHandBtnRight');
  if (leftBtn)  leftBtn.classList.toggle('active',  hand === 'left');
  if (rightBtn) rightBtn.classList.toggle('active', hand === 'right');
  mlRefreshSampleCounts();
}

// ── mlRefreshSampleCounts ──────────────────────────────────────────────────
async function mlRefreshSampleCounts(joint) {
  const select   = document.getElementById('mlJointSelect');
  const baseKey  = joint || (select ? select.value : null);
  if (!baseKey || !_mlSelectedHand) return;
  const j        = `${baseKey}-${_mlSelectedHand}`;
  const countEl  = document.getElementById('mlSampleCount');
  const trainBtn = document.getElementById('mlTrainBtn');

  try {
    const [meta, allMeta] = await Promise.all([
      db.collection('trainingMeta').doc(j).get(),
      db.collection('trainingMeta').get(),
    ]);
    const jointCount  = meta.exists ? meta.data().totalSamples : 0;
    const grandTotal  = allMeta.docs.reduce((sum, d) => sum + (d.data().totalSamples || 0), 0);

    if (countEl) countEl.textContent = `${jointCount} sample${jointCount !== 1 ? 's' : ''}`;
    if (trainBtn) {
      trainBtn.disabled    = jointCount < 100;
      trainBtn.textContent = jointCount < 100 ? `Train Model (need ${100 - jointCount} more)` : 'Train Model';
    }

    const labelEl = document.getElementById('mlStatJointLabel');
    const jCountEl = document.getElementById('mlStatJointCount');
    const totalEl  = document.getElementById('mlStatTotal');
    if (labelEl && select) {
      const optText = select.options[select.selectedIndex]?.text || baseKey;
      const handStr = _mlSelectedHand ? ` (${_mlSelectedHand})` : '';
      labelEl.textContent = `Samples for ${optText}${handStr}`;
    }
    if (jCountEl) jCountEl.textContent = jointCount;
    if (totalEl)  totalEl.textContent  = grandTotal;

    const docData = meta.exists ? meta.data() : {};
    const grid = {};
    Object.keys(docData).forEach(k => { if (k.startsWith('grid_')) grid[k] = docData[k]; });
    mlRenderGrid(grid);
  } catch (e) {
    console.error(e);
  }
}

// ── mlClassifyOrientation / mlRenderGrid ───────────────────────────────────
let _mlSuggestedAngle = null;

function mlPalmNormal(landmarks) {
  const w = landmarks[0], p1 = landmarks[5], p5 = landmarks[17];
  const ax = p5.x - w.x, ay = p5.y - w.y, az = (p5.z || 0) - (w.z || 0);
  const bx = p1.x - w.x, by = p1.y - w.y, bz = (p1.z || 0) - (w.z || 0);
  const nx = ay * bz - az * by;
  const ny = az * bx - ax * bz;
  const nz = ax * by - ay * bx;
  const mag = Math.sqrt(nx * nx + ny * ny + nz * nz);
  return mag === 0 ? { nx: 0, ny: 0, nz: 0 } : { nx: nx / mag, ny: ny / mag, nz: nz / mag };
}

function mlClassifyOrientation(landmarks) {
  const { nx, ny, nz } = mlPalmNormal(landmarks);
  const ax = Math.abs(nx), ay = Math.abs(ny), az = Math.abs(nz);
  if (az >= ax && az >= ay) return nz > 0 ? 'toward' : 'away';
  if (ay >= ax && ay >= az) return ny < 0 ? 'up' : 'down';  // image y inverted
  return nx > 0 ? 'right' : 'left';
}

function mlRenderGrid(grid) {
  const gridEl  = document.getElementById('mlCoverageGrid');
  const labelEl = document.getElementById('mlNextAngleLabel');
  const useBtn  = document.getElementById('mlUseBtn');
  if (!gridEl) return;

  const ORIENTS = [
    { key: 'toward', label: 'TOWARD' },
    { key: 'away',   label: 'AWAY'   },
    { key: 'up',     label: 'UP'     },
    { key: 'down',   label: 'DOWN'   },
    { key: 'left',   label: 'LEFT'   },
    { key: 'right',  label: 'RIGHT'  },
  ];
  const BUCKETS = [
    { key: 'hyp', label: '<0',      mid: -15 },
    { key: '0',   label: '0',       mid: 0   },
    { key: '1',   label: '1-30',    mid: 15  },
    { key: '31',  label: '31-60',   mid: 45  },
    { key: '61',  label: '61-90',   mid: 75  },
    { key: '91',  label: '91-120',  mid: 105 },
    { key: '121', label: '121-150', mid: 135 },
    { key: '151', label: '151-180', mid: 165 },
  ];

  const cells     = ORIENTS.map(o => BUCKETS.map(b => grid[`grid_${o.key}_${b.key}`] || 0));
  const allCounts = cells.flat();
  const minCount  = Math.min(...allCounts);
  const minFlat   = allCounts.indexOf(minCount);
  const minOi     = Math.floor(minFlat / BUCKETS.length);
  const minBi     = minFlat % BUCKETS.length;
  _mlSuggestedAngle = BUCKETS[minBi].mid;

  if (labelEl) labelEl.textContent = `Suggested: ${_mlSuggestedAngle}° (${ORIENTS[minOi].label})`;
  if (useBtn)  useBtn.disabled = false;

  gridEl.innerHTML = `
    <div class="ml-grid-row ml-grid-header">
      <div class="ml-grid-orient-label"></div>
      ${BUCKETS.map(b => `<div class="ml-grid-col-label">${b.label}</div>`).join('')}
    </div>
    ${ORIENTS.map((o, oi) => `
      <div class="ml-grid-row">
        <div class="ml-grid-orient-label">${o.label}</div>
        ${BUCKETS.map((b, bi) => {
          const count  = cells[oi][bi];
          const pct    = Math.min(100, Math.round(count / 30 * 100));
          const isDone = count >= 30;
          const isMin  = oi === minOi && bi === minBi;
          const style  = isMin || isDone ? '' : `--pct:${pct}%`;
          return `<div class="ml-grid-cell${isDone ? ' ml-grid-cell--done' : ''}${isMin ? ' ml-grid-cell--target' : ''}" style="${style}" title="${count}/30"></div>`;
        }).join('')}
      </div>
    `).join('')}
  `;
}

function mlUseSuggested() {
  if (_mlSuggestedAngle === null) return;
  const slider = document.getElementById('mlAngleSlider');
  if (slider) { slider.value = _mlSuggestedAngle; mlOnSlider(_mlSuggestedAngle); }
}

// ── mlRefreshModelsList ────────────────────────────────────────────────────
async function mlRefreshModelsList() {
  const list = document.getElementById('mlModelsList');
  if (!list) return;

  try {
    const snap = await db.collection('mlModels').get();
    if (snap.empty) {
      list.textContent = 'No models trained yet.';
      return;
    }
    list.innerHTML = snap.docs.map(doc => {
      const d = doc.data();
      return `<div class="ml-model-row">
        <span class="ml-model-joint">${doc.id}</span>
        <span class="ml-model-meta">${d.sampleCount} samples — ${d.mae}° avg error</span>
      </div>`;
    }).join('');
  } catch (e) {
    list.textContent = 'Failed to load.';
    console.error(e);
  }
}

// ── mlFlipCamera ───────────────────────────────────────────────────────────
function mlFlipCamera() {
  _mlTrainerFacingMode = _mlTrainerFacingMode === 'environment' ? 'user' : 'environment';
  if (_mlTrainerCamera) { _mlTrainerCamera.stop(); _mlTrainerCamera = null; }
  Object.keys(_mlFilterStates).forEach(k => delete _mlFilterStates[k]);
  mlStartCamera();
}

// ── mlToggleStats ──────────────────────────────────────────────────────────
function mlToggleStats() {
  const body    = document.getElementById('mlStatsBody');
  const chevron = document.getElementById('mlStatsChevron');
  const card    = document.getElementById('mlStatsCard');
  if (!body) return;
  const open = body.style.display === 'none';
  body.style.display = open ? 'block' : 'none';
  if (chevron) chevron.textContent = open ? '▾' : '▸';
  if (open && card) setTimeout(() => card.scrollIntoView({ behavior: 'smooth', block: 'nearest' }), 20);
}

// ── mlToggleModels ─────────────────────────────────────────────────────────
function mlToggleModels() {
  const body    = document.getElementById('mlModelsBody');
  const chevron = document.getElementById('mlModelsChevron');
  const card    = document.getElementById('mlModelsCard');
  if (!body) return;
  const open = body.style.display === 'none';
  body.style.display  = open ? 'block' : 'none';
  if (chevron) chevron.textContent = open ? '▾' : '▸';
  if (open && card) setTimeout(() => card.scrollIntoView({ behavior: 'smooth', block: 'nearest' }), 20);
}

// ── mlToggleSamples ────────────────────────────────────────────────────────
async function mlToggleSamples() {
  const body    = document.getElementById('mlSamplesBody');
  const chevron = document.getElementById('mlSamplesChevron');
  const card    = document.getElementById('mlSamplesCard');
  if (!body) return;
  const open = body.style.display === 'none';
  body.style.display = open ? 'block' : 'none';
  if (chevron) chevron.textContent = open ? '▾' : '▸';
  if (open) {
    if (!_mlSamplesLoaded) await mlLoadSamples();
    if (card) setTimeout(() => card.scrollIntoView({ behavior: 'smooth', block: 'nearest' }), 20);
  }
}

// ── mlLoadSamples ──────────────────────────────────────────────────────────
async function mlLoadSamples() {
  const select = document.getElementById('mlJointSelect');
  const listEl = document.getElementById('mlSamplesList');
  if (!select || !listEl || !_mlSelectedHand) return;

  const joint = `${select.value}-${_mlSelectedHand}`;
  listEl.innerHTML = '<div class="ml-samples-loading">Loading...</div>';

  try {
    const snap = await db.collection('trainingChunks').where('joint', '==', joint).get();
    const all  = snap.docs.flatMap(d => d.data().samples || []);

    _mlSamplesCache  = { joint, snap };
    _mlSamplesLoaded = true;

    mlRenderSamples(all);
  } catch (e) {
    console.error('mlLoadSamples:', e);
    listEl.innerHTML = '<div class="ml-samples-loading">Failed to load.</div>';
  }
}

// ── mlRenderSamples ────────────────────────────────────────────────────────
function mlRenderSamples(samples) {
  const listEl = document.getElementById('mlSamplesList');
  if (!listEl) return;

  if (!samples.length) {
    listEl.innerHTML = '<div class="ml-samples-loading">No samples recorded yet.</div>';
    return;
  }

  // Group by date, then by recordingId within each date
  const byDate = {};
  for (const s of samples) {
    const date = (s.recordedAt || '').slice(0, 10) || 'Unknown';
    if (!byDate[date]) byDate[date] = {};
    const rid = s.recordingId || `__manual_${s.recordedAt}`;
    if (!byDate[date][rid]) byDate[date][rid] = [];
    byDate[date][rid].push(s);
  }

  const dates = Object.keys(byDate).sort((a, b) => b.localeCompare(a));

  listEl.innerHTML = dates.map((date, di) => {
    const sessions = byDate[date];
    const rids     = Object.keys(sessions).sort((a, b) => {
      const ta = sessions[a][0]?.recordedAt || '';
      const tb = sessions[b][0]?.recordedAt || '';
      return tb.localeCompare(ta);
    });
    const dateTotal = rids.reduce((n, r) => n + sessions[r].length, 0);
    const bodyId    = `mlSamplesDate_${di}`;

    const rows = rids.map(rid => {
      const ss      = sessions[rid];
      const time    = new Date(ss[0].recordedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      const minAng  = Math.min(...ss.map(s => s.trueAngle));
      const maxAng  = Math.max(...ss.map(s => s.trueAngle));
      const isManual = rid.startsWith('__manual_');
      const deleteArg = isManual ? `null,'${ss[0].recordedAt}',this` : `'${rid}',null,this`;
      const angleStr  = minAng === maxAng ? `${minAng}°` : `${minAng}°–${maxAng}°`;
      return `<div class="ml-sample-session">
        <span class="ml-sample-session-info">${time} — ${ss.length} sample${ss.length !== 1 ? 's' : ''} — ${angleStr}</span>
        <button class="ml-sample-delete-btn" onclick="mlDeleteSession(${deleteArg})">Delete</button>
      </div>`;
    }).join('');

    return `<div class="ml-samples-date-group">
      <button class="ml-samples-date-hdr" onclick="this.nextElementSibling.style.display=this.nextElementSibling.style.display==='none'?'':'none';this.querySelector('.ml-samples-date-chevron').textContent=this.nextElementSibling.style.display===''?'▾':'▸'">
        <span>${date} <span class="ml-samples-date-count">(${dateTotal})</span></span>
        <span class="ml-samples-date-chevron">▸</span>
      </button>
      <div id="${bodyId}" class="ml-samples-date-body" style="display:none">${rows}</div>
    </div>`;
  }).join('');
}

// ── mlDeleteSession ────────────────────────────────────────────────────────
async function mlDeleteSession(recordingId, fallbackRecordedAt, btn) {
  const select = document.getElementById('mlJointSelect');
  if (!select || !_mlSelectedHand || !_mlSamplesCache) return;

  const joint = `${select.value}-${_mlSelectedHand}`;
  if (btn) { btn.disabled = true; btn.textContent = 'Removing...'; }

  try {
    const { snap } = _mlSamplesCache;
    const batch    = db.batch();

    const filter = s => recordingId
      ? s.recordingId !== recordingId
      : s.recordedAt  !== fallbackRecordedAt;

    for (const doc of snap.docs) {
      const orig = doc.data().samples || [];
      const kept = orig.filter(filter);
      if (kept.length !== orig.length) batch.update(doc.ref, { samples: kept });
    }
    await batch.commit();

    // Recalculate metadata from remaining samples
    const remaining = snap.docs.flatMap(d => (d.data().samples || []).filter(filter));
    const newMeta   = { joint, totalSamples: remaining.length };
    for (const s of remaining) {
      const bk = `histogram.b${Math.min(17, Math.floor(s.trueAngle / 10))}`;
      newMeta[bk] = (newMeta[bk] || 0) + 1;
      const lm     = s.landmarks;
      const lmObjs = Array.isArray(lm[0])
        ? lm.map(([x, y, z]) => ({ x, y, z }))
        : Array.from({ length: lm.length / 3 }, (_, i) => ({ x: lm[i*3], y: lm[i*3+1], z: lm[i*3+2] }));
      const orient = mlClassifyOrientation(lmObjs);
      const gk     = `grid_${orient}_${mlAngleBucket(s.trueAngle)}`;
      newMeta[gk]  = (newMeta[gk] || 0) + 1;
    }
    await db.collection('trainingMeta').doc(joint).set(newMeta);

    // Update local cache and re-render
    _mlSamplesCache = { joint, snap: { docs: snap.docs.map(d => ({ ref: d.ref, data: () => ({ ...d.data(), samples: (d.data().samples || []).filter(filter) }) })) } };
    mlRenderSamples(remaining);
    mlRefreshSampleCounts();
  } catch (e) {
    console.error('mlDeleteSession:', e);
    if (btn) { btn.disabled = false; btn.textContent = 'Delete'; }
  }
}

// ── mlTrainerBack ──────────────────────────────────────────────────────────
function mlTrainerBack() {
  if (_mlRecording) mlStopRecording();
  if (_mlTrainerCamera) { _mlTrainerCamera.stop(); _mlTrainerCamera = null; }
  _mlMpHands = null;
  _mlCurrentLandmarks = null;
  const video = document.getElementById('mlVideo');
  if (video?.srcObject) {
    video.srcObject.getTracks().forEach(t => t.stop());
    video.srcObject = null;
    video.classList.remove('ready');
  }
  Object.keys(_mlFilterStates).forEach(k => delete _mlFilterStates[k]);
  showScreen('therapistScreen');
}

/* ══════════════════════════════════════════════════════════════════════════
   WINDOW EXPORTS — required for Vite module mode so inline HTML onclick
   handlers can reach these functions (modules don't auto-pollute globals)
   ══════════════════════════════════════════════════════════════════════════ */
Object.assign(window, {
  // Auth
  handleLogin, handleSignup, handleForgot, selectRole,
  handleConnect, skipConnect,
  logout, requestLogout, closeLogoutModal, confirmLogout, resetInactivityTimer,
  approveTherapist, rejectTherapist, acceptConsent,

  // Navigation
  showScreen,

  // Bottom sheet
  showExerciseDetail, dismissExerciseDetail,

  // Manual session
  openManualSession, closeManualSession, submitManualSession,

  // Patient flows
  startScanSession, startSessionWithProtocol, startSessionByIndex, showExercisesScreen,
  showProgressScreen, openPatientMessaging, sendMessageFromPatient, toggleMsgSend, toggleExerciseList,

  // Camera session
  flipCamera, advanceSet, skipRest, completeSessionEarly, dismissSummary, dismissSummaryToProgress,
  toggleSound,
  openVideoModal, closeVideoModal, downloadSessionVideo,

  // Clinics
  showMyClinicOrJoin, showCreateClinicScreen, createClinic,
  showJoinClinicScreen, joinClinicByCode, showClinicScreen,
  acceptInvite, declineInvite, sendClinicInvite,
  regenerateClinicCode, toggleClinicCode, copyClinicJoinCode,
  removeClinicMember, confirmLeaveClinic,

  // Clinic Library
  showClinicLibraryScreen, shareExerciseToClinic, pullExerciseFromClinic,
  removeSharedExercise, showShareExerciseModal, closeShareExerciseModal,

  // Therapist panel
  copyClinicCode,

  // ML Trainer
  startMLTrainer, mlTrainerBack, mlFlipCamera, mlOnJointChange, mlOnSlider, mlUseSuggested, mlToggleModels, mlToggleStats, mlToggleSamples, mlSaveNotes,
  trainMLModel, mlStartRecording, mlStopRecording, mlUndoLastRecording, mlClearJoint, mlSetHand, mlDeleteSession,
  openSidebar, closeSidebar,
  backToPatientList, filterPatients, toggleTpSection, showRealPatient,
  deleteProtocol, editProtocol, cancelEditProtocol, assignProtocol,
  openAddProtocol, closeAddProtocol, apmSelectExercise, apmFilter,
  openBulkAssign, bulkAssignProtocol, bapToggleAll, bapFilterPatients, _bapUpdateSubmitBtn,
  apmEnterCreateMode, apmExitCreateMode, apmSaveCustomExercise,
  epAddCondition, epRemoveCondition, updateExerciseParamsUI,

  // Protocol Library
  openProtocolLibrary, closeProtocolLibrary, plFilter, plSelectExercise,
  plEnterCreateMode, plExitCreateMode, plSaveNewExercise, plSaveExercise,
  plToggleHide, plUnhide, plResetBuiltIn, plToggleHiddenSection, plDeselect,

  // Demo recording
  demoStartDemo, demoEndDemo, demoFlipCamera,
  demoUseThis, demoReRecord, demoClearVideo,
  demoUploadFile, demoHandleFileSelect,
  playProtocolDemo, removeProtocolDemo,
  closeDemoAndStart, skipDemoVideo, replayDemoInSession, exitDemoNoSave, onDemoVideoProgress,

  // Manual camera session
  openManualCameraSession, manualCamExit, manualCamStartRecording, manualCamEndSet, manualCamCancelSet, manualCamSaveSet,

  // Progress screen
  toggleProgDay, showSetNotes, closeSetNotesModal,

  // Session history
  shLoadMore, toggleShExpand,

  // Exposed array for exercises screen start buttons
  get _exercisesProtocols() { return _exercisesProtocols; },
});
