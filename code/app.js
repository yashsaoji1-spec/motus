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

db.enablePersistence({ synchronizeTabs: true }).catch(err => {
  if (err.code === 'failed-precondition') console.warn('Persistence failed: multiple tabs open');
  else if (err.code === 'unimplemented') console.warn('Persistence not available in this browser');
});

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

function showScreen(screenId) {
  const prevActive = document.querySelector('.screen.active');
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  const next = document.getElementById(screenId);
  next.classList.add('active');
  next.scrollTop = 0;
  if (screenTitles[screenId]) document.title = screenTitles[screenId];

  // Stop session camera when leaving camera screen
  if (prevActive && prevActive.id === 'cameraScreen' && screenId !== 'cameraScreen') {
    if (mpCamera) { mpCamera.stop(); mpCamera = null; }
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
    successEl.textContent = '✓ Password reset email sent! Check your inbox.';
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
  successEl.textContent = `✓ Connected to ${therapist.name}! Loading your exercises...`;
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
}

function logout() {
  if (mpCamera) { mpCamera.stop(); mpCamera = null; }
  if (calibMpCamera) { calibMpCamera.stop(); calibMpCamera = null; }
  if (restTimerInterval) { clearInterval(restTimerInterval); restTimerInterval = null; }
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

  const listEl = document.getElementById('patientExerciseList');
  if (protocols.length > 0 && listEl) {
    listEl.style.display = 'flex';
    _exercisesProtocols = protocols;
    const today = new Date().toDateString();
    const todaySessions = sessions.filter(s => new Date(s.date).toDateString() === today);
    const doneById = {};
    todaySessions.filter(s => s.protocolId).forEach(s => {
      doneById[s.protocolId] = (doneById[s.protocolId] || 0) + 1;
    });
    const PEL_MAX = 3;
    const pills = protocols.map((p, i) => {
      const done = doneById[p.id] || 0;
      const total = p.sets || 3;
      const isDone = done >= total;
      const cls = isDone ? 'pel-done' : done > 0 ? 'pel-partial' : '';
      const statusText = isDone ? '✓' : done > 0 ? `${done}/${total}` : `${total} sets`;
      return `<button class="pel-card ${cls}" onclick="startSessionWithProtocol(_exercisesProtocols[${i}])">
        <div class="pel-info">
          <div class="pel-name">${exerciseLabels[p.exerciseType] || p.exerciseType}</div>
        </div>
        <div class="pel-status">${statusText}</div>
      </button>`;
    });
    const overflow = protocols.length > PEL_MAX ? `<button class="pel-card pel-more" onclick="showExercisesScreen()">+${protocols.length - PEL_MAX} more</button>` : '';
    listEl.innerHTML = pills.slice(0, PEL_MAX).join('') + overflow;
  } else if (listEl) {
    listEl.style.display = 'none';
  }

  // Today's Plan card
  const planCard = document.getElementById('todaysPlanCard');
  const planList = document.getElementById('todaysPlanList');
  if (planCard && planList && protocols.length > 0) {
    planCard.style.display = 'block';
    planList.innerHTML = protocols.map(p => {
      const name = exerciseLabels[p.exerciseType] || p.exerciseType;
      const dose = `${p.sets || 3} × ${p.reps || 10} reps`;
      return `<div class="todays-plan-item"><span class="todays-plan-name">${name}</span><span class="todays-plan-dose">${dose}</span></div>`;
    }).join('');
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
  // Refresh protocol section in-place instead of rebuilding entire panel
  const updatedProtocols = await getProtocols(patientEmail);
  const protoBody = document.querySelector('#tps-protocol .tp-colsec-body');
  if (protoBody) {
    protoBody.innerHTML = buildProtocolForm(patientEmail, updatedProtocols);
    updateExerciseParamsUI('full_fist', null);
  } else {
    const snap = await db.collection('users').doc(patientEmail).get();
    if (snap.exists) showRealPatient({ email: patientEmail, ...snap.data() });
  }
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

  const EXS_COLLAPSED_MAX = 3;
  const cards = protocols.map((p, i) => {
    const doneSets = doneById[p.id] || 0;
    const totalSetsNeeded = p.sets || 3;
    const isDone = doneSets >= totalSetsNeeded;
    const statusCls = isDone ? 'exs-status-done' : doneSets > 0 ? 'exs-status-partial' : '';
    const badge = isDone ? '<span class="exs-row-badge done">Done</span>'
      : doneSets > 0 ? `<span class="exs-row-badge partial">${doneSets}/${totalSetsNeeded}</span>` : '';
    return `<div class="exs-row ${statusCls}" onclick="startSessionWithProtocol(_exercisesProtocols[${i}])">
      <div class="exs-row-left">
        <span class="exs-row-name">${exerciseLabels[p.exerciseType] || p.exerciseType}</span>
        <span class="exs-row-meta">${p.reps} reps × ${p.sets} sets · ${frequencyLabels[p.frequency] || p.frequency}</span>
      </div>
      <div class="exs-row-right">
        ${badge}
        <span class="exs-row-sets">${totalSetsNeeded} sets</span>
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
    const statusColor = compliance >= 80 ? 'var(--success)' : compliance >= 50 ? '#f59e0b' : 'var(--danger)';
    const statusText  = compliance >= 80 ? 'On track' : compliance >= 50 ? 'At risk' : sessions.length === 0 ? 'No sessions yet' : 'Non-compliant';
    item.innerHTML = `
      <div class="patient-name">${patient.name}</div>
      <div class="patient-connected">
        <span class="sh-indicator" style="background:${statusColor}"></span> ${statusText}${sessions.length > 0 ? ` — ${compliance}% compliance` : ''}
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
  const cutoff = new Date(Date.now() - 90 * 86400000).toISOString();
  const snap = await db.collection('sessions')
    .where('patientEmail', '==', patientEmail)
    .where('date', '>=', cutoff)
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
      <div class="tp-patient-header">
        <div>
          <h3 style="font-size: 1.5rem; font-weight: 600; margin: 0;">${patient.name}</h3>
          <p style="color: var(--muted); font-size: 0.85rem; margin: 4px 0 0;">Connected Patient</p>
        </div>
      </div>
      <div class="tp-empty-state">
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="var(--muted)" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
          <path d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2"/>
          <rect x="9" y="3" width="6" height="4" rx="1"/>
        </svg>
        <p>No sessions yet</p>
        <p class="tp-empty-sub">Data will appear after ${patient.name.split(' ')[0]} completes a session.</p>
      </div>
      ${makeCollapsible('joints', 'Joint monitoring', buildJointSelector(patient.email), false)}
      ${makeCollapsible('history', 'Session history', buildSessionHistory(sessions), false)}
      ${makeCollapsible('protocol', 'Add exercise to protocol', buildProtocolForm(patient.email, protocols), false)}
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
  const labels          = buildChartLabels(recent);

  panel.innerHTML = `
    <div class="tp-patient-header">
      <div>
        <h3 style="font-size: 1.5rem; font-weight: 600; margin: 0;">${patient.name}</h3>
        <p style="color: var(--muted); font-size: 0.85rem; margin: 4px 0 0;">Connected Patient — ${sessions.length} session${sessions.length !== 1 ? 's' : ''} recorded</p>
      </div>
    </div>
    <div class="stats-row">
      <div class="stat-card"><div class="stat-value"><span class="sh-indicator" style="background:${complianceColor}"></span>${compliance}%</div><div class="stat-label">7-Day Compliance</div></div>
      <div class="stat-card"><div class="stat-value">${avgROM}°</div><div class="stat-label">Avg Range of Motion</div></div>
      <div class="stat-card"><div class="stat-value">${avgPain}</div><div class="stat-label">Avg Pain Rating</div></div>
    </div>
    <div class="stats-row stats-row-full">
      <div class="stat-card stat-card-full"><div class="stat-value stat-value-sm">${totalReps} reps</div><div class="stat-label">Total Reps All Time</div></div>
    </div>
    <div class="tp-charts-grid">
    ${makeCollapsible('rom',     'Range of motion over time', '<canvas id="romChart" height="160"></canvas>', true)}
    ${makeCollapsible('pain',    'Pain rating over time',     '<canvas id="painChart" height="160"></canvas>', true)}
    </div>
    ${makeCollapsible('joints',  'Joint monitoring',          buildJointSelector(patient.email), false)}
    ${makeCollapsible('history', `Session history — ${sessions.length} session${sessions.length !== 1 ? 's' : ''}`, buildSessionHistory(sessions), false)}
    ${makeCollapsible('protocol','Add exercise to protocol',  buildProtocolForm(patient.email, protocols), false)}
    ${makeCollapsible('messages','Messages',                  buildMessagePanel(patient.email), false)}`;

  const tRomCfg = buildChartConfig(romData, { type: 'rom', color: '#0B6CB0', fillColor: 'rgba(11,108,176,0.06)' });
  new Chart(document.getElementById('romChart').getContext('2d'), {
    type: 'line', data: { labels, datasets: [tRomCfg.dataset] }, options: tRomCfg.options
  });
  const tPainCfg = buildChartConfig(painData, { type: 'pain', color: '#ef4444', fillColor: 'rgba(239,68,68,0.06)' });
  new Chart(document.getElementById('painChart').getContext('2d'), {
    type: 'line', data: { labels, datasets: [tPainCfg.dataset] }, options: tPainCfg.options
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

function groupSetsIntoSessions(sets) {
  if (sets.length === 0) return [];
  const sorted = [...sets].sort((a, b) => new Date(a.date) - new Date(b.date));
  const groups = [];
  let cur = { sets: [sorted[0]], protocolId: sorted[0].protocolId || '' };
  for (let i = 1; i < sorted.length; i++) {
    const gap = (new Date(sorted[i].date) - new Date(sorted[i - 1].date)) / 60000;
    const sameProto = (sorted[i].protocolId || '') === cur.protocolId;
    if (gap <= 30 && sameProto) { cur.sets.push(sorted[i]); }
    else { groups.push(cur); cur = { sets: [sorted[i]], protocolId: sorted[i].protocolId || '' }; }
  }
  groups.push(cur);
  return groups.map(g => {
    const s = g.sets;
    const totalReps = s.reduce((sum, x) => sum + (x.reps || 0), 0);
    const maxROM = Math.max(...s.map(x => x.rom || 0));
    const avgPain = s.length ? s.reduce((sum, x) => sum + (x.pain || 0), 0) / s.length : 0;
    const dur = Math.round((new Date(s[s.length - 1].date) - new Date(s[0].date)) / 60000);
    return {
      date: s[0].date, sets: s, setsCompleted: s.length,
      totalReps, maxROM, avgPain, durationMin: dur,
      exerciseType: s[0].exerciseType || '', protocolId: g.protocolId
    };
  });
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
    body.innerHTML = buildSessionHistory(window._lastHistorySessions);
  }
}

function buildSessionHistory(sessions) {
  window._lastHistorySessions = sessions;
  if (sessions.length === 0) {
    return `<div class="session-history-card"><h4>Session history</h4><div style="color:var(--muted); font-size:0.85rem; text-align:center; padding:20px;">No sessions recorded yet.</div></div>`;
  }
  const grouped = groupSetsIntoSessions(sessions);
  const allReversed = [...grouped].reverse();
  const visible = allReversed.slice(0, shVisibleCount);
  const hasMore = allReversed.length > shVisibleCount;
  const rows = visible.map((g, gi) => {
    const d = new Date(g.date);
    const dateStr = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    const timeStr = d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
    const exLabel = g.exerciseType ? (exerciseLabels[g.exerciseType] || g.exerciseType) : 'General';
    const romColor = g.maxROM >= 120 ? 'var(--success)' : g.maxROM >= 80 ? '#f59e0b' : 'var(--danger)';
    const painColor = g.avgPain <= 3 ? 'var(--success)' : g.avgPain <= 6 ? '#f59e0b' : 'var(--danger)';
    const rowId = `sh-exp-${gi}`;
    const durLabel = g.durationMin > 0 ? `${g.durationMin} min` : '< 1 min';
    const hasVideo = g.sets.some(s => s.videoUrl);
    const setDetail = g.sets.map((s, si) => {
      const sp = s.pain || 0, sr = s.rom || 0;
      const spc = sp <= 3 ? 'var(--success)' : sp <= 6 ? '#f59e0b' : 'var(--danger)';
      const src = sr >= 120 ? 'var(--success)' : sr >= 80 ? '#f59e0b' : 'var(--danger)';
      const t = new Date(s.date).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
      return `<div class="sh-set-detail-row">
        <span class="sh-set-label">Set ${si + 1}</span>
        <span class="sh-set-time">${t}</span>
        <span class="sh-set-val">${s.reps || 0} reps</span>
        <span class="sh-set-val"><span class="sh-indicator" style="background:${src}"></span>${sr}°</span>
        <span class="sh-set-val"><span class="sh-indicator" style="background:${spc}"></span>${sp}/10</span>
      </div>`;
    }).join('');
    return `
      <div class="sh-row sh-row-expandable" id="${rowId}" onclick="toggleShExpand('${rowId}')">
        <div class="sh-cell sh-date"><span class="sh-date-text">${dateStr}</span><span class="sh-time-text">${timeStr}</span></div>
        <div class="sh-cell sh-exercise">${exLabel}</div>
        <div class="sh-cell sh-setsreps">${g.setsCompleted} × ${g.totalReps}</div>
        <div class="sh-cell sh-rom"><span class="sh-indicator" style="background:${romColor}"></span>${g.maxROM}°</div>
        <div class="sh-cell sh-pain"><span class="sh-indicator" style="background:${painColor}"></span>${g.avgPain.toFixed(1)}</div>
        <div class="sh-cell sh-actions">${hasVideo ? '<svg class="sh-play-icon" width="16" height="16" viewBox="0 0 24 24" fill="var(--accent)" stroke="none"><polygon points="5,3 19,12 5,21"/></svg>' : ''}</div>
      </div>
      <div class="sh-detail-wrap" id="${rowId}-detail">
        <div class="sh-detail-inner">
          <div class="sh-detail-meta">
            <span class="sh-meta-chip">${g.setsCompleted} set${g.setsCompleted !== 1 ? 's' : ''}</span>
            <span class="sh-meta-chip">${durLabel}</span>
          </div>
          <div class="sh-set-detail-list">${setDetail}</div>
        </div>
      </div>`;
  }).join('');
  const loadMoreBtn = hasMore ? `<button class="sh-load-more" onclick="shLoadMore()">Show more (${allReversed.length - shVisibleCount} remaining)</button>` : '';
  return `
    <div class="session-history-card">
      <h4>Session history</h4>
      <div class="sh-grid-wrap">
        <div class="sh-grid-header">
          <div class="sh-hdr">Date</div>
          <div class="sh-hdr">Exercise</div>
          <div class="sh-hdr">Sets × Reps</div>
          <div class="sh-hdr">ROM</div>
          <div class="sh-hdr">Pain</div>
          <div class="sh-hdr"></div>
        </div>
        ${rows}
      </div>
      ${loadMoreBtn}
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
        <div id="protocolSuccess" class="auth-success" style="display:none; margin-top:12px;">✓ Protocol assigned successfully</div>
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
    const angle = Math.round(getJointAngle(landmarks, triplet));
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
      const angle = Math.round(getJointAngle(landmarks, triplet));
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
  await db.collection('sessions').add(doc);
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
    if (i < currentSet)   { dot.classList.add('complete'); dot.textContent = '✓'; }
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
  const camCtrlRestore = document.querySelector('.cam-controls');
  if (camCtrlRestore) camCtrlRestore.style.display = '';
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
    await db.collection('sessions').add(doc);
  }

  showSessionSummary(repCount > 0 ? repCount : 0);
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
var calHandDetected = false;

function showCalOverlay() {
  calHandDetected = false;
  var overlay = document.getElementById('calOverlay');
  var hint = document.getElementById('calHint');
  var error = document.getElementById('calError');
  overlay.style.display = 'flex';
  overlay.classList.remove('fade-out');
  hint.style.display = 'none';
  error.style.display = 'none';
  calHintTimer = setTimeout(function() {
    hint.style.display = 'block';
  }, 15000);
}

function hideCalOverlay() {
  if (calHandDetected) return;
  calHandDetected = true;
  clearTimeout(calHintTimer);
  var overlay = document.getElementById('calOverlay');
  overlay.classList.add('fade-out');
  setTimeout(function() { overlay.style.display = 'none'; }, 300);
}

function showCalError(msg) {
  clearTimeout(calHintTimer);
  document.getElementById('calOverlay').style.display = 'none';
  var error = document.getElementById('calError');
  document.getElementById('calErrorMsg').textContent = msg;
  error.style.display = 'flex';
}

function startCamera() {
  if (mpCamera) return;
  showCalOverlay();
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
    if (results.multiHandLandmarks && results.multiHandLandmarks.length > 0) {
      hideCalOverlay();
      for (const landmarks of results.multiHandLandmarks) {
        const w = sessionCanvas.width, h = sessionCanvas.height;
        const fingers = [[0,1,2,3,4],[5,6,7,8],[9,10,11,12],[13,14,15,16],[17,18,19,20]];
        const palm = [[0,5],[0,9],[0,13],[0,17],[5,9],[9,13],[13,17]];
        sessionCtx.strokeStyle = 'rgba(0,229,192,0.4)';
        sessionCtx.lineWidth = 2;
        sessionCtx.lineCap = 'round';
        for (const chain of fingers) {
          sessionCtx.beginPath();
          for (let j = 0; j < chain.length; j++) {
            const pt = landmarks[chain[j]];
            if (j === 0) sessionCtx.moveTo(pt.x * w, pt.y * h);
            else sessionCtx.lineTo(pt.x * w, pt.y * h);
          }
          sessionCtx.stroke();
        }
        sessionCtx.strokeStyle = 'rgba(0,229,192,0.25)';
        for (const [a, b] of palm) {
          sessionCtx.beginPath();
          sessionCtx.moveTo(landmarks[a].x * w, landmarks[a].y * h);
          sessionCtx.lineTo(landmarks[b].x * w, landmarks[b].y * h);
          sessionCtx.stroke();
        }
        const tips = [4, 8, 12, 16, 20];
        const knuckles = [1, 5, 9, 13, 17];
        for (let i = 0; i < 21; i++) {
          const lm = landmarks[i];
          const isTip = tips.includes(i);
          const isKnuckle = knuckles.includes(i);
          const r = isTip ? 5 : isKnuckle ? 3.5 : 2.5;
          if (isTip) { sessionCtx.shadowColor = 'rgba(0,229,192,0.6)'; sessionCtx.shadowBlur = 8; }
          sessionCtx.beginPath();
          sessionCtx.arc(lm.x * w, lm.y * h, r, 0, Math.PI * 2);
          sessionCtx.fillStyle = isTip ? 'rgba(0,229,192,0.9)' : isKnuckle ? 'rgba(0,229,192,0.5)' : 'rgba(255,255,255,0.3)';
          sessionCtx.fill();
          if (isTip) sessionCtx.shadowBlur = 0;
        }
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
  }
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
  const labels    = buildChartLabels(recent);
  const grouped = groupSetsIntoSessions(sessions);

  const historyHTML = [...grouped].reverse().map((g, idx) => {
    const d = new Date(g.date);
    const dateStr = d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
    const timeStr = d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
    const exLabel = g.exerciseType ? (exerciseLabels[g.exerciseType] || g.exerciseType) : 'Session';
    const painColor = g.avgPain <= 3 ? 'var(--success)' : g.avgPain <= 6 ? 'var(--warning)' : 'var(--danger)';
    const prevGroup = grouped[grouped.length - 1 - idx - 1];
    const trendHTML = (() => {
      if (!prevGroup) return '';
      const diff = g.maxROM - prevGroup.maxROM;
      if (Math.abs(diff) < 2) return '<span class="ses-trend ses-trend--flat">&rarr;</span>';
      return diff > 0
        ? `<span class="ses-trend ses-trend--up">&uarr;${diff}&deg;</span>`
        : `<span class="ses-trend ses-trend--down">&darr;${Math.abs(diff)}&deg;</span>`;
    })();
    const cardId = `psc-${idx}`;
    const setRows = g.sets.map((s, si) => {
      const sp = s.pain || 0, sr = s.rom || 0;
      const spc = sp <= 3 ? 'var(--success)' : sp <= 6 ? 'var(--warning)' : 'var(--danger)';
      const src = sr >= 120 ? 'var(--success)' : sr >= 80 ? 'var(--warning)' : 'var(--danger)';
      return `<div class="ses-set-row">
        <span class="ses-set-num">Set ${si + 1}</span>
        <span class="ses-set-stat">${s.reps || 0} reps</span>
        <span class="ses-set-stat"><span class="sh-indicator" style="background:${src}"></span>${sr}&deg;</span>
        <span class="ses-set-stat"><span class="sh-indicator" style="background:${spc}"></span>${sp}/10</span>
      </div>`;
    }).join('');
    const highPain = g.sets.reduce((mx, s, i) => (s.pain || 0) > (mx.p || 0) ? { p: s.pain, i: i + 1 } : mx, { p: 0, i: 0 });
    const durLabel = g.durationMin > 0 ? g.durationMin + ' min' : '< 1 min';
    return `
      <div class="psc-card" id="${cardId}">
        <div class="psc-header" onclick="document.getElementById('${cardId}').classList.toggle('expanded')">
          <div class="psc-header-left">
            <div class="psc-date">${dateStr}</div>
            <div class="psc-time">${timeStr}</div>
          </div>
          <div class="psc-header-stats">
            <div class="psc-stat-group"><span class="psc-stat-val">${g.setsCompleted}</span><span class="psc-stat-lbl">sets</span></div>
            <div class="psc-stat-group"><span class="psc-stat-val">${g.totalReps}</span><span class="psc-stat-lbl">reps</span></div>
            <div class="psc-stat-group"><span class="psc-stat-val">${g.maxROM}&deg;</span>${trendHTML}<span class="psc-stat-lbl">ROM</span></div>
            <div class="psc-stat-group"><span class="psc-stat-val"><span class="sh-indicator" style="background:${painColor}"></span>${g.avgPain.toFixed(1)}</span><span class="psc-stat-lbl">pain</span></div>
          </div>
          <span class="psc-chevron">&#x25BE;</span>
        </div>
        <div class="psc-body">
          <div class="psc-detail-row">
            <div class="psc-detail-item"><span class="psc-detail-label">Exercise</span><span class="psc-detail-val psc-exercise-tag">${exLabel}</span></div>
            <div class="psc-detail-item"><span class="psc-detail-label">Duration</span><span class="psc-detail-val">${durLabel}</span></div>
            ${highPain.p > 5 ? `<div class="psc-detail-item psc-pain-flag"><span class="psc-detail-label">Peak Pain</span><span class="psc-detail-val" style="color:var(--danger)">${highPain.p}/10 in Set ${highPain.i}</span></div>` : ''}
          </div>
          <div class="psc-sets-header">Per-Set Breakdown</div>
          <div class="psc-sets-list">${setRows}</div>
        </div>
      </div>`;
  }).join('');

  content.innerHTML = `
    <div class="stats-row stats-row-4" style="margin-bottom:24px;">
      <div class="stat-card"><div class="stat-value">${grouped.length}</div><div class="stat-label">Sessions</div></div>
      <div class="stat-card"><div class="stat-value">${avgROM}&deg;</div><div class="stat-label">Avg ROM</div></div>
      <div class="stat-card"><div class="stat-value">${bestROM}&deg;</div><div class="stat-label">Best ROM</div></div>
      <div class="stat-card"><div class="stat-value">${avgPain}</div><div class="stat-label">Avg Pain</div></div>
    </div>
    <div class="chart-card" style="margin-bottom:24px;">
      <h4>Range of Motion Over Time</h4>
      <canvas id="patientRomChart" height="160"></canvas>
    </div>
    <div class="chart-card" style="margin-bottom:24px;">
      <h4>Pain Level Over Time</h4>
      <canvas id="patientPainChart" height="160"></canvas>
    </div>
    <p style="font-size:0.8rem; color:var(--muted); margin-bottom:12px; text-transform:uppercase; letter-spacing:0.5px;">Session History</p>
    <div class="psc-list">${historyHTML}</div>`;
  const romCfg = buildChartConfig(romData, { type: 'rom', color: '#0B6CB0', fillColor: 'rgba(11,108,176,0.06)' });
  new Chart(document.getElementById('patientRomChart').getContext('2d'), {
    type: 'line', data: { labels, datasets: [romCfg.dataset] }, options: romCfg.options
  });
  const painCfg = buildChartConfig(painData, { type: 'pain', color: '#ef4444', fillColor: 'rgba(239,68,68,0.06)' });
  new Chart(document.getElementById('patientPainChart').getContext('2d'), {
    type: 'line', data: { labels, datasets: [painCfg.dataset] }, options: painCfg.options
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
      ${EJS_FINGER_LABELS[f]}
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
          <svg viewBox="0 -16 200 298" xmlns="http://www.w3.org/2000/svg" class="ejs-hand-svg">
            <defs>
              <linearGradient id="handGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stop-color="#e8eff8"/>
                <stop offset="100%" stop-color="#d4dde9"/>
              </linearGradient>
            </defs>
            <g class="ejs-hand-group">
              <path class="ejs-hand-shape" fill="url(#handGrad)" d="
                M 98,278
                C 136,278 166,260 176,236
                C 184,216 186,194 186,174
                C 186,160 182,150 176,144
                C 172,138 170,126 169,106
                C 168,82 167,60 167,44
                C 166,32 163,26 157,26
                C 151,26 148,32 147,44
                C 147,60 147,82 147,106
                C 147,126 147,138 147,144
                C 145,150 142,152 140,150
                C 138,148 139,142 139,136
                C 140,106 140,72 140,42
                C 140,22 139,10 138,2
                C 136,-4 133,-6 128,-6
                C 123,-6 120,-4 118,2
                C 117,10 116,22 116,42
                C 116,72 116,106 116,136
                C 115,144 112,148 109,146
                C 106,144 106,140 106,136
                C 107,104 107,66 107,32
                C 107,12 106,0 105,-4
                C 103,-10 100,-14 95,-14
                C 90,-14 87,-10 85,-4
                C 84,0 83,12 83,32
                C 83,66 83,104 83,136
                C 82,144 79,148 76,146
                C 74,144 74,140 74,136
                C 75,106 76,72 76,38
                C 76,20 75,8 74,2
                C 72,-2 69,-4 64,-4
                C 59,-4 56,-2 54,2
                C 53,8 52,20 52,38
                C 52,72 52,106 52,140
                C 50,158 46,174 42,184
                C 38,190 36,184 36,172
                C 37,150 39,128 40,104
                C 41,84 42,70 42,58
                C 42,46 38,38 31,38
                C 24,38 20,46 19,58
                C 18,70 18,84 18,104
                C 17,132 16,162 15,184
                C 10,212 12,242 30,260
                C 48,274 74,278 98,278
                Z"/>
            </g>
            <g class="ejs-jdot" id="ejsdot-thumb-mcp" onclick="ejsDotClick('thumb','mcp')"><circle class="ejs-dot" cx="34" cy="148" r="5" data-finger="thumb"/></g>
            <g class="ejs-jdot" id="ejsdot-thumb-pip" onclick="ejsDotClick('thumb','pip')"><circle class="ejs-dot" cx="30" cy="108" r="5" data-finger="thumb"/></g>
            <g class="ejs-jdot" id="ejsdot-thumb-tip" onclick="ejsDotClick('thumb','tip')"><circle class="ejs-dot" cx="30" cy="74" r="5" data-finger="thumb"/></g>
            <g class="ejs-jdot" id="ejsdot-index-mcp" onclick="ejsDotClick('index','mcp')"><circle class="ejs-dot" cx="64" cy="130" r="5" data-finger="index"/></g>
            <g class="ejs-jdot" id="ejsdot-index-pip" onclick="ejsDotClick('index','pip')"><circle class="ejs-dot" cx="64" cy="88" r="5" data-finger="index"/></g>
            <g class="ejs-jdot" id="ejsdot-index-dip" onclick="ejsDotClick('index','dip')"><circle class="ejs-dot" cx="64" cy="52" r="5" data-finger="index"/></g>
            <g class="ejs-jdot" id="ejsdot-index-tip" onclick="ejsDotClick('index','tip')"><circle class="ejs-dot" cx="64" cy="22" r="5" data-finger="index"/></g>
            <g class="ejs-jdot" id="ejsdot-middle-mcp" onclick="ejsDotClick('middle','mcp')"><circle class="ejs-dot" cx="95" cy="128" r="5" data-finger="middle"/></g>
            <g class="ejs-jdot" id="ejsdot-middle-pip" onclick="ejsDotClick('middle','pip')"><circle class="ejs-dot" cx="95" cy="82" r="5" data-finger="middle"/></g>
            <g class="ejs-jdot" id="ejsdot-middle-dip" onclick="ejsDotClick('middle','dip')"><circle class="ejs-dot" cx="95" cy="40" r="5" data-finger="middle"/></g>
            <g class="ejs-jdot" id="ejsdot-middle-tip" onclick="ejsDotClick('middle','tip')"><circle class="ejs-dot" cx="95" cy="8" r="5" data-finger="middle"/></g>
            <g class="ejs-jdot" id="ejsdot-ring-mcp" onclick="ejsDotClick('ring','mcp')"><circle class="ejs-dot" cx="128" cy="126" r="5" data-finger="ring"/></g>
            <g class="ejs-jdot" id="ejsdot-ring-pip" onclick="ejsDotClick('ring','pip')"><circle class="ejs-dot" cx="128" cy="84" r="5" data-finger="ring"/></g>
            <g class="ejs-jdot" id="ejsdot-ring-dip" onclick="ejsDotClick('ring','dip')"><circle class="ejs-dot" cx="128" cy="48" r="5" data-finger="ring"/></g>
            <g class="ejs-jdot" id="ejsdot-ring-tip" onclick="ejsDotClick('ring','tip')"><circle class="ejs-dot" cx="128" cy="18" r="5" data-finger="ring"/></g>
            <g class="ejs-jdot" id="ejsdot-pinky-mcp" onclick="ejsDotClick('pinky','mcp')"><circle class="ejs-dot" cx="157" cy="130" r="5" data-finger="pinky"/></g>
            <g class="ejs-jdot" id="ejsdot-pinky-pip" onclick="ejsDotClick('pinky','pip')"><circle class="ejs-dot" cx="157" cy="100" r="5" data-finger="pinky"/></g>
            <g class="ejs-jdot" id="ejsdot-pinky-dip" onclick="ejsDotClick('pinky','dip')"><circle class="ejs-dot" cx="157" cy="72" r="5" data-finger="pinky"/></g>
            <g class="ejs-jdot" id="ejsdot-pinky-tip" onclick="ejsDotClick('pinky','tip')"><circle class="ejs-dot" cx="157" cy="48" r="5" data-finger="pinky"/></g>
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
          <div class="ejs-info-empty-icon"><svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="var(--muted)" stroke-width="1.5" stroke-linecap="round"><circle cx="12" cy="12" r="3"/><path d="M12 2v4m0 12v4M2 12h4m12 0h4"/></svg></div>
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
            <button class="ejs-track-btn ejs-track-add" id="ejsTrackBtn" onclick="ejsToggleFromInfo()">＋ Track This Joint</button>
          </div>
        </div>
        <div class="ejs-tracked-summary">
          <div class="ejs-tracked-header">
            <div class="ejs-tracked-title">Tracked Joints</div>
            <div class="ejs-tracked-count" id="ejsTrackedCount"></div>
          </div>
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
  ejsToggleJoint(key);
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
    btn.textContent = '✕ Remove from Tracking';
    btn.style.background = '';
  } else {
    btn.className   = 'ejs-track-btn ejs-track-add';
    btn.textContent = '＋ Track This Joint';
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
    const validCount = EJS_JOINTS.filter(j => { const d = EJS_JOINT_DATA[`${finger}-${j}`]; return d && d.lm !== null; }).length;
    const fc = document.getElementById(`ejsfcount-${finger}`);
    if (fc) fc.textContent = `${count} / ${validCount}`;
  });

  // SVG dots
  EJS_FINGERS.forEach(finger => {
    EJS_JOINTS.forEach(joint => {
      const key  = `${finger}-${joint}`;
      const dot  = document.getElementById(`ejsdot-${finger}-${joint}`);
      if (!dot) return;
      const selected = selectedJoints.has(key);
      dot.classList.toggle('ejs-dot-selected', selected);
      const circle = dot.querySelector('.ejs-dot');
      if (circle) circle.style.stroke = selected ? EJS_FINGER_COLORS[finger] : '';
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
        btn.textContent = '✕ Remove from Tracking';
        btn.style.background = '';
      } else {
        btn.className   = 'ejs-track-btn ejs-track-add';
        btn.textContent = '＋ Track This Joint';
        btn.style.background = EJS_FINGER_COLORS[data.finger];
      }
    }
  }
}

function ejsRenderChips() {
  const wrap = document.getElementById('ejsTrackedChips');
  const countEl = document.getElementById('ejsTrackedCount');
  if (!wrap) return;
  const totalValid = Object.values(EJS_JOINT_DATA).filter(d => d.lm !== null).length;
  if (countEl) countEl.textContent = selectedJoints.size > 0 ? `${selectedJoints.size} of ${totalValid}` : '';
  if (selectedJoints.size === 0) {
    wrap.innerHTML = '<span class="ejs-tracked-empty">None selected</span>';
    return;
  }
  const grouped = {};
  [...selectedJoints].forEach(key => {
    const data = EJS_JOINT_DATA[key];
    if (!data) return;
    if (!grouped[data.finger]) grouped[data.finger] = [];
    grouped[data.finger].push({ key, data });
  });
  wrap.innerHTML = EJS_FINGERS.filter(f => grouped[f]).map(finger => {
    const color = EJS_FINGER_COLORS[finger];
    const chips = grouped[finger].map(({ key, data }) =>
      `<button class="ejs-chip" style="color:${color};border-color:${color}22;background:${color}0D" onclick="ejsRemoveChip('${key}')">${data.label}<span class="ejs-chip-x">×</span></button>`
    ).join('');
    return `<div class="ejs-tracked-finger-row">
      <span class="ejs-tracked-finger-label" style="color:${color}">${EJS_FINGER_LABELS[finger]}</span>
      <div class="ejs-tracked-finger-chips">${chips}</div>
    </div>`;
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
    const time = timeAgo(m.timestamp);
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
   WINDOW EXPORTS — required for Vite module mode so inline HTML onclick
   handlers can reach these functions (modules don't auto-pollute globals)
   ══════════════════════════════════════════════════════════════════════════ */
Object.assign(window, {
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
  copyClinicCode, startCalibration, calibBack,
  backToPatientList, filterPatients, toggleTpSection, showRealPatient,
  deleteProtocol, editProtocol, cancelEditProtocol, assignProtocol,
  epAddCondition, epRemoveCondition, updateExerciseParamsUI,

  // Joint selector
  ejsDotClick, ejsSelectCard, ejsToggleFromInfo,
  ejsRemoveChip, ejsQuickSelectFinger, ejsSelectAll, ejsClearAll,

  // Session history
  shLoadMore, toggleShExpand, toggleExerciseList,

  // Exposed array for exercises screen start buttons
  get _exercisesProtocols() { return _exercisesProtocols; },
});