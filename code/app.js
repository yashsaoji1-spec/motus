/* ═══════════════════════════════════════════════════════════════════════════
   PhalanX — Merged Script
   Combines: dashboard.html inline JS + script.js (calibration tracker)
   ═══════════════════════════════════════════════════════════════════════════ */

// ── npm imports (replaces CDN globals for Firebase + Chart.js) ──
import firebase from 'firebase/compat/app';
import 'firebase/compat/auth';
import 'firebase/compat/firestore';
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

// ── Video recording state ──
let mediaRecorder        = null;   // active MediaRecorder during a session
let recordedChunks       = [];     // Blob chunks accumulated from MediaRecorder
let recordingSupported   = false;  // false on iOS/unsupported browsers — skip all recording logic
let _pendingSessionDocId = null;   // Firestore doc ID to patch with videoUrl after upload completes

// ── Firebase config — replace all REPLACE_* values with your project's config ──
// Get these from: Firebase console → Project Settings → Your apps → SDK setup
// Required Firestore composite indexes (create in Firebase console → Firestore → Indexes):
//   sessions:  patientEmail ASC, date ASC
//   messages:  participants ARRAY, timestamp ASC
//   messages:  to ASC, from ASC, read ASC
const FIREBASE_CONFIG = {
  apiKey:            "AIzaSyAwlgTFuYFQ8CO_svT26kQpqzXCjr0yT_A",
  authDomain:        "phalanx-firebase-database.firebaseapp.com",
  projectId:         "phalanx-firebase-database",
  storageBucket:     "phalanx-firebase-database.firebasestorage.app",
  messagingSenderId: "1023274632764",
  appId:             "1:1023274632764:web:6190e7a3b4622ebce26539"
};

firebase.initializeApp(FIREBASE_CONFIG);
const db   = firebase.firestore();
const auth = firebase.auth();

const CLOUDINARY_CLOUD  = 'dslbugsdg';
const CLOUDINARY_PRESET = 'phalanx-videos';

// Restore session on page reload and route on sign-in / sign-out
auth.onAuthStateChanged(async (firebaseUser) => {
  if (!firebaseUser) {
    currentUser = null;
    currentRole = null;
    showScreen('loginScreen');
    return;
  }
  try {
    const snap = await db.collection('users').doc(firebaseUser.email).get();
    currentUser = { email: firebaseUser.email, ...snap.data() };
    currentRole = currentUser.role;
    await loginSuccess();
    loadMLModels();
  } catch (e) {
    console.error('onAuthStateChanged error:', e);
    showScreen('loginScreen');
  }
});

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
  await db.collection('connections').doc(therapistEmail)
    .set({ patients: firebase.firestore.FieldValue.arrayUnion(patientEmail) }, { merge: true });
}

async function getConnectedTherapist() {
  if (!currentUser) return null;
  const snap = await db.collection('connections')
    .where('patients', 'array-contains', currentUser.email).get();
  return snap.empty ? null : snap.docs[0].id;
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
  loginScreen:        'PhalanX — Sign In',
  signupScreen:       'PhalanX — Create Account',
  forgotScreen:       'PhalanX — Reset Password',
  connectScreen:      'PhalanX — Connect to Therapist',
  patientScreen:      'PhalanX — Home',
  cameraScreen:       'PhalanX — Session',
  therapistScreen:    'PhalanX — Therapist Dashboard',
  exercisesScreen:    'PhalanX — My Exercises',
  progressScreen:     'PhalanX — My Progress',
  calibrationScreen:  'PhalanX — Calibration',
  pendingScreen:      'PhalanX — Pending Approval',
  adminScreen:        'PhalanX — Admin Panel',
};

const AUTH_SCREENS = new Set(['loginScreen', 'signupScreen', 'forgotScreen', 'roleScreen', 'connectScreen', 'pendingScreen']);

function showScreen(screenId) {
  const prevActive = document.querySelector('.screen.active');
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  const next = document.getElementById(screenId);
  next.classList.add('active');
  next.scrollTop = 0;
  if (screenTitles[screenId]) document.title = screenTitles[screenId];
  if (!AUTH_SCREENS.has(screenId)) sessionStorage.setItem('phalanx_screen', screenId);

  // Stop session camera when leaving camera screen
  if (prevActive && prevActive.id === 'cameraScreen' && screenId !== 'cameraScreen') {
    if (mpCamera) { mpCamera.stop(); mpCamera = null; }
    if (mediaRecorder && mediaRecorder.state !== 'inactive') {
      mediaRecorder.stop(); mediaRecorder = null; recordedChunks = [];
    }
    currentFacingMode = 'user';
  }

  // Stop calibration camera when leaving calibration screen
  if (screenId !== 'calibrationScreen' && calibMpCamera) {
    calibMpCamera.stop();
    calibMpCamera = null;
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

async function handleLogin() {
  hideError('loginError');
  const email    = document.getElementById('loginEmail').value.trim().toLowerCase();
  const password = document.getElementById('loginPassword').value;
  if (!email || !password) { showError('loginError', 'Please enter your email and password.'); return; }
  try {
    await auth.signInWithEmailAndPassword(email, password);
    // onAuthStateChanged handles routing
  } catch (e) {
    showError('loginError',
      (e.code === 'auth/wrong-password' || e.code === 'auth/user-not-found' || e.code === 'auth/invalid-credential')
        ? 'Incorrect email or password. Try again.'
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
  if (password.length < 6) { showError('signupError', 'Password must be at least 6 characters.'); return; }
  try {
    const cred = await auth.createUserWithEmailAndPassword(email, password);
    const roleToSave = selectedRole === 'therapist' ? 'therapist_pending' : 'patient';
    await db.collection('users').doc(cred.user.email).set({ name, role: roleToSave });
    // onAuthStateChanged handles routing
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
    showError('forgotError',
      e.code === 'auth/user-not-found'
        ? 'No account found with that email.'
        : (e.message || 'Password reset failed. Please try again.'));
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
  const savedScreen = sessionStorage.getItem('phalanx_screen');

  if (currentRole === 'admin') {
    showScreen('adminScreen');
    await loadAdminScreen();
  } else if (currentRole === 'therapist') {
    showScreen('therapistScreen');
    document.getElementById('therapistCode').textContent = generateCodeForEmail(currentUser.email);
    await loadConnectedPatients();
  } else if (currentRole === 'therapist_pending') {
    showScreen('pendingScreen');
  } else {
    // patient
    const therapistEmail = await getConnectedTherapist();
    if (therapistEmail) {
      showScreen('patientScreen');
      await updatePatientHomeScreen();
      await initSetTracker();
    } else {
      showScreen('connectScreen');
    }
  }

  await restoreScreen(savedScreen);
}

async function restoreScreen(saved) {
  if (!saved) return;

  // sweepCalibrationScreen needs patientEmail arg — can't restore
  // cameraScreen session state is gone on refresh — can't restore
  // messagingScreen needs currentPatient set — can't restore
  if (currentRole === 'therapist') {
    if (saved === 'mlTrainerScreen') { await startMLTrainer(); }
    // therapistScreen is already shown by loginSuccess — nothing to do
  } else if (currentRole === 'patient') {
    if (saved === 'exercisesScreen') { await showExercisesScreen(); }
    else if (saved === 'progressScreen') { await showProgressScreen(); }
    // patientScreen already shown by loginSuccess — nothing to do
  }
}

function logout() {
  if (mpCamera) { mpCamera.stop(); mpCamera = null; }
  if (calibMpCamera) { calibMpCamera.stop(); calibMpCamera = null; }
  if (restTimerInterval) { clearInterval(restTimerInterval); restTimerInterval = null; }
  sessionStorage.removeItem('phalanx_screen');
  auth.signOut();
  // onAuthStateChanged resets currentUser/currentRole and shows loginScreen
}

function requestLogout() {
  document.getElementById('logoutWarning').textContent = repCount > 0
    ? `You have ${repCount} unsaved reps. Leaving now will lose this set's data.`
    : 'You will be signed out of PhalanX.';
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
   SECTION 6: PATIENT HOME
   ══════════════════════════════════════════════════════════════════════════ */

async function getTodayCompletion(email) {
  const protocols = await getProtocols(email);
  if (protocols.length === 0) return null;
  const today    = new Date().toDateString();
  const sessions = await getPatientSessions(email);
  const todaySessions = sessions.filter(s => new Date(s.date).toDateString() === today);
  // Only count sessions whose protocolId matches a current protocol's id.
  // Sessions without protocolId (saved before this field existed) are excluded — we cannot
  // tell which protocol they belong to, preventing stale sessions from showing "Done".
  const currentIds = new Set(protocols.map(p => p.id).filter(Boolean));
  const done = todaySessions.filter(s => s.protocolId && currentIds.has(s.protocolId)).length;
  const required = protocols.reduce((sum, p) => sum + (p.sets || 3), 0);
  return { done, required };
}

async function updatePatientHomeScreen() {
  if (!currentUser) return;
  const hour     = new Date().getHours();
  const greeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';
  document.getElementById('patientGreeting').textContent    = greeting;
  document.getElementById('patientDisplayName').textContent = currentUser.name;

  const [protocols, sessions, therapistEmail] = await Promise.all([
    getProtocols(currentUser.email),
    getPatientSessions(currentUser.email),
    getConnectedTherapist()
  ]);

  const strip = document.getElementById('patientProtocolStrip');
  if (protocols.length > 0 && strip) {
    strip.style.display = 'flex';
    document.getElementById('protocolStripExercise').textContent =
      protocols.length === 1
        ? (exerciseLabels[protocols[0].exerciseType] || protocols[0].exerciseType)
        : `${protocols.length} exercises assigned`;
    document.getElementById('protocolStripMeta').textContent =
      protocols.length === 1
        ? 'Assigned by ' + protocols[0].assignedBy
        : 'Tap "My Exercises" to choose';

    const today         = new Date().toDateString();
    const todaySessions = sessions.filter(s => new Date(s.date).toDateString() === today);
    const currentIds    = new Set(protocols.map(p => p.id).filter(Boolean));
    const done          = todaySessions.filter(s => s.protocolId && currentIds.has(s.protocolId)).length;
    const required      = protocols.reduce((sum, p) => sum + (p.sets || 3), 0);
    const statusEl = document.getElementById('protocolStripStatus');
    if (statusEl) {
      if (done >= required) {
        statusEl.textContent = 'Done';
        statusEl.className   = 'protocol-strip-status status-done';
      } else if (done > 0) {
        statusEl.textContent = `${done} / ${required} sets`;
        statusEl.className   = 'protocol-strip-status status-partial';
      } else {
        statusEl.textContent = `${required} sets`;
        statusEl.className   = 'protocol-strip-status status-pending';
      }
    }
  } else if (strip) {
    strip.style.display = 'none';
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
    if (!badgeEl.querySelector('.streak-flame')) badgeEl.insertAdjacentHTML('afterbegin', '<span class="streak-flame"></span>');
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

  const msgBadge = document.getElementById('patientUnreadBadge');
  if (msgBadge && therapistEmail) {
    const n = await unreadCount(currentUser.email, therapistEmail);
    msgBadge.textContent = n;
    msgBadge.style.display = n > 0 ? 'inline' : 'none';
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

async function startSessionWithProtocol(protocol) {
  selectedProtocol = protocol;
  trackedJoints  = await loadTrackedJoints(currentUser.email);
  jointMaxAngles = {};
  showScreen('cameraScreen');
  loadPatientProtocol();
  initSetTracker();
  if (!mpCamera) startCamera();
}

async function startScanSession() {
  const protocols = await getProtocols(currentUser.email);
  if (protocols.length !== 1) {
    // 0 protocols: exercises screen shows "no protocol" message
    // 2+ protocols: exercises screen lets patient pick
    showExercisesScreen();
    return;
  }
  selectedProtocol = protocols[0];
  trackedJoints  = await loadTrackedJoints(currentUser.email);
  jointMaxAngles = {};
  showScreen('cameraScreen');
  await loadPatientProtocol();
  await initSetTracker();
  if (!mpCamera) startCamera();
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
  wrist_extension:        'Wrist Extension'
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
};

// b is pivot. pip uses [MCP, PIP, TIP] = composite flexion, matching legacy middle-finger behavior.
const FINGER_LANDMARK_MAP = {
  thumb:  { mcp:[0,2,3],   pip:[2,3,4],    dip:null        },
  index:  { mcp:[0,5,6],   pip:[5,6,8],    dip:[6,7,8]     },
  middle: { mcp:[0,9,10],  pip:[9,10,12],  dip:[10,11,12]  },
  ring:   { mcp:[0,13,14], pip:[13,14,16], dip:[14,15,16]  },
  pinky:  { mcp:[0,17,18], pip:[17,18,20], dip:[18,19,20]  },
};

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
  const updated = existing.filter(p => p.id !== protocolId);
  if (updated.length === 0) {
    await db.collection('protocols').doc(patientEmail).delete();
  } else {
    await db.collection('protocols').doc(patientEmail).set({ items: updated });
  }
  const snap = await db.collection('users').doc(patientEmail).get();
  if (snap.exists) showRealPatient({ email: patientEmail, ...snap.data() });
}

async function editProtocol(patientEmail, protocolId) {
  const protocols = await getProtocols(patientEmail);
  const p = protocols.find(x => x.id === protocolId);
  if (!p) return;

  editingProtocolId = protocolId;
  editingPatientEmail = patientEmail;

  // Expand the protocol collapsible section
  const section = document.getElementById('tps-protocol');
  if (section && section.classList.contains('collapsed')) toggleTpSection('tps-protocol');

  // Populate the form with existing values
  const sel = document.getElementById('exerciseType');
  if (sel) sel.value = p.exerciseType;
  updateExerciseParamsUI(p.exerciseType, p.exerciseParams || null);

  const repsEl = document.getElementById('protocolReps');
  const setsEl = document.getElementById('protocolSets');
  const freqEl = document.getElementById('protocolFrequency');
  const notesEl = document.getElementById('protocolNotes');
  if (repsEl) repsEl.value = p.reps || 10;
  if (setsEl) setsEl.value = p.sets || 3;
  if (freqEl) freqEl.value = p.frequency || 'daily';
  if (notesEl) notesEl.value = p.notes || '';

  // Change button text and show cancel link
  const btn = document.querySelector('.protocol-btn');
  if (btn) {
    btn.textContent = 'Save Changes';
    btn.classList.add('editing');
  }
  let cancelEl = document.getElementById('cancelEditBtn');
  if (!cancelEl) {
    cancelEl = document.createElement('button');
    cancelEl.id = 'cancelEditBtn';
    cancelEl.className = 'protocol-cancel-btn';
    cancelEl.textContent = 'Cancel Edit';
    cancelEl.onclick = () => cancelEditProtocol(patientEmail);
    const btn2 = document.querySelector('.protocol-btn');
    if (btn2) btn2.parentElement.insertBefore(cancelEl, btn2.nextSibling);
  }
  cancelEl.style.display = 'inline-block';

  // Scroll into view
  const formEl = document.querySelector('.protocol-card');
  if (formEl) formEl.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function cancelEditProtocol(patientEmail) {
  editingProtocolId = null;
  editingPatientEmail = null;
  const btn = document.querySelector('.protocol-btn');
  if (btn) {
    btn.textContent = 'Add to Protocol';
    btn.classList.remove('editing');
  }
  const cancelEl = document.getElementById('cancelEditBtn');
  if (cancelEl) cancelEl.style.display = 'none';
  // Reset form
  const repsEl = document.getElementById('protocolReps');
  const setsEl = document.getElementById('protocolSets');
  const notesEl = document.getElementById('protocolNotes');
  if (repsEl) repsEl.value = 10;
  if (setsEl) setsEl.value = 3;
  if (notesEl) notesEl.value = '';
  updateExerciseParamsUI('full_fist', null);
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

async function assignProtocol(patientEmail) {
  const exerciseType = document.getElementById('exerciseType').value;
  const defaults = EXERCISE_DEFAULTS[exerciseType];

  // Collect exerciseParams from the UI
  let exerciseParams = null;
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

  const reps = parseInt(document.getElementById('protocolReps').value);
  const sets = parseInt(document.getElementById('protocolSets').value);
  if (isNaN(reps) || reps < 1) { alert('Please enter a valid rep count.'); return; }
  if (isNaN(sets) || sets < 1) { alert('Please enter a valid set count.'); return; }
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
    if (exerciseParams) newItem.exerciseParams = exerciseParams;
    await db.collection('protocols').doc(patientEmail).set({ items: [...existing, newItem] });
  }
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
    ${p.notes ? `<p class="proto-notes">"${p.notes}"</p>` : ''}
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
    .forEach(s => { doneById[s.protocolId] = (doneById[s.protocolId] || 0) + 1; });

  _exercisesProtocols = protocols;

  inner.innerHTML = `<div class="exs-card-grid">${protocols.map((p, i) => {
    const doneSets = doneById[p.id] || 0;
    const totalSetsNeeded = p.sets || 3;
    const isDone = doneSets >= totalSetsNeeded;
    const progressText = isDone
      ? `<span class="exs-done-badge">Done today</span>`
      : doneSets > 0
        ? `<span class="exs-progress-text">${doneSets} / ${totalSetsNeeded} sets done today</span>`
        : '';
    return `
    <div class="exs-hero-card ${isDone ? 'exs-status-done' : doneSets > 0 ? 'exs-status-partial' : ''}">
      <div class="exs-hero-name">${exerciseLabels[p.exerciseType] || p.exerciseType}</div>
      <div class="exs-detail-line">${p.reps} reps × ${p.sets} sets · ${frequencyLabels[p.frequency] || p.frequency}</div>
      <div class="exs-assigned-by">Prescribed by ${p.assignedBy}</div>
      ${p.notes ? `<p class="exs-notes-text">"${p.notes}"</p>` : ''}
      ${progressText}
      <button class="exs-start-btn"
        onclick="startSessionWithProtocol(_exercisesProtocols[${i}])">${isDone ? 'Do Again' : 'Start Session'}</button>
    </div>`;
  }).join('')}</div>`;

  showScreen('exercisesScreen');
}

/* ══════════════════════════════════════════════════════════════════════════
   SECTION 8: THERAPIST PANEL
   ══════════════════════════════════════════════════════════════════════════ */

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
    const sessions  = await getPatientSessions(patient.email);
    const compliance = calcCompliance(sessions);
    const statusColor = compliance >= 80 ? '#22c55e' : compliance >= 50 ? '#f59e0b' : '#ef4444';
    const statusText  = compliance >= 80 ? 'On track' : compliance >= 50 ? 'At risk' : sessions.length === 0 ? 'No sessions yet' : 'Non-compliant';
    item.innerHTML = `
      <div class="patient-name">${patient.name}</div>
      <div class="patient-connected" style="color:${statusColor}">
        ● ${statusText}${sessions.length > 0 ? ` — ${compliance}% compliance` : ''}
      </div>`;
    item.onclick = () => {
      document.querySelectorAll('.patient-item').forEach(i => i.classList.remove('selected'));
      item.classList.add('selected');
      showRealPatient(patient);
    };
    document.querySelector('.sidebar-footer').before(item);
  }
}

// ── Mobile therapist panel helpers ────────────────────────────────────────────
function backToPatientList() {
  document.getElementById('therapistScreen').classList.remove('tp-mobile-detail');
  document.querySelectorAll('.patient-item').forEach(i => i.classList.remove('selected'));
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
  panel.insertAdjacentHTML('afterbegin', '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px;"><button class="tp-mobile-back-btn" style="padding:0" onclick="backToPatientList()">← All Patients</button><button class="tp-mobile-back-btn" style="padding:0" onclick="startCalibration()">Calibrate</button></div>');
}

// ── Calibration back button (named so Vite module can export it) ──────────────
function calibBack() {
  showScreen(currentRole === 'therapist' ? 'therapistScreen' : 'patientScreen');
}

// Seeded sessions for demo patient — always present regardless of localStorage state.
// daysAgo is relative to today so the data always looks recent.
function getDemoSessions(patientEmail) {
  if (patientEmail !== 'james.park@gmail.com') return [];
  const th = 'sarah.chen@mayoclinic.org';
  // [daysAgo, reps, rom, pain] — gradual improvement arc over ~3 weeks
  const templates = [
    [21,  8,  42, 7],
    [19,  9,  48, 6],
    [17, 10,  55, 7],
    [14, 10,  58, 5],
    [12, 11,  64, 5],
    [10, 12,  68, 4],
    [ 7, 12,  72, 4],
    [ 5, 13,  78, 3],
    [ 3, 14,  82, 3],
    [ 1, 15,  88, 2],
  ];
  return templates.map(([daysAgo, reps, rom, pain]) => {
    const d = new Date();
    d.setDate(d.getDate() - daysAgo);
    d.setHours(9, 30, 0, 0);
    return { date: d.toISOString(), reps, rom, pain, tam: Math.round(rom * 2.8), therapistEmail: th };
  });
}

async function getPatientSessions(patientEmail) {
  const snap = await db.collection('sessions')
    .where('patientEmail', '==', patientEmail)
    .orderBy('date', 'asc').get();
  const stored = snap.docs.map(d => d.data());
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
}

async function showRealPatient(patient) {
  const [sessions, protocols] = await Promise.all([
    getPatientSessions(patient.email),
    getProtocols(patient.email)
  ]);
  const panel = document.getElementById('mainPanel');

  if (sessions.length === 0) {
    panel.innerHTML = `
      <h3>${patient.name}</h3>
      <p class="subtitle">Connected Patient</p>
      <button class="sweep-launch-btn" onclick="startSweepCalibration('${patient.email}')">Sweep Calibration</button>
      <button class="sweep-launch-btn" onclick="startMLTrainer()">ML Trainer</button>
      <div class="chart-card" style="text-align:center; color:#475569; padding:40px;">
        No session data yet. Data will appear here once ${patient.name.split(' ')[0]} completes their first session.
      </div>
      ${makeCollapsible('joints', 'Joint Monitoring', buildJointSelector(patient.email), false)}
      ${makeCollapsible('history', 'Session History', buildSessionHistory(sessions, patient.name), false)}
      ${makeCollapsible('protocol', 'Add Exercise to Protocol', buildProtocolForm(patient.email, protocols), false)}
      ${makeCollapsible('messages', 'Messages', buildMessagePanel(patient.email), false)}`;
    await markRead(currentUser.email, patient.email);
    document.getElementById('therapistMsgSend').onclick = async () => {
      const input = document.getElementById('therapistMsgInput');
      await sendMessage(currentUser.email, patient.email, input.value);
      input.value = '';
      await renderThread('therapistMsgThread', currentUser.email, patient.email);
    };
    await renderThread('therapistMsgThread', currentUser.email, patient.email);
    enableMobilePatientDetail(panel);
    await ejsInit(patient.email, sessions);
    updateExerciseParamsUI('full_fist', null);
    return;
  }

  const compliance      = calcCompliance(sessions);
  const avgROM          = Math.round(sessions.reduce((s, x) => s + (x.rom  || 0), 0) / sessions.length);
  const avgPain         = (sessions.reduce((s, x) => s + (x.pain || 0), 0) / sessions.length).toFixed(1);
  const totalReps       = sessions.reduce((s, x) => s + (x.reps || 0), 0);
  const complianceColor = compliance >= 80 ? '#22c55e' : compliance >= 50 ? '#f59e0b' : '#ef4444';
  const recent          = sessions.slice(-8);
  const romData         = recent.map(s => s.rom  || 0);
  const painData        = recent.map(s => s.pain || 0);
  const labels          = recent.map(s => {
    const d = new Date(s.date);
    return `${d.getMonth()+1}/${d.getDate()} ${d.getHours()}:${String(d.getMinutes()).padStart(2,'0')}`;
  });

  panel.innerHTML = `
    <h3>${patient.name}</h3>
    <p class="subtitle">Connected Patient — ${sessions.length} session${sessions.length !== 1 ? 's' : ''} recorded</p>
    <button class="sweep-launch-btn" onclick="startSweepCalibration('${patient.email}')">Sweep Calibration</button>
    <button class="sweep-launch-btn" onclick="startMLTrainer()">ML Trainer</button>
    <div class="stats-row">
      <div class="stat-card"><div class="stat-value" style="color:${complianceColor}">${compliance}%</div><div class="stat-label">7-Day Compliance</div></div>
      <div class="stat-card"><div class="stat-value">${avgROM}°</div><div class="stat-label">Avg Range of Motion</div></div>
      <div class="stat-card"><div class="stat-value">${avgPain}</div><div class="stat-label">Avg Pain Rating</div></div>
    </div>
    <div class="stats-row stats-row-full">
      <div class="stat-card stat-card-full"><div class="stat-value stat-value-sm">${totalReps} reps</div><div class="stat-label">Total Reps All Time</div></div>
    </div>
    <div class="tp-charts-grid">
    ${makeCollapsible('rom',     'Range of Motion Over Time', '<canvas id="romChart" height="100"></canvas>', true)}
    ${makeCollapsible('pain',    'Pain Rating Over Time',     '<canvas id="painChart" height="100"></canvas>', true)}
    </div>
    ${makeCollapsible('joints',  'Joint Monitoring',          buildJointSelector(patient.email), false)}
    ${makeCollapsible('history', `Session History — ${sessions.length} session${sessions.length !== 1 ? 's' : ''}`, buildSessionHistory(sessions, patient.name), false)}
    ${makeCollapsible('protocol','Add Exercise to Protocol',  buildProtocolForm(patient.email, protocols), false)}
    ${makeCollapsible('messages','Messages',                  buildMessagePanel(patient.email), false)}`;

  new Chart(document.getElementById('romChart').getContext('2d'), {
    type: 'line',
    data: { labels, datasets: [{ data: romData, borderColor: '#3b82f6', backgroundColor: 'rgba(59,130,246,0.1)', borderWidth: 2, pointBackgroundColor: '#3b82f6', pointRadius: 4, tension: 0.4, fill: true }] },
    options: { plugins: { legend: { display: false } }, scales: { x: { ticks: { color: '#64748b', maxRotation: 45 }, grid: { color: '#1e293b' } }, y: { ticks: { color: '#64748b' }, grid: { color: '#1e293b' }, min: 0, max: 180 } } }
  });
  new Chart(document.getElementById('painChart').getContext('2d'), {
    type: 'line',
    data: { labels, datasets: [{ data: painData, borderColor: '#ef4444', backgroundColor: 'rgba(239,68,68,0.1)', borderWidth: 2, pointBackgroundColor: '#ef4444', pointRadius: 4, tension: 0.4, fill: true }] },
    options: { plugins: { legend: { display: false } }, scales: { x: { ticks: { color: '#64748b', maxRotation: 45 }, grid: { color: '#1e293b' } }, y: { ticks: { color: '#64748b' }, grid: { color: '#1e293b' }, min: 0, max: 10 } } }
  });

  await markRead(currentUser.email, patient.email);
  document.getElementById('therapistMsgSend').onclick = async () => {
    const input = document.getElementById('therapistMsgInput');
    await sendMessage(currentUser.email, patient.email, input.value);
    input.value = '';
    await renderThread('therapistMsgThread', currentUser.email, patient.email);
  };
  await renderThread('therapistMsgThread', currentUser.email, patient.email);
  enableMobilePatientDetail(panel);
  await ejsInit(patient.email, sessions);
  updateExerciseParamsUI('full_fist', null);
}

function buildSessionHistory(sessions, patientName) {
  if (sessions.length === 0) {
    return `<div class="session-history-card"><h4>Session History</h4><div style="color:var(--muted); font-size:0.85rem; text-align:center; padding:20px;">No sessions recorded yet.</div></div>`;
  }
  const VIDEO_EXPIRY_DAYS = 30;
  const nameSafe = (patientName || '').replace(/\s+/g, '-').replace(/[^a-zA-Z0-9-]/g, '');
  const rows = [...sessions].reverse().map(s => {
    const d       = new Date(s.date);
    const dateStr = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    const timeStr = d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
    const pain      = s.pain || 0;
    const rom       = s.rom  || 0;
    const painColor = pain <= 3 ? 'var(--green)' : pain <= 6 ? '#f59e0b' : 'var(--danger)';
    const romColor  = rom >= 120 ? 'var(--green)' : rom >= 80 ? '#f59e0b' : 'var(--muted)';
    const exLabel   = s.exerciseType ? (exerciseLabels[s.exerciseType] || s.exerciseType) : '';
    const sessionAge = (Date.now() - new Date(s.date).getTime()) / (1000 * 60 * 60 * 24);
    const videoCell = s.videoUrl && sessionAge <= VIDEO_EXPIRY_DAYS
      ? `<td class="sh-cell sh-video"><span class="session-video-actions"><button class="session-video-btn" onclick="openVideoModal('${s.videoUrl}','${s.date}','${nameSafe}')">▶ Watch</button><button class="session-video-btn session-video-btn--dl" onclick="downloadSessionVideo('${s.videoUrl}','${s.date}','${nameSafe}')">↓</button></span></td>`
      : s.videoUrl && sessionAge > VIDEO_EXPIRY_DAYS
        ? `<td class="sh-cell sh-video"><span class="session-video-actions"><span class="session-video-btn session-video-btn--expired">Expired</span></span></td>`
        : `<td class="sh-cell sh-video"><span class="session-video-actions"><span class="session-video-btn session-video-btn--none">No video</span></span></td>`;
    return `
      <tr class="sh-row">
        <td class="sh-cell sh-date"><span class="sh-date-text">${dateStr}</span><span class="sh-time-text">${timeStr}</span></td>
        <td class="sh-cell sh-exercise">${exLabel}</td>
        <td class="sh-cell sh-reps">${s.reps || 0}</td>
        <td class="sh-cell sh-rom" style="color:${romColor}">${rom}°</td>
        <td class="sh-cell sh-pain"><span class="session-pain-dot" style="background:${painColor}"></span><span style="color:${painColor}">${pain}/10</span></td>
        ${videoCell}
      </tr>`;
  }).join('');
  return `
    <div class="session-history-card">
      <h4>Session History — ${sessions.length} session${sessions.length !== 1 ? 's' : ''}</h4>
      <div class="sh-table-wrap">
        <table class="sh-table">
          <thead><tr>
            <th class="sh-th">Date</th>
            <th class="sh-th">Exercise</th>
            <th class="sh-th">Reps</th>
            <th class="sh-th">ROM</th>
            <th class="sh-th">Pain</th>
            <th class="sh-th">Video</th>
          </tr></thead>
          <tbody>${rows}</tbody>
        </table>
      </div>
    </div>`;
}

function buildProtocolForm(patientEmail, protocols) {
  const existingHTML = protocols.length > 0 ? `
    <div class="proto-existing-section">
      <div class="proto-existing-title">Current Protocol · ${protocols.length} exercise${protocols.length !== 1 ? 's' : ''}</div>
      ${protocols.map(p => `
        <div class="proto-card">
          <div class="proto-card-header">
            <span class="proto-card-name">${exerciseLabels[p.exerciseType] || p.exerciseType}</span>
            <div class="protocol-action-btns">
              <button class="protocol-edit-btn" onclick="editProtocol('${patientEmail}', '${p.id}')">Edit</button>
              <button class="protocol-delete-btn" onclick="deleteProtocol('${patientEmail}', '${p.id}')">Remove</button>
            </div>
          </div>
          ${formatProtocol(p)}
        </div>
      `).join('')}
    </div>` : '';

  return `
    <div class="protocol-card">
      <h4>Add Exercise to Protocol</h4>
      <div class="protocol-form">
        <div class="protocol-field">
          <label>Exercise Type</label>
          <select id="exerciseType" onchange="updateExerciseParamsUI(this.value, null)">
            <optgroup label="Full Hand">
              <option value="full_fist">Full Fist</option>
              <option value="hook_fist">Hook Fist</option>
              <option value="tabletop_position">Tabletop Position</option>
              <option value="grip_squeeze">Grip Squeeze</option>
            </optgroup>
            <optgroup label="Individual Fingers">
              <option value="index_flexion">Index Finger Flexion</option>
              <option value="middle_flexion">Middle Finger Flexion</option>
              <option value="ring_flexion">Ring Finger Flexion</option>
              <option value="pinky_flexion">Pinky Flexion</option>
              <option value="thumb_flexion">Thumb Flexion</option>
              <option value="finger_flexion">Finger Flexion</option>
              <option value="finger_extension">Finger Extension</option>
            </optgroup>
            <optgroup label="Opposition / Spread">
              <option value="thumb_index_opposition">Thumb to Index Opposition</option>
              <option value="thumb_opposition">Thumb Opposition</option>
              <option value="finger_abduction">Finger Abduction</option>
            </optgroup>
          </select>
        </div>
        <div id="exerciseParamsSection" class="ep-container"></div>
        <div class="proto-dosage-row">
          <div class="protocol-field">
            <label>Reps</label>
            <input type="number" id="protocolReps" value="10" min="1" max="50" />
          </div>
          <div class="protocol-field">
            <label>Sets</label>
            <input type="number" id="protocolSets" value="3" min="1" max="10" />
          </div>
          <div class="protocol-field">
            <label>Frequency</label>
            <select id="protocolFrequency">
              <option value="daily">Daily</option>
              <option value="twice_daily">Twice Daily</option>
              <option value="every_other">Every Other Day</option>
              <option value="three_week">3x Per Week</option>
            </select>
          </div>
        </div>
        <div class="protocol-field">
          <label>Notes for Patient</label>
          <textarea id="protocolNotes" placeholder="e.g. Move slowly and stop if pain exceeds 6/10..." rows="2"></textarea>
        </div>
        <button class="protocol-btn" onclick="assignProtocol('${patientEmail}')">Add to Protocol</button>
        <div id="protocolSuccess" class="auth-success" style="display:none; margin-top:12px;">Protocol assigned successfully</div>
      </div>
      ${existingHTML}
    </div>`;
}

function epUpdateRequireAllVisibility() {
  const count = document.querySelectorAll('#epConditionsList .ep-condition-row').length;
  const row   = document.getElementById('epRequireAllRow');
  if (row) row.style.display = count > 1 ? 'flex' : 'none';
  document.querySelectorAll('.ep-remove-btn').forEach(btn => {
    btn.style.visibility = count > 1 ? 'visible' : 'hidden';
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

  const sel = document.getElementById('exerciseType');
  if (sel && exerciseType) sel.value = exerciseType;

  const defaults = EXERCISE_DEFAULTS[exerciseType];
  if (!defaults) { container.innerHTML = ''; return; }

  if (defaults.metric === 'distance') {
    const tipName = defaults.tipB === 8 ? 'index finger' : defaults.tipB === 12 ? 'middle finger' : 'target finger';
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

function updateRepFeedback(state) {
  const el = document.getElementById('repFeedback');
  if (!el) return;

  if (!currentExerciseParams || !state) {
    el.textContent = '';
    return;
  }

  const needBend = fingerState !== 'flexed';

  // Distance / abduction metrics — no per-finger conditions
  if (!state.conditions) {
    const isAbduction = currentExerciseParams.metric === 'abduction';
    if (isAbduction) {
      el.textContent = needBend ? 'Spread your fingers' : 'Bring your fingers together';
    } else {
      el.textContent = needBend ? 'Close your hand' : 'Open your hand';
    }
    return;
  }

  // Angle metric — find which fingers still need to move
  const pending = needBend
    ? state.conditions.filter(c => !c.isFlexed)
    : state.conditions.filter(c => !c.isExtended);

  const targets = pending.length > 0 ? pending : state.conditions;
  const names   = [...new Set(targets.map(c => fingerLabel(c.finger)))];
  const fingerStr = names.length === 1
    ? names[0]
    : names.slice(0, -1).join(', ') + ' and ' + names[names.length - 1];

  el.textContent = needBend ? `Bend your ${fingerStr}` : `Straighten your ${fingerStr}`;
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
    total += calibGetAngle(landmarks[j.a], landmarks[j.b], landmarks[j.c]);
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
    sessionPaused = true;
  }
}

async function saveSession() {
  const doc = {
    patientEmail:   currentUser.email,
    date:           new Date().toISOString(),
    reps:           repCount,
    pain:           parseInt(document.getElementById('painSliderCongrats').value),
    rom:            lastROM,
    tam:            lastTAM,
    therapistEmail: await getConnectedTherapist(),
    exerciseType:   selectedProtocol?.exerciseType || '',
    protocolId:     selectedProtocol?.id || ''
  };
  if (Object.keys(jointMaxAngles).length > 0) doc.jointAngles = { ...jointMaxAngles };
  const docRef = await db.collection('sessions').add(doc);
  _pendingSessionDocId = docRef.id;
  jointMaxAngles = {}; // reset after save so each set starts fresh

  if (recordingSupported) {
    const blob = await stopRecording();
    uploadSessionVideo(blob, docRef.id, currentUser.email);
    startRecording(document.getElementById('patientCanvas'));
  }
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

function renderRepDots() {
  const container = document.getElementById('repDots');
  if (!container) return;
  if (TARGET_REPS > 20) { container.innerHTML = ''; return; }
  container.innerHTML = '';
  for (let i = 1; i <= TARGET_REPS; i++) {
    const dot = document.createElement('div');
    dot.className = 'rep-dot';
    if (i <= repCount)           dot.classList.add('done');
    else if (i === repCount + 1) dot.classList.add('active-rep');
    container.appendChild(dot);
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
  document.getElementById('allSetsComplete').style.display = 'none';
  document.getElementById('nextSetBtn').textContent = 'Start Next Set';
  if (setsComplete >= totalSets) { showSessionSummary(); return; }
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
    message = 'Excellent range of motion today! You\'re making great progress.';
  } else if (maxROM >= 80) {
    message = 'Good session. Consistency is key — keep it up!';
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
  await initSetTracker();
  showScreen('patientScreen');
  await updatePatientHomeScreen();
}

async function completeSessionEarly() {
  // Stop rest timer if running
  clearInterval(restTimerInterval);
  restTimerInterval = null;
  document.getElementById('restTimerOverlay').style.display = 'none';
  sessionPaused = false;

  // Hide congrats overlay if visible
  document.getElementById('congratsOverlay').classList.remove('show');

  // Save current partial set if any reps were completed
  if (repCount > 0) {
    const painVal = parseInt(document.getElementById('painSlider').value);
    setPainValues.push(painVal);
    const doc = {
      patientEmail:   currentUser.email,
      date:           new Date().toISOString(),
      reps:           repCount,
      pain:           painVal,
      rom:            lastROM,
      tam:            lastTAM,
      therapistEmail: await getConnectedTherapist(),
      exerciseType:   selectedProtocol?.exerciseType || '',
      protocolId:     selectedProtocol?.id || ''
    };
    if (Object.keys(jointMaxAngles).length > 0) doc.jointAngles = { ...jointMaxAngles };
    const docRef = await db.collection('sessions').add(doc);
    _pendingSessionDocId = docRef.id;
  }

  if (recordingSupported) {
    const blob = await stopRecording();
    if (_pendingSessionDocId) uploadSessionVideo(blob, _pendingSessionDocId, currentUser.email);
  }

  showSessionSummary(repCount > 0 ? repCount : 0);
}

/* ══════════════════════════════════════════════════════════════════════════
   SECTION 11: PATIENT SESSION CAMERA  (dashboard camera)
   ══════════════════════════════════════════════════════════════════════════ */

let currentFacingMode = 'user';

async function flipCamera() {
  currentFacingMode = currentFacingMode === 'user' ? 'environment' : 'user';
  if (mpCamera) { mpCamera.stop(); mpCamera = null; }
  if (mediaRecorder && mediaRecorder.state !== 'inactive') {
    await stopRecording();
    recordedChunks = [];
  }
  startCamera();
}

function isMobile() {
  return /Mobi|Android|iPhone|iPad/i.test(navigator.userAgent);
}

let mpCamera = null;

function startCamera() {
  if (mpCamera) return;
  mediaRecorder = null; recordedChunks = []; recordingSupported = false; _pendingSessionDocId = null;
  const sessionVideo  = document.getElementById('patientVideo');
  const sessionCanvas = document.getElementById('patientCanvas');
  const sessionCtx    = sessionCanvas.getContext('2d');
  let hands;
  try {
    hands = new window.Hands({ locateFile: f => `https://cdn.jsdelivr.net/npm/@mediapipe/hands/${f}` });
  } catch(e) {
    alert('Hands init error: ' + e.message);
    return;
  }
  hands.setOptions({ maxNumHands: 1, modelComplexity: isMobile() ? 0 : 1, minDetectionConfidence: 0.7, minTrackingConfidence: 0.5 });
  hands.onResults(results => {
    sessionCtx.clearRect(0, 0, sessionCanvas.width, sessionCanvas.height);
    sessionCtx.drawImage(results.image, 0, 0, sessionCanvas.width, sessionCanvas.height);
    const _rawHand = (results.multiHandedness?.[0]?.label || '').toLowerCase();
    _currentHandLabel = _rawHand === 'left' ? 'right' : _rawHand === 'right' ? 'left' : null;
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
            startRecording(sessionCanvas);
          };
          mpCamera = {
            stop: () => {
              active = false;
              stream.getTracks().forEach(t => t.stop());
              sessionVideo.srcObject = null;
            }
          };
        })
        .catch(err => { alert('Camera error: ' + err.name + ': ' + err.message); });
    };

    doGetUserMedia();
  } else {
    mpCamera = new window.Camera(sessionVideo, {
      onFrame: async () => {
        if (sessionVideo.readyState >= 2) await hands.send({ image: sessionVideo });
      },
      width: 640, height: 480,
    });
    mpCamera.start();
    startRecording(sessionCanvas);
  }
}

/* ══════════════════════════════════════════════════════════════════════════
   SECTION 12: PROGRESS SCREEN
   ══════════════════════════════════════════════════════════════════════════ */

async function showProgressScreen() {
  if (mpCamera) { mpCamera.stop(); mpCamera = null; }
  showScreen('progressScreen');
  await renderProgressScreen();
}

async function renderProgressScreen() {
  const sessions = currentUser ? await getPatientSessions(currentUser.email) : [];
  const content  = document.getElementById('progressContent');
  if (sessions.length === 0) {
    content.innerHTML = `<div class="no-progress-msg">No sessions recorded yet.<br/>Complete a set of reps to see your progress here.</div>`;
    return;
  }
  const totalReps = sessions.reduce((s, x) => s + (x.reps || 0), 0);
  const avgROM    = Math.round(sessions.reduce((s, x) => s + (x.rom  || 0), 0) / sessions.length);
  const bestROM   = Math.max(...sessions.map(s => s.rom || 0));
  const avgPain   = (sessions.reduce((s, x) => s + (x.pain || 0), 0) / sessions.length).toFixed(1);
  const recent    = sessions.slice(-10);
  const romData   = recent.map(s => s.rom || 0);
  const painData  = recent.map(s => s.pain || 0);
  const labels    = recent.map(s => { const d = new Date(s.date); return `${d.getMonth()+1}/${d.getDate()}`; });
  const historyHTML = [...sessions].reverse().map(s => {
    const d       = new Date(s.date);
    const dateStr = d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
    return `
      <div class="progress-session-card">
        <div><div class="progress-session-date">${dateStr}</div></div>
        <div class="progress-session-stats">
          <div class="progress-stat"><div class="progress-stat-value">${s.reps || 0}</div><div class="progress-stat-label">Reps</div></div>
          <div class="progress-stat"><div class="progress-stat-value">${s.rom || 0}°</div><div class="progress-stat-label">ROM</div></div>
          <div class="progress-stat"><div class="progress-stat-value" style="color:#ef4444">${s.pain || 0}</div><div class="progress-stat-label">Pain</div></div>
        </div>
      </div>`;
  }).join('');
  content.innerHTML = `
    <div class="stats-row" style="margin-bottom:24px;">
      <div class="stat-card"><div class="stat-value">${sessions.length}</div><div class="stat-label">Total Sessions</div></div>
      <div class="stat-card"><div class="stat-value">${totalReps}</div><div class="stat-label">Total Reps</div></div>
      <div class="stat-card"><div class="stat-value">${avgROM}°</div><div class="stat-label">Avg ROM</div></div>
      <div class="stat-card"><div class="stat-value" style="color:#0B6CB0">${bestROM}°</div><div class="stat-label">Best ROM</div></div>
      <div class="stat-card"><div class="stat-value" style="color:#ef4444">${avgPain}</div><div class="stat-label">Avg Pain</div></div>
    </div>
    <div class="chart-card" style="margin-bottom:24px;">
      <h4>Range of Motion Over Time</h4>
      <canvas id="patientRomChart" height="100"></canvas>
    </div>
    <div class="chart-card" style="margin-bottom:24px;">
      <h4>Pain Level Over Time</h4>
      <canvas id="patientPainChart" height="100"></canvas>
    </div>
    <p style="font-size:0.8rem; color:var(--muted); margin-bottom:12px; text-transform:uppercase; letter-spacing:0.5px;">Session History</p>
    <div class="progress-history-grid">${historyHTML}</div>`;
  new Chart(document.getElementById('patientRomChart').getContext('2d'), {
    type: 'line',
    data: { labels, datasets: [{ data: romData, borderColor: '#0B6CB0', backgroundColor: 'rgba(16,185,129,0.08)', borderWidth: 2, pointBackgroundColor: '#10B981', pointRadius: 5, pointBorderColor: '#0B6CB0', pointBorderWidth: 2, tension: 0.4, fill: true }] },
    options: { plugins: { legend: { display: false } }, scales: { x: { ticks: { color: '#6B7A99' }, grid: { color: '#C8D8D4' } }, y: { ticks: { color: '#6B7A99' }, grid: { color: '#C8D8D4' }, min: 0, max: 180 } } }
  });
  new Chart(document.getElementById('patientPainChart').getContext('2d'), {
    type: 'line',
    data: { labels, datasets: [{ data: painData, borderColor: '#ef4444', backgroundColor: 'rgba(239,68,68,0.08)', borderWidth: 2, pointBackgroundColor: '#ef4444', pointRadius: 5, pointBorderColor: '#CC2936', pointBorderWidth: 2, tension: 0.4, fill: true }] },
    options: { plugins: { legend: { display: false } }, scales: { x: { ticks: { color: '#6B7A99' }, grid: { color: '#C8D8D4' } }, y: { ticks: { color: '#6B7A99' }, grid: { color: '#C8D8D4' }, min: 0, max: 10 } } }
  });
}

/* ══════════════════════════════════════════════════════════════════════════
   SECTION 13: JOINT SELECTOR  (therapist panel) — Enhanced
   ══════════════════════════════════════════════════════════════════════════ */

const EJS_FINGER_COLORS = {
  thumb: '#F5A623', index: '#2D7FF9', middle: '#00C9B1', ring: '#A78BFA', pinky: '#F04B4B'
};
const EJS_FINGER_LABELS = {
  thumb: 'Thumb', index: 'Index', middle: 'Middle', ring: 'Ring', pinky: 'Pinky'
};
const EJS_FINGERS = ['thumb', 'index', 'middle', 'ring', 'pinky'];
const EJS_JOINTS  = ['mcp', 'pip', 'dip', 'tip'];
const EJS_PRIORITY_COLORS = { Critical: '#CC2936', High: '#F59E0B', Medium: '#005EB8', Low: '#8A9AB0' };

const EJS_JOINT_DATA = {
  'thumb-mcp':  { label:'MP',  fullName:'Metacarpophalangeal Joint',       lm:2,  maxROM:60,  jointType:'Condyloid', priority:'High',     finger:'thumb',  desc:"The thumb's basal knuckle, enabling opposition and key pinch mechanics. Critical for grip strength assessment. Stiffness here often indicates early CMC arthritis or post-fracture contracture." },
  'thumb-pip':  { label:'IP',  fullName:'Interphalangeal Joint',           lm:3,  maxROM:80,  jointType:'Hinge',     priority:'Medium',   finger:'thumb',  desc:"The thumb's only interphalangeal joint. Monitors flexor/extensor tendon integrity. Loss of active extension may indicate extensor pollicis longus rupture." },
  'thumb-dip':  { label:'—',   fullName:'N/A (Thumb has no DIP)',          lm:null,maxROM:null,jointType:'—',        priority:'—',        finger:'thumb',  desc:'Thumb has only two phalanges and therefore no DIP joint.' },
  'thumb-tip':  { label:'TIP', fullName:'Distal Phalanx — Tip',           lm:4,  maxROM:null,jointType:'Reference', priority:'Low',      finger:'thumb',  desc:'Fingertip landmark used for opposition distance calculations and precision pinch tracking.' },
  'index-mcp':  { label:'MCP', fullName:'Metacarpophalangeal Joint',       lm:5,  maxROM:90,  jointType:'Condyloid', priority:'High',     finger:'index',  desc:'Primary power grip knuckle. Monitors flexor digitorum profundus integrity and dorsal hood mechanism. Hyperextension may indicate volar plate laxity post-dislocation.' },
  'index-pip':  { label:'PIP', fullName:'Proximal Interphalangeal Joint',  lm:6,  maxROM:100, jointType:'Hinge',     priority:'Critical', finger:'index',  desc:'The most commonly injured joint in the hand. Boutonnière and swan neck deformities originate here. Primary target for ROM tracking after ORIF, tendon repair, or arthroplasty.' },
  'index-dip':  { label:'DIP', fullName:'Distal Interphalangeal Joint',    lm:7,  maxROM:70,  jointType:'Hinge',     priority:'Medium',   finger:'index',  desc:'Monitors flexor digitorum profundus and terminal extensor tendon function. Mallet finger presents as loss of active DIP extension.' },
  'index-tip':  { label:'TIP', fullName:'Distal Phalanx — Tip',           lm:8,  maxROM:null,jointType:'Reference', priority:'Low',      finger:'index',  desc:'Index fingertip reference for grip reach, tool manipulation tracking, and opposition distance from thumb.' },
  'middle-mcp': { label:'MCP', fullName:'Metacarpophalangeal Joint',       lm:9,  maxROM:90,  jointType:'Condyloid', priority:'High',     finger:'middle', desc:'Central axis of the hand. The reference joint for fist formation and composite flexion. Primary metric for post-surgical hook fist and full fist progression protocols.' },
  'middle-pip': { label:'PIP', fullName:'Proximal Interphalangeal Joint',  lm:10, maxROM:100, jointType:'Hinge',     priority:'Critical', finger:'middle', desc:'Current primary rep-counting joint in PhalanX. Used for open-close cycle detection. Highest sensitivity for edema-related stiffness and tendon adhesion assessment.' },
  'middle-dip': { label:'DIP', fullName:'Distal Interphalangeal Joint',    lm:11, maxROM:70,  jointType:'Hinge',     priority:'Medium',   finger:'middle', desc:'FDP slip assessment point. Decreased active DIP flexion with intact PIP motion indicates a partial FDP rupture or zone 1 injury pattern.' },
  'middle-tip': { label:'TIP', fullName:'Distal Phalanx — Tip',           lm:12, maxROM:null,jointType:'Reference', priority:'Low',      finger:'middle', desc:'Longest reach point of the hand. Used for composite fist-to-palm distance (fingertip-to-distal palmar crease gap), a standard clinical ROM outcome measure.' },
  'ring-mcp':   { label:'MCP', fullName:'Metacarpophalangeal Joint',       lm:13, maxROM:90,  jointType:'Condyloid', priority:'Medium',   finger:'ring',   desc:'Commonly affected in rheumatoid arthritis with ulnar drift deformity. Monitors intrinsic muscle function and MCP joint capsule integrity after arthroplasty.' },
  'ring-pip':   { label:'PIP', fullName:'Proximal Interphalangeal Joint',  lm:14, maxROM:100, jointType:'Hinge',     priority:'High',     finger:'ring',   desc:"Frequently stiff in crush injuries and ring avulsion. Tracks central slip integrity and oblique retinacular ligament tightness — a key indicator in Dupuytren's contracture progression." },
  'ring-dip':   { label:'DIP', fullName:'Distal Interphalangeal Joint',    lm:15, maxROM:70,  jointType:'Hinge',     priority:'Low',      finger:'ring',   desc:'FDP terminal slip assessment. Ring finger DIP mallet deformity is less common but clinically significant in athletic hand trauma.' },
  'ring-tip':   { label:'TIP', fullName:'Distal Phalanx — Tip',           lm:16, maxROM:null,jointType:'Reference', priority:'Low',      finger:'ring',   desc:'Ring fingertip reference landmark. Used in abduction spread calculations and fingertip-to-palm composite reach measurements.' },
  'pinky-mcp':  { label:'MCP', fullName:'Metacarpophalangeal Joint',       lm:17, maxROM:90,  jointType:'Condyloid', priority:'Medium',   finger:'pinky',  desc:"Site of boxer's fracture (5th metacarpal neck fracture). Monitors post-fracture angulation correction and extensor lag. Important for power grip and hypothenar muscle function." },
  'pinky-pip':  { label:'PIP', fullName:'Proximal Interphalangeal Joint',  lm:18, maxROM:100, jointType:'Hinge',     priority:'High',     finger:'pinky',  desc:'Pinky PIP stiffness significantly impacts grip width and keyboard/instrument function. Monitors FDS slip integrity and volar plate healing.' },
  'pinky-dip':  { label:'DIP', fullName:'Distal Interphalangeal Joint',    lm:19, maxROM:70,  jointType:'Hinge',     priority:'Low',      finger:'pinky',  desc:'Terminal phalanx position affects fine motor coordination for writing and musical instrument performance.' },
  'pinky-tip':  { label:'TIP', fullName:'Distal Phalanx — Tip',           lm:20, maxROM:null,jointType:'Reference', priority:'Low',      finger:'pinky',  desc:'Pinky tip reference for grip span measurement and abduction spread calculations.' },
};

let selectedJoints    = new Set();
let ejsActiveInfoKey  = null;
let _ejsPatientEmail  = '';
let _ejsSessions      = [];
let _ejsChartInstances = [];
let _ejsSaveTimer     = null;

function buildJointSelector(patientEmail) {
  // Build finger blocks for the grid column
  const fingerBlocks = EJS_FINGERS.map(finger => {
    const cards = EJS_JOINTS.map(joint => {
      const key  = `${finger}-${joint}`;
      const data = EJS_JOINT_DATA[key];
      if (!data || data.lm === null) {
        return `<div class="ejs-joint-card ejs-disabled" style="color:${EJS_FINGER_COLORS[finger]}">
          <div class="ejs-joint-card-label" style="opacity:0.3">—</div>
          <div class="ejs-joint-card-name" style="opacity:0.3">N/A</div>
        </div>`;
      }
      return `<div class="ejs-joint-card" id="ejscard-${key}" style="color:${EJS_FINGER_COLORS[finger]}"
                   onclick="ejsSelectCard('${key}')">
        <div class="ejs-joint-check" id="ejscheck-${key}">
          <svg viewBox="0 0 8 8" fill="none"><polyline points="1,4 3,6 7,2" stroke="white" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>
        </div>
        <div class="ejs-joint-card-label">${data.label}</div>
        <div class="ejs-joint-card-name">${data.fullName.split(' ').slice(0,2).join(' ')}</div>
        <div class="ejs-joint-card-lm">LM ${data.lm}</div>
      </div>`;
    }).join('');
    return `<div class="ejs-finger-block">
      <div class="ejs-finger-block-header">
        <div class="ejs-finger-color-bar" style="background:${EJS_FINGER_COLORS[finger]}"></div>
        <span class="ejs-finger-name">${EJS_FINGER_LABELS[finger]}</span>
        <span class="ejs-finger-sel-count" id="ejsfcount-${finger}">0 / 4</span>
      </div>
      <div class="ejs-joint-row">${cards}</div>
    </div>`;
  }).join('');

  // Finger pills
  const pills = EJS_FINGERS.map(f =>
    `<div class="ejs-finger-pill" id="ejspill-${f}" data-finger="${f}"
          style="border-color:${EJS_FINGER_COLORS[f]};color:${EJS_FINGER_COLORS[f]}"
          onclick="ejsQuickSelectFinger('${f}')">
      ${f.slice(0,3).toUpperCase()}
    </div>`
  ).join('');

  return `
  <div class="ejs-panel">
    <div class="ejs-panel-header">
      <span class="ejs-panel-title">Joint Monitoring — Select joints to track for this patient</span>
      <span class="ejs-total-count" id="ejsTotalCount">0 tracked</span>
    </div>
    <div class="ejs-body">

      <!-- LEFT: Hand SVG -->
      <div class="ejs-hand-col">
        <span class="ejs-view-label">Palmar View</span>
        <div class="ejs-svg-wrap" id="ejsSvgWrap-${patientEmail.replace(/[@.]/g,'_')}">
          <svg viewBox="0 0 220 340" xmlns="http://www.w3.org/2000/svg" class="ejs-hand-svg">
            <path class="ejs-palm" d="M 60 200 Q 42 215 44 255 Q 46 290 80 305 Q 110 318 145 310 Q 178 302 185 270 Q 192 238 180 210 Z"/>
            <path class="ejs-finger-seg" d="M 52 195 Q 32 185 22 160 Q 14 138 28 122 Q 42 108 58 120 Q 68 130 70 158 L 72 190"/>
            <path class="ejs-finger-seg" d="M 85 198 Q 82 165 80 138 Q 78 112 80 90 Q 82 70 94 65 Q 106 60 114 70 Q 121 80 118 104 Q 115 130 113 158 Q 111 180 110 198"/>
            <path class="ejs-finger-seg" d="M 112 197 Q 110 163 109 135 Q 108 107 110 84 Q 112 62 124 56 Q 136 50 144 60 Q 152 70 149 94 Q 146 120 144 148 Q 142 172 141 197"/>
            <path class="ejs-finger-seg" d="M 143 197 Q 144 166 146 141 Q 148 116 152 95 Q 156 76 166 73 Q 176 70 182 80 Q 188 92 183 114 Q 178 138 174 162 Q 170 182 168 197"/>
            <path class="ejs-finger-seg" d="M 170 200 Q 173 178 177 160 Q 181 140 186 122 Q 191 106 199 104 Q 208 102 212 113 Q 216 126 210 146 Q 204 166 199 184 Q 195 196 192 206"/>
            <!-- Thumb joints -->
            <g class="ejs-jdot" id="ejsdot-thumb-mcp" onclick="ejsDotClick('thumb','mcp')"><circle class="ejs-dot-outer" cx="60" cy="178" r="7" stroke="#F5A623"/><circle class="ejs-dot-inner" cx="60" cy="178" r="3.5" fill="#F5A623"/><text class="ejs-dot-text" x="60" y="178" fill="#F5A623">M</text></g>
            <g class="ejs-jdot" id="ejsdot-thumb-pip" onclick="ejsDotClick('thumb','pip')"><circle class="ejs-dot-outer" cx="46" cy="150" r="7" stroke="#F5A623"/><circle class="ejs-dot-inner" cx="46" cy="150" r="3.5" fill="#F5A623"/><text class="ejs-dot-text" x="46" y="150" fill="#F5A623">P</text></g>
            <g class="ejs-jdot" id="ejsdot-thumb-tip" onclick="ejsDotClick('thumb','tip')"><circle class="ejs-dot-outer" cx="30" cy="125" r="7" stroke="#F5A623"/><circle class="ejs-dot-inner" cx="30" cy="125" r="3.5" fill="#F5A623"/><text class="ejs-dot-text" x="30" y="125" fill="#F5A623">T</text></g>
            <!-- Index joints -->
            <g class="ejs-jdot" id="ejsdot-index-mcp" onclick="ejsDotClick('index','mcp')"><circle class="ejs-dot-outer" cx="100" cy="193" r="7" stroke="#2D7FF9"/><circle class="ejs-dot-inner" cx="100" cy="193" r="3.5" fill="#2D7FF9"/><text class="ejs-dot-text" x="100" y="193" fill="#2D7FF9">M</text></g>
            <g class="ejs-jdot" id="ejsdot-index-pip" onclick="ejsDotClick('index','pip')"><circle class="ejs-dot-outer" cx="96" cy="148" r="7" stroke="#2D7FF9"/><circle class="ejs-dot-inner" cx="96" cy="148" r="3.5" fill="#2D7FF9"/><text class="ejs-dot-text" x="96" y="148" fill="#2D7FF9">P</text></g>
            <g class="ejs-jdot" id="ejsdot-index-dip" onclick="ejsDotClick('index','dip')"><circle class="ejs-dot-outer" cx="94" cy="108" r="7" stroke="#2D7FF9"/><circle class="ejs-dot-inner" cx="94" cy="108" r="3.5" fill="#2D7FF9"/><text class="ejs-dot-text" x="94" y="108" fill="#2D7FF9">D</text></g>
            <g class="ejs-jdot" id="ejsdot-index-tip" onclick="ejsDotClick('index','tip')"><circle class="ejs-dot-outer" cx="92" cy="72" r="7" stroke="#2D7FF9"/><circle class="ejs-dot-inner" cx="92" cy="72" r="3.5" fill="#2D7FF9"/><text class="ejs-dot-text" x="92" y="72" fill="#2D7FF9">T</text></g>
            <!-- Middle joints -->
            <g class="ejs-jdot" id="ejsdot-middle-mcp" onclick="ejsDotClick('middle','mcp')"><circle class="ejs-dot-outer" cx="126" cy="192" r="7" stroke="#00C9B1"/><circle class="ejs-dot-inner" cx="126" cy="192" r="3.5" fill="#00C9B1"/><text class="ejs-dot-text" x="126" y="192" fill="#00C9B1">M</text></g>
            <g class="ejs-jdot" id="ejsdot-middle-pip" onclick="ejsDotClick('middle','pip')"><circle class="ejs-dot-outer" cx="127" cy="145" r="7" stroke="#00C9B1"/><circle class="ejs-dot-inner" cx="127" cy="145" r="3.5" fill="#00C9B1"/><text class="ejs-dot-text" x="127" y="145" fill="#00C9B1">P</text></g>
            <g class="ejs-jdot" id="ejsdot-middle-dip" onclick="ejsDotClick('middle','dip')"><circle class="ejs-dot-outer" cx="128" cy="103" r="7" stroke="#00C9B1"/><circle class="ejs-dot-inner" cx="128" cy="103" r="3.5" fill="#00C9B1"/><text class="ejs-dot-text" x="128" y="103" fill="#00C9B1">D</text></g>
            <g class="ejs-jdot" id="ejsdot-middle-tip" onclick="ejsDotClick('middle','tip')"><circle class="ejs-dot-outer" cx="129" cy="65" r="7" stroke="#00C9B1"/><circle class="ejs-dot-inner" cx="129" cy="65" r="3.5" fill="#00C9B1"/><text class="ejs-dot-text" x="129" y="65" fill="#00C9B1">T</text></g>
            <!-- Ring joints -->
            <g class="ejs-jdot" id="ejsdot-ring-mcp" onclick="ejsDotClick('ring','mcp')"><circle class="ejs-dot-outer" cx="158" cy="192" r="7" stroke="#A78BFA"/><circle class="ejs-dot-inner" cx="158" cy="192" r="3.5" fill="#A78BFA"/><text class="ejs-dot-text" x="158" y="192" fill="#A78BFA">M</text></g>
            <g class="ejs-jdot" id="ejsdot-ring-pip" onclick="ejsDotClick('ring','pip')"><circle class="ejs-dot-outer" cx="162" cy="147" r="7" stroke="#A78BFA"/><circle class="ejs-dot-inner" cx="162" cy="147" r="3.5" fill="#A78BFA"/><text class="ejs-dot-text" x="162" y="147" fill="#A78BFA">P</text></g>
            <g class="ejs-jdot" id="ejsdot-ring-dip" onclick="ejsDotClick('ring','dip')"><circle class="ejs-dot-outer" cx="166" cy="107" r="7" stroke="#A78BFA"/><circle class="ejs-dot-inner" cx="166" cy="107" r="3.5" fill="#A78BFA"/><text class="ejs-dot-text" x="166" y="107" fill="#A78BFA">D</text></g>
            <g class="ejs-jdot" id="ejsdot-ring-tip" onclick="ejsDotClick('ring','tip')"><circle class="ejs-dot-outer" cx="170" cy="72" r="7" stroke="#A78BFA"/><circle class="ejs-dot-inner" cx="170" cy="72" r="3.5" fill="#A78BFA"/><text class="ejs-dot-text" x="170" y="72" fill="#A78BFA">T</text></g>
            <!-- Pinky joints -->
            <g class="ejs-jdot" id="ejsdot-pinky-mcp" onclick="ejsDotClick('pinky','mcp')"><circle class="ejs-dot-outer" cx="183" cy="197" r="7" stroke="#F04B4B"/><circle class="ejs-dot-inner" cx="183" cy="197" r="3.5" fill="#F04B4B"/><text class="ejs-dot-text" x="183" y="197" fill="#F04B4B">M</text></g>
            <g class="ejs-jdot" id="ejsdot-pinky-pip" onclick="ejsDotClick('pinky','pip')"><circle class="ejs-dot-outer" cx="190" cy="158" r="7" stroke="#F04B4B"/><circle class="ejs-dot-inner" cx="190" cy="158" r="3.5" fill="#F04B4B"/><text class="ejs-dot-text" x="190" y="158" fill="#F04B4B">P</text></g>
            <g class="ejs-jdot" id="ejsdot-pinky-dip" onclick="ejsDotClick('pinky','dip')"><circle class="ejs-dot-outer" cx="196" cy="126" r="7" stroke="#F04B4B"/><circle class="ejs-dot-inner" cx="196" cy="126" r="3.5" fill="#F04B4B"/><text class="ejs-dot-text" x="196" y="126" fill="#F04B4B">D</text></g>
            <g class="ejs-jdot" id="ejsdot-pinky-tip" onclick="ejsDotClick('pinky','tip')"><circle class="ejs-dot-outer" cx="202" cy="108" r="7" stroke="#F04B4B"/><circle class="ejs-dot-inner" cx="202" cy="108" r="3.5" fill="#F04B4B"/><text class="ejs-dot-text" x="202" y="108" fill="#F04B4B">T</text></g>
          </svg>
        </div>
        <div class="ejs-finger-strip">${pills}</div>
        <div class="ejs-bulk-row">
          <button class="ejs-bulk-btn" onclick="ejsSelectAll()">All</button>
          <button class="ejs-bulk-btn" onclick="ejsClearAll()">Clear</button>
        </div>
      </div>

      <!-- MIDDLE: Joint grid -->
      <div class="ejs-grid-col">${fingerBlocks}</div>

      <!-- RIGHT: Info panel -->
      <div class="ejs-info-col">
        <div class="ejs-info-empty" id="ejsInfoEmpty">
          <div class="ejs-info-empty-icon"></div>
          <div class="ejs-info-empty-text">Tap any joint on the diagram or in the grid to view clinical details and toggle tracking.</div>
        </div>
        <div class="ejs-info-detail" id="ejsInfoDetail">
          <div class="ejs-info-top">
            <div class="ejs-info-finger-tag" id="ejsInfoTag">—</div>
            <div class="ejs-info-joint-name" id="ejsInfoJointName">—</div>
            <div class="ejs-info-joint-full" id="ejsInfoJointFull">—</div>
          </div>
          <div class="ejs-info-meta">
            <div class="ejs-info-meta-row"><span class="ejs-meta-key">MediaPipe LM</span><span class="ejs-meta-val" id="ejsInfoLM">—</span></div>
            <div class="ejs-info-meta-row"><span class="ejs-meta-key">Max ROM</span><span class="ejs-meta-val" id="ejsInfoMaxROM">—</span></div>
            <div class="ejs-info-meta-row"><span class="ejs-meta-key">Joint Type</span><span class="ejs-meta-val" id="ejsInfoJointType">—</span></div>
            <div class="ejs-info-meta-row"><span class="ejs-meta-key">Clinical Priority</span><span class="ejs-meta-val" id="ejsInfoPriority">—</span></div>
          </div>
          <div class="ejs-rom-wrap">
            <div class="ejs-rom-label">Normal Range of Motion</div>
            <div class="ejs-rom-row">
              <svg viewBox="0 0 80 48" width="72" height="44">
                <path d="M 8,44 A 36,36 0 0,1 72,44" fill="none" stroke="#E8ECF2" stroke-width="6" stroke-linecap="round"/>
                <path id="ejsArcFill" d="M 8,44 A 36,36 0 0,1 72,44" fill="none" stroke="#005EB8" stroke-width="6" stroke-linecap="round" stroke-dasharray="113" stroke-dashoffset="113" style="transition:stroke-dashoffset 0.5s ease,stroke 0.3s"/>
              </svg>
              <div class="ejs-rom-vals">
                <div class="ejs-rom-val-row"><span class="ejs-rom-num" id="ejsRomMax" style="color:#005EB8">—</span><span class="ejs-rom-lbl">max</span></div>
                <div class="ejs-rom-val-row"><span class="ejs-rom-num" style="color:var(--muted)">0°</span><span class="ejs-rom-lbl">min</span></div>
              </div>
            </div>
          </div>
          <div class="ejs-info-desc"><div id="ejsInfoDesc" class="ejs-info-desc-text">—</div></div>
          <div class="ejs-info-actions">
            <button class="ejs-track-btn ejs-track-add" id="ejsTrackBtn" onclick="ejsToggleFromInfo()">+ Track This Joint</button>
          </div>
        </div>
        <div class="ejs-tracked-summary">
          <div class="ejs-tracked-title">Currently Tracking</div>
          <div class="ejs-tracked-chips" id="ejsTrackedChips"><span class="ejs-tracked-empty">None selected</span></div>
        </div>
      </div>

    </div>
  </div>
  <div id="ejsChartsArea" class="ejs-charts-area"></div>`;
}

/* After buildJointSelector HTML is injected into the DOM, call this to reset/load state */
async function ejsInit(patientEmail, sessions) {
  _ejsPatientEmail = patientEmail || '';
  _ejsSessions     = sessions     || [];
  selectedJoints.clear();
  ejsActiveInfoKey = null;

  // Load saved joint selections from Firestore
  if (patientEmail) {
    const saved = await loadTrackedJoints(patientEmail);
    saved.forEach(key => selectedJoints.add(key));
  }

  ejsRefreshUI();
  renderJointCharts();
}

/* Called whenever the joint selection changes — updates UI, charts, and persists to Firestore */
function ejsOnSelectionChange() {
  ejsRefreshUI();
  renderJointCharts();
  if (_ejsSaveTimer) clearTimeout(_ejsSaveTimer);
  _ejsSaveTimer = setTimeout(() => {
    if (_ejsPatientEmail) saveTrackedJoints(_ejsPatientEmail, [...selectedJoints]);
  }, 800);
}

/* Render one Chart.js line chart per tracked joint showing max angle over sessions */
function renderJointCharts() {
  const area = document.getElementById('ejsChartsArea');
  if (!area) return;

  // Destroy stale chart instances
  _ejsChartInstances.forEach(c => c.destroy());
  _ejsChartInstances = [];

  if (selectedJoints.size === 0) {
    area.innerHTML = '';
    return;
  }

  const joints = [...selectedJoints];
  area.innerHTML = joints.map(key => {
    const safe = key.replace('-', '_');
    return `<div class="ejs-chart-card">
      <div class="ejs-chart-title" id="ejscharttitle-${safe}"></div>
      <canvas id="ejscanvas-${safe}" height="90"></canvas>
      <div class="ejs-chart-empty" id="ejschartempty-${safe}" style="display:none">
        No session data with this joint tracked yet — data will appear here once the patient completes a session with joint monitoring active.
      </div>
    </div>`;
  }).join('');

  joints.forEach(key => {
    const data  = EJS_JOINT_DATA[key];
    if (!data) return;
    const safe  = key.replace('-', '_');
    const canvas  = document.getElementById(`ejscanvas-${safe}`);
    const titleEl = document.getElementById(`ejscharttitle-${safe}`);
    const emptyEl = document.getElementById(`ejschartempty-${safe}`);
    if (!canvas) return;

    const color = EJS_FINGER_COLORS[data.finger];
    if (titleEl) {
      titleEl.textContent = `${EJS_FINGER_LABELS[data.finger]} ${data.label} — ${data.fullName}`;
      titleEl.style.color = color;
    }

    const sessionData = _ejsSessions
      .filter(s => s.jointAngles && typeof s.jointAngles[key] === 'number')
      .map(s => {
        const d = new Date(s.date);
        return {
          label: `${d.getMonth()+1}/${d.getDate()} ${d.getHours()}:${String(d.getMinutes()).padStart(2,'0')}`,
          angle: s.jointAngles[key]
        };
      });

    if (sessionData.length === 0) {
      canvas.style.display = 'none';
      if (emptyEl) emptyEl.style.display = 'block';
      return;
    }

    const chart = new Chart(canvas.getContext('2d'), {
      type: 'line',
      data: {
        labels: sessionData.map(s => s.label),
        datasets: [{
          label: 'Max ROM (°)',
          data: sessionData.map(s => s.angle),
          borderColor: color,
          backgroundColor: color + '22',
          borderWidth: 2,
          pointBackgroundColor: color,
          pointRadius: 4,
          tension: 0.4,
          fill: true
        }]
      },
      options: {
        plugins: { legend: { display: false } },
        scales: {
          x: { ticks: { color: '#64748b', maxRotation: 45 }, grid: { color: '#E8ECF2' } },
          y: {
            min: 0,
            max: data.maxROM ? Math.min(data.maxROM + 20, 180) : 120,
            ticks: { color: '#64748b' },
            grid: { color: '#E8ECF2' },
            title: { display: true, text: 'Degrees (°)', color: '#64748b', font: { size: 11 } }
          }
        }
      }
    });
    _ejsChartInstances.push(chart);
  });
}

function ejsDotClick(finger, joint) {
  const key = `${finger}-${joint}`;
  const data = EJS_JOINT_DATA[key];
  if (!data || data.lm === null) return;
  ejsToggleJoint(key);
  ejsShowInfo(key);
}

function ejsSelectCard(key) {
  const data = EJS_JOINT_DATA[key];
  if (!data || data.lm === null) return;
  ejsShowInfo(key);
}

function ejsToggleJoint(key) {
  if (selectedJoints.has(key)) selectedJoints.delete(key);
  else selectedJoints.add(key);
  ejsOnSelectionChange();
}

function ejsToggleFromInfo() {
  if (!ejsActiveInfoKey) return;
  ejsToggleJoint(ejsActiveInfoKey);
  ejsShowInfo(ejsActiveInfoKey);
}

function ejsShowInfo(key) {
  ejsActiveInfoKey = key;
  const data = EJS_JOINT_DATA[key];
  if (!data) return;

  document.getElementById('ejsInfoEmpty').style.display  = 'none';
  document.getElementById('ejsInfoDetail').style.display = 'flex';

  const tag = document.getElementById('ejsInfoTag');
  tag.textContent   = EJS_FINGER_LABELS[data.finger];
  tag.style.background = EJS_FINGER_COLORS[data.finger];

  document.getElementById('ejsInfoJointName').textContent = `${data.label} — ${data.fullName.split(' ')[0]}`;
  document.getElementById('ejsInfoJointFull').textContent = data.fullName;
  document.getElementById('ejsInfoLM').textContent        = data.lm !== null ? `[${data.lm}]` : 'N/A';
  document.getElementById('ejsInfoMaxROM').textContent    = data.maxROM !== null ? `${data.maxROM}°` : 'N/A';
  document.getElementById('ejsInfoJointType').textContent = data.jointType;
  document.getElementById('ejsInfoDesc').textContent      = data.desc;

  const priEl = document.getElementById('ejsInfoPriority');
  priEl.textContent  = data.priority;
  priEl.style.color  = EJS_PRIORITY_COLORS[data.priority] || 'var(--muted)';

  // ROM arc
  const arcFill = document.getElementById('ejsArcFill');
  const romMax  = document.getElementById('ejsRomMax');
  if (data.maxROM !== null) {
    const pct = Math.min(data.maxROM / 120, 1);
    arcFill.style.strokeDashoffset = 113 * (1 - pct);
    arcFill.style.stroke = EJS_FINGER_COLORS[data.finger];
    romMax.textContent   = `${data.maxROM}°`;
    romMax.style.color   = EJS_FINGER_COLORS[data.finger];
  } else {
    arcFill.style.strokeDashoffset = 113;
    romMax.textContent = '—';
    romMax.style.color = 'var(--muted)';
  }

  // Track button
  const btn = document.getElementById('ejsTrackBtn');
  if (selectedJoints.has(key)) {
    btn.className   = 'ejs-track-btn ejs-track-remove';
    btn.textContent = '- Remove from Tracking';
  } else {
    btn.className   = 'ejs-track-btn ejs-track-add';
    btn.textContent = '+ Track This Joint';
    btn.style.background = EJS_FINGER_COLORS[data.finger];
  }

  // Highlight card
  document.querySelectorAll('.ejs-joint-card').forEach(c => c.style.outline = '');
  const card = document.getElementById(`ejscard-${key}`);
  if (card && data.lm !== null) card.style.outline = `2px solid ${EJS_FINGER_COLORS[data.finger]}`;
}

function ejsRefreshUI() {
  // Cards + finger counts
  EJS_FINGERS.forEach(finger => {
    let count = 0;
    EJS_JOINTS.forEach(joint => {
      const key  = `${finger}-${joint}`;
      const card = document.getElementById(`ejscard-${key}`);
      const chk  = document.getElementById(`ejscheck-${key}`);
      if (!card) return;
      const sel = selectedJoints.has(key);
      card.classList.toggle('ejs-selected', sel);
      if (chk) chk.classList.toggle('ejs-check-on', sel);
      if (sel) count++;
    });
    const fc = document.getElementById(`ejsfcount-${finger}`);
    if (fc) fc.textContent = `${count} / ${EJS_JOINTS.length}`;
  });

  // SVG dots
  EJS_FINGERS.forEach(finger => {
    EJS_JOINTS.forEach(joint => {
      const key  = `${finger}-${joint}`;
      const dot  = document.getElementById(`ejsdot-${finger}-${joint}`);
      if (!dot) return;
      dot.classList.toggle('ejs-dot-selected', selectedJoints.has(key));
    });
  });

  // Finger pills
  EJS_FINGERS.forEach(finger => {
    const pill = document.getElementById(`ejspill-${finger}`);
    if (!pill) return;
    const validJoints = EJS_JOINTS.filter(j => {
      const d = EJS_JOINT_DATA[`${finger}-${j}`];
      return d && d.lm !== null;
    });
    const all = validJoints.every(j => selectedJoints.has(`${finger}-${j}`));
    const any = validJoints.some(j => selectedJoints.has(`${finger}-${j}`));
    pill.classList.toggle('ejs-pill-on',  all);
    pill.classList.toggle('ejs-pill-off', !any);
    pill.style.background = all ? EJS_FINGER_COLORS[finger] : '';
    pill.style.color      = all ? 'white' : EJS_FINGER_COLORS[finger];
  });

  // Counter
  const tc = document.getElementById('ejsTotalCount');
  if (tc) tc.textContent = `${selectedJoints.size} tracked`;

  // Chips
  ejsRenderChips();

  // Re-outline active card
  if (ejsActiveInfoKey) {
    document.querySelectorAll('.ejs-joint-card').forEach(c => c.style.outline = '');
    const card = document.getElementById(`ejscard-${ejsActiveInfoKey}`);
    const data = EJS_JOINT_DATA[ejsActiveInfoKey];
    if (card && data && data.lm !== null) card.style.outline = `2px solid ${EJS_FINGER_COLORS[data.finger]}`;
    // Refresh button state
    const btn = document.getElementById('ejsTrackBtn');
    if (btn && data) {
      if (selectedJoints.has(ejsActiveInfoKey)) {
        btn.className   = 'ejs-track-btn ejs-track-remove';
        btn.textContent = '- Remove from Tracking';
      } else {
        btn.className   = 'ejs-track-btn ejs-track-add';
        btn.textContent = '+ Track This Joint';
        btn.style.background = EJS_FINGER_COLORS[data.finger];
      }
    }
  }
}

function ejsRenderChips() {
  const wrap = document.getElementById('ejsTrackedChips');
  if (!wrap) return;
  if (selectedJoints.size === 0) {
    wrap.innerHTML = '<span class="ejs-tracked-empty">None selected</span>';
    return;
  }
  wrap.innerHTML = [...selectedJoints].map(key => {
    const data = EJS_JOINT_DATA[key];
    if (!data) return '';
    return `<button class="ejs-chip" style="background:${EJS_FINGER_COLORS[data.finger]}"
                    onclick="ejsRemoveChip('${key}')">
      ${EJS_FINGER_LABELS[data.finger].slice(0,3)} ${data.label} <span>×</span>
    </button>`;
  }).join('');
}

function ejsRemoveChip(key) {
  selectedJoints.delete(key);
  ejsOnSelectionChange();
  if (ejsActiveInfoKey === key) ejsShowInfo(key);
}

function ejsQuickSelectFinger(finger) {
  const validJoints = EJS_JOINTS.filter(j => {
    const d = EJS_JOINT_DATA[`${finger}-${j}`];
    return d && d.lm !== null;
  });
  const all = validJoints.every(j => selectedJoints.has(`${finger}-${j}`));
  validJoints.forEach(j => {
    const key = `${finger}-${j}`;
    if (all) selectedJoints.delete(key);
    else selectedJoints.add(key);
  });
  ejsOnSelectionChange();
}

function ejsSelectAll() {
  EJS_FINGERS.forEach(f => EJS_JOINTS.forEach(j => {
    const d = EJS_JOINT_DATA[`${f}-${j}`];
    if (d && d.lm !== null) selectedJoints.add(`${f}-${j}`);
  }));
  ejsOnSelectionChange();
}

function ejsClearAll() {
  selectedJoints.clear();
  ejsOnSelectionChange();
}

/* ══════════════════════════════════════════════════════════════════════════
   SECTION 14: CALIBRATION SCREEN  (from script.js / index.html)
   All variables and DOM references are prefixed "calib" to avoid collisions.
   ══════════════════════════════════════════════════════════════════════════ */

// ── Active joints state ───────────────────────────────────────────────────────
const calibActiveJoints = {
  thumb:  { mcp: true,  pip: true,  dip: false },
  index:  { mcp: true,  pip: true,  dip: true  },
  middle: { mcp: true,  pip: true,  dip: true  },
  ring:   { mcp: true,  pip: true,  dip: true  },
  pinky:  { mcp: true,  pip: true,  dip: true  },
};

// ── Finger joint definitions ──────────────────────────────────────────────────
const CALIB_FINGERS = {
  thumb:  { mcp: { a:0, b:2,  c:3,  id:'calib-thumb-mcp'  }, pip: { a:2,  b:3,  c:4,  id:'calib-thumb-pip'  }, dip: null },
  index:  { mcp: { a:0, b:5,  c:6,  id:'calib-index-mcp'  }, pip: { a:5,  b:6,  c:7,  id:'calib-index-pip'  }, dip: { a:6,  b:7,  c:8,  id:'calib-index-dip'  } },
  middle: { mcp: { a:0, b:9,  c:10, id:'calib-middle-mcp' }, pip: { a:9,  b:10, c:11, id:'calib-middle-pip' }, dip: { a:10, b:11, c:12, id:'calib-middle-dip' } },
  ring:   { mcp: { a:0, b:13, c:14, id:'calib-ring-mcp'   }, pip: { a:13, b:14, c:15, id:'calib-ring-pip'   }, dip: { a:14, b:15, c:16, id:'calib-ring-dip'   } },
  pinky:  { mcp: { a:0, b:17, c:18, id:'calib-pinky-mcp'  }, pip: { a:17, b:18, c:19, id:'calib-pinky-pip'  }, dip: { a:18, b:19, c:20, id:'calib-pinky-dip'  } },
};

const CALIB_FINGER_FULL = {
  thumb: 'Thumb', index: 'Index', middle: 'Middle', ring: 'Ring', pinky: 'Pinky'
};

const CALIB_JOINT_MAX = { mcp: 110, pip: 115, dip: 70 };

const CALIB_FINGER_THRESHOLDS = {
  thumb: 0.05, index: 0.05, middle: 0.018, ring: 0.018, pinky: 0.05,
};

const CALIB_TIP_INDICES = new Set([4, 8, 12, 16, 20]);

// ── One Euro Filter (calib-scoped) ────────────────────────────────────────────
const CALIB_ONE_EURO_MINCUTOFF = 0.3;
const CALIB_ONE_EURO_BETA      = 0.1;
const CALIB_ONE_EURO_DCUTOFF   = 1.0;
const calibFilterStates = {};

function calibOneEuroFilter(id, rawValue, timestamp) {
  if (!calibFilterStates[id]) {
    calibFilterStates[id] = { prevValue: rawValue, prevDeriv: 0, prevTime: timestamp };
    return rawValue;
  }
  const state = calibFilterStates[id];
  const dt    = timestamp - state.prevTime || 1/60;
  const alpha_d = calibAlphaFor(CALIB_ONE_EURO_DCUTOFF, dt);
  const deriv   = alpha_d * ((rawValue - state.prevValue) / dt) + (1 - alpha_d) * state.prevDeriv;
  const cutoff  = CALIB_ONE_EURO_MINCUTOFF + CALIB_ONE_EURO_BETA * Math.abs(deriv);
  const alpha   = calibAlphaFor(cutoff, dt);
  const value   = alpha * rawValue + (1 - alpha) * state.prevValue;
  state.prevValue = value;
  state.prevDeriv = deriv;
  state.prevTime  = timestamp;
  return Math.round(value);
}

function calibAlphaFor(cutoff, dt) {
  const r = 2 * Math.PI * cutoff * dt;
  return r / (r + 1);
}

function calibClearBuffers() {
  for (const key of Object.keys(calibFilterStates)) delete calibFilterStates[key];
}

// ── Per-landmark stability tracking ──────────────────────────────────────────
const CALIB_LANDMARK_PREV = {};

function calibLandmarkJumped(index, lm, threshold) {
  const prev = CALIB_LANDMARK_PREV[index];
  if (!prev) { CALIB_LANDMARK_PREV[index] = { x: lm.x, y: lm.y }; return false; }
  const dist = Math.sqrt((lm.x-prev.x)**2 + (lm.y-prev.y)**2);
  CALIB_LANDMARK_PREV[index] = { x: lm.x, y: lm.y };
  return dist > threshold;
}

// ── Angle calculation ─────────────────────────────────────────────────────────
function calibGetAngle(a, b, c) {
  const ba = { x: a.x-b.x, y: a.y-b.y, z: (a.z||0)-(b.z||0) };
  const bc = { x: c.x-b.x, y: c.y-b.y, z: (c.z||0)-(b.z||0) };
  const dotVal = ba.x*bc.x + ba.y*bc.y + ba.z*bc.z;
  const magBA  = Math.sqrt(ba.x**2 + ba.y**2 + ba.z**2);
  const magBC  = Math.sqrt(bc.x**2 + bc.y**2 + bc.z**2);
  if (magBA === 0 || magBC === 0) return 0;
  const cos = Math.max(-1, Math.min(1, dotVal / (magBA * magBC)));
  return Math.round(180 - Math.acos(cos) * (180 / Math.PI));
}

// ── Compute one joint ─────────────────────────────────────────────────────────
function calibComputeJoint(joint, landmarks, threshold) {
  const aJ = calibLandmarkJumped(joint.a, landmarks[joint.a], threshold);
  const bJ = calibLandmarkJumped(joint.b, landmarks[joint.b], threshold);
  const cJ = calibLandmarkJumped(joint.c, landmarks[joint.c], threshold);
  if (!aJ && !bJ && !cJ) {
    const raw = calibGetAngle(landmarks[joint.a], landmarks[joint.b], landmarks[joint.c]);
    return calibOneEuroFilter(joint.id, raw, performance.now() / 1000);
  }
  return calibFilterStates[joint.id]?.prevValue ? Math.round(calibFilterStates[joint.id].prevValue) : 0;
}

// ── Joint display label (thumb uses MP / IP instead of MCP / DIP) ────────────
function calibJointLabel(finger, joint) {
  if (finger === 'thumb') {
    if (joint === 'mcp') return 'MP';
    if (joint === 'dip') return 'IP';
  }
  return joint.toUpperCase();
}

// ── Sync finger toggle button active state ────────────────────────────────────
function calibUpdateFingerToggles() {
  for (const finger of Object.keys(calibActiveJoints)) {
    const btn = document.querySelector(`.calib-finger-toggle[data-finger="${finger}"]`);
    if (!btn) continue;
    const anyActive = Object.entries(calibActiveJoints[finger]).some(([j, v]) => {
      if (finger === 'thumb' && j === 'dip') return false;
      return v;
    });
    btn.classList.toggle('finger-off', !anyActive);
  }
}

// ── Rebuild readout DOM ───────────────────────────────────────────────────────
function calibRebuildReadouts() {
  const panel = document.getElementById('calibReadoutPanel');
  if (!panel) return;
  panel.innerHTML = '';
  let count = 0;

  for (const finger of ['thumb', 'index', 'middle', 'ring', 'pinky']) {
    const hasActive = ['mcp','pip','dip'].some(j =>
      calibActiveJoints[finger][j] && !(finger === 'thumb' && j === 'dip') && CALIB_FINGERS[finger][j]
    );
    if (!hasActive) continue;

    const label = document.createElement('div');
    label.className = 'calib-readout-group-label';
    label.innerHTML = `<strong>${CALIB_FINGER_FULL[finger]}</strong>`;
    panel.appendChild(label);

    for (const joint of ['mcp', 'pip', 'dip']) {
      if (!calibActiveJoints[finger][joint]) continue;
      if (finger === 'thumb' && joint === 'dip') continue;

      const row = document.createElement('div');
      row.className = 'calib-readout-row';
      row.id = `calib-readout-${finger}-${joint}`;
      row.innerHTML = `
        <div class="calib-readout-label">
          <span>${CALIB_FINGER_FULL[finger]} ${calibJointLabel(finger, joint)}</span>
          <span class="calib-readout-val" id="calib-rval-${finger}-${joint}">—</span>
        </div>
        <div class="calib-readout-bar-wrap">
          <div class="calib-readout-bar" id="calib-rbar-${finger}-${joint}"></div>
        </div>`;
      panel.appendChild(row);
      count++;
    }
  }

  if (count === 0) {
    panel.innerHTML = '<div class="calib-readout-empty">No joints selected</div>';
  }
  calibUpdateFingerToggles();
}

// ── Update readouts ───────────────────────────────────────────────────────────
function calibUpdateReadouts(landmarks) {
  for (const finger of Object.keys(CALIB_FINGERS)) {
    const threshold = CALIB_FINGER_THRESHOLDS[finger];
    for (const joint of ['mcp', 'pip', 'dip']) {
      if (!calibActiveJoints[finger][joint]) continue;
      const jDef = CALIB_FINGERS[finger][joint];
      if (!jDef) continue;
      const valEl = document.getElementById(`calib-rval-${finger}-${joint}`);
      const barEl = document.getElementById(`calib-rbar-${finger}-${joint}`);
      if (!valEl || !barEl) continue;
      const smoothed = calibComputeJoint(jDef, landmarks, threshold);
      valEl.textContent = Math.min(smoothed, CALIB_JOINT_MAX[joint]) + '°';
      barEl.style.width = Math.min(100, (smoothed / CALIB_JOINT_MAX[joint]) * 100) + '%';
    }
  }
}

// ── Clear readouts ────────────────────────────────────────────────────────────
function calibClearReadouts() {
  for (const finger of Object.keys(CALIB_FINGERS)) {
    for (const joint of ['mcp', 'pip', 'dip']) {
      const valEl = document.getElementById(`calib-rval-${finger}-${joint}`);
      const barEl = document.getElementById(`calib-rbar-${finger}-${joint}`);
      if (valEl) valEl.textContent = '—';
      if (barEl) barEl.style.width = '0%';
    }
  }
  calibClearBuffers();
}

// ── Draw landmarks ────────────────────────────────────────────────────────────
function calibDrawLandmarks(ctx, landmarks) {
  window.drawConnectors(ctx, landmarks, window.HAND_CONNECTIONS, {
    color: 'rgba(0, 229, 192, 0.45)', lineWidth: 2,
  });
  landmarks.forEach((lm, i) => {
    const x = lm.x * ctx.canvas.width;
    const y = lm.y * ctx.canvas.height;
    ctx.beginPath();
    ctx.arc(x, y, CALIB_TIP_INDICES.has(i) ? 7 : 4, 0, Math.PI * 2);
    ctx.fillStyle   = CALIB_TIP_INDICES.has(i) ? '#00e5c0' : 'rgba(0,229,192,0.7)';
    ctx.shadowBlur  = CALIB_TIP_INDICES.has(i) ? 14 : 5;
    ctx.shadowColor = '#00e5c0';
    ctx.fill();
    ctx.shadowBlur  = 0;
  });
}

// ── Calib status helpers ──────────────────────────────────────────────────────
function calibSetStatus(msg, state = 'idle') {
  const calibDot  = document.getElementById('calibDot');
  const calibText = document.getElementById('calibStatusText');
  if (!calibDot || !calibText) return;
  calibText.textContent = msg;
  calibText.className   = state === 'active' ? 'active' : '';
  calibDot.className = 'dot' + (state === 'active' ? ' active' : state === 'error' ? ' error' : '');
}

// ── MediaPipe results callback (calib) ────────────────────────────────────────
function calibOnResults(results) {
  const calibCanvas = document.getElementById('calibCanvas');
  const calibCtx    = calibCanvas.getContext('2d');
  const calibHandCount = document.getElementById('calibHandCount');
  const calibCameraWrapEl = document.getElementById('calibCameraWrap');

  // Center-crop to square (matches video's object-fit:cover) — from feature/ui
  const srcW = results.image.width;
  const srcH = results.image.height;
  const size  = Math.min(srcW, srcH);
  const cropX = (srcW - size) / 2;
  const cropY = (srcH - size) / 2;

  calibCanvas.width  = size;
  calibCanvas.height = size;

  calibCtx.save();
  calibCtx.clearRect(0, 0, size, size);
  calibCtx.drawImage(results.image, cropX, cropY, size, size, 0, 0, size, size);

  const count = results.multiHandLandmarks ? results.multiHandLandmarks.length : 0;
  if (calibHandCount) calibHandCount.textContent = `${count} hand${count !== 1 ? 's' : ''}`;

  if (count > 0) {
    calibSetStatus('Tracking active', 'active');
    if (calibCameraWrapEl) calibCameraWrapEl.classList.add('scanning');
    for (const landmarks of results.multiHandLandmarks) {
      // Remap landmarks into cropped square coordinate space for drawing
      const drawLandmarks = landmarks.map(lm => ({
        ...lm,
        x: (lm.x * srcW - cropX) / size,
        y: (lm.y * srcH - cropY) / size,
      }));
      calibDrawLandmarks(calibCtx, drawLandmarks);
      calibUpdateReadouts(landmarks); // original coords for angle math
    }
  } else {
    calibSetStatus('Point camera at hand', 'idle');
    if (calibCameraWrapEl) calibCameraWrapEl.classList.remove('scanning');
    calibClearReadouts();
  }

  calibCtx.restore();
}

// ── Init calibration camera ───────────────────────────────────────────────────
let calibMpCamera = null;

async function startCalibration() {
  showScreen('calibrationScreen');

  // Rebuild readouts fresh each time we enter
  calibRebuildReadouts();

  if (calibMpCamera) return; // already running

  const calibVideo   = document.getElementById('calibVideo');
  const calibOverlay = document.getElementById('calibOverlay');
  const calibOverlayMsg = document.getElementById('calibOverlayMsg');

  calibSetStatus('Loading...', 'idle');
  if (calibOverlayMsg) calibOverlayMsg.textContent = 'LOADING MEDIAPIPE...';

  const hands = new window.Hands({
    locateFile: file => `https://cdn.jsdelivr.net/npm/@mediapipe/hands/${file}`,
  });

  hands.setOptions({
    maxNumHands: 2,
    modelComplexity: 1,
    minDetectionConfidence: 0.85,
    minTrackingConfidence: 0.75,
  });

  hands.onResults(calibOnResults);

  if (calibOverlayMsg) calibOverlayMsg.textContent = 'REQUESTING CAMERA...';

  try {
    const stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: 'user', width: 1280, height: 720 },
    });

    calibVideo.srcObject = stream;
    calibVideo.onloadedmetadata = () => calibVideo.play();
    calibVideo.onplaying = () => {
      calibVideo.classList.add('ready');
      if (calibOverlay) calibOverlay.classList.add('hidden');
      calibSetStatus('Point camera at hand', 'idle');
    };

    calibMpCamera = new window.Camera(calibVideo, {
      onFrame: async () => { await hands.send({ image: calibVideo }); },
      width: 1280, height: 720,
    });

    calibMpCamera.start();

  } catch (err) {
    if (calibOverlay) calibOverlay.classList.remove('hidden');
    if (calibOverlayMsg) calibOverlayMsg.textContent = 'CAMERA ACCESS DENIED';
    calibSetStatus('Camera denied', 'error');
    console.error(err);
  }
}

// ── Wire up calibration toggle grid (runs after DOM ready) ────────────────────
document.addEventListener('DOMContentLoaded', () => {
  // Finger toggle buttons
  document.querySelectorAll('.calib-finger-toggle').forEach(btn => {
    btn.addEventListener('click', () => {
      const finger = btn.dataset.finger;
      const anyOn = Object.entries(calibActiveJoints[finger]).some(([j, v]) => {
        if (finger === 'thumb' && j === 'dip') return false;
        return v;
      });
      const newState = !anyOn;
      for (const joint of Object.keys(calibActiveJoints[finger])) {
        if (finger === 'thumb' && joint === 'dip') continue;
        calibActiveJoints[finger][joint] = newState;
      }
      document.querySelectorAll(`.calib-grid-cell[data-finger="${finger}"]`).forEach(cell => {
        const j = cell.dataset.joint;
        if (finger === 'thumb' && j === 'dip') return;
        cell.querySelector('.calib-cell-inner').classList.toggle('active', calibActiveJoints[finger][j]);
      });
      calibRebuildReadouts();
    });
  });

  // Cell toggles
  document.querySelectorAll('.calib-grid-cell').forEach(cell => {
    cell.addEventListener('click', () => {
      const finger = cell.dataset.finger;
      const joint  = cell.dataset.joint;
      if (finger === 'thumb' && joint === 'dip') return;
      calibActiveJoints[finger][joint] = !calibActiveJoints[finger][joint];
      cell.querySelector('.calib-cell-inner').classList.toggle('active', calibActiveJoints[finger][joint]);
      calibRebuildReadouts();
    });
  });

  // ALL button
  const allBtn = document.getElementById('calibAllBtn');
  if (allBtn) {
    allBtn.addEventListener('click', () => {
      for (const finger of Object.keys(calibActiveJoints)) {
        for (const joint of Object.keys(calibActiveJoints[finger])) {
          if (finger === 'thumb' && joint === 'dip') continue;
          calibActiveJoints[finger][joint] = true;
        }
      }
      document.querySelectorAll('.calib-grid-cell').forEach(cell => {
        const f = cell.dataset.finger;
        const j = cell.dataset.joint;
        if (f === 'thumb' && j === 'dip') return;
        cell.querySelector('.calib-cell-inner').classList.add('active');
      });
      calibRebuildReadouts();
    });
  }

  // NONE button
  const noneBtn = document.getElementById('calibNoneBtn');
  if (noneBtn) {
    noneBtn.addEventListener('click', () => {
      for (const finger of Object.keys(calibActiveJoints)) {
        for (const joint of Object.keys(calibActiveJoints[finger])) {
          calibActiveJoints[finger][joint] = false;
        }
      }
      document.querySelectorAll('.calib-cell-inner').forEach(el => el.classList.remove('active'));
      calibRebuildReadouts();
    });
  }

  // Build initial readouts
  calibRebuildReadouts();
});

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

function formatMsgTime(isoStr) {
  const d     = new Date(isoStr);
  const now   = new Date();
  const today = now.toDateString();
  const yesterday = new Date(now - 86400000).toDateString();
  const time  = d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  if (d.toDateString() === today)     return time;
  if (d.toDateString() === yesterday) return `Yesterday ${time}`;
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) + ' ' + time;
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

async function renderThread(containerId, myEmail, otherEmail) {
  const el = document.getElementById(containerId);
  if (!el) return;
  const thread = await getThread(myEmail, otherEmail);
  if (!thread.length) {
    el.innerHTML = '<p class="msg-empty">No messages yet.</p>';
    return;
  }
  el.innerHTML = thread.map(m => {
    const mine = m.from === myEmail;
    const time = formatMsgTime(m.timestamp);
    return `<div class="msg-bubble ${mine ? 'msg-mine' : 'msg-theirs'}">
      <div class="msg-text">${escapeHtml(m.text)}</div>
      <div class="msg-time">${time}</div>
    </div>`;
  }).join('');
  el.scrollTop = el.scrollHeight;
}

// ── Patient-side functions ────────────────────────────────────────────────────

async function openPatientMessaging() {
  const tEmail = await getConnectedTherapist();
  if (!tEmail) { alert('You are not connected to a therapist yet.'); return; }
  await markRead(currentUser.email, tEmail);
  const tSnap = await db.collection('users').doc(tEmail).get();
  document.getElementById('msgHeaderTitle').textContent = tSnap.exists ? tSnap.data().name : 'Your Therapist';
  await renderThread('msgThread', currentUser.email, tEmail);
  showScreen('messagingScreen');
}

async function sendMessageFromPatient() {
  const tEmail = await getConnectedTherapist();
  if (!tEmail) return;
  const input = document.getElementById('msgInput');
  await sendMessage(currentUser.email, tEmail, input.value);
  input.value = '';
  await renderThread('msgThread', currentUser.email, tEmail);
}

// ── Therapist-side panel builder ──────────────────────────────────────────────

function buildMessagePanel(patientEmail) {
  return `<div class="therapist-msg-panel">
    <div class="section-title" style="font-size:0.85rem; font-weight:700; color:#6B7A99; text-transform:uppercase; letter-spacing:0.5px; margin-bottom:12px;">Messages</div>
    <div class="therapist-msg-thread" id="therapistMsgThread"></div>
    <div class="therapist-msg-row">
      <input type="text" id="therapistMsgInput" class="therapist-msg-input" placeholder="Send a message…" />
      <button id="therapistMsgSend" class="therapist-msg-send">Send</button>
    </div>
  </div>`;
}

// ── Video Recording Utilities ────────────────────────────────────────────────

function getRecordingMimeType() {
  const candidates = ['video/webm;codecs=vp9','video/webm;codecs=vp8','video/webm','video/mp4'];
  for (const mime of candidates) {
    if (typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported(mime)) return mime;
  }
  return null;
}

function startRecording(canvas) {
  const mime = getRecordingMimeType();
  if (!mime || typeof MediaRecorder === 'undefined') { recordingSupported = false; return; }
  recordingSupported = true;
  recordedChunks = [];
  let stream;
  try { stream = canvas.captureStream(30); } catch(e) { recordingSupported = false; return; }
  try {
    mediaRecorder = new MediaRecorder(stream, { mimeType: mime, videoBitsPerSecond: 400_000 });
  } catch(e) { recordingSupported = false; return; }
  mediaRecorder.ondataavailable = e => { if (e.data && e.data.size > 0) recordedChunks.push(e.data); };
  mediaRecorder.start(1000);
  showRecordingIndicator();
}

function stopRecording() {
  return new Promise(resolve => {
    if (!mediaRecorder || mediaRecorder.state === 'inactive') {
      hideRecordingIndicator(); resolve(null); return;
    }
    mediaRecorder.onstop = () => {
      hideRecordingIndicator();
      if (recordedChunks.length === 0) { resolve(null); return; }
      const mime = mediaRecorder.mimeType || 'video/webm';
      const blob = new Blob(recordedChunks, { type: mime });
      recordedChunks = []; mediaRecorder = null;
      resolve(blob);
    };
    mediaRecorder.stop();
  });
}

async function uploadSessionVideo(blob, docId, patientEmail) {
  if (!blob || !docId) return;
  try {
    const form = new FormData();
    form.append('file', blob);
    form.append('upload_preset', CLOUDINARY_PRESET);
    form.append('public_id', `sessions/${patientEmail}/${docId}`);
    const res  = await fetch(`https://api.cloudinary.com/v1_1/${CLOUDINARY_CLOUD}/video/upload`, { method: 'POST', body: form });
    const data = await res.json();
    if (data.error) throw new Error(data.error.message);
    await db.collection('sessions').doc(docId).update({ videoUrl: data.secure_url });
  } catch(e) {
    console.error('Session video upload failed:', e?.message || e);
  }
}

function showRecordingIndicator() {
  const el = document.getElementById('recordingIndicator');
  if (el) el.style.display = 'flex';
}

function hideRecordingIndicator() {
  const el = document.getElementById('recordingIndicator');
  if (el) el.style.display = 'none';
}

async function downloadSessionVideo(url, date, patientName) {
  const d    = new Date(date);
  const ts   = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
  const ext  = url.includes('.mp4') ? 'mp4' : 'webm';
  const name = patientName ? `${patientName}-${ts}` : ts;
  try {
    const res  = await fetch(url);
    const blob = await res.blob();
    const blobUrl = URL.createObjectURL(blob);
    const a   = document.createElement('a');
    a.href     = blobUrl;
    a.download = `phalanx-session-${name}.${ext}`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(blobUrl), 10000);
  } catch(e) {
    window.open(url, '_blank');
  }
}

function openVideoModal(videoUrl, sessionDate, patientName) {
  const modal  = document.getElementById('videoModal');
  const player = document.getElementById('videoModalPlayer');
  const dlBtn  = document.getElementById('videoModalDownload');
  player.src = videoUrl;
  if (dlBtn) {
    dlBtn.onclick = () => downloadSessionVideo(videoUrl, sessionDate || new Date().toISOString(), patientName);
  }
  modal.style.display = 'flex';
  player.play().catch(() => {});
}

function closeVideoModal() {
  const modal  = document.getElementById('videoModal');
  const player = document.getElementById('videoModalPlayer');
  player.pause(); player.src = '';
  modal.style.display = 'none';
}

/* ══════════════════════════════════════════════════════════════════════════
   SECTION 16: SWEEP CALIBRATION
   Therapist sweeps camera around patient's stationary hand. Algorithm records
   a joint's angle only when the camera orientation satisfies Yash's rule for
   that joint — rules derived from empirical goniometer testing.

   Workflow:
   1. Set SWEEP_DEBUG = true, run sweep, hold joints at known angles.
   2. Click COPY LOG → export JSON with all orientation metrics + angles.
   3. Find frames where angles[joint] matches known true angle → read metrics.
   4. Fill in SWEEP_JOINT_RULES[joint] = [{ metric, min, max }, ...].
   ══════════════════════════════════════════════════════════════════════════ */

const SWEEP_DEBUG           = true;  // shows METRICS panel and debug log
const SWEEP_REQUIRED_FRAMES = 5;     // consecutive in-rule frames before recording

// Per-joint orientation rules. null = not recorded. Array of { metric, min, max } — OR logic.
// metric must be one of the keys returned by sweepComputeMetrics().
const SWEEP_JOINT_RULES = {
  'thumb-mcp':  [{ metric: 'palmNormalZ',    min: 0.70, max: 1.0 }],
  'thumb-pip':  [{ metric: 'palmNormalZ',    min: 0.70, max: 1.0 }],
  'index-mcp':  [{ metric: 'fingerZ_index',  min: 0.25, max: 1.0 }],
  'index-pip':  [{ metric: 'fingerZ_index',  min: 0.25, max: 1.0 }],
  'index-dip':  [{ metric: 'fingerZ_index',  min: 0.25, max: 1.0 }],
  'middle-mcp': [{ metric: 'fingerZ_middle', min: 0.55, max: 1.0 }],
  'middle-pip': [{ metric: 'lateralZ',       min: 0.70, max: 1.0 }],
  'middle-dip': [{ metric: 'lateralZ',       min: 0.70, max: 1.0 }],
  'ring-mcp':   [{ metric: 'fingerZ_ring',   min: 0.35, max: 1.0 }],
  'ring-pip':   [{ metric: 'fingerZ_ring',   min: 0.25, max: 1.0 }],
  'ring-dip':   null,
  'pinky-mcp':  [{ metric: 'fingerZ_pinky',  min: 0.25, max: 1.0 }],
  'pinky-pip':  [{ metric: 'lateralZ',       min: 0.70, max: 1.0 }],
  'pinky-dip':  [{ metric: 'palmNormalZ',    min: 0.20, max: 1.0 }],
};

// ── One Euro Filter for landmarks ─────────────────────────────────────────
// Reuses calibAlphaFor() from Section 14. Separate state and no Math.round
// since landmark coords are normalized floats, not integer angles.
const SWEEP_ONE_EURO_MINCUTOFF = 1.0;
const SWEEP_ONE_EURO_BETA      = 0.1;
const SWEEP_ONE_EURO_DCUTOFF   = 1.0;
const _sweepFilterStates = {};

function sweepOneEuroFilter(id, rawValue, timestamp) {
  if (!_sweepFilterStates[id]) {
    _sweepFilterStates[id] = { prevValue: rawValue, prevDeriv: 0, prevTime: timestamp };
    return rawValue;
  }
  const state   = _sweepFilterStates[id];
  const dt      = (timestamp - state.prevTime) || (1 / 60);
  const alpha_d = calibAlphaFor(SWEEP_ONE_EURO_DCUTOFF, dt);
  const deriv   = alpha_d * ((rawValue - state.prevValue) / dt) + (1 - alpha_d) * state.prevDeriv;
  const cutoff  = SWEEP_ONE_EURO_MINCUTOFF + SWEEP_ONE_EURO_BETA * Math.abs(deriv);
  const alpha   = calibAlphaFor(cutoff, dt);
  const value   = alpha * rawValue + (1 - alpha) * state.prevValue;
  state.prevValue = value;
  state.prevDeriv = deriv;
  state.prevTime  = timestamp;
  return value;
}

// ── State ─────────────────────────────────────────────────────────────────
let _sweepPatientEmail = '';
let _sweepMpHands      = null;
let _sweepMpCamera     = null;
let _sweepDebugLog     = [];   // circular buffer, last 60 frames
let _sweepFacingMode   = 'environment';  // default to rear camera

// Anatomical angle limits — readings outside these are physically impossible
// and indicate a bad MediaPipe frame. Used to gate recording only.
const SWEEP_ANGLE_LIMITS = { mcp: [0, 100], pip: [0, 115], dip: [0, 90] };

// All 14 joints derived from CALIB_FINGERS (Section 14): thumb MP/IP,
// index/middle/ring/pinky MCP/PIP/DIP. Thumb DIP is null in CALIB_FINGERS
// so it is naturally skipped.
const SWEEP_JOINTS = (() => {
  const out = [];
  for (const [finger, joints] of Object.entries(CALIB_FINGERS)) {
    for (const [joint, def] of Object.entries(joints)) {
      if (!def) continue;
      out.push({ key: `${finger}-${joint}`, finger, joint, def });
    }
  }
  return out;
})();

// Per-joint state: best metric value seen when angle was recorded
const _sweepJointState = {};
const _sweepFrameCount = {};  // consecutive in-rule frames per joint
const _sweepCooldowns  = {};  // key → ms timestamp when cooldown expires
let   _sweepCapturing  = false;

function sweepResetState() {
  for (const { key } of SWEEP_JOINTS) {
    _sweepJointState[key] = { bestMetricVal: 0, bestAngle: null };
    _sweepFrameCount[key] = 0;
    delete _sweepCooldowns[key];
  }
  Object.keys(_sweepFilterStates).forEach(k => delete _sweepFilterStates[k]);
  _sweepCapturing = false;
  const captureBtn = document.getElementById('sweepCaptureBtn');
  const saveBtn    = document.getElementById('sweepSaveBtn');
  if (captureBtn) captureBtn.style.display = '';
  if (saveBtn)    saveBtn.style.display    = 'none';
}

function sweepStartCapture() {
  _sweepCapturing = true;
  const captureBtn = document.getElementById('sweepCaptureBtn');
  const saveBtn    = document.getElementById('sweepSaveBtn');
  if (captureBtn) captureBtn.style.display = 'none';
  if (saveBtn)    saveBtn.style.display    = '';
}

function sweepResetJoint(key) {
  _sweepJointState[key] = { bestMetricVal: 0, bestAngle: null };
  _sweepFrameCount[key] = 0;
  _sweepCooldowns[key]  = performance.now() + 3000;
  const dot    = document.getElementById(`sweep-dot-${key}`);
  const bestEl = document.getElementById(`sweep-best-${key}`);
  if (dot)    { dot.classList.remove('captured', 'in-range'); dot.classList.add('cooldown'); }
  if (bestEl) bestEl.textContent = '—';
}

// ── Orientation metrics ────────────────────────────────────────────────────
// Returns all measurable camera-orientation metrics from 3D landmarks.
// Yash references these keys in SWEEP_JOINT_RULES after goniometer testing.
function sweepComputeMetrics(landmarks) {
  const lateralZ   = Math.abs(normZ(landmarks[5], landmarks[17]));
  const palmNormalZ = Math.abs(sweepPalmNormalZ(landmarks));
  return {
    lateralZ,
    palmNormalZ,
    fingerZ_thumb:  Math.abs(normZ(landmarks[2],  landmarks[3])),
    fingerZ_index:  Math.abs(normZ(landmarks[5],  landmarks[6])),
    fingerZ_middle: Math.abs(normZ(landmarks[9],  landmarks[10])),
    fingerZ_ring:   Math.abs(normZ(landmarks[13], landmarks[14])),
    fingerZ_pinky:  Math.abs(normZ(landmarks[17], landmarks[18])),
  };
}

function normZ(a, b) {
  const dx = b.x - a.x, dy = b.y - a.y, dz = (b.z || 0) - (a.z || 0);
  const mag = Math.sqrt(dx * dx + dy * dy + dz * dz);
  return mag === 0 ? 0 : dz / mag;
}

function sweepPalmNormalZ(landmarks) {
  const w = landmarks[0], p1 = landmarks[5], p5 = landmarks[17];
  const ax = p5.x - w.x, ay = p5.y - w.y, az = (p5.z || 0) - (w.z || 0);
  const bx = p1.x - w.x, by = p1.y - w.y, bz = (p1.z || 0) - (w.z || 0);
  const cz = ax * by - ay * bx;
  const mag = Math.sqrt((ay * bz - az * by) ** 2 + (az * bx - ax * bz) ** 2 + cz ** 2);
  return mag === 0 ? 0 : cz / mag;
}

// ── Real hand sanity check ─────────────────────────────────────────────────
// Verifies that detected landmarks look like a real hand, not a face or object.
// For each of the 4 fingers, the MCP→PIP segment should be at least as long
// as the PIP→DIP segment (real hand anatomy). Face false-positives fail this.
function sweepIsRealHand(landmarks) {
  const fingers = [
    [5, 6, 7],   // index  MCP, PIP, DIP
    [9, 10, 11], // middle
    [13, 14, 15], // ring
    [17, 18, 19], // pinky
  ];
  let passes = 0;
  for (const [a, b, c] of fingers) {
    const d1 = Math.hypot(landmarks[b].x - landmarks[a].x, landmarks[b].y - landmarks[a].y);
    const d2 = Math.hypot(landmarks[c].x - landmarks[b].x, landmarks[c].y - landmarks[b].y);
    if (d1 > 0.01 && d2 > 0.005 && d1 >= d2 * 0.5 && d2 >= d1 * 0.25) passes++;
  }
  return passes >= 3;
}

// ── Distance detection ─────────────────────────────────────────────────────
// Wrist (landmark 0) → middle MCP (landmark 9) in normalised coords scales
// inversely with real distance. Thresholds from testing at ~30–50 cm.
function sweepDistanceStatus(landmarks) {
  const w = landmarks[0], m = landmarks[9];
  const d = Math.sqrt((w.x - m.x) ** 2 + (w.y - m.y) ** 2);
  if (d < 0.12) return 'too_far';
  if (d > 0.38) return 'too_close';
  return 'good';
}

// ── Guidance text ──────────────────────────────────────────────────────────
function sweepGuidanceText() {
  const untuned = SWEEP_JOINTS.filter(({ key }) => !SWEEP_JOINT_RULES[key]);
  if (untuned.length > 0) return `${untuned.length} joint${untuned.length > 1 ? 's' : ''} have no rules set yet.`;
  const missing = SWEEP_JOINTS.filter(({ key }) => _sweepJointState[key].bestAngle === null);
  if (missing.length === 0) return 'All joints captured.';
  const ulnar  = missing.filter(({ finger }) => finger === 'ring' || finger === 'pinky');
  const radial = missing.filter(({ finger }) => finger === 'thumb' || finger === 'index' || finger === 'middle');
  if (ulnar.length > radial.length)  return 'Tilt camera toward pinky side.';
  if (radial.length > ulnar.length)  return 'Tilt camera toward thumb side.';
  return 'Keep sweeping around the hand.';
}

// ── Build completion grid ──────────────────────────────────────────────────
// Each cell shows: status dot, live angle (current frame), best recorded angle
function sweepBuildGrid() {
  const grid = document.getElementById('sweepGrid');
  if (!grid) return;
  const fingers      = ['thumb', 'index', 'middle', 'ring', 'pinky'];
  const fingerLabels = { thumb: 'THB', index: 'IDX', middle: 'MID', ring: 'RNG', pinky: 'PNK' };
  const joints       = ['mcp', 'pip', 'dip'];
  const jointLabels  = { mcp: 'MCP', pip: 'PIP', dip: 'DIP' };

  let html = '<div class="sweep-grid-row sweep-grid-header"><div class="sweep-grid-cell sweep-grid-label"></div>';
  for (const f of fingers) html += `<div class="sweep-grid-cell sweep-grid-col-label">${fingerLabels[f]}</div>`;
  html += '</div>';

  for (const j of joints) {
    html += `<div class="sweep-grid-row"><div class="sweep-grid-cell sweep-grid-label">${jointLabels[j]}</div>`;
    for (const f of fingers) {
      const disabled = f === 'thumb' && j === 'dip';
      const key = `${f}-${j}`;
      if (disabled) {
        html += `<div class="sweep-grid-cell sweep-cell-data"><div class="sweep-dot sweep-dot-disabled"></div></div>`;
      } else {
        html += `<div class="sweep-grid-cell sweep-cell-data">
          <div class="sweep-dot" id="sweep-dot-${key}" onclick="sweepResetJoint('${key}')"></div>
          <div class="sweep-live-val" id="sweep-live-${key}">—</div>
          <div class="sweep-best-val" id="sweep-best-${key}">—</div>
        </div>`;
      }
    }
    html += '</div>';
  }
  grid.innerHTML = html;
}

// ── Update grid UI ─────────────────────────────────────────────────────────
// Three states per dot: untuned (gray, default) / in-range (yellow) / captured (green)
function sweepUpdateGrid(metrics) {
  let captured = 0;
  for (const { key } of SWEEP_JOINTS) {
    const state  = _sweepJointState[key];
    const rules  = SWEEP_JOINT_RULES[key];
    const dot    = document.getElementById(`sweep-dot-${key}`);
    const bestEl = document.getElementById(`sweep-best-${key}`);

    if (dot) {
      const inCooldown = _sweepCooldowns[key] && performance.now() < _sweepCooldowns[key];
      dot.classList.remove('untuned', 'in-range', 'captured', 'cooldown');
      if (state.bestAngle !== null) {
        dot.classList.add('captured');
      } else if (inCooldown) {
        dot.classList.add('cooldown');
      } else if (!rules) {
        dot.classList.add('untuned');
      } else if (metrics && _sweepCapturing) {
        if (rules.some(r => metrics[r.metric] >= r.min && metrics[r.metric] <= r.max)) dot.classList.add('in-range');
      }
    }

    if (bestEl) bestEl.textContent = state.bestAngle !== null ? `${state.bestAngle}°` : '—';
    if (state.bestAngle !== null) captured++;
  }
  const btn = document.getElementById('sweepSaveBtn');
  if (btn) btn.textContent = `Save — ${captured}/14 captured`;
}

// ── Per-joint foreshortening check ────────────────────────────────────────
// Returns false if either segment forming the angle lever arm is too short in
// 2D relative to hand scale — indicating the segment is edge-on / occluded.
// Hand scale = wrist→middle MCP distance (scales with camera distance).
const SWEEP_FORESHORTENING_THRESHOLD = 0.12;

function sweepJointReliable(landmarks, def) {
  const handScale = Math.hypot(landmarks[9].x - landmarks[0].x, landmarks[9].y - landmarks[0].y);
  if (handScale < 0.01) return false;
  const seg1 = Math.hypot(landmarks[def.b].x - landmarks[def.a].x, landmarks[def.b].y - landmarks[def.a].y);
  const seg2 = Math.hypot(landmarks[def.c].x - landmarks[def.b].x, landmarks[def.c].y - landmarks[def.b].y);
  return seg1 >= SWEEP_FORESHORTENING_THRESHOLD * handScale
      && seg2 >= SWEEP_FORESHORTENING_THRESHOLD * handScale;
}

// ── Update live angle display (current frame) ──────────────────────────────
function sweepUpdateLiveAngles(landmarks) {
  for (const { key, joint, def } of SWEEP_JOINTS) {
    const el = document.getElementById(`sweep-live-${key}`);
    if (!el) continue;
    const trained = getTrainedAngle(key, landmarks);
    const raw     = trained !== null
      ? trained
      : Math.round(calibGetAngle(landmarks[def.a], landmarks[def.b], landmarks[def.c]));
    const limits = SWEEP_ANGLE_LIMITS[joint];
    const angle  = limits ? Math.min(raw, limits[1]) : raw;
    el.textContent = angle + '°';
    el.style.color = trained !== null ? 'var(--green)' : '';
  }
}

function sweepClearLiveAngles() {
  for (const { key } of SWEEP_JOINTS) {
    const el = document.getElementById(`sweep-live-${key}`);
    if (el) el.textContent = '—';
  }
}

// ── Update distance indicator UI ───────────────────────────────────────────
function sweepUpdateDistance(status) {
  const ids = { too_close: 'sweepDistTooClose', good: 'sweepDistGood', too_far: 'sweepDistTooFar' };
  for (const [k, id] of Object.entries(ids)) {
    const el = document.getElementById(id);
    if (el) el.classList.toggle('active', k === status);
  }
}

// ── Update metrics readout (debug only) ───────────────────────────────────
function sweepUpdateMetrics(metrics) {
  if (!SWEEP_DEBUG || !metrics) return;
  const el = document.getElementById('sweepMetricsReadout');
  if (!el) return;
  el.textContent = Object.entries(metrics)
    .map(([k, v]) => `${k}: ${v.toFixed(3)}`).join('\n');
}

// ── Landmark drawing for sweep ─────────────────────────────────────────────
// Tip landmarks (4,8,12,16,20) are used in DIP angle calculations but not drawn —
// MediaPipe's tip positions are inaccurate for curled/occluded fingers, and the
// large glowing dots from calibDrawLandmarks make that obvious. All other joints
// are drawn as uniform small dots.
const SWEEP_TIP_INDICES = new Set([4, 8, 12, 16, 20]);

function sweepDrawLandmarks(ctx, landmarks) {
  window.drawConnectors(ctx, landmarks, window.HAND_CONNECTIONS, {
    color: 'rgba(0, 229, 192, 0.45)', lineWidth: 2,
  });
  landmarks.forEach((lm, i) => {
    const x = lm.x * ctx.canvas.width;
    const y = lm.y * ctx.canvas.height;
    ctx.beginPath();
    ctx.arc(x, y, 4, 0, Math.PI * 2);
    ctx.fillStyle  = 'rgba(0,229,192,0.7)';
    ctx.shadowBlur = 5;
    ctx.shadowColor = '#00e5c0';
    ctx.fill();
    ctx.shadowBlur = 0;
  });
}

// ── MediaPipe results callback ─────────────────────────────────────────────
function sweepOnResults(results) {
  const canvas    = document.getElementById('sweepCanvas');
  const wrap      = document.getElementById('sweepCameraWrap');
  const trackDot  = document.getElementById('sweepTrackDot');
  const guidEl    = document.getElementById('sweepGuidance');
  if (!canvas) return;

  const ctx = canvas.getContext('2d');

  // Center-crop to square (same pattern as calibOnResults)
  const srcW = results.image.width;
  const srcH = results.image.height;
  const size = Math.min(srcW, srcH);
  const cropX = (srcW - size) / 2;
  const cropY = (srcH - size) / 2;
  canvas.width  = size;
  canvas.height = size;
  ctx.save();
  ctx.clearRect(0, 0, size, size);
  ctx.drawImage(results.image, cropX, cropY, size, size, 0, 0, size, size);

  const count = results.multiHandLandmarks ? results.multiHandLandmarks.length : 0;

  if (count === 0) {
    if (trackDot) trackDot.classList.remove('active');
    if (wrap)     wrap.classList.remove('scanning');
    sweepUpdateDistance('none');
    sweepUpdateMetrics(null);
    sweepClearLiveAngles();
    if (guidEl)  guidEl.textContent = 'Point camera at hand';
    ctx.restore();
    return;
  }

  const rawLandmarks = results.multiHandLandmarks[0];

  // Sanity check on raw landmarks — reject non-hand detections (face, objects, etc.)
  if (!sweepIsRealHand(rawLandmarks)) {
    if (trackDot) trackDot.classList.remove('active');
    if (wrap)     wrap.classList.remove('scanning');
    sweepUpdateDistance('none');
    sweepUpdateMetrics(null);
    sweepClearLiveAngles();
    for (const { key } of SWEEP_JOINTS) _sweepFrameCount[key] = 0;
    ctx.restore();
    return;
  }

  if (trackDot) trackDot.classList.add('active');
  if (wrap)     wrap.classList.add('scanning');

  // Smooth landmarks with One Euro Filter before any computation or drawing
  const t = performance.now() / 1000;
  const landmarks = rawLandmarks.map((lm, i) => ({
    ...lm,
    x: sweepOneEuroFilter(`${i}-x`, lm.x, t),
    y: sweepOneEuroFilter(`${i}-y`, lm.y, t),
    z: sweepOneEuroFilter(`${i}-z`, lm.z || 0, t),
  }));

  // Remap to cropped-square coords for drawing
  const drawLandmarks = landmarks.map(lm => ({
    ...lm,
    x: (lm.x * srcW - cropX) / size,
    y: (lm.y * srcH - cropY) / size,
  }));
  sweepDrawLandmarks(ctx, drawLandmarks);
  ctx.restore();

  const _sRawHand = (results.multiHandedness?.[0]?.label || '').toLowerCase();
  _currentHandLabel = _sRawHand === 'left' ? 'right' : _sRawHand === 'right' ? 'left' : null;
  extractVisualFeatures(canvas, landmarks).then(f => { _currentFrameFeatures = f; });

  // Distance indicator — informational only, does not block recording
  sweepUpdateDistance(sweepDistanceStatus(landmarks));

  // Compute all orientation metrics
  const metrics = sweepComputeMetrics(landmarks);
  sweepUpdateMetrics(metrics);

  // Update live angle display every frame
  sweepUpdateLiveAngles(landmarks);

  // Per-joint recording: only record when capturing is active and rule is satisfied
  for (const { key, joint, def } of SWEEP_JOINTS) {
    const rules = SWEEP_JOINT_RULES[key];
    if (!rules || !_sweepCapturing) { _sweepFrameCount[key] = 0; continue; }
    if (_sweepCooldowns[key] && performance.now() < _sweepCooldowns[key]) { _sweepFrameCount[key] = 0; continue; }

    const passing = rules.find(r => metrics[r.metric] >= r.min && metrics[r.metric] <= r.max);

    if (passing) {
      const val   = metrics[passing.metric];
      const angle = Math.round(calibGetAngle(landmarks[def.a], landmarks[def.b], landmarks[def.c]));
      const [minA, maxA] = SWEEP_ANGLE_LIMITS[joint] || SWEEP_ANGLE_LIMITS.pip;
      if (angle < minA || angle > maxA) { _sweepFrameCount[key] = 0; continue; }
      _sweepFrameCount[key] = (_sweepFrameCount[key] || 0) + 1;
      if (_sweepFrameCount[key] >= SWEEP_REQUIRED_FRAMES) {
        if (_sweepJointState[key].bestAngle === null || val > _sweepJointState[key].bestMetricVal) {
          _sweepJointState[key].bestMetricVal = val;
          _sweepJointState[key].bestAngle     = angle;
        }
      }
    } else {
      _sweepFrameCount[key] = 0;
    }
  }

  sweepUpdateGrid(metrics);
  if (guidEl) guidEl.textContent = sweepGuidanceText();

  // Debug frame logging — all metrics + all joint angles per frame
  if (SWEEP_DEBUG) {
    const frame = { t: performance.now().toFixed(0), ...Object.fromEntries(Object.entries(metrics).map(([k, v]) => [k, parseFloat(v.toFixed(3))])), angles: {} };
    for (const { key, def } of SWEEP_JOINTS) {
      frame.angles[key] = Math.round(calibGetAngle(landmarks[def.a], landmarks[def.b], landmarks[def.c]));
    }
    _sweepDebugLog.push(frame);
    if (_sweepDebugLog.length > 60) _sweepDebugLog.shift();
    const logEl = document.getElementById('sweepDebugLog');
    if (logEl) {
      logEl.textContent = _sweepDebugLog.slice(-5).map(f =>
        Object.entries(f).filter(([k]) => k !== 't' && k !== 'angles').map(([k, v]) => `${k}:${v}`).join(' ')
      ).join('\n');
    }
  }
}

// ── sweepToggleDebug / sweepCopyLog ────────────────────────────────────────
function sweepToggleDebug() {
  const panel = document.getElementById('sweepDebugPanel');
  if (panel) panel.style.display = panel.style.display === 'none' ? '' : 'none';
}

function sweepCopyLog() {
  navigator.clipboard.writeText(JSON.stringify(_sweepDebugLog, null, 2)).catch(() => {});
}

// ── sweepStartCamera ───────────────────────────────────────────────────────
// Mobile: RAF loop + direct getUserMedia (iOS Safari fix — same as patient camera).
// Desktop: window.Camera class. Reads _sweepFacingMode and _sweepMpHands.
function sweepStartCamera() {
  const video      = document.getElementById('sweepVideo');
  const overlay    = document.getElementById('sweepOverlay');
  const overlayMsg = document.getElementById('sweepOverlayMsg');

  // On mobile, override CSS mirror based on facing mode (rear = none, front = scaleX(-1)).
  // On desktop, CSS scaleX(-1) is always correct — front webcam raw image is naturally mirrored.
  if (isMobile()) {
    const mirror = _sweepFacingMode === 'user' ? 'scaleX(-1)' : 'none';
    video.style.transform = mirror;
    const sweepCanvas = document.getElementById('sweepCanvas');
    if (sweepCanvas) sweepCanvas.style.transform = mirror;
  }

  if (overlayMsg) overlayMsg.textContent = 'REQUESTING CAMERA...';

  if (isMobile()) {
    let active = true;
    _sweepMpCamera = { stop: () => { active = false; } };

    navigator.mediaDevices.getUserMedia({
      video: { facingMode: _sweepFacingMode, width: { ideal: 1280 }, height: { ideal: 720 } },
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
            try { await _sweepMpHands.send({ image: offCanvas }); } catch(e) {}
          }
          if (active) requestAnimationFrame(processFrame);
        };

        video.onloadedmetadata = () => {
          video.play();
          if (overlay)    overlay.classList.add('hidden');
          video.classList.add('ready');
          processFrame();
        };

        _sweepMpCamera = {
          stop: () => {
            active = false;
            stream.getTracks().forEach(t => t.stop());
            video.srcObject = null;
            video.classList.remove('ready');
          }
        };
      })
      .catch(err => {
        if (overlay)    overlay.classList.remove('hidden');
        if (overlayMsg) overlayMsg.textContent = 'CAMERA ACCESS DENIED';
        console.error(err);
      });
  } else {
    // Desktop: same RAF loop as mobile, send video directly (no offscreen canvas needed outside iOS Safari)
    let active = true;
    _sweepMpCamera = { stop: () => { active = false; } };

    navigator.mediaDevices.getUserMedia({
      video: { facingMode: { ideal: _sweepFacingMode }, width: { ideal: 1280 }, height: { ideal: 720 } },
      audio: false,
    }).then(stream => {
      video.srcObject = stream;

      const processFrame = async () => {
        if (!active) return;
        if (video.readyState >= 2) {
          try { await _sweepMpHands.send({ image: video }); } catch(e) {}
        }
        if (active) requestAnimationFrame(processFrame);
      };

      video.onloadedmetadata = () => {
        video.play();
        if (overlay) overlay.classList.add('hidden');
        video.classList.add('ready');
        processFrame();
      };

      _sweepMpCamera = {
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

// ── sweepFlipCamera ────────────────────────────────────────────────────────
function sweepFlipCamera() {
  _sweepFacingMode = _sweepFacingMode === 'environment' ? 'user' : 'environment';
  if (_sweepMpCamera) { _sweepMpCamera.stop(); _sweepMpCamera = null; }
  Object.keys(_sweepFilterStates).forEach(k => delete _sweepFilterStates[k]);
  sweepStartCamera();
}

// ── startSweepCalibration ──────────────────────────────────────────────────
async function startSweepCalibration(patientEmail) {
  _sweepPatientEmail = patientEmail;
  _sweepDebugLog     = [];
  _sweepFacingMode   = 'environment';
  sweepResetState();

  showScreen('sweepCalibrationScreen');
  sweepBuildGrid();
  sweepUpdateGrid(null);
  sweepUpdateDistance('none');

  const video      = document.getElementById('sweepVideo');
  const overlay    = document.getElementById('sweepOverlay');
  const overlayMsg = document.getElementById('sweepOverlayMsg');
  const statusEl   = document.getElementById('sweepStatusText');
  const dbgBtn     = document.getElementById('sweepDebugBtn');

  if (statusEl)  { statusEl.textContent = 'Loading...'; statusEl.className = ''; }
  if (overlayMsg)  overlayMsg.textContent = 'LOADING MEDIAPIPE...';
  if (dbgBtn)      dbgBtn.style.display = SWEEP_DEBUG ? '' : 'none';
  const metricsPanel = document.getElementById('sweepMetricsPanel');
  if (metricsPanel)  metricsPanel.style.display = SWEEP_DEBUG ? '' : 'none';

  if (_sweepMpCamera) return; // already running

  const hands = new window.Hands({
    locateFile: file => `https://cdn.jsdelivr.net/npm/@mediapipe/hands/${file}`,
  });
  hands.setOptions({
    maxNumHands: 1,
    modelComplexity: 1,
    minDetectionConfidence: 0.85,
    minTrackingConfidence: 0.75,
  });
  hands.onResults(sweepOnResults);
  _sweepMpHands = hands;

  sweepStartCamera();
}

// ── sweepBack ──────────────────────────────────────────────────────────────
function sweepBack() {
  if (_sweepMpCamera) { _sweepMpCamera.stop(); _sweepMpCamera = null; }
  _sweepMpHands = null;
  const video = document.getElementById('sweepVideo');
  if (video?.srcObject) {
    video.srcObject.getTracks().forEach(t => t.stop());
    video.srcObject = null;
    video.classList.remove('ready');
  }
  showScreen('therapistScreen');
}

// ── sweepSave ──────────────────────────────────────────────────────────────
async function sweepSave() {
  const btn = document.getElementById('sweepSaveBtn');
  if (btn) { btn.textContent = 'Saving...'; btn.disabled = true; }

  const joints = {};
  for (const { key } of SWEEP_JOINTS) {
    const s = _sweepJointState[key];
    if (s.bestAngle !== null) {
      joints[key] = { angle: s.bestAngle, metricVal: parseFloat(s.bestMetricVal.toFixed(3)) };
    }
  }

  try {
    await db.collection('calibration').doc(_sweepPatientEmail).set({
      joints,
      recordedAt: new Date().toISOString(),
      recordedBy: currentUser?.email || '',
    });
    if (btn) { btn.textContent = 'Saved'; btn.disabled = false; }
    setTimeout(sweepBack, 800);
  } catch (err) {
    if (btn) { btn.textContent = 'Save failed — retry'; btn.disabled = false; }
    console.error(err);
  }
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
let _mlRecordingId          = null;
let _mlLastRecordingId      = null;
let _mlLastRecordingCount   = 0;
let _mlCaptureInFlight      = false;
const ML_RECORD_FRAME_INTERVAL        = 15;
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

  if (results.multiHandLandmarks.length === 0 || !sweepIsRealHand(results.multiHandLandmarks[0])) {
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
    : Math.round(calibGetAngle(landmarks[jDef.def.a], landmarks[jDef.def.b], landmarks[jDef.def.c]));

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

// ── submitMLSample ─────────────────────────────────────────────────────────
async function submitMLSample() {
  if (!_mlCurrentLandmarks || !_mlSelectedHand) return;
  const select = document.getElementById('mlJointSelect');
  const slider = document.getElementById('mlAngleSlider');
  const btn    = document.getElementById('mlSubmitBtn');
  if (!select || !slider || !btn) return;

  const joint      = `${select.value}-${_mlSelectedHand}`;
  const trueAngle  = parseInt(slider.value);
  const lmSnapshot = _mlCurrentLandmarks.slice();
  const landmarks  = lmSnapshot.flatMap(lm => [lm.x, lm.y, lm.z || 0]);

  btn.disabled = true;
  btn.textContent = 'Saving...';

  try {
    const metaRef  = db.collection('trainingMeta').doc(joint);
    const meta     = await metaRef.get();
    const total    = meta.exists ? meta.data().totalSamples : 0;
    const chunkIdx = Math.floor(total / 50);
    const chunkId  = `${joint}_chunk_${chunkIdx}`;
    const notes       = document.getElementById('mlSessionNotes')?.value?.trim() || '';
    const sample      = { landmarks, trueAngle, recordedAt: new Date().toISOString(), recordedBy: currentUser?.email || '', notes, ...(_currentFrameFeatures ? { imageFeatures: _currentFrameFeatures } : {}) };

    const bucketKey = `histogram.b${Math.min(17, Math.floor(trueAngle / 10))}`;
    const orient    = mlClassifyOrientation(lmSnapshot);
    const gridKey   = `grid_${orient}_${mlAngleBucket(trueAngle)}`;
    const chunkRef  = db.collection('trainingChunks').doc(chunkId);
    const chunkSnap = await chunkRef.get();
    const existing  = chunkSnap.exists ? (chunkSnap.data().samples || []) : [];
    await chunkRef.set({ joint, chunk: chunkIdx, samples: [...existing, sample] });
    await metaRef.set({
      joint,
      totalSamples: firebase.firestore.FieldValue.increment(1),
      [bucketKey]: firebase.firestore.FieldValue.increment(1),
      [gridKey]: firebase.firestore.FieldValue.increment(1),
    }, { merge: true });

    btn.textContent = 'Saved!';
    setTimeout(() => { btn.textContent = 'Submit Sample'; btn.disabled = false; }, 700);

    slider.value = 90;
    mlOnSlider(90);
    await mlRefreshSampleCounts(joint);
  } catch (e) {
    btn.textContent = 'Error — retry';
    btn.disabled = false;
    console.error(e);
  }
}

// ── mlAutoCapture — called every ML_RECORD_FRAME_INTERVAL frames during recording
async function mlAutoCapture() {
  if (!_mlRecording || !_mlCurrentLandmarks || !_mlSelectedHand) return;
  if (_mlCaptureInFlight) return;
  _mlCaptureInFlight = true;

  const select = document.getElementById('mlJointSelect');
  const slider = document.getElementById('mlAngleSlider');
  if (!select || !slider) { _mlCaptureInFlight = false; return; }

  const joint        = `${select.value}-${_mlSelectedHand}`;
  const trueAngle    = parseInt(slider.value);
  const lmSnapshot   = _mlCurrentLandmarks.slice();
  const landmarks    = lmSnapshot.flatMap(lm => [lm.x, lm.y, lm.z || 0]);
  const notes        = document.getElementById('mlSessionNotes')?.value?.trim() || '';
  const sample       = {
    landmarks, trueAngle,
    recordedAt:  new Date().toISOString(),
    recordedBy:  currentUser?.email || '',
    recordingId: _mlRecordingId,
    notes,
    ...(_currentFrameFeatures ? { imageFeatures: _currentFrameFeatures } : {}),
  };

  const countEl = document.getElementById('mlRecordCount');

  try {
    const metaRef   = db.collection('trainingMeta').doc(joint);
    const meta      = await metaRef.get();
    const total     = meta.exists ? meta.data().totalSamples : 0;
    const chunkIdx  = Math.floor(total / 50);
    const chunkId   = `${joint}_chunk_${chunkIdx}`;
    const bucketKey = `histogram.b${Math.min(17, Math.floor(trueAngle / 10))}`;
    const orient    = mlClassifyOrientation(lmSnapshot);
    const gridKey   = `grid_${orient}_${mlAngleBucket(trueAngle)}`;

    const chunkRef  = db.collection('trainingChunks').doc(chunkId);
    const chunkSnap = await chunkRef.get();
    const existing  = chunkSnap.exists ? (chunkSnap.data().samples || []) : [];
    await chunkRef.set({ joint, chunk: chunkIdx, samples: [...existing, sample] });
    await metaRef.set({
      joint,
      totalSamples: firebase.firestore.FieldValue.increment(1),
      [bucketKey]:  firebase.firestore.FieldValue.increment(1),
      [gridKey]:    firebase.firestore.FieldValue.increment(1),
    }, { merge: true });

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
function mlStartRecording() {
  if (_mlRecording || !_mlSelectedHand) return;
  const slider    = document.getElementById('mlAngleSlider');
  const submitBtn = document.getElementById('mlSubmitBtn');
  const startBtn  = document.getElementById('mlRecordStartBtn');
  const stopBtn   = document.getElementById('mlRecordStopBtn');
  const countEl   = document.getElementById('mlRecordCount');
  const indicator = document.getElementById('mlRecordingIndicator');
  const undoBar   = document.getElementById('mlUndoBar');

  _mlRecording         = true;
  _mlRecordFrameCount  = 0;
  _mlRecordSampleCount = 0;
  _mlRecordingId       = Date.now().toString();

  if (slider)    slider.disabled    = true;
  if (submitBtn) submitBtn.disabled = true;
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
  const submitBtn = document.getElementById('mlSubmitBtn');
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

  if (slider)    { slider.value = 90; slider.disabled = false; mlOnSlider(90); }
  if (submitBtn) submitBtn.disabled = false;
  if (startBtn)  startBtn.style.display = '';
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
  _mlSelectedHand = hand;
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
  // Video modal
  openVideoModal, closeVideoModal, downloadSessionVideo,

  // Auth
  handleLogin, handleSignup, handleForgot, selectRole,
  handleConnect, skipConnect,
  logout, requestLogout, closeLogoutModal, confirmLogout,
  approveTherapist, rejectTherapist,

  // Navigation
  showScreen,

  // Patient flows
  startScanSession, startSessionWithProtocol, showExercisesScreen,
  showProgressScreen, openPatientMessaging, sendMessageFromPatient,

  // Camera session
  flipCamera, advanceSet, skipRest, completeSessionEarly, dismissSummary,
  toggleSound,

  // Therapist panel
  startCalibration, calibBack,
  startSweepCalibration, sweepBack, sweepSave, sweepToggleDebug, sweepCopyLog, sweepFlipCamera,
  sweepStartCapture, sweepResetJoint,

  // ML Trainer
  startMLTrainer, mlTrainerBack, mlFlipCamera, mlOnJointChange, mlOnSlider, mlUseSuggested, mlToggleModels, mlToggleStats, mlSaveNotes,
  submitMLSample, trainMLModel, mlStartRecording, mlStopRecording, mlUndoLastRecording, mlClearJoint, mlSetHand,
  backToPatientList, filterPatients, toggleTpSection, showRealPatient,
  deleteProtocol, editProtocol, cancelEditProtocol, assignProtocol,
  epAddCondition, epRemoveCondition, updateExerciseParamsUI,

  // Joint selector
  ejsDotClick, ejsSelectCard, ejsToggleFromInfo,
  ejsRemoveChip, ejsQuickSelectFinger, ejsSelectAll, ejsClearAll,

  // Exposed array for exercises screen start buttons
  get _exercisesProtocols() { return _exercisesProtocols; },
});