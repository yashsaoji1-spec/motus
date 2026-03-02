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
  progressScreen:     'PhalanX — My Progress',
  calibrationScreen:  'PhalanX — Calibration',
  messagingScreen:    'PhalanX — Messages',
};

function showScreen(screenId) {
  const prevActive = document.querySelector('.screen.active');
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  const next = document.getElementById(screenId);
  next.classList.add('active');
  next.scrollTop = 0;
  if (screenTitles[screenId]) document.title = screenTitles[screenId];

  // Stop patient camera when leaving the camera screen
  if (prevActive && prevActive.id === 'cameraScreen' && screenId !== 'cameraScreen') {
    if (mpCamera) { mpCamera.stop(); mpCamera = null; }
  }

  // Stop calibration camera when leaving calibration screen
  if (screenId !== 'calibrationScreen' && calibMpCamera) {
    calibMpCamera.stop();
    calibMpCamera = null;
  }

  // Reset forgot-password form if navigating away mid-flow
  if (screenId !== 'forgotScreen' && forgotStep !== 1) {
    forgotStep = 1;
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
  if (name.length < 2) { showError('signupError', 'Please enter your full name.'); return; }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { showError('signupError', 'Please enter a valid email address.'); return; }
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
  if (!/^\d{6}$/.test(code)) { showError('connectError', 'Please enter a valid 6-digit clinic code.'); return; }
  const therapist = getTherapistForCode(code);
  if (!therapist) { showError('connectError', 'No therapist found with that code. Double-check with your therapist.'); return; }
  saveConnection(therapist.email, currentUser.email);
  localStorage.removeItem('phalanx_skipped_connect_' + currentUser.email);
  document.getElementById('clinicCodeInput').value = '';
  showScreen('patientScreen');
  updatePatientHomeScreen();
  initSetTracker();
}

function skipConnect() {
  localStorage.setItem('phalanx_skipped_connect_' + currentUser.email, '1');
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
    const skipped          = localStorage.getItem('phalanx_skipped_connect_' + currentUser.email);
    if (alreadyConnected || skipped) {
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
  if (mpCamera)        { mpCamera.stop(); mpCamera = null; }
  if (calibMpCamera)   { calibMpCamera.stop(); calibMpCamera = null; }
  if (restTimerInterval) { clearInterval(restTimerInterval); restTimerInterval = null; }
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
    document.getElementById('protocolStripSets').textContent     = protocol.sets || 3;
  }

  const therapistEmail = getConnectedTherapist();
  const therapistBtn   = document.getElementById('therapistContactBtn');
  const therapistLabel = document.getElementById('therapistBtnLabel');
  if (therapistEmail) {
    const therapist = getAccounts().find(a => a.email === therapistEmail);
    if (therapist) document.getElementById('therapistContactName').textContent = 'Message ' + therapist.name;
    if (therapistLabel) therapistLabel.textContent = 'Contact My Therapist';
    if (therapistBtn)   therapistBtn.onclick = openPatientMessaging;
  } else {
    if (therapistLabel) therapistLabel.textContent = 'Connect to Therapist';
    document.getElementById('therapistContactName').textContent = 'Enter your clinic code';
    if (therapistBtn)   therapistBtn.onclick = () => { document.getElementById('clinicCodeInput').value = ''; showScreen('connectScreen'); };
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

  // Unread badge — reuse therapistEmail already fetched above
  const msgBadge = document.getElementById('patientUnreadBadge');
  if (msgBadge && therapistEmail) {
    const n = unreadCount(currentUser.email, therapistEmail);
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

function getExistingProtocol(patientEmail) {
  const stored = localStorage.getItem(`phalanx_protocol_${patientEmail}`);
  return stored ? JSON.parse(stored) : null;
}

function assignProtocol(patientEmail) {
  const protocol = {
    exerciseType: document.getElementById('exerciseType').value,
    reps:         parseInt(document.getElementById('protocolReps').value),
    sets:         parseInt(document.getElementById('protocolSets').value),
    frequency:    document.getElementById('protocolFrequency').value,
    notes:        document.getElementById('protocolNotes').value.trim(),
    assignedBy:   currentUser.name,
    assignedAt:   new Date().toISOString()
  };
  const errEl = document.getElementById('protocolSuccess'); // reuse element for error display if needed
  if (isNaN(protocol.reps) || protocol.reps < 1 || protocol.reps > 100) {
    if (errEl) { errEl.textContent = '⚠ Reps must be between 1 and 100.'; errEl.style.color = '#CC2936'; errEl.style.display = 'block'; setTimeout(() => { errEl.style.display = 'none'; errEl.style.color = ''; }, 3000); }
    return;
  }
  if (isNaN(protocol.sets) || protocol.sets < 1 || protocol.sets > 20) {
    if (errEl) { errEl.textContent = '⚠ Sets must be between 1 and 20.'; errEl.style.color = '#CC2936'; errEl.style.display = 'block'; setTimeout(() => { errEl.style.display = 'none'; errEl.style.color = ''; }, 3000); }
    return;
  }
  localStorage.setItem(`phalanx_protocol_${patientEmail}`, JSON.stringify(protocol));
  if (errEl) {
    errEl.textContent = '✓ Protocol assigned successfully';
    errEl.style.color = '';
    errEl.style.display = 'block';
    setTimeout(() => { errEl.style.display = 'none'; }, 3000);
  }
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
    return;
  }

  const compliance      = calcCompliance(sessions);
  const avgROM          = Math.round(sessions.reduce((s, x) => s + (x.rom  || 0), 0) / sessions.length);
  const avgTAM          = Math.round(sessions.reduce((s, x) => s + (x.tam  || 0), 0) / sessions.length);
  const avgPain         = (sessions.reduce((s, x) => s + (x.pain || 0), 0) / sessions.length).toFixed(1);
  const totalReps       = sessions.reduce((s, x) => s + (x.reps || 0), 0);
  const complianceColor = compliance >= 80 ? '#22c55e' : compliance >= 50 ? '#f59e0b' : '#ef4444';
  const recent          = sessions.slice(-8);
  const romData         = recent.map(s => s.rom  || 0);
  const tamData         = recent.map(s => s.tam  || 0);
  const painData        = recent.map(s => s.pain || 0);
  const labels          = recent.map(s => {
    const d = new Date(s.date);
    return `${d.getMonth()+1}/${d.getDate()} ${d.getHours()}:${String(d.getMinutes()).padStart(2,'0')}`;
  });
  const hasTAM = sessions.some(s => s.tam > 0);

  panel.innerHTML = `
    <h3>${patient.name}</h3>
    <p class="subtitle">Connected Patient — ${sessions.length} session${sessions.length !== 1 ? 's' : ''} recorded</p>
    <div class="stats-row">
      <div class="stat-card"><div class="stat-value" style="color:${complianceColor}">${compliance}%</div><div class="stat-label">7-Day Compliance</div></div>
      <div class="stat-card"><div class="stat-value">${avgROM}°</div><div class="stat-label">Avg ROM</div></div>
      ${hasTAM ? `<div class="stat-card"><div class="stat-value" style="color:#a78bfa">${avgTAM}°</div><div class="stat-label">Avg TAM</div></div>` : ''}
      <div class="stat-card"><div class="stat-value">${avgPain}</div><div class="stat-label">Avg Pain</div></div>
    </div>
    <div class="stats-row" style="margin-top:-8px;">
      <div class="stat-card" style="grid-column:span ${hasTAM ? 4 : 3};"><div class="stat-value" style="font-size:1.4rem">${totalReps} reps</div><div class="stat-label">Total Reps All Time</div></div>
    </div>
    <div class="chart-card"><h4>Range of Motion Over Time (degrees)</h4><canvas id="romChart" height="100"></canvas></div>
    <div class="chart-card"><h4>Pain Rating Over Time (1–10)</h4><canvas id="painChart" height="100"></canvas></div>
    ${buildJointSelector(patient.email)}
    ${buildSessionHistory(patient.email)}
    ${buildProtocolForm(patient.email)}
    ${buildMessagePanel(patient.email)}`;

  const chartDefaults = {
    plugins: { legend: { display: hasTAM } },
    scales: {
      x: { ticks: { color: '#64748b', maxRotation: 45 }, grid: { color: '#1e293b' } },
      y: { ticks: { color: '#64748b' }, grid: { color: '#1e293b' }, min: 0 }
    }
  };
  new Chart(document.getElementById('romChart').getContext('2d'), {
    type: 'line',
    data: {
      labels,
      datasets: [
        { label: 'ROM', data: romData, borderColor: '#3b82f6', backgroundColor: 'rgba(59,130,246,0.08)', borderWidth: 2, pointBackgroundColor: '#3b82f6', pointRadius: 4, tension: 0.4, fill: true },
        ...(hasTAM ? [{ label: 'TAM', data: tamData, borderColor: '#a78bfa', backgroundColor: 'rgba(167,139,250,0.08)', borderWidth: 2, pointBackgroundColor: '#a78bfa', pointRadius: 4, tension: 0.4, fill: false }] : [])
      ]
    },
    options: { ...chartDefaults, scales: { ...chartDefaults.scales, y: { ...chartDefaults.scales.y, max: 300 } } }
  });
  new Chart(document.getElementById('painChart').getContext('2d'), {
    type: 'line',
    data: { labels, datasets: [{ label: 'Pain', data: painData, borderColor: '#ef4444', backgroundColor: 'rgba(239,68,68,0.1)', borderWidth: 2, pointBackgroundColor: '#ef4444', pointRadius: 4, tension: 0.4, fill: true }] },
    options: { ...chartDefaults, plugins: { legend: { display: false } }, scales: { ...chartDefaults.scales, y: { ...chartDefaults.scales.y, max: 10 } } }
  });

  document.getElementById('therapistMsgSend').onclick = () => {
    const input = document.getElementById('therapistMsgInput');
    sendMessage(currentUser.email, patient.email, input.value);
    input.value = '';
    renderThread('therapistMsgThread', currentUser.email, patient.email);
  };
  renderThread('therapistMsgThread', currentUser.email, patient.email);
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
    const tam       = s.tam  || 0;
    const painColor = pain <= 3 ? '#22c55e' : pain <= 6 ? '#f59e0b' : '#ef4444';
    const romColor  = rom  >= 120 ? '#22c55e' : rom >= 80 ? '#f59e0b' : '#94a3b8';
    const tamColor  = tam  >= 220 ? '#22c55e' : tam >= 150 ? '#a78bfa' : '#94a3b8';
    return `
      <div class="session-history-row">
        <div class="session-date">
          <div style="color:#94a3b8; font-weight:600;">${dateStr}</div>
          <div style="font-size:0.72rem; color:#475569;">${timeStr}</div>
        </div>
        <div class="session-stat" style="color:#3b82f6;">${s.reps || 0} reps</div>
        <div class="session-stat" style="color:${romColor};">${rom}°</div>
        <div class="session-stat" style="color:${tamColor};">${tam}°</div>
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
          <span style="text-align:center">ROM</span><span style="text-align:center">TAM</span><span style="text-align:center">Pain</span>
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
          <select id="exerciseType">
            <optgroup label="Full Hand">
              <option value="full_fist">Full Fist</option>
              <option value="hook_fist">Hook Fist</option>
              <option value="tabletop_position">Tabletop Position</option>
            </optgroup>
            <optgroup label="Individual Fingers">
              <option value="index_flexion">Index Finger Flexion</option>
              <option value="middle_flexion">Middle Finger Flexion</option>
              <option value="ring_flexion">Ring Finger Flexion</option>
              <option value="pinky_flexion">Pinky Flexion</option>
              <option value="thumb_flexion">Thumb Flexion</option>
            </optgroup>
            <optgroup label="Opposition">
              <option value="thumb_index_opposition">Thumb to Index Opposition</option>
              <option value="thumb_opposition">Thumb Opposition</option>
            </optgroup>
          </select>
        </div>
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
              <option value="daily">Daily</option>
              <option value="twice_daily">Twice Daily</option>
              <option value="every_other">Every Other Day</option>
              <option value="three_week">3x Per Week</option>
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
      ${existing ? `<div class="protocol-existing"><p class="protocol-existing-label">Current Protocol</p>${formatProtocol(existing)}</div>` : ''}
    </div>`;
}

/* ══════════════════════════════════════════════════════════════════════════
   SECTION 9: REP COUNTER  (patient session camera)
   ══════════════════════════════════════════════════════════════════════════ */

let TARGET_REPS = 10;
let repCount    = 0;
let fingerState = 'unknown';
let lastROM     = 0;
let maxROMThisSession = 0;
let lastTAM     = 0;
let maxTAMThisSession = 0;
let sessionPaused = false;
let angleBuffer = [];  // rolling average to prevent jitter-induced double-counts
const ANGLE_SMOOTH_FRAMES = 5;
let lastRepTime = null;
let setPainValues = [];
let restTimerInterval = null;
let restTimeRemaining = 30;
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
  return Math.acos(Math.max(-1, Math.min(1, dot / (mag1 * mag2)))) * (180 / Math.PI);
}

// ── Total Arc of Motion (TAM = MCP + PIP + DIP for one finger) ────────────────
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

// Returns the highest TAM across all four main fingers (best performing finger)
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

  // ── ROM tracking: keep 2D angle for backward-compatible session data ──────────
  const rawAngle = getMiddleFingerAngle(landmarks);
  angleBuffer.push(rawAngle);
  if (angleBuffer.length > ANGLE_SMOOTH_FRAMES) angleBuffer.shift();
  const smoothAngle = angleBuffer.reduce((a, b) => a + b, 0) / angleBuffer.length;
  if (smoothAngle > maxROMThisSession) { maxROMThisSession = smoothAngle; lastROM = Math.round(smoothAngle); }

  // ── TAM tracking ──────────────────────────────────────────────────────────────
  const tam = calcTAM(landmarks);
  if (tam > maxTAMThisSession) { maxTAMThisSession = tam; lastTAM = Math.round(tam); }
  const tamEl = document.getElementById('tamDisplay');
  if (tamEl) tamEl.textContent = Math.round(tam) + '°';

  // ── Rep detection: 3D-aware PIP angle ─────────────────────────────────────────
  // calibGetAngle returns 0° when fully extended, ~90° when fully flexed.
  // Uses MCP(9)→PIP(10)→DIP(11): DIP stays visible in a fist; avoids occluded TIP(12).
  const pipFlex = calibGetAngle(landmarks[9], landmarks[10], landmarks[11]);
  if (pipFlex > 45 && fingerState !== 'flexed') {
    fingerState = 'flexed';
  } else if (pipFlex < 20 && fingerState === 'flexed') {
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
    tam:            lastTAM,
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
    if (protocol) { totalSets = protocol.sets || 3; TARGET_REPS = protocol.reps || 10; }
  }
  currentSet   = 1;
  setsComplete = 0;
  repCount     = 0;
  fingerState  = 'unknown';
  lastROM      = 0;
  maxROMThisSession = 0;
  lastTAM      = 0;
  maxTAMThisSession = 0;
  angleBuffer  = [];
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
  lastTAM = 0;
  maxTAMThisSession = 0;
  angleBuffer = [];
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
  const maxTAM = Math.round(maxTAMThisSession);
  document.getElementById('summaryTotalReps').textContent = totalRepsCompleted;
  document.getElementById('summarySets').textContent      = setsComplete;
  document.getElementById('summaryMaxROM').textContent    = maxROM + '°';
  document.getElementById('summaryAvgPain').textContent   = avgPain;
  document.getElementById('summaryMaxTAM').textContent    = maxTAM + '°';
  let message = '';
  if (avgPain !== '—' && parseFloat(avgPain) >= 7) {
    message = '⚠️ Pain was high today. Consider mentioning this to your therapist.';
  } else if (maxTAM >= 220 || maxROM >= 120) {
    message = '💪 Excellent range of motion today! You\'re making great progress.';
  } else if (maxTAM >= 160 || maxROM >= 80) {
    message = '👍 Good session. Consistency is key — keep it up!';
  } else if (totalRepsCompleted === 0) {
    message = '📋 Session recorded. Start moving to track your range of motion next time.';
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
      tam:            lastTAM,
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
    if (results.multiHandLandmarks && results.multiHandLandmarks.length > 0) {
      for (const landmarks of results.multiHandLandmarks) {
        drawConnectors(sessionCtx, landmarks, HAND_CONNECTIONS, { color: '#00FF00', lineWidth: 2 });
        drawLandmarks(sessionCtx, landmarks, { color: '#FF0000', lineWidth: 1, radius: 4 });
        updateRepCount(landmarks);
      }
    } else {
      // No hand in frame — reset live TAM display
      const tamEl = document.getElementById('tamDisplay');
      if (tamEl) tamEl.textContent = '—';
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
  const avgTAM    = Math.round(sessions.reduce((s, x) => s + (x.tam  || 0), 0) / sessions.length);
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
          <div class="progress-stat"><div class="progress-stat-value" style="color:#a78bfa">${s.tam || 0}°</div><div class="progress-stat-label">TAM</div></div>
          <div class="progress-stat"><div class="progress-stat-value" style="color:#ef4444">${s.pain || 0}</div><div class="progress-stat-label">Pain</div></div>
        </div>
      </div>`;
  }).join('');
  content.innerHTML = `
    <div class="stats-row" style="margin-bottom:24px;">
      <div class="stat-card"><div class="stat-value">${sessions.length}</div><div class="stat-label">Total Sessions</div></div>
      <div class="stat-card"><div class="stat-value">${totalReps}</div><div class="stat-label">Total Reps</div></div>
      <div class="stat-card"><div class="stat-value">${avgROM}°</div><div class="stat-label">Avg ROM</div></div>
      <div class="stat-card"><div class="stat-value" style="color:#a78bfa">${avgTAM}°</div><div class="stat-label">Avg TAM</div></div>
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
   SECTION 13: JOINT SELECTOR  (therapist panel)
   ══════════════════════════════════════════════════════════════════════════ */

const fingerColors = { Thumb: '#f5a623', Index: '#2d7ff9', Middle: '#00c9b1', Ring: '#a78bfa', Pinky: '#f04b4b' };
let selectedJoints = new Set();

function buildJointSelector(patientEmail) {
  return `
    <div class="joint-selector-panel">
      <h4>Joint Tracking — Select Which Joints to Monitor</h4>
      <div class="joint-selector-body">
        <div class="hand-svg-wrapper">
          <svg viewBox="0 0 280 360" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M 80 220 Q 60 240 65 280 Q 70 310 100 320 Q 140 330 180 320 Q 210 310 215 280 Q 220 240 200 220 Z" fill="#0f172a" stroke="#1e293b" stroke-width="1.5"/>
            <path d="M 80 220 Q 55 200 45 175 Q 38 155 50 140 Q 62 128 75 138 Q 82 145 85 165 L 90 200" fill="#0f172a" stroke="#1e293b" stroke-width="1.5"/>
            <path d="M 105 215 Q 100 185 98 160 Q 96 135 98 115 Q 100 95 110 90 Q 120 85 128 92 Q 136 100 133 120 Q 130 145 128 170 Q 126 195 125 215" fill="#0f172a" stroke="#1e293b" stroke-width="1.5"/>
            <path d="M 130 213 Q 128 180 127 152 Q 126 124 128 100 Q 130 78 140 73 Q 150 68 158 76 Q 166 85 163 108 Q 160 135 158 162 Q 156 188 155 213" fill="#0f172a" stroke="#1e293b" stroke-width="1.5"/>
            <path d="M 157 213 Q 158 182 160 158 Q 162 132 165 110 Q 168 90 177 87 Q 187 84 194 93 Q 200 103 196 125 Q 192 148 189 172 Q 186 196 184 213" fill="#0f172a" stroke="#1e293b" stroke-width="1.5"/>
            <path d="M 184 215 Q 188 192 191 172 Q 194 150 198 132 Q 202 115 210 112 Q 218 109 223 118 Q 228 128 224 148 Q 220 168 216 190 Q 212 208 208 218" fill="#0f172a" stroke="#1e293b" stroke-width="1.5"/>
            <g class="joint-dot" data-joint="thumb-mcp" data-finger="Thumb" data-name="MCP Joint" data-lm="2" data-desc="Thumb base knuckle" onclick="toggleJoint(this)">
              <circle cx="68" cy="168" r="7" fill="#1a2940" stroke="#f5a623" stroke-width="2"/>
              <text x="68" y="172" text-anchor="middle" fill="#f5a623" font-size="7" font-family="monospace">M</text>
            </g>
            <g class="joint-dot" data-joint="thumb-tip" data-finger="Thumb" data-name="Tip" data-lm="4" data-desc="Thumb fingertip" onclick="toggleJoint(this)">
              <circle cx="50" cy="138" r="7" fill="#1a2940" stroke="#f5a623" stroke-width="2"/>
              <text x="50" y="142" text-anchor="middle" fill="#f5a623" font-size="7" font-family="monospace">T</text>
            </g>
            <g class="joint-dot" data-joint="index-mcp" data-finger="Index" data-name="MCP Joint" data-lm="5" data-desc="Index base knuckle" onclick="toggleJoint(this)">
              <circle cx="115" cy="210" r="7" fill="#1a2940" stroke="#2d7ff9" stroke-width="2"/>
              <text x="115" y="214" text-anchor="middle" fill="#2d7ff9" font-size="7" font-family="monospace">M</text>
            </g>
            <g class="joint-dot" data-joint="index-pip" data-finger="Index" data-name="PIP Joint" data-lm="6" data-desc="Index middle joint — primary flex measurement" onclick="toggleJoint(this)">
              <circle cx="112" cy="158" r="7" fill="#1a2940" stroke="#2d7ff9" stroke-width="2"/>
              <text x="112" y="162" text-anchor="middle" fill="#2d7ff9" font-size="7" font-family="monospace">P</text>
            </g>
            <g class="joint-dot" data-joint="index-tip" data-finger="Index" data-name="Tip" data-lm="8" data-desc="Index fingertip" onclick="toggleJoint(this)">
              <circle cx="110" cy="100" r="7" fill="#1a2940" stroke="#2d7ff9" stroke-width="2"/>
              <text x="110" y="104" text-anchor="middle" fill="#2d7ff9" font-size="7" font-family="monospace">T</text>
            </g>
            <g class="joint-dot" data-joint="middle-mcp" data-finger="Middle" data-name="MCP Joint" data-lm="9" data-desc="Middle finger base knuckle" onclick="toggleJoint(this)">
              <circle cx="141" cy="210" r="7" fill="#1a2940" stroke="#00c9b1" stroke-width="2"/>
              <text x="141" y="214" text-anchor="middle" fill="#00c9b1" font-size="7" font-family="monospace">M</text>
            </g>
            <g class="joint-dot" data-joint="middle-pip" data-finger="Middle" data-name="PIP Joint" data-lm="10" data-desc="Middle finger PIP — used for current rep counting" onclick="toggleJoint(this)">
              <circle cx="142" cy="152" r="7" fill="#1a2940" stroke="#00c9b1" stroke-width="2"/>
              <text x="142" y="156" text-anchor="middle" fill="#00c9b1" font-size="7" font-family="monospace">P</text>
            </g>
            <g class="joint-dot" data-joint="middle-tip" data-finger="Middle" data-name="Tip" data-lm="12" data-desc="Middle fingertip" onclick="toggleJoint(this)">
              <circle cx="143" cy="88" r="7" fill="#1a2940" stroke="#00c9b1" stroke-width="2"/>
              <text x="143" y="92" text-anchor="middle" fill="#00c9b1" font-size="7" font-family="monospace">T</text>
            </g>
            <g class="joint-dot" data-joint="ring-mcp" data-finger="Ring" data-name="MCP Joint" data-lm="13" data-desc="Ring finger base knuckle" onclick="toggleJoint(this)">
              <circle cx="170" cy="210" r="7" fill="#1a2940" stroke="#a78bfa" stroke-width="2"/>
              <text x="170" y="214" text-anchor="middle" fill="#a78bfa" font-size="7" font-family="monospace">M</text>
            </g>
            <g class="joint-dot" data-joint="ring-pip" data-finger="Ring" data-name="PIP Joint" data-lm="14" data-desc="Ring finger middle joint — commonly stiff in arthritis" onclick="toggleJoint(this)">
              <circle cx="175" cy="152" r="7" fill="#1a2940" stroke="#a78bfa" stroke-width="2"/>
              <text x="175" y="156" text-anchor="middle" fill="#a78bfa" font-size="7" font-family="monospace">P</text>
            </g>
            <g class="joint-dot" data-joint="ring-tip" data-finger="Ring" data-name="Tip" data-lm="16" data-desc="Ring fingertip" onclick="toggleJoint(this)">
              <circle cx="178" cy="94" r="7" fill="#1a2940" stroke="#a78bfa" stroke-width="2"/>
              <text x="178" y="98" text-anchor="middle" fill="#a78bfa" font-size="7" font-family="monospace">T</text>
            </g>
            <g class="joint-dot" data-joint="pinky-mcp" data-finger="Pinky" data-name="MCP Joint" data-lm="17" data-desc="Pinky base knuckle" onclick="toggleJoint(this)">
              <circle cx="196" cy="212" r="7" fill="#1a2940" stroke="#f04b4b" stroke-width="2"/>
              <text x="196" y="216" text-anchor="middle" fill="#f04b4b" font-size="7" font-family="monospace">M</text>
            </g>
            <g class="joint-dot" data-joint="pinky-pip" data-finger="Pinky" data-name="PIP Joint" data-lm="18" data-desc="Pinky middle joint" onclick="toggleJoint(this)">
              <circle cx="206" cy="162" r="7" fill="#1a2940" stroke="#f04b4b" stroke-width="2"/>
              <text x="206" y="166" text-anchor="middle" fill="#f04b4b" font-size="7" font-family="monospace">P</text>
            </g>
            <g class="joint-dot" data-joint="pinky-tip" data-finger="Pinky" data-name="Tip" data-lm="20" data-desc="Pinky fingertip" onclick="toggleJoint(this)">
              <circle cx="214" cy="118" r="7" fill="#1a2940" stroke="#f04b4b" stroke-width="2"/>
              <text x="214" y="122" text-anchor="middle" fill="#f04b4b" font-size="7" font-family="monospace">T</text>
            </g>
          </svg>
          <div class="finger-legend">
            <div class="legend-item"><div class="legend-dot" style="background:#f5a623"></div>Thumb</div>
            <div class="legend-item"><div class="legend-dot" style="background:#2d7ff9"></div>Index</div>
            <div class="legend-item"><div class="legend-dot" style="background:#00c9b1"></div>Middle</div>
            <div class="legend-item"><div class="legend-dot" style="background:#a78bfa"></div>Ring</div>
            <div class="legend-item"><div class="legend-dot" style="background:#f04b4b"></div>Pinky</div>
          </div>
          <div style="font-size:0.68rem; color:#334155; font-family:monospace;">M=MCP · P=PIP · T=Tip</div>
        </div>
        <div class="joint-right-panel">
          <div class="joint-info-box">
            <div class="joint-info-empty-text" id="jointInfoEmpty">← Tap a joint to see details</div>
            <div id="jointInfoContent" style="display:none;">
              <div class="joint-info-finger-label" id="jointInfoFinger"></div>
              <div class="joint-info-joint-name" id="jointInfoName"></div>
              <div class="joint-info-desc-text" id="jointInfoDesc"></div>
              <span class="landmark-tag" id="jointInfoLm"></span>
            </div>
          </div>
          <div>
            <div style="font-size:0.65rem; font-weight:700; color:#64748b; text-transform:uppercase; letter-spacing:2px; margin-bottom:8px;">Quick Select</div>
            <div class="finger-quick-btns">
              <button class="finger-quick-btn" onclick="quickSelectFinger('Thumb', this)">Thumb</button>
              <button class="finger-quick-btn" onclick="quickSelectFinger('Index', this)">Index</button>
              <button class="finger-quick-btn" onclick="quickSelectFinger('Middle', this)">Middle</button>
              <button class="finger-quick-btn" onclick="quickSelectFinger('Ring', this)">Ring</button>
              <button class="finger-quick-btn" onclick="quickSelectFinger('Pinky', this)">Pinky</button>
              <button class="finger-quick-btn" onclick="quickSelectAll(this)">All</button>
            </div>
          </div>
          <div>
            <div style="font-size:0.65rem; font-weight:700; color:#64748b; text-transform:uppercase; letter-spacing:2px; margin-bottom:8px;">
              Tracking (<span id="jointCount">0</span>)
            </div>
            <div class="selected-joints-list" id="selectedJointsList">
              <div style="color:#334155; font-size:0.78rem; text-align:center; padding:12px;">None selected</div>
            </div>
          </div>
          <button class="joint-clear-btn" onclick="clearAllJoints()">Clear All</button>
        </div>
      </div>
    </div>`;
}

function toggleJoint(el) {
  const joint  = el.dataset.joint;
  const finger = el.dataset.finger;
  const color  = fingerColors[finger];
  document.getElementById('jointInfoEmpty').style.display   = 'none';
  document.getElementById('jointInfoContent').style.display = 'block';
  document.getElementById('jointInfoFinger').textContent    = finger + ' Finger';
  document.getElementById('jointInfoFinger').style.color    = color;
  document.getElementById('jointInfoName').textContent      = el.dataset.name;
  document.getElementById('jointInfoDesc').textContent      = el.dataset.desc;
  document.getElementById('jointInfoLm').textContent        = 'Landmark [' + el.dataset.lm + ']';
  if (selectedJoints.has(joint)) { selectedJoints.delete(joint); el.classList.remove('selected'); }
  else                           { selectedJoints.add(joint);    el.classList.add('selected');    }
  renderSelectedJoints();
}

function quickSelectFinger(finger, btn) {
  const joints      = document.querySelectorAll(`[data-finger="${finger}"]`);
  const allSelected = [...joints].every(j => selectedJoints.has(j.dataset.joint));
  joints.forEach(j => {
    if (allSelected) { selectedJoints.delete(j.dataset.joint); j.classList.remove('selected'); }
    else             { selectedJoints.add(j.dataset.joint);    j.classList.add('selected');    }
  });
  btn.classList.toggle('fq-active', !allSelected);
  renderSelectedJoints();
}

function quickSelectAll(btn) {
  const all         = document.querySelectorAll('.joint-dot');
  const allSelected = [...all].every(j => selectedJoints.has(j.dataset.joint));
  all.forEach(j => {
    if (allSelected) { selectedJoints.delete(j.dataset.joint); j.classList.remove('selected'); }
    else             { selectedJoints.add(j.dataset.joint);    j.classList.add('selected');    }
  });
  document.querySelectorAll('.finger-quick-btn').forEach(b => b.classList.toggle('fq-active', !allSelected));
  renderSelectedJoints();
}

function clearAllJoints() {
  selectedJoints.clear();
  document.querySelectorAll('.joint-dot').forEach(j => j.classList.remove('selected'));
  document.querySelectorAll('.finger-quick-btn').forEach(b => b.classList.remove('fq-active'));
  renderSelectedJoints();
}

function renderSelectedJoints() {
  const list    = document.getElementById('selectedJointsList');
  const countEl = document.getElementById('jointCount');
  if (!list) return;
  if (countEl) countEl.textContent = selectedJoints.size;
  if (selectedJoints.size === 0) {
    list.innerHTML = `<div style="color:#334155; font-size:0.78rem; text-align:center; padding:12px;">None selected</div>`;
    return;
  }
  list.innerHTML = [...selectedJoints].map(jointId => {
    const el     = document.querySelector(`[data-joint="${jointId}"]`);
    if (!el) return '';
    const finger = el.dataset.finger;
    const color  = fingerColors[finger];
    return `
      <div class="selected-joint-item">
        <div class="selected-joint-item-left">
          <div class="selected-joint-color" style="background:${color}"></div>
          <div>
            <div class="selected-joint-name">${el.dataset.name}</div>
            <div class="selected-joint-finger">${finger}</div>
          </div>
        </div>
        <span class="selected-joint-lm">LM ${el.dataset.lm}</span>
      </div>`;
  }).join('');
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

  // Center-crop the source frame to a square (matches video's object-fit:cover)
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
      // Remap landmarks into the cropped square coordinate space for drawing.
      // Original landmarks are normalized to the full frame; adjust for the crop offset.
      const drawLandmarks = landmarks.map(lm => ({
        ...lm,
        x: (lm.x * srcW - cropX) / size,
        y: (lm.y * srcH - cropY) / size,
      }));
      calibDrawLandmarks(calibCtx, drawLandmarks);
      calibUpdateReadouts(landmarks); // always use original coords for angle math
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

// ── Helpers ───────────────────────────────────────────────────────────────────

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

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

function renderThread(containerId, myEmail, otherEmail) {
  const el = document.getElementById(containerId);
  if (!el) return;
  const thread = getThread(myEmail, otherEmail);
  if (!thread.length) {
    el.innerHTML = '<p class="msg-empty">No messages yet.</p>';
    return;
  }
  el.innerHTML = thread.map(m => {
    const mine = m.from === myEmail;
    return `<div class="msg-bubble ${mine ? 'msg-mine' : 'msg-theirs'}">
      <div class="msg-text">${escapeHtml(m.text)}</div>
      <div class="msg-time">${formatMsgTime(m.timestamp)}</div>
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
      <input type="text" id="therapistMsgInput" class="therapist-msg-input" placeholder="Send a message…"
             onkeydown="if(event.key==='Enter'){ document.getElementById('therapistMsgSend').click(); }" />
      <button id="therapistMsgSend" class="therapist-msg-send">Send</button>
    </div>
  </div>`;
}