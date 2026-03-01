/* ═══════════════════════════════════════════════════════════════════════════
   PhalanX — Merged Script
   Combines: dashboard.html inline JS + script.js (calibration tracker)
   ═══════════════════════════════════════════════════════════════════════════ */

/* ══════════════════════════════════════════════════════════════════════════
   SECTION 1: AUTH & STATE  (from dashboard)
   ══════════════════════════════════════════════════════════════════════════ */

let currentRole = null;
let currentUser = null;
let selectedRole = 'patient';

const demoAccounts = [
  { name: "Dr. Sarah Chen", email: "sarah.chen@mayoclinic.org", password: "demo123", role: "therapist" },
  { name: "James Park",     email: "james.park@gmail.com",      password: "demo123", role: "patient" }
];

function getAccounts() {
  const stored = localStorage.getItem('phalanx_accounts');
  const saved  = stored ? JSON.parse(stored) : [];
  return [...demoAccounts, ...saved];
}

function saveAccount(account) {
  const stored = localStorage.getItem('phalanx_accounts');
  const saved  = stored ? JSON.parse(stored) : [];
  saved.push(account);
  localStorage.setItem('phalanx_accounts', JSON.stringify(saved));
}

function generateCodeForEmail(email) {
  let hash = 0;
  for (let i = 0; i < email.length; i++) {
    hash = ((hash << 5) - hash) + email.charCodeAt(i);
    hash |= 0;
  }
  return String(Math.abs(hash) % 900000 + 100000);
}

function getConnections() {
  const stored = localStorage.getItem('phalanx_connections');
  return stored ? JSON.parse(stored) : {};
}

function saveConnection(therapistEmail, patientEmail) {
  const connections = getConnections();
  if (!connections[therapistEmail]) connections[therapistEmail] = [];
  if (!connections[therapistEmail].includes(patientEmail)) {
    connections[therapistEmail].push(patientEmail);
  }
  localStorage.setItem('phalanx_connections', JSON.stringify(connections));
}

function getTherapistForCode(code) {
  const seen = new Set();
  for (const t of getAccounts().filter(a => a.role === 'therapist')) {
    if (seen.has(t.email)) continue;
    seen.add(t.email);
    if (generateCodeForEmail(t.email) === code) return t;
  }
  return null;
}

function getConnectedPatients(therapistEmail) {
  const connections   = getConnections();
  const patientEmails = connections[therapistEmail] || [];
  return patientEmails.map(email => getAccounts().find(a => a.email === email)).filter(Boolean);
}

function getConnectedTherapist() {
  const connections = getConnections();
  for (const [therapistEmail, patients] of Object.entries(connections)) {
    if (patients.includes(currentUser.email)) return therapistEmail;
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
};

function showScreen(screenId) {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  document.getElementById(screenId).classList.add('active');
  if (screenTitles[screenId]) document.title = screenTitles[screenId];

  // Stop calibration camera when leaving calibration screen
  if (screenId !== 'calibrationScreen' && calibMpCamera) {
    calibMpCamera.stop();
    calibMpCamera = null;
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

function handleLogin() {
  hideError('loginError');
  const email    = document.getElementById('loginEmail').value.trim().toLowerCase();
  const password = document.getElementById('loginPassword').value;
  if (!email || !password) { showError('loginError', 'Please enter your email and password.'); return; }
  const match = getAccounts().find(a => a.email.toLowerCase() === email && a.password === password);
  if (!match) { showError('loginError', 'Incorrect email or password. Try again.'); return; }
  currentUser = match;
  currentRole = match.role;
  loginSuccess();
}

function handleSignup() {
  hideError('signupError');
  const name     = document.getElementById('signupName').value.trim();
  const email    = document.getElementById('signupEmail').value.trim().toLowerCase();
  const password = document.getElementById('signupPassword').value;
  if (!name || !email || !password) { showError('signupError', 'Please fill in all fields.'); return; }
  if (password.length < 6) { showError('signupError', 'Password must be at least 6 characters.'); return; }
  if (getAccounts().find(a => a.email.toLowerCase() === email)) { showError('signupError', 'An account with that email already exists.'); return; }
  const newAccount = { name, email, password, role: selectedRole };
  saveAccount(newAccount);
  currentUser = newAccount;
  currentRole = selectedRole;
  loginSuccess();
}

let forgotStep = 1;

function handleForgot() {
  if (forgotStep === 1) {
    const email = document.getElementById('forgotEmail').value.trim().toLowerCase();
    if (!email) { showError('forgotError', 'Please enter your email.'); return; }
    const match = getAccounts().find(a => a.email.toLowerCase() === email);
    if (!match) { showError('forgotError', 'No account found with that email.'); return; }
    if (demoAccounts.map(a => a.email.toLowerCase()).includes(email)) {
      showError('forgotError', 'Demo accounts cannot be changed. Try creating your own account.'); return;
    }
    hideError('forgotError');
    document.getElementById('newPasswordField').style.display = 'flex';
    document.getElementById('forgotBtn').textContent = 'Reset Password';
    document.getElementById('forgotEmail').disabled  = true;
    forgotStep = 2;
  } else {
    const email       = document.getElementById('forgotEmail').value.trim().toLowerCase();
    const newPassword = document.getElementById('forgotNewPassword').value;
    if (newPassword.length < 6) { showError('forgotError', 'Password must be at least 6 characters.'); return; }
    const stored = localStorage.getItem('phalanx_accounts');
    const saved  = stored ? JSON.parse(stored) : [];
    const idx    = saved.findIndex(a => a.email.toLowerCase() === email);
    if (idx !== -1) { saved[idx].password = newPassword; localStorage.setItem('phalanx_accounts', JSON.stringify(saved)); }
    hideError('forgotError');
    const successEl = document.getElementById('forgotSuccess');
    successEl.textContent = '✓ Password reset! You can now sign in.';
    successEl.style.display = 'block';
    setTimeout(() => {
      forgotStep = 1;
      document.getElementById('forgotEmail').disabled    = false;
      document.getElementById('forgotEmail').value       = '';
      document.getElementById('forgotNewPassword').value = '';
      document.getElementById('newPasswordField').style.display = 'none';
      document.getElementById('forgotBtn').textContent   = 'Find Account';
      successEl.style.display = 'none';
      showScreen('loginScreen');
    }, 2000);
  }
}

/* ══════════════════════════════════════════════════════════════════════════
   SECTION 4: CONNECT
   ══════════════════════════════════════════════════════════════════════════ */

function handleConnect() {
  hideError('connectError');
  const code = document.getElementById('clinicCodeInput').value.trim();
  if (code.length !== 6 || isNaN(code)) { showError('connectError', 'Please enter a valid 6-digit clinic code.'); return; }
  const therapist = getTherapistForCode(code);
  if (!therapist) { showError('connectError', 'No therapist found with that code. Double-check with your therapist.'); return; }
  saveConnection(therapist.email, currentUser.email);
  const successEl = document.getElementById('connectSuccess');
  successEl.textContent = `✓ Connected to ${therapist.name}! Loading your exercises...`;
  successEl.style.display = 'block';
  setTimeout(() => {
    showScreen('patientScreen');
    updatePatientHomeScreen();
    initSetTracker();
  }, 1800);
}

function skipConnect() {
  showScreen('patientScreen');
  updatePatientHomeScreen();
  initSetTracker();
}

/* ══════════════════════════════════════════════════════════════════════════
   SECTION 5: LOGIN SUCCESS / LOGOUT
   ══════════════════════════════════════════════════════════════════════════ */

function loginSuccess() {
  if (currentRole === 'therapist') {
    showScreen('therapistScreen');
    document.getElementById('therapistCode').textContent = generateCodeForEmail(currentUser.email);
    loadConnectedPatients();
  } else {
    const connections      = getConnections();
    const alreadyConnected = Object.values(connections).some(list => list.includes(currentUser.email));
    if (alreadyConnected) {
      showScreen('patientScreen');
      updatePatientHomeScreen();
      initSetTracker();
    } else {
      showScreen('connectScreen');
    }
  }
}

function logout() {
  currentUser = null;
  currentRole = null;
  if (mpCamera) { mpCamera.stop(); mpCamera = null; }
  if (calibMpCamera) { calibMpCamera.stop(); calibMpCamera = null; }
  showScreen('loginScreen');
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
   SECTION 6: PATIENT HOME
   ══════════════════════════════════════════════════════════════════════════ */

function getTodayCompletion(email) {
  const protocol = getExistingProtocol(email);
  if (!protocol) return null;
  const today    = new Date().toDateString();
  const sessions = getPatientSessions(email);
  const done     = sessions.filter(s => new Date(s.date).toDateString() === today).length;
  const required = protocol.sets || 3;
  return { done, required };
}

function updatePatientHomeScreen() {
  if (!currentUser) return;
  const hour     = new Date().getHours();
  const greeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';
  document.getElementById('patientGreeting').textContent    = greeting;
  document.getElementById('patientDisplayName').textContent = currentUser.name;

  const protocol = getExistingProtocol(currentUser.email);
  const strip    = document.getElementById('patientProtocolStrip');
  if (protocol && strip) {
    strip.style.display = 'flex';
    document.getElementById('protocolStripExercise').textContent = exerciseLabels[protocol.exerciseType] || protocol.exerciseType;
    document.getElementById('protocolStripMeta').textContent     = 'Assigned by ' + protocol.assignedBy;

    const comp = getTodayCompletion(currentUser.email);
    const statusEl = document.getElementById('protocolStripStatus');
    if (statusEl && comp) {
      if (comp.done >= comp.required) {
        statusEl.textContent = 'Done';
        statusEl.className   = 'protocol-strip-status status-done';
      } else if (comp.done > 0) {
        statusEl.textContent = `${comp.done} / ${comp.required} sets`;
        statusEl.className   = 'protocol-strip-status status-partial';
      } else {
        statusEl.textContent = `${comp.required} sets`;
        statusEl.className   = 'protocol-strip-status status-pending';
      }
    }
  }

  const therapistEmail = getConnectedTherapist();
  if (therapistEmail) {
    const therapist = getAccounts().find(a => a.email === therapistEmail);
    if (therapist) document.getElementById('therapistContactName').textContent = 'Message ' + therapist.name;
  }

  // Streak
  const sessions  = getPatientSessions(currentUser.email);
  const streak    = calcStreak(sessions);
  const badgeEl   = document.getElementById('streakBadge');
  const countEl   = document.getElementById('streakCount');
  const labelEl   = document.getElementById('streakLabel');
  const bestEl    = document.getElementById('streakBest');
  if (badgeEl && streak.current > 0) {
    badgeEl.style.display = 'flex';
    countEl.textContent   = streak.current;
    labelEl.textContent   = 'day streak';
    if (streak.best > 1) bestEl.textContent = `Best: ${streak.best} days`;
  } else if (badgeEl) {
    badgeEl.style.display = 'none';
  }

  const tEmail = getConnectedTherapist();
  const msgBadge = document.getElementById('patientUnreadBadge');
  if (msgBadge && tEmail) {
    const n = unreadCount(currentUser.email, tEmail);
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

function startScanSession() {
  showScreen('cameraScreen');
  document.getElementById('soundToggleBtn').textContent = soundEnabled ? '🔊 Sound On' : '🔇 Sound Off';
  loadPatientProtocol();
  initSetTracker();
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
  finger_abduction:       'Finger Abduction'
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
  full_fist:         { metric:'angle', conditions:[{finger:'index',joint:'pip',flexAt:90,extendAt:30},{finger:'middle',joint:'pip',flexAt:90,extendAt:30},{finger:'ring',joint:'pip',flexAt:90,extendAt:30},{finger:'pinky',joint:'pip',flexAt:90,extendAt:30}], requireAll:true  },
  hook_fist:         { metric:'angle', conditions:[{finger:'index',joint:'dip',flexAt:60,extendAt:20},{finger:'middle',joint:'dip',flexAt:60,extendAt:20},{finger:'ring',joint:'dip',flexAt:60,extendAt:20},{finger:'pinky',joint:'dip',flexAt:60,extendAt:20}], requireAll:true  },
  tabletop_position: { metric:'angle', conditions:[{finger:'index',joint:'mcp',flexAt:70,extendAt:20},{finger:'middle',joint:'mcp',flexAt:70,extendAt:20},{finger:'ring',joint:'mcp',flexAt:70,extendAt:20},{finger:'pinky',joint:'mcp',flexAt:70,extendAt:20}], requireAll:true  },
  index_flexion:     { metric:'angle', conditions:[{finger:'index', joint:'pip',flexAt:90,extendAt:30}], requireAll:false },
  middle_flexion:    { metric:'angle', conditions:[{finger:'middle',joint:'pip',flexAt:90,extendAt:30}], requireAll:false },
  ring_flexion:      { metric:'angle', conditions:[{finger:'ring',  joint:'pip',flexAt:90,extendAt:30}], requireAll:false },
  pinky_flexion:     { metric:'angle', conditions:[{finger:'pinky', joint:'pip',flexAt:90,extendAt:30}], requireAll:false },
  thumb_flexion:     { metric:'angle', conditions:[{finger:'thumb', joint:'mcp',flexAt:50,extendAt:15}], requireAll:false },
  finger_flexion:    { metric:'angle', conditions:[{finger:'index',joint:'pip',flexAt:90,extendAt:30},{finger:'middle',joint:'pip',flexAt:90,extendAt:30},{finger:'ring',joint:'pip',flexAt:90,extendAt:30},{finger:'pinky',joint:'pip',flexAt:90,extendAt:30}], requireAll:false },
  finger_extension:  { metric:'angle', conditions:[{finger:'index',joint:'mcp',flexAt:50,extendAt:10},{finger:'middle',joint:'mcp',flexAt:50,extendAt:10},{finger:'ring',joint:'mcp',flexAt:50,extendAt:10},{finger:'pinky',joint:'mcp',flexAt:50,extendAt:10}], requireAll:false },
  grip_squeeze:      { metric:'angle', conditions:[{finger:'index',joint:'pip',flexAt:90,extendAt:30},{finger:'middle',joint:'pip',flexAt:90,extendAt:30},{finger:'ring',joint:'pip',flexAt:90,extendAt:30},{finger:'pinky',joint:'pip',flexAt:90,extendAt:30}], requireAll:true  },
  thumb_index_opposition: { metric:'distance',  tipA:4,  tipB:8,  closeAt:0.08, openAt:0.25 },
  thumb_opposition:       { metric:'distance',  tipA:4,  tipB:12, closeAt:0.08, openAt:0.25 },
  finger_abduction:       { metric:'abduction', tipA:8,  tipB:20, spreadAt:0.30, closedAt:0.15 },
};

// b is pivot. pip uses [MCP, PIP, Tip] = composite flexion, matching current middle-finger behavior.
const FINGER_LANDMARK_MAP = {
  thumb:  { mcp:[0,2,3],   pip:[2,3,4],    dip:null        },
  index:  { mcp:[0,5,6],   pip:[5,6,8],    dip:[6,7,8]     },
  middle: { mcp:[0,9,10],  pip:[9,10,12],  dip:[10,11,12]  },
  ring:   { mcp:[0,13,14], pip:[13,14,16], dip:[14,15,16]  },
  pinky:  { mcp:[0,17,18], pip:[17,18,20], dip:[18,19,20]  },
};

function getExistingProtocol(patientEmail) {
  const stored = localStorage.getItem(`phalanx_protocol_${patientEmail}`);
  return stored ? JSON.parse(stored) : null;
}

function deleteProtocol(patientEmail) {
  if (!confirm(`Remove the assigned protocol for this patient? This cannot be undone.`)) return;
  localStorage.removeItem(`phalanx_protocol_${patientEmail}`);
  const patient = getAccounts().find(a => a.email === patientEmail);
  if (patient) showRealPatient(patient);
}

function assignProtocol(patientEmail) {
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

  const protocol = {
    exerciseType,
    reps:         parseInt(document.getElementById('protocolReps').value),
    sets:         parseInt(document.getElementById('protocolSets').value),
    frequency:    document.getElementById('protocolFrequency').value,
    notes:        document.getElementById('protocolNotes').value.trim(),
    assignedBy:   currentUser.name,
    assignedAt:   new Date().toISOString()
  };
  if (exerciseParams) protocol.exerciseParams = exerciseParams;
  if (isNaN(protocol.reps) || protocol.reps < 1) { alert('Please enter a valid rep count.'); return; }
  if (isNaN(protocol.sets) || protocol.sets < 1) { alert('Please enter a valid set count.'); return; }
  localStorage.setItem(`phalanx_protocol_${patientEmail}`, JSON.stringify(protocol));
  const successEl = document.getElementById('protocolSuccess');
  if (successEl) { successEl.style.display = 'block'; setTimeout(() => { successEl.style.display = 'none'; }, 3000); }
}

function formatProtocol(p) {
  return `
    <div class="protocol-existing-detail">
      <div class="protocol-tag"><strong>Exercise:</strong> ${exerciseLabels[p.exerciseType] || p.exerciseType}</div>
      <div class="protocol-tag"><strong>Reps:</strong> ${p.reps} per set</div>
      <div class="protocol-tag"><strong>Sets:</strong> ${p.sets} per session</div>
      <div class="protocol-tag"><strong>Frequency:</strong> ${frequencyLabels[p.frequency] || p.frequency}</div>
    </div>
    ${p.notes ? `<p class="protocol-notes-display">"${p.notes}"</p>` : ''}
    <p style="font-size:0.75rem; color:#334155; margin-top:8px;">Assigned by ${p.assignedBy}</p>`;
}

function loadPatientProtocol() {
  if (!currentUser) return;
  const protocol  = getExistingProtocol(currentUser.email);
  const container = document.getElementById('assignedProtocol');
  const inner     = document.getElementById('assignedProtocolInner');
  if (!container || !inner) return;
  if (!protocol) { container.style.display = 'none'; return; }
  TARGET_REPS = protocol.reps;
  totalSets   = protocol.sets || 3;
  container.style.display = 'block';
  inner.innerHTML = `
    <div style="display:flex; justify-content:space-between; align-items:center;">
      <span class="protocol-title">Your Assigned Protocol</span>
      <span style="font-size:0.75rem; color:#475569;">from ${protocol.assignedBy}</span>
    </div>
    <div class="protocol-exercise-name">${exerciseLabels[protocol.exerciseType] || protocol.exerciseType}</div>
    <div class="protocol-meta">
      <span class="protocol-meta-item"><strong>Reps:</strong> ${protocol.reps}</span>
      <span class="protocol-meta-item"><strong>Sets:</strong> ${protocol.sets}</span>
      <span class="protocol-meta-item"><strong>Frequency:</strong> ${frequencyLabels[protocol.frequency] || protocol.frequency}</span>
    </div>
    ${protocol.notes ? `<p class="protocol-patient-notes">"${protocol.notes}"</p>` : ''}`;
}

function showExercisesScreen() {
  const protocol = currentUser ? getExistingProtocol(currentUser.email) : null;
  const inner = document.getElementById('exercisesScreenInner');
  if (!inner) return;

  if (!protocol) {
    inner.innerHTML = `
      <div class="exs-empty">
        <div class="exs-empty-icon">💪</div>
        <p class="exs-empty-title">No protocol yet</p>
        <p class="exs-empty-sub">Your therapist has not assigned any exercizes for you.</p>
      </div>`;
    showScreen('exercisesScreen');
    return;
  }

  const comp = getTodayCompletion(currentUser.email);
  let completionHTML = '';
  if (comp) {
    const isComplete = comp.done >= comp.required;
    const isPartial  = comp.done > 0 && !isComplete;
    const statusText  = isComplete ? 'Completed today' : isPartial ? `${comp.done} of ${comp.required} sets done today` : 'Not completed today';
    const statusClass = isComplete ? 'exs-status-done' : isPartial ? 'exs-status-partial' : 'exs-status-pending';
    completionHTML = `
      <div class="exs-section-card exs-status-card ${statusClass}">
        <div class="exs-status-text">${statusText}</div>
        ${isPartial ? `<div class="exs-status-sub">Keep going — ${comp.required - comp.done} set${comp.required - comp.done > 1 ? 's' : ''} remaining</div>` : ''}
        ${!isPartial && !isComplete ? `<div class="exs-status-sub">${comp.required} set${comp.required > 1 ? 's' : ''} assigned for today</div>` : ''}
      </div>`;
  }

  const notesHTML = protocol.notes ? `
    <div class="exs-section-card">
      <div class="exs-section-title">Notes from your therapist</div>
      <p class="exs-notes-text">"${protocol.notes}"</p>
    </div>` : '';

  inner.innerHTML = `
    <div class="exs-hero-card">
      <div class="exs-hero-label">Assigned Exercise</div>
      <div class="exs-hero-name">${exerciseLabels[protocol.exerciseType] || protocol.exerciseType}</div>
      <div class="exs-stats-row">
        <div class="exs-stat">
          <div class="exs-stat-value">${protocol.reps}</div>
          <div class="exs-stat-label">Reps per Set</div>
        </div>
        <div class="exs-stat-divider"></div>
        <div class="exs-stat">
          <div class="exs-stat-value">${protocol.sets}</div>
          <div class="exs-stat-label">Sets</div>
        </div>
        <div class="exs-stat-divider"></div>
        <div class="exs-stat">
          <div class="exs-stat-value exs-stat-freq">${frequencyLabels[protocol.frequency] || protocol.frequency}</div>
          <div class="exs-stat-label">Frequency</div>
        </div>
      </div>
      <div class="exs-assigned-by">Prescribed by ${protocol.assignedBy}</div>
    </div>
    ${completionHTML}
    ${notesHTML}`;

  showScreen('exercisesScreen');
}

/* ══════════════════════════════════════════════════════════════════════════
   SECTION 8: THERAPIST PANEL
   ══════════════════════════════════════════════════════════════════════════ */

function loadConnectedPatients() {
  document.querySelectorAll('.patient-item').forEach(el => el.remove());
  const existing = document.getElementById('noPatientsMsg');
  if (existing) existing.remove();
  const patients = getConnectedPatients(currentUser.email);
  if (patients.length === 0) {
    const msg = document.createElement('div');
    msg.id = 'noPatientsMsg';
    msg.className = 'no-patients';
    msg.innerHTML = `No patients connected yet.<br/>Share your clinic code above<br/>with your patients to get started.`;
    document.querySelector('.sidebar-footer').before(msg);
    return;
  }
  patients.forEach(patient => {
    const item      = document.createElement('div');
    item.className  = 'patient-item';
    const sessions  = getPatientSessions(patient.email);
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
  });
}

function getPatientSessions(patientEmail) {
  const stored = localStorage.getItem(`phalanx_sessions_${patientEmail}`);
  return stored ? JSON.parse(stored) : [];
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

function showRealPatient(patient) {
  const sessions = getPatientSessions(patient.email);
  const panel    = document.getElementById('mainPanel');

  if (sessions.length === 0) {
    panel.innerHTML = `
      <h3>${patient.name}</h3>
      <p class="subtitle">Connected Patient</p>
      <div class="chart-card" style="text-align:center; color:#475569; padding:40px;">
        No session data yet. Data will appear here once ${patient.name.split(' ')[0]} completes their first session.
      </div>
      ${buildJointSelector(patient.email)}
      ${buildSessionHistory(patient.email)}
      ${buildProtocolForm(patient.email)}
      ${buildMessagePanel(patient.email)}`;
    document.getElementById('therapistMsgSend').onclick = () => {
      const input = document.getElementById('therapistMsgInput');
      sendMessage(currentUser.email, patient.email, input.value);
      input.value = '';
      renderThread('therapistMsgThread', currentUser.email, patient.email);
    };
    renderThread('therapistMsgThread', currentUser.email, patient.email);
    ejsInit();
    const _ep0 = getExistingProtocol(patient.email);
    updateExerciseParamsUI(_ep0?.exerciseType || 'full_fist', _ep0?.exerciseParams || null);
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
    <div class="stats-row">
      <div class="stat-card"><div class="stat-value" style="color:${complianceColor}">${compliance}%</div><div class="stat-label">7-Day Compliance</div></div>
      <div class="stat-card"><div class="stat-value">${avgROM}°</div><div class="stat-label">Avg Range of Motion</div></div>
      <div class="stat-card"><div class="stat-value">${avgPain}</div><div class="stat-label">Avg Pain Rating</div></div>
    </div>
    <div class="stats-row" style="margin-top:-8px;">
      <div class="stat-card" style="grid-column:span 3;"><div class="stat-value" style="font-size:1.4rem">${totalReps} reps</div><div class="stat-label">Total Reps All Time</div></div>
    </div>
    <div class="chart-card"><h4>Range of Motion Over Time (degrees)</h4><canvas id="romChart" height="100"></canvas></div>
    <div class="chart-card"><h4>Pain Rating Over Time (1–10)</h4><canvas id="painChart" height="100"></canvas></div>
    ${buildJointSelector(patient.email)}
    ${buildSessionHistory(patient.email)}
    ${buildProtocolForm(patient.email)}
    ${buildMessagePanel(patient.email)}`;

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

  document.getElementById('therapistMsgSend').onclick = () => {
    const input = document.getElementById('therapistMsgInput');
    sendMessage(currentUser.email, patient.email, input.value);
    input.value = '';
    renderThread('therapistMsgThread', currentUser.email, patient.email);
  };
  renderThread('therapistMsgThread', currentUser.email, patient.email);
  ejsInit();
  const _ep = getExistingProtocol(patient.email);
  updateExerciseParamsUI(_ep?.exerciseType || 'full_fist', _ep?.exerciseParams || null);
}

function buildSessionHistory(patientEmail) {
  const sessions = getPatientSessions(patientEmail);
  if (sessions.length === 0) {
    return `<div class="session-history-card"><h4>Session History</h4><div style="color:#334155; font-size:0.85rem; text-align:center; padding:20px;">No sessions recorded yet.</div></div>`;
  }
  const rows = [...sessions].reverse().map(s => {
    const d         = new Date(s.date);
    const dateStr   = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
    const timeStr   = d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
    const pain      = s.pain || 0;
    const rom       = s.rom  || 0;
    const painColor = pain <= 3 ? '#22c55e' : pain <= 6 ? '#f59e0b' : '#ef4444';
    const romColor  = rom  >= 120 ? '#22c55e' : rom >= 80 ? '#f59e0b' : '#94a3b8';
    return `
      <div class="session-history-row">
        <div class="session-date">
          <div style="color:#94a3b8; font-weight:600;">${dateStr}</div>
          <div style="font-size:0.72rem; color:#475569;">${timeStr}</div>
        </div>
        <div class="session-stat" style="color:#3b82f6;">${s.reps || 0} reps</div>
        <div class="session-stat" style="color:${romColor};">${rom}°</div>
        <div class="session-stat">
          <span class="session-pain-dot" style="background:${painColor}"></span>
          <span style="color:${painColor}">${pain}/10</span>
        </div>
      </div>`;
  }).join('');
  return `
    <div class="session-history-card">
      <h4>Session History — ${sessions.length} session${sessions.length !== 1 ? 's' : ''}</h4>
      <div class="session-history-list">
        <div class="session-history-row header-row">
          <span>Date & Time</span><span style="text-align:center">Reps</span>
          <span style="text-align:center">ROM</span><span style="text-align:center">Pain</span>
        </div>
        ${rows}
      </div>
    </div>`;
}

function buildProtocolForm(patientEmail) {
  const existing = getExistingProtocol(patientEmail);
  return `
    <div class="protocol-card">
      <h4>Assign Exercise Protocol</h4>
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
        <div class="protocol-row">
          <div class="protocol-field">
            <label>Reps per Set</label>
            <input type="number" id="protocolReps" value="${existing?.reps || 10}" min="1" max="50" />
          </div>
          <div class="protocol-field">
            <label>Sets per Session</label>
            <input type="number" id="protocolSets" value="${existing?.sets || 3}" min="1" max="10" />
          </div>
          <div class="protocol-field">
            <label>Frequency</label>
            <select id="protocolFrequency">
              <option value="daily" ${existing?.frequency==='daily'?'selected':''}>Daily</option>
              <option value="twice_daily" ${existing?.frequency==='twice_daily'?'selected':''}>Twice Daily</option>
              <option value="every_other" ${existing?.frequency==='every_other'?'selected':''}>Every Other Day</option>
              <option value="three_week" ${existing?.frequency==='three_week'?'selected':''}>3x Per Week</option>
            </select>
          </div>
        </div>
        <div class="protocol-field">
          <label>Notes for Patient</label>
          <textarea id="protocolNotes" placeholder="e.g. Move slowly and stop if pain exceeds 6/10..." rows="3">${existing?.notes || ''}</textarea>
        </div>
        <button class="protocol-btn" onclick="assignProtocol('${patientEmail}')">Assign Protocol</button>
        <div id="protocolSuccess" class="auth-success" style="display:none; margin-top:12px;">✓ Protocol assigned successfully</div>
      </div>
      ${existing ? `<div class="protocol-existing">
        <div class="protocol-existing-header">
          <p class="protocol-existing-label">Current Protocol</p>
          <button class="protocol-delete-btn" onclick="deleteProtocol('${patientEmail}')">Remove</button>
        </div>
        ${formatProtocol(existing)}
      </div>` : ''}
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
        <span>Finger</span><span>Joint</span><span>Flex °</span><span>Extend °</span><span></span>
      </div>
      <div id="epConditionsList"></div>
      <button class="ep-add-btn" onclick="epAddCondition()">+ Add Condition</button>
    </div>
    <div class="ep-require-all-row" id="epRequireAllRow" style="display:none">
      <label class="ep-checkbox-label">
        <input type="checkbox" id="epRequireAll" ${requireAllChecked}>
        Require ALL conditions to be met simultaneously
      </label>
    </div>
    <p class="ep-threshold-hint">0° = straight. Flex at: joint must bend to or past this angle. Extend at: joint must straighten to or below this angle.</p>`;

  normalized.conditions.forEach(c => epAddCondition(c.finger, c.joint, c.flexAt, c.extendAt));
}

/* ══════════════════════════════════════════════════════════════════════════
   SECTION 9: REP COUNTER  (patient session camera)
   ══════════════════════════════════════════════════════════════════════════ */

let TARGET_REPS = 10;
let repCount    = 0;
let fingerState = 'unknown';
let lastROM     = 0;
let maxROMThisSession = 0;
let sessionPaused = false;
let lastRepTime = null;
let setPainValues = [];
let restTimerInterval = null;
let restTimeRemaining = 30;
let currentExerciseParams = null;
const REST_DURATION = 30;
let soundEnabled = localStorage.getItem('phalanx_sound') !== 'false';

function playRepSound() {
  if (!soundEnabled) return;
  try {
    const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    const oscillator = audioCtx.createOscillator();
    const gainNode   = audioCtx.createGain();
    oscillator.connect(gainNode);
    gainNode.connect(audioCtx.destination);
    oscillator.type = 'sine';
    oscillator.frequency.setValueAtTime(880, audioCtx.currentTime);
    oscillator.frequency.exponentialRampToValueAtTime(440, audioCtx.currentTime + 0.08);
    gainNode.gain.setValueAtTime(0.3, audioCtx.currentTime);
    gainNode.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.12);
    oscillator.start(audioCtx.currentTime);
    oscillator.stop(audioCtx.currentTime + 0.12);
  } catch(e) {}
}

let speedWarningTimeout = null;

function showSpeedWarning() {
  const el = document.getElementById('speedWarning');
  if (!el) return;
  el.classList.add('show');
  clearTimeout(speedWarningTimeout);
  speedWarningTimeout = setTimeout(() => el.classList.remove('show'), 2000);
}

function toggleSound() {
  soundEnabled = !soundEnabled;
  localStorage.setItem('phalanx_sound', soundEnabled);
  document.getElementById('soundToggleBtn').textContent = soundEnabled ? '🔊 Sound On' : '🔇 Sound Off';
}

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
  return {
    metric:     'angle',
    conditions: ep.fingers.map(finger => ({ finger, joint: ep.joint, flexAt: ep.flexAt, extendAt: ep.extendAt })),
    requireAll: ep.requireAll ?? false,
  };
}

// Returns { isFlexed, isExtended, repAngle } based on currentExerciseParams
function checkExerciseState(landmarks) {
  const p = currentExerciseParams;
  if (!p) return null;

  if (p.metric === 'distance') {
    const dist = getTipDistance(landmarks, p.tipA, p.tipB);
    return { isFlexed: dist <= p.closeAt, isExtended: dist >= p.openAt, repAngle: Math.round(dist * 100) };
  }

  if (p.metric === 'abduction') {
    const spread = getTipDistance(landmarks, p.tipA, p.tipB);
    return { isFlexed: spread >= p.spreadAt, isExtended: spread <= p.closedAt, repAngle: Math.round(spread * 100) };
  }

  // metric === 'angle' — 0° = straight, higher = more bent
  // flexed when angle >= flexAt (bent enough), extended when angle <= extendAt (straight enough)
  const results = p.conditions.map(cond => {
    const triplet = FINGER_LANDMARK_MAP[cond.finger]?.[cond.joint];
    if (!triplet) return null;
    const angle = getJointAngle(landmarks, triplet);
    return {
      angle,
      isFlexed:   angle >= cond.flexAt,
      isExtended: angle <= cond.extendAt,
    };
  }).filter(r => r !== null);

  if (results.length === 0) return null;

  const isFlexed   = p.requireAll ? results.every(r => r.isFlexed)   : results.some(r => r.isFlexed);
  const isExtended = p.requireAll ? results.every(r => r.isExtended) : results.some(r => r.isExtended);
  const repAngle   = Math.round(Math.max(...results.map(r => r.angle)));

  return { isFlexed, isExtended, repAngle };
}

function updateRepCount(landmarks) {
  if (sessionPaused) return;
  let isFlexed, isExtended, repAngle;

  if (currentExerciseParams) {
    const state = checkExerciseState(landmarks);
    if (!state) return;                         // bad config, skip silently
    ({ isFlexed, isExtended, repAngle } = state);
  } else {
    // Legacy fallback — middle finger PIP, 0°=straight convention
    const angle = getMiddleFingerAngle(landmarks);
    repAngle = Math.round(angle); isFlexed = angle > 90; isExtended = angle < 30;
  }

  if (repAngle > maxROMThisSession) { maxROMThisSession = repAngle; lastROM = repAngle; }

  if (isFlexed && fingerState !== 'flexed') {
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
  renderRepDots();
  document.getElementById('repDisplay').textContent    = repCount;
  document.getElementById('progressText').textContent  = `${repCount} / ${TARGET_REPS} reps`;
  const pct = Math.min((repCount / TARGET_REPS) * 100, 100);
  document.getElementById('progressFill').style.width  = pct + '%';
  if (repCount >= TARGET_REPS) {
    document.getElementById('targetDisplay').textContent      = TARGET_REPS;
    document.getElementById('currentSetDisplay').textContent  = currentSet;
    document.getElementById('totalSetsDisplay').textContent   = totalSets;
    if (currentSet >= totalSets) {
      document.getElementById('allSetsComplete').style.display = 'block';
      document.getElementById('nextSetBtn').textContent = '🏆 Finish Session';
    }
    document.getElementById('congratsOverlay').classList.add('show');
    sessionPaused = true;
  }
}

function saveSession() {
  const session = {
    date:           new Date().toISOString(),
    reps:           repCount,
    pain:           parseInt(document.getElementById('painSliderCongrats').value),
    rom:            lastROM,
    therapistEmail: getConnectedTherapist()
  };
  const key      = `phalanx_sessions_${currentUser.email}`;
  const stored   = localStorage.getItem(key);
  const sessions = stored ? JSON.parse(stored) : [];
  sessions.push(session);
  localStorage.setItem(key, JSON.stringify(sessions));
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

function initSetTracker() {
  if (currentUser) {
    const protocol = getExistingProtocol(currentUser.email);
    if (protocol) {
      totalSets  = protocol.sets || 3;
      TARGET_REPS = protocol.reps || 10;
      const rawEp = protocol.exerciseParams || EXERCISE_DEFAULTS[protocol.exerciseType] || null;
      currentExerciseParams = normalizeExerciseParams(rawEp);
    } else {
      currentExerciseParams = null;
    }
  }
  currentSet   = 1;
  setsComplete = 0;
  repCount     = 0;
  fingerState  = 'unknown';
  lastROM      = 0;
  maxROMThisSession = 0;
  sessionPaused = false;
  lastRepTime = null;
  setPainValues = [];
  renderSetDots();
  renderRepDots();
  updateRepUI();
}

function renderSetDots() {
  const tracker = document.getElementById('setTracker');
  if (!tracker) return;
  tracker.innerHTML = '';
  for (let i = 1; i <= totalSets; i++) {
    const dot = document.createElement('div');
    dot.className = 'set-dot';
    if (i < currentSet)    dot.classList.add('complete');
    if (i === currentSet)  dot.classList.add('active');
    tracker.appendChild(dot);
  }
  const label = document.getElementById('setLabel');
  if (label) label.textContent = `Set ${currentSet} of ${totalSets}`;
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

function advanceSet() {
  sessionPaused = false;
  if (repCount >= TARGET_REPS) {
    const painVal = parseInt(document.getElementById('painSliderCongrats').value);
    setPainValues.push(painVal);
    saveSession();
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
  maxROMThisSession = 0;
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
    if (restTimeRemaining <= 10) document.getElementById('restTimerFill').style.background = '#22c55e';
    if (restTimeRemaining <= 0) skipRest();
  }, 1000);
}

function skipRest() {
  clearInterval(restTimerInterval);
  restTimerInterval = null;
  document.getElementById('restTimerOverlay').style.display = 'none';
  document.getElementById('restTimerFill').style.background = '#3b82f6';
  sessionPaused = false;
}

function showSessionSummary(partialReps = 0) {
  const totalRepsCompleted = setsComplete * TARGET_REPS + partialReps;
  const avgPain = setPainValues.length > 0
    ? (setPainValues.reduce((a, b) => a + b, 0) / setPainValues.length).toFixed(1)
    : '—';
  const maxROM = Math.round(maxROMThisSession);
  document.getElementById('summaryTotalReps').textContent = totalRepsCompleted;
  document.getElementById('summarySets').textContent      = setsComplete;
  document.getElementById('summaryMaxROM').textContent    = maxROM + '°';
  document.getElementById('summaryAvgPain').textContent   = avgPain;
  let message = '';
  if (avgPain !== '—' && parseFloat(avgPain) >= 7) {
    message = '⚠️ Pain was high today. Consider mentioning this to your therapist.';
  } else if (maxROM >= 120) {
    message = '💪 Excellent range of motion today! You\'re making great progress.';
  } else if (maxROM >= 80) {
    message = '👍 Good session. Consistency is key — keep it up!';
  } else {
    message = '✅ Session logged. Every rep counts toward your recovery.';
  }
  document.getElementById('summaryMessage').textContent = message;
  document.getElementById('sessionSummaryOverlay').style.display = 'flex';
}

function dismissSummary() {
  document.getElementById('sessionSummaryOverlay').style.display = 'none';
  initSetTracker();
  showScreen('patientScreen');
  updatePatientHomeScreen();
}

function completeSessionEarly() {
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
    const session = {
      date:           new Date().toISOString(),
      reps:           repCount,
      pain:           painVal,
      rom:            lastROM,
      therapistEmail: getConnectedTherapist()
    };
    const key      = `phalanx_sessions_${currentUser.email}`;
    const stored   = localStorage.getItem(key);
    const sessions = stored ? JSON.parse(stored) : [];
    sessions.push(session);
    localStorage.setItem(key, JSON.stringify(sessions));
  }

  showSessionSummary(repCount > 0 ? repCount : 0);
}

/* ══════════════════════════════════════════════════════════════════════════
   SECTION 11: PATIENT SESSION CAMERA  (dashboard camera)
   ══════════════════════════════════════════════════════════════════════════ */

let mpCamera = null;

function startCamera() {
  if (mpCamera) return;
  const sessionVideo  = document.getElementById('patientVideo');
  const sessionCanvas = document.getElementById('patientCanvas');
  const sessionCtx    = sessionCanvas.getContext('2d');
  const hands = new Hands({ locateFile: f => `https://cdn.jsdelivr.net/npm/@mediapipe/hands/${f}` });
  hands.setOptions({ maxNumHands: 1, modelComplexity: 1, minDetectionConfidence: 0.7, minTrackingConfidence: 0.5 });
  hands.onResults(results => {
    sessionCtx.clearRect(0, 0, sessionCanvas.width, sessionCanvas.height);
    sessionCtx.drawImage(results.image, 0, 0, sessionCanvas.width, sessionCanvas.height);
    if (results.multiHandLandmarks) {
      for (const landmarks of results.multiHandLandmarks) {
        drawConnectors(sessionCtx, landmarks, HAND_CONNECTIONS, { color: 'rgba(0, 229, 192, 0)', lineWidth: 2 });
        drawLandmarks(sessionCtx, landmarks, { color: 'rgba(0, 0, 0, 0)', lineWidth: 1, radius: 4 });
        updateRepCount(landmarks);
      }
    }
  });
  mpCamera = new Camera(sessionVideo, {
    onFrame: async () => { await hands.send({ image: sessionVideo }); },
    width: 640, height: 480
  });
  mpCamera.start();
}

/* ══════════════════════════════════════════════════════════════════════════
   SECTION 12: PROGRESS SCREEN
   ══════════════════════════════════════════════════════════════════════════ */

function showProgressScreen() {
  if (mpCamera) { mpCamera.stop(); mpCamera = null; }
  showScreen('progressScreen');
  renderProgressScreen();
}

function renderProgressScreen() {
  const sessions = currentUser ? getPatientSessions(currentUser.email) : [];
  const content  = document.getElementById('progressContent');
  if (sessions.length === 0) {
    content.innerHTML = `<div class="no-progress-msg">No sessions recorded yet.<br/>Complete a set of reps to see your progress here.</div>`;
    return;
  }
  const totalReps = sessions.reduce((s, x) => s + (x.reps || 0), 0);
  const avgROM    = Math.round(sessions.reduce((s, x) => s + (x.rom  || 0), 0) / sessions.length);
  const recent    = sessions.slice(-10);
  const romData   = recent.map(s => s.rom || 0);
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
    </div>
    <div class="chart-card" style="margin-bottom:24px;">
      <h4>Range of Motion Over Time</h4>
      <canvas id="patientRomChart" height="100"></canvas>
    </div>
    <p style="font-size:0.8rem; color:#475569; margin-bottom:12px; text-transform:uppercase; letter-spacing:0.5px;">Session History</p>
    ${historyHTML}`;
  new Chart(document.getElementById('patientRomChart').getContext('2d'), {
    type: 'line',
    data: { labels, datasets: [{ data: romData, borderColor: '#3b82f6', backgroundColor: 'rgba(59,130,246,0.1)', borderWidth: 2, pointBackgroundColor: '#3b82f6', pointRadius: 4, tension: 0.4, fill: true }] },
    options: { plugins: { legend: { display: false } }, scales: { x: { ticks: { color: '#64748b' }, grid: { color: '#1e293b' } }, y: { ticks: { color: '#64748b' }, grid: { color: '#1e293b' }, min: 0, max: 180 } } }
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

let selectedJoints   = new Set();
let ejsActiveInfoKey = null;

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
          <div class="ejs-info-empty-icon">🦴</div>
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
          <div class="ejs-tracked-title">Currently Tracking</div>
          <div class="ejs-tracked-chips" id="ejsTrackedChips"><span class="ejs-tracked-empty">None selected</span></div>
        </div>
      </div>

    </div>
  </div>`;
}

/* After buildJointSelector HTML is injected into the DOM, call this to reset state */
function ejsInit() {
  selectedJoints.clear();
  ejsActiveInfoKey = null;
  ejsRefreshUI();
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
  ejsRefreshUI();
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
        btn.textContent = '✕ Remove from Tracking';
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
  ejsRefreshUI();
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
  ejsRefreshUI();
}

function ejsSelectAll() {
  EJS_FINGERS.forEach(f => EJS_JOINTS.forEach(j => {
    const d = EJS_JOINT_DATA[`${f}-${j}`];
    if (d && d.lm !== null) selectedJoints.add(`${f}-${j}`);
  }));
  ejsRefreshUI();
}

function ejsClearAll() {
  selectedJoints.clear();
  ejsRefreshUI();
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
  drawConnectors(ctx, landmarks, HAND_CONNECTIONS, {
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

  calibCanvas.width  = results.image.width;
  calibCanvas.height = results.image.height;

  calibCtx.save();
  calibCtx.clearRect(0, 0, calibCanvas.width, calibCanvas.height);
  calibCtx.drawImage(results.image, 0, 0, calibCanvas.width, calibCanvas.height);

  const count = results.multiHandLandmarks ? results.multiHandLandmarks.length : 0;
  if (calibHandCount) calibHandCount.textContent = `${count} hand${count !== 1 ? 's' : ''}`;

  if (count > 0) {
    calibSetStatus('Tracking active', 'active');
    if (calibCameraWrapEl) calibCameraWrapEl.classList.add('scanning');
    for (const landmarks of results.multiHandLandmarks) {
      calibDrawLandmarks(calibCtx, landmarks);
      calibUpdateReadouts(landmarks);
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

  const hands = new Hands({
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

    calibMpCamera = new Camera(calibVideo, {
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
   Storage key: phalanx_messages  — global array of message objects
   { from, to, text, timestamp, read }
   ══════════════════════════════════════════════════════════════════════════ */

// ── Core helpers ──────────────────────────────────────────────────────────────

function getMessages() {
  return JSON.parse(localStorage.getItem('phalanx_messages') || '[]');
}

function saveMessages(msgs) {
  localStorage.setItem('phalanx_messages', JSON.stringify(msgs));
}

function getThread(a, b) {
  return getMessages()
    .filter(m => (m.from === a && m.to === b) || (m.from === b && m.to === a))
    .sort((x, y) => new Date(x.timestamp) - new Date(y.timestamp));
}

function sendMessage(from, to, text) {
  if (!text.trim()) return;
  const msgs = getMessages();
  msgs.push({ from, to, text: text.trim(), timestamp: new Date().toISOString(), read: false });
  saveMessages(msgs);
}

function markRead(toEmail, fromEmail) {
  const msgs = getMessages();
  msgs.forEach(m => { if (m.to === toEmail && m.from === fromEmail) m.read = true; });
  saveMessages(msgs);
}

function unreadCount(toEmail, fromEmail) {
  return getMessages().filter(m => m.to === toEmail && m.from === fromEmail && !m.read).length;
}

// ── Shared thread renderer ────────────────────────────────────────────────────

function renderThread(containerId, myEmail, otherEmail) {
  const el     = document.getElementById(containerId);
  if (!el) return;
  const thread = getThread(myEmail, otherEmail);
  if (!thread.length) {
    el.innerHTML = '<p class="msg-empty">No messages yet.</p>';
    return;
  }
  el.innerHTML = thread.map(m => {
    const mine = m.from === myEmail;
    const time = new Date(m.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    return `<div class="msg-bubble ${mine ? 'msg-mine' : 'msg-theirs'}">
      <div class="msg-text">${m.text}</div>
      <div class="msg-time">${time}</div>
    </div>`;
  }).join('');
  el.scrollTop = el.scrollHeight;
}

// ── Patient-side functions ────────────────────────────────────────────────────

function openPatientMessaging() {
  const tEmail = getConnectedTherapist();
  if (!tEmail) { alert('You are not connected to a therapist yet.'); return; }
  markRead(currentUser.email, tEmail);
  const t = getAccounts().find(a => a.email === tEmail);
  document.getElementById('msgHeaderTitle').textContent = t ? t.name : 'Your Therapist';
  renderThread('msgThread', currentUser.email, tEmail);
  showScreen('messagingScreen');
}

function sendMessageFromPatient() {
  const tEmail = getConnectedTherapist();
  if (!tEmail) return;
  const input = document.getElementById('msgInput');
  sendMessage(currentUser.email, tEmail, input.value);
  input.value = '';
  renderThread('msgThread', currentUser.email, tEmail);
}

// ── Therapist-side panel builder ──────────────────────────────────────────────

function buildMessagePanel(patientEmail) {
  markRead(currentUser.email, patientEmail);
  return `<div class="therapist-msg-panel">
    <div class="section-title" style="font-size:0.85rem; font-weight:700; color:#6B7A99; text-transform:uppercase; letter-spacing:0.5px; margin-bottom:12px;">Messages</div>
    <div class="therapist-msg-thread" id="therapistMsgThread"></div>
    <div class="therapist-msg-row">
      <input type="text" id="therapistMsgInput" class="therapist-msg-input" placeholder="Send a message…" />
      <button id="therapistMsgSend" class="therapist-msg-send">Send</button>
    </div>
  </div>`;
}