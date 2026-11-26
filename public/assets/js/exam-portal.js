(function () {
  'use strict';
  const root = document.getElementById('examApp');
  if (!root) return;
  const titles = {
    loksewa: 'Loksewa Preparation', 'teacher-service': 'Teacher Service Commission', banking: 'Banking Preparation',
    'health-institutional': 'Health & Institutional Service', 'police-army': 'Nepal Police, Army & Armed Police',
    computer: 'Computer Courses', tuition: 'Tuition Classes', 'ielts-pte': 'IELTS & PTE', 'gr-indian-army': 'GR & Indian Army',
    'british-army': 'British Army', 'singapore-police': 'Singapore Police'
  };
  const params = new URLSearchParams(window.location.search);
  let course = params.get('course') || '';
  let user = null;
  let attempt = null;
  let timerHandle = null;
  let saveQueue = Promise.resolve();
  let busy = false;
  let portalConnection = 'checking';

  function escapeHtml(value) {
    return String(value == null ? '' : value).replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
  }
  async function api(url, options) {
    const opts = Object.assign({ credentials: 'same-origin', cache: 'no-store', headers: {} }, options || {});
    if (opts.body && typeof opts.body !== 'string') {
      opts.headers['Content-Type'] = 'application/json';
      opts.body = JSON.stringify(opts.body);
    }
    let response;
    try {
      response = await fetch(url, opts);
    } catch (_) {
      const error = new Error('Cannot connect to the secure exam server. Please contact Hello EPS.');
      error.code = 'NETWORK';
      throw error;
    }
    const contentType = response.headers && response.headers.get ? (response.headers.get('content-type') || '') : '';
    let data = {};
    if (contentType.includes('application/json')) {
      try { data = await response.json(); } catch (_) { data = {}; }
    } else {
      const error = new Error('The secure login service is not available at this website address. The complete Node.js exam portal must be deployed.');
      error.status = response.status;
      error.code = 'API_NOT_AVAILABLE';
      throw error;
    }
    if (!response.ok) {
      const error = new Error(data.error || 'The request could not be completed.');
      error.status = response.status;
      throw error;
    }
    return data;
  }
  function portalMessage(error) {
    if (!error) return 'The secure exam server is ready.';
    if (error.status === 401) return 'Username or password is incorrect, or this account is inactive.';
    if (error.status === 429) return 'Too many attempts. Please wait before trying again.';
    if (error.status === 404 || error.code === 'API_NOT_AVAILABLE') return 'The secure exam service is not installed at this website address. The full Node.js + PostgreSQL portal must be deployed.';
    if (error.status === 503) return 'The exam database is currently unavailable. Please contact the institute administrator.';
    if (error.code === 'NETWORK') return 'Cannot connect to the secure exam server. Check the connection or contact Hello EPS.';
    if (error.status >= 500) return 'The secure exam server encountered an error. Please try again shortly or contact Hello EPS.';
    return error.message || 'The request could not be completed.';
  }
  function updatePortalStatus(state, message) {
    portalConnection = state;
    const status = document.getElementById('portalConnectionStatus');
    if (!status) return;
    status.className = 'exam-connection-status ' + state;
    status.querySelector('.exam-connection-dot').textContent = state === 'online' ? '●' : state === 'offline' ? '!' : '…';
    status.querySelector('.exam-connection-copy').textContent = message || (state === 'online' ? 'Secure server connected' : state === 'offline' ? 'Secure server unavailable' : 'Checking secure server…');
  }
  function stopTimer() { if (timerHandle) window.clearInterval(timerHandle); timerHandle = null; }
  function showAlert(message, type) {
    const old = root.querySelector('.exam-alert');
    if (old) old.remove();
    const box = document.createElement('div');
    box.className = 'exam-alert ' + (type || 'error');
    box.textContent = message;
    const target = root.querySelector('.exam-card-head') || root.firstElementChild;
    if (target) target.insertAdjacentElement('afterend', box); else root.append(box);
  }
  function renderLoading(message) {
    root.innerHTML = '<div class="exam-loading"><span class="exam-spinner"></span><p>' + escapeHtml(message || 'Loading secure examination portal…') + '</p></div>';
  }
  async function boot() {
    stopTimer();
    user = null;
    // Always show the username/password screen immediately. A server/database
    // outage must never replace the login form with a generic error-only page.
    renderLogin('', '', 'checking');
    try {
      await api('/api/health');
      updatePortalStatus('online', 'Secure exam server connected');
    } catch (error) {
      updatePortalStatus('offline', 'Secure exam server unavailable');
      setLoginMessage(portalMessage(error), 'error');
      return;
    }
    try {
      const data = await api('/api/auth/me');
      user = data.user;
      if (user.role === 'admin') {
        await renderWelcome();
        return;
      }
      user = null;
      renderLogin('This portal is restricted to the Hello EPS administrator.', '', portalConnection);
    } catch (error) {
      if (error.status === 401) {
        updatePortalStatus('online', 'Secure server ready • Admin sign-in required');
        return;
      }
      updatePortalStatus('offline', 'Secure exam server unavailable');
      setLoginMessage(portalMessage(error), 'error');
    }
  }
  function setLoginMessage(message, type) {
    const box = document.getElementById('loginMessage');
    if (!box) return;
    box.textContent = message || '';
    box.className = message ? 'exam-alert ' + (type || 'error') : '';
    box.hidden = !message;
  }
  function renderLogin(message, usernameValue, connectionState) {
    stopTimer();
    if (connectionState) portalConnection = connectionState;
    const selectedCourse = titles[course] ? `
      <div class="exam-selected-course"><span class="exam-selected-course-icon">✓</span><span><small>SELECTED COURSE</small><strong>${escapeHtml(titles[course])}</strong></span></div>` : '';
    root.innerHTML = `
      <div class="exam-login-wrap">
        <div class="exam-login-heading">
          <span class="exam-kicker">HELLO EPS • SECURE PORTAL</span>
          <h2>Admin Login</h2>
          <p>Sign in with the Hello EPS administrator account to access mock tests, review exam results and manage website enquiries.</p>
        </div>
        <div class="exam-connection-status ${escapeHtml(portalConnection)}" id="portalConnectionStatus" role="status">
          <span class="exam-connection-dot">${portalConnection === 'online' ? '●' : portalConnection === 'offline' ? '!' : '…'}</span>
          <span class="exam-connection-copy">${portalConnection === 'online' ? 'Secure server connected' : portalConnection === 'offline' ? 'Secure server unavailable' : 'Checking secure server…'}</span>
        </div>
        ${selectedCourse}
        <form class="exam-form exam-login-form" id="loginForm" autocomplete="on" novalidate>
          <div class="exam-field">
            <label for="examUsername">Username</label>
            <input id="examUsername" name="username" type="text" autocomplete="username" autocapitalize="none" spellcheck="false" required minlength="3" maxlength="32" pattern="[A-Za-z0-9._-]{3,32}" placeholder="Enter your username">
          </div>
          <div class="exam-field">
            <label for="examPassword">Password</label>
            <div class="exam-password-wrap">
              <input id="examPassword" name="password" type="password" autocomplete="current-password" required maxlength="72" placeholder="Enter your password">
              <button class="exam-password-toggle" id="togglePassword" type="button" aria-label="Show password" aria-pressed="false">Show</button>
            </div>
          </div>
          <button class="exam-button exam-login-submit" id="loginSubmit" type="submit">Secure Sign In <span aria-hidden="true">→</span></button>
          <div id="loginMessage" class="exam-alert error" role="alert" ${message ? '' : 'hidden'}>${escapeHtml(message || '')}</div>
          <p class="exam-help exam-login-help">Only the authorised Hello EPS administrator can sign in and access the Mock Test portal.</p>
        </form>
        <div class="exam-login-footnote"><span>🔒 Administrator access only</span><span>Private exam session</span></div>
      </div>`;
    const form = document.getElementById('loginForm');
    const usernameInput = document.getElementById('examUsername');
    usernameInput.value = usernameValue || '';
    document.getElementById('togglePassword').addEventListener('click', () => {
      const passwordInput = document.getElementById('examPassword');
      const button = document.getElementById('togglePassword');
      const visible = passwordInput.type === 'password';
      passwordInput.type = visible ? 'text' : 'password';
      button.textContent = visible ? 'Hide' : 'Show';
      button.setAttribute('aria-label', visible ? 'Hide password' : 'Show password');
      button.setAttribute('aria-pressed', visible ? 'true' : 'false');
    });
    form.addEventListener('submit', async event => {
      event.preventDefault();
      if (busy) return;
      const submittedUsername = usernameInput.value.trim();
      const passwordInput = document.getElementById('examPassword');
      const submittedPassword = passwordInput.value;
      if (!/^[A-Za-z0-9._-]{3,32}$/.test(submittedUsername) || !submittedPassword) {
        setLoginMessage('Enter a valid username and password.', 'error');
        return;
      }
      busy = true;
      const button = document.getElementById('loginSubmit');
      button.disabled = true;
      button.textContent = 'Verifying account…';
      setLoginMessage('', 'error');
      try {
        // Check readiness first so credentials are never posted to a static
        // hosting fallback or an unavailable API endpoint.
        await api('/api/health');
        updatePortalStatus('online', 'Secure exam server connected');
        const data = await api('/api/auth/login', { method: 'POST', body: { username: submittedUsername, password: submittedPassword } });
        user = data.user;
        busy = false;
        if (user.role === 'admin') { await renderWelcome(); return; }
        user = null;
        renderLogin('Incorrect account type. Only the Hello EPS administrator can sign in.', submittedUsername, portalConnection);
      } catch (error) {
        busy = false;
        if (error.code === 'NETWORK' || error.status === 404 || error.status === 503 || error.status >= 500) {
          updatePortalStatus('offline', 'Secure exam server unavailable');
        }
        renderLogin(portalMessage(error), submittedUsername, portalConnection);
      }
    });
  }
  function renderAdminNotice() {
    stopTimer();
    root.innerHTML = `<div class="exam-card-head"><div><span class="exam-kicker">ADMINISTRATOR ACCOUNT</span><h2>Welcome, ${escapeHtml(user.fullName)}</h2><p>You are signed in as the Hello EPS administrator. Open the Mock Test portal or review exam results and website enquiries.</p></div></div><div class="exam-actions"><a class="exam-button" href="mock-test.html?admin=1">Open Mock Test</a><a class="exam-button secondary" href="exam-admin.html">Exam Administration</a><button class="exam-button ghost" id="examLogout" type="button">Sign Out</button></div>`;
    document.getElementById('examLogout').addEventListener('click', logout);
  }
  async function renderWelcome(notice) {
    stopTimer();
    let active = null;
    if (course && titles[course]) {
      try {
        const data = await api('/api/exams/active?course=' + encodeURIComponent(course));
        if (data.active) active = data.attempt;
        if (active && active.status === 'submitted') return renderResult(active.result, 'Your previous examination reached its time limit. The server has already submitted your saved answers.');
      } catch (error) { if (error.status === 401) { user = null; return renderLogin(); } throw error; }
    }
    root.innerHTML = `
      <div class="exam-card-head"><div><span class="exam-kicker">SIGNED IN • SECURE ACCESS ENABLED</span><h2>Welcome, ${escapeHtml(user.fullName || user.username)}</h2><p>Choose your course and start or resume a secure examination. Your answers are saved to the institute's exam server.</p></div><div class="exam-user-pill"><span class="exam-user-dot"></span>${escapeHtml(user.username)}</div></div>
      <div class="exam-info-grid"><div class="exam-info"><strong>10 minutes</strong><span>Exam duration</span></div><div class="exam-info"><strong>10 questions</strong><span>Multiple choice</span></div><div class="exam-info"><strong>Server saved</strong><span>Answers and results</span></div></div>
      <div class="exam-field" style="max-width:520px"><label for="examCourse">Select course</label><select class="exam-select" id="examCourse"><option value="">Choose a course</option>${Object.entries(titles).map(([slug,title]) => '<option value="'+slug+'" '+(slug===course?'selected':'')+'>'+escapeHtml(title)+'</option>').join('')}</select></div>
      <div class="exam-warning"><strong>Examination instructions:</strong> Once you start, the timer begins immediately. Do not refresh to extend the time. Your active attempt can be resumed with the same account, and the server submits saved answers when time expires. Do not share your login.</div>
      ${active ? '<div class="exam-alert success">You have an unfinished examination for <strong>' + escapeHtml(titles[course]) + '</strong>. You can resume where you left off.</div>' : ''}
      ${notice ? '<div class="exam-alert success">' + escapeHtml(notice) + '</div>' : ''}
      <div class="exam-actions"><button class="exam-button" id="startExam" type="button">${active ? 'Resume Examination' : 'Start Examination'}</button><a class="exam-button secondary" href="courses.html">Back to Courses</a><button class="exam-button ghost" id="examHistory" type="button">My Exam History</button><button class="exam-button ghost" id="examLogout" type="button">Sign Out</button></div>
      <div id="examHistoryPanel"></div>`;
    document.getElementById('examCourse').addEventListener('change', event => {
      course = event.target.value;
      const next = new URL(window.location.href);
      if (course) next.searchParams.set('course', course); else next.searchParams.delete('course');
      window.history.replaceState({}, '', next);
      renderWelcome();
    });
    document.getElementById('startExam').addEventListener('click', startExam);
    document.getElementById('examLogout').addEventListener('click', logout);
    document.getElementById('examHistory').addEventListener('click', loadHistory);
  }
  async function startExam() {
    if (!course || !titles[course]) return showAlert('Please select a course before starting.', 'error');
    if (busy) return;
    busy = true;
    const button = document.getElementById('startExam');
    button.disabled = true;
    button.textContent = 'Preparing exam…';
    try {
      const data = await api('/api/exams/start', { method: 'POST', body: { courseSlug: course } });
      attempt = data.attempt;
      if (attempt.status === 'submitted') return renderResult(attempt.result, 'Your exam time ended before you returned. The answers saved on the server were submitted.');
      renderExam(attempt);
    } catch (error) { showAlert(error.message, 'error'); button.disabled = false; button.textContent = 'Start Examination'; }
    finally { busy = false; }
  }
  function renderExam(data) {
    attempt = data;
    const total = data.questions.length;
    const answers = Object.assign({}, data.answers || {});
    let current = 0;
    let saveError = null;
    const serverClockOffset = data.serverNow ? new Date(data.serverNow).getTime() - Date.now() : 0;
    saveQueue = Promise.resolve();
    stopTimer();

    root.innerHTML = `
      <div class="exam-topline"><div><span class="exam-kicker">LIVE EXAMINATION • ${escapeHtml(user.username)}</span><h2>${escapeHtml(data.courseTitle)}</h2></div><div class="exam-timer" id="examTimer" role="timer" aria-live="off">10:00</div></div>
      <div class="exam-progress-row"><span id="examQuestionCount">Question 1 of ${total}</span><span id="examAnsweredCount">0 of ${total} answered</span></div><div class="exam-progress"><span id="examProgressBar" style="width:${100/total}%"></span></div>
      <div class="exam-layout"><section class="exam-question-box"><div class="exam-question-number" id="examQNumber">QUESTION 01</div><h3 class="exam-question-text" id="examQText"></h3><div class="exam-options" id="examOptions"></div><div class="exam-save-status" id="examSaveStatus" aria-live="polite">Your answers are saved securely as you go.</div></section><aside class="exam-palette"><h3>Question Navigator</h3><div class="exam-palette-grid" id="examPalette"></div><p class="exam-help">Green = answered · Blue = current</p></aside></div>
      <div class="exam-bottom-actions"><button class="exam-button secondary" id="examPrevious" type="button">Previous</button><div class="exam-actions" style="margin:0"><button class="exam-button secondary" id="examNext" type="button">Next</button><button class="exam-button" id="examSubmit" type="button">Submit Exam</button></div></div>`;

    const qText = document.getElementById('examQText');
    const optionsBox = document.getElementById('examOptions');
    const palette = document.getElementById('examPalette');
    const saveStatus = document.getElementById('examSaveStatus');

    function updatePalette() {
      palette.innerHTML = '';
      data.questions.forEach((question, index) => {
        const btn = document.createElement('button');
        btn.type = 'button'; btn.textContent = String(index + 1);
        btn.className = (index === current ? 'current ' : '') + (Number.isInteger(answers[String(index)]) ? 'answered' : '');
        btn.setAttribute('aria-label', 'Go to question ' + (index + 1));
        btn.addEventListener('click', () => { current = index; renderQuestion(); });
        palette.append(btn);
      });
      document.getElementById('examAnsweredCount').textContent = Object.values(answers).filter(Number.isInteger).length + ' of ' + total + ' answered';
    }
    function renderQuestion() {
      const question = data.questions[current];
      document.getElementById('examQuestionCount').textContent = 'Question ' + (current + 1) + ' of ' + total;
      document.getElementById('examQNumber').textContent = 'QUESTION ' + String(current + 1).padStart(2, '0');
      document.getElementById('examProgressBar').style.width = ((current + 1) / total * 100) + '%';
      qText.textContent = question.question;
      optionsBox.innerHTML = '';
      question.options.forEach((option, index) => {
        const label = document.createElement('label');
        label.className = 'exam-option' + (answers[String(current)] === index ? ' selected' : '');
        const input = document.createElement('input');
        input.type = 'radio'; input.name = 'exam-answer'; input.value = String(index);
        input.checked = answers[String(current)] === index;
        const letter = document.createElement('span'); letter.className = 'exam-option-letter'; letter.textContent = String.fromCharCode(65 + index);
        const copy = document.createElement('span'); copy.className = 'exam-option-text'; copy.textContent = option;
        label.append(input, letter, copy);
        label.addEventListener('click', () => {
          const questionIndex = current;
          answers[String(questionIndex)] = index;
          label.classList.add('selected');
          updatePalette();
          saveError = null;
          saveStatus.textContent = 'Saving your answer…';
          const answerPayload = Object.assign({}, answers);
          saveQueue = saveQueue.then(() => api('/api/exams/' + data.id + '/answers', { method: 'PUT', body: { answers: answerPayload } }))
            .then(() => { saveStatus.textContent = '✓ Answer saved securely'; })
            .catch(error => { saveError = error; saveStatus.textContent = 'Unable to save: ' + error.message; });
          renderQuestion();
        });
        optionsBox.append(label);
      });
      document.getElementById('examPrevious').disabled = current === 0;
      document.getElementById('examNext').disabled = current === total - 1;
      updatePalette();
    }
    document.getElementById('examPrevious').addEventListener('click', () => { if (current > 0) { current--; renderQuestion(); } });
    document.getElementById('examNext').addEventListener('click', () => { if (current < total - 1) { current++; renderQuestion(); } });
    document.getElementById('examSubmit').addEventListener('click', () => submitExam(false));
    renderQuestion();
    updateTimer();
    timerHandle = window.setInterval(updateTimer, 1000);
    function updateTimer() {
      const remain = Math.max(0, Math.floor((new Date(data.expiresAt).getTime() - (Date.now() + serverClockOffset)) / 1000));
      const mm = String(Math.floor(remain / 60)).padStart(2, '0');
      const ss = String(remain % 60).padStart(2, '0');
      const timer = document.getElementById('examTimer');
      if (!timer) { stopTimer(); return; }
      timer.textContent = mm + ':' + ss;
      timer.classList.toggle('time-low', remain <= 60);
      if (remain <= 0) submitExam(true);
    }
    async function submitExam(auto) {
      if (busy) return;
      const unanswered = total - Object.values(answers).filter(Number.isInteger).length;
      if (!auto && !window.confirm(unanswered ? 'You still have ' + unanswered + ' unanswered question(s). Submit your exam now?' : 'Submit your exam now? You cannot change answers after submission.')) return;
      busy = true;
      const submitButton = document.getElementById('examSubmit');
      if (submitButton) { submitButton.disabled = true; submitButton.textContent = auto ? 'Time ended…' : 'Submitting…'; }
      try {
        await saveQueue;
        if (saveError) throw saveError;
        const result = await api('/api/exams/' + data.id + '/submit', { method: 'POST', body: {} });
        attempt = result.attempt;
        busy = false;
        renderResult(attempt.result, auto ? 'The time limit ended. Your server-saved answers were submitted automatically.' : 'Your examination has been submitted and marked by the server.');
      } catch (error) {
        busy = false;
        showAlert(error.message, 'error');
        if (submitButton) { submitButton.disabled = false; submitButton.textContent = 'Submit Exam'; }
      }
    }
  }
  function renderResult(result, message) {
    stopTimer();
    if (!result) return renderError('The exam result is not available. Please contact the institute.');
    root.innerHTML = `
      <div class="exam-card-head"><div><span class="exam-kicker">EXAM SUBMITTED • SERVER MARKED</span><h2>Examination Result</h2><p>${escapeHtml(message || 'Your answers have been checked securely.')}</p></div><div class="exam-user-pill"><span class="exam-user-dot"></span>${escapeHtml(user.username)}</div></div>
      <div class="exam-result-summary"><div class="exam-score-circle">${result.score}/${result.total}</div><div><h2>${result.percentage}% Score</h2><p>${result.score} correct answer(s) out of ${result.total}. Review each question and explanation below.</p></div></div>
      <h3 class="exam-review-title">Answer review</h3>
      <div id="examReview">${result.items.map(item => `<article class="exam-review-item ${item.isCorrect ? 'correct' : 'incorrect'}"><h3>${item.number}. ${escapeHtml(item.question)}</h3><p>Your answer: ${escapeHtml(item.yourAnswer)}</p><p class="exam-correct-answer">Correct answer: ${escapeHtml(item.correctAnswer)}</p><p>${escapeHtml(item.explanation)}</p></article>`).join('')}</div>
      <div class="exam-actions"><button class="exam-button" id="examRetry" type="button">Start Another Attempt</button><a class="exam-button secondary" href="courses.html">Back to Courses</a><button class="exam-button ghost" id="examLogout" type="button">Sign Out</button></div>`;
    document.getElementById('examRetry').addEventListener('click', () => renderWelcome('Your previous result has been saved. You may start a new attempt.'));
    document.getElementById('examLogout').addEventListener('click', logout);
  }
  async function loadHistory() {
    const panel = document.getElementById('examHistoryPanel');
    panel.innerHTML = '<p class="exam-help">Loading your exam history…</p>';
    try {
      const data = await api('/api/student/history');
      if (!data.attempts.length) { panel.innerHTML = '<p class="exam-help">No exam attempts yet.</p>'; return; }
      panel.innerHTML = '<h3 class="exam-review-title">Your recent attempts</h3>' + data.attempts.map(item => `<article class="exam-review-item"><h3>${escapeHtml(item.courseTitle)}</h3><p>${escapeHtml(new Date(item.started_at).toLocaleString())} · ${item.status === 'submitted' ? 'Submitted' : 'In progress'}</p><p>${item.status === 'submitted' ? 'Score: ' + item.score + ' / ' + item.total_questions : 'An unfinished attempt can be resumed from this course.'}</p></article>`).join('');
    } catch (error) { panel.textContent = error.message; }
  }
  async function logout() {
    stopTimer();
    try { await api('/api/auth/logout', { method: 'POST', body: {} }); } catch (_) {}
    user = null; attempt = null; busy = false;
    renderLogin('You have signed out.');
  }
  function renderError(message) {
    root.innerHTML = `<div class="exam-card-head"><div><span class="exam-kicker">PORTAL NOTICE</span><h2>Unable to open the exam portal</h2><p>${escapeHtml(message)}</p></div></div><div class="exam-actions"><button class="exam-button" id="examReload" type="button">Try Again</button><a class="exam-button secondary" href="contact.html">Contact the Institute</a></div>`;
    document.getElementById('examReload').addEventListener('click', boot);
  }
  document.querySelectorAll('.year').forEach(el => { el.textContent = new Date().getFullYear(); });
  boot();
})();
