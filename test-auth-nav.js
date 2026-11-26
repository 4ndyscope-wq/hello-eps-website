const fs = require('fs');
const vm = require('vm');
const path = require('path');
const source = fs.readFileSync(path.join(__dirname, 'public/assets/js/auth-nav.js'), 'utf8');
async function run(role, status=200) {
  const link = {
    hidden: true, textContent: 'Mock Test', href: 'mock-test.html',
    attrs: {'data-root-prefix': '../'}, dataset: {},
    getAttribute(name) { return this.attrs[name] ?? null; },
    setAttribute(name, value) { this.attrs[name] = value; }
  };
  const context = {
    document: {querySelectorAll(selector) { return selector === '[data-student-portal-link]' ? [link] : []; }},
    fetch: async () => ({ok: status>=200 && status<300, json: async () => ({user: role ? {role} : null})})
  };
  vm.runInNewContext(source, context);
  await new Promise(resolve => setTimeout(resolve, 5));
  return link;
}
(async () => {
  let link = await run(null,401);
  if (!link.hidden) throw new Error('Logged-out portal link should be hidden');
  console.log('PASS logged out: no Student Login or Mock Test item in public navigation');
  link = await run('teacher');
  if (!link.hidden) throw new Error('Teacher navigation must remain hidden in admin-only mode');
  console.log('PASS teacher: teacher navigation stays hidden in admin-only mode');
  link = await run('admin');
  if (link.hidden || link.textContent !== 'Exam Admin' || link.href !== '../exam-admin.html') throw new Error('Admin navigation visibility failed');
  console.log('PASS admin: Exam Admin tab appears after verified admin login');
})().catch(e => { console.error(e); process.exit(1); });
