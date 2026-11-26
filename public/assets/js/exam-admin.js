(function () {
  'use strict';
  const root = document.getElementById('adminApp');
  if (!root) return;
  const esc = value => String(value == null ? '' : value).replace(/[&<>"']/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
  async function api(url, options) {
    const opts = Object.assign({ credentials:'same-origin', headers:{} }, options || {});
    if (opts.body && typeof opts.body !== 'string') { opts.headers['Content-Type']='application/json'; opts.body=JSON.stringify(opts.body); }
    const response = await fetch(url, opts); let data={}; try { data=await response.json(); } catch (_) {}
    if (!response.ok) { const error=new Error(data.error||'Request failed.'); error.status=response.status; throw error; }
    return data;
  }
  function alert(message, type) {
    const box=document.getElementById('adminNotice'); if(!box)return;
    box.className='exam-alert '+(type||'success'); box.textContent=message; box.hidden=false;
  }
  async function boot() {
    try {
      const data=await api('/api/auth/me');
      if(data.user.role!=='admin') { renderDenied(); return; }
      renderDashboard(data.user);
      await Promise.all([loadAttempts(),loadInquiries()]);
    } catch(error) { if(error.status===401) renderDenied('Please sign in with the institute administrator account first.'); else renderError(error.message); }
  }
  function renderDenied(message) {
    root.innerHTML=`<div class="exam-card-head"><div><span class="exam-kicker">RESTRICTED AREA</span><h2>Administrator sign-in required</h2><p>${esc(message||'This page is available only to authorised Hello EPS administrators.')}</p></div></div><div class="exam-actions"><a class="exam-button" href="mock-test.html">Sign In</a><a class="exam-button secondary" href="index.html">Back to Website</a></div>`;
  }
  function renderError(message) { root.innerHTML=`<div class="exam-alert error">${esc(message)}</div><a class="exam-button" href="exam-admin.html">Try Again</a>`; }
  function renderDashboard(user) {
    root.innerHTML=`
      <div class="exam-card-head"><div><span class="exam-kicker">AUTHORISED ADMINISTRATOR</span><h2>Welcome, ${esc(user.fullName)}</h2><p>Use this private administrator area to review mock test results and website enquiries.</p></div><div class="exam-user-pill"><span class="exam-user-dot"></span>${esc(user.username)}</div></div>
      <div id="adminNotice" class="exam-alert success" hidden></div>
      <section class="admin-panel"><span class="exam-kicker">ADMIN SESSION</span><h3>Administrator controls</h3><p class="exam-help">Teacher login has been removed. The administrator account is the only account permitted to access this local Mock Test portal.</p><div class="exam-actions"><button class="exam-button secondary" id="refreshAdmin" type="button">Refresh Data</button><a class="exam-button" href="mock-test.html">Open Mock Test</a><button class="exam-button ghost" id="adminLogout" type="button">Sign Out</button></div></section>
      <section class="admin-section"><div class="admin-section-head"><div><span class="exam-kicker">ASSESSMENT RECORD</span><h3>Mock exam attempts</h3></div></div><div class="admin-table-wrap"><table class="admin-table"><thead><tr><th>Account</th><th>Course</th><th>Started</th><th>Result</th><th>Status</th></tr></thead><tbody id="attemptsBody"><tr><td colspan="5">Loading attempts…</td></tr></tbody></table></div></section>
      <section class="admin-section"><div class="admin-section-head"><div><span class="exam-kicker">WEBSITE ENQUIRIES</span><h3>Admission and contact submissions</h3></div></div><div id="inquiriesList" class="admin-inquiries"><p class="exam-help">Loading submissions…</p></div></section>`;
    document.getElementById('refreshAdmin').addEventListener('click', refreshAll);
    document.getElementById('adminLogout').addEventListener('click', logout);
  }
  async function loadAttempts() {
    const data=await api('/api/admin/attempts'); const tbody=document.getElementById('attemptsBody');
    tbody.innerHTML=data.attempts.length?data.attempts.map(item=>`<tr><td><strong>${esc(item.full_name)}</strong><small>${esc(item.username)}</small></td><td>${esc(item.courseTitle)}</td><td>${esc(new Date(item.started_at).toLocaleString())}</td><td>${item.status==='submitted'?esc(item.score)+' / '+esc(item.total_questions):'—'}</td><td><span class="admin-status ${item.status==='submitted'?'active':'pending'}">${item.status==='submitted'?'Submitted':'In progress'}</span></td></tr>`).join(''):'<tr><td colspan="5">No exam attempts recorded yet.</td></tr>';
  }
  async function loadInquiries() {
    const data=await api('/api/admin/inquiries'); const box=document.getElementById('inquiriesList');
    if(!data.inquiries.length){box.innerHTML='<p class="exam-help">No website form submissions have been received yet.</p>';return;}
    box.innerHTML=data.inquiries.map(item=>{
      const entries=Object.entries(item.payload||{}).map(([key,value])=>`<div><dt>${esc(key.replace(/[-_]/g,' '))}</dt><dd>${esc(Array.isArray(value)?value.join(', '):value)}</dd></div>`).join('');
      return `<details class="admin-inquiry"><summary><span><strong>${esc(item.form_name)}</strong><small>${esc(new Date(item.created_at).toLocaleString())}</small></span><b>#${esc(item.id)}</b></summary><dl>${entries}</dl>${item.has_file?`<p class="admin-file-link"><a href="/api/admin/inquiries/${encodeURIComponent(item.id)}/file">Download receipt: ${esc(item.file_name||'Uploaded receipt')}</a></p>`:''}</details>`;
    }).join('');
  }
  async function refreshAll(){try{await Promise.all([loadAttempts(),loadInquiries()]);alert('Administration data refreshed.','success');}catch(error){alert(error.message,'error');}}
  async function logout(){try{await api('/api/auth/logout',{method:'POST',body:{}});}catch(_){}renderDenied('You have signed out. Sign in again with the administrator account.');}
  document.querySelectorAll('.year').forEach(el=>el.textContent=new Date().getFullYear());
  boot();
})();
