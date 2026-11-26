from pathlib import Path
p=Path('/mnt/data/eps_teacher/server.js'); s=p.read_text()
s=s.replace("role VARCHAR(16) NOT NULL DEFAULT 'student' CHECK (role IN ('admin', 'student'))", "role VARCHAR(16) NOT NULL DEFAULT 'student' CHECK (role IN ('admin', 'student', 'teacher'))")
# add migration immediately after create table query block end before admin bootstrap
needle="  `);\n\n  if (process.env.ADMIN_USERNAME && process.env.ADMIN_PASSWORD) {"
repl="  `);\n\n  // Upgrade existing installations to support teacher-only exam accounts.\n  await pool.query(`ALTER TABLE app_users DROP CONSTRAINT IF EXISTS app_users_role_check`);\n  await pool.query(`ALTER TABLE app_users ADD CONSTRAINT app_users_role_check CHECK (role IN ('admin', 'student', 'teacher'))`);\n\n  if (process.env.ADMIN_USERNAME && process.env.ADMIN_PASSWORD) {"
s=s.replace(needle,repl,1)
# add requireTeacher
needle="function requireAdmin(req, res, next) {\n  if (!req.user || req.user.role !== 'admin') return jsonError(res, 403, 'Administrator access is required.');\n  next();\n}"
repl=needle+"\nfunction requireTeacher(req, res, next) {\n  if (!req.user || req.user.role !== 'teacher') return jsonError(res, 403, 'Only authorised teacher accounts can access mock examinations.');\n  next();\n}"
s=s.replace(needle,repl)
# login reject student role after password validity check
needle="    if (!user || !user.active || !(await bcrypt.compare(password, user.password_hash))) {\n      return jsonError(res, 401, 'Incorrect username or password, or the account is inactive.');\n    }"
repl=needle+"\n    if (user.role === 'student') return jsonError(res, 403, 'Mock Test access is restricted to authorised teachers. Contact the institute for a teacher account.');"
s=s.replace(needle,repl)
# Exam APIs require teacher
for route in ["app.get('/api/exams/courses', requireAuth,", "app.get('/api/exams/active', requireAuth,", "app.post('/api/exams/start', requireAuth,", "app.get('/api/exams/:id', requireAuth,", "app.put('/api/exams/:id/answers', requireAuth,", "app.post('/api/exams/:id/submit', requireAuth,", "app.get('/api/student/history', requireAuth,"]:
    s=s.replace(route,route.replace('requireAuth,','requireAuth, requireTeacher,'))
# Admin create teacher endpoint uses same API, role teacher
s=s.replace("if (fullName.length < 2 || fullName.length > 100) return jsonError(res, 400, 'Enter the student’s full name.');", "if (fullName.length < 2 || fullName.length > 100) return jsonError(res, 400, 'Enter the teacher’s full name.');")
s=s.replace("VALUES ($1, $2, $3, 'student')\n       RETURNING id, username, full_name, role, active, created_at`,", "VALUES ($1, $2, $3, 'teacher')\n       RETURNING id, username, full_name, role, active, created_at`,")
s=s.replace("WHERE id = $1 AND role = 'student'", "WHERE id = $1 AND role = 'teacher'")
s=s.replace("Student account not found.", "Teacher account not found.")
s=s.replace("Student account updated.", "Teacher account updated.")
s=s.replace("student’s full name", "teacher’s full name")
s=s.replace("A disabled account must not leave an exam running in the background.", "A disabled teacher account must not leave an exam running in the background.")
s=s.replace("A password reset signs the student out everywhere.", "A password reset signs the teacher out everywhere.")
p.write_text(s)

# Admin interface becomes teacher-account manager
p=Path('/mnt/data/eps_teacher/public/assets/js/exam-admin.js'); s=p.read_text()
s=s.replace('student credentials','teacher credentials').replace('student account','teacher account').replace('Student Access','TEACHER ACCESS').replace('Create a student account','Create a teacher account').replace('Student full name','Teacher full name').replace('studentFullName','teacherFullName').replace('studentUsername','teacherUsername').replace('studentPassword','teacherPassword').replace('Student\'s full name','Teacher\'s full name').replace('ram.student','teacher.name').replace('Create Student Login','Create Teacher Login').replace('Student accounts','Teacher accounts').replace('Student</th>','Teacher</th>').replace('No student accounts','No teacher accounts').replace('data.users.filter(user=>user.role===\'student\')','data.users.filter(user=>user.role===\'teacher\')').replace('Student account created:','Teacher account created:').replace('student account?','teacher account?').replace('this student account?','this teacher account?').replace('the student will no longer','the teacher will no longer').replace('student account updated','teacher account updated').replace('student sessions','teacher sessions').replace('student.','teacher.')
p.write_text(s)

p=Path('/mnt/data/eps_teacher/public/assets/js/auth-nav.js'); s=p.read_text().replace("role === 'student'", "role === 'teacher'").replace('signed-in role','signed-in teacher role').replace('verified student login','verified teacher login')
p.write_text(s)

p=Path('/mnt/data/eps_teacher/public/assets/js/exam-portal.js'); s=p.read_text()
s=s.replace('HELLO EPS • STUDENT EXAMINATION','HELLO EPS • TEACHER EXAMINATION').replace('<h2>Student Login</h2>','<h2>Teacher Login</h2>').replace('Student accounts are created by the institute. There is no public registration. Contact Hello EPS if you need your login details or a password reset.','Teacher accounts are created by the institute. Only authorised teachers can access mock examinations. Contact Hello EPS for login details or a password reset.').replace('🔒 Protected student access','🔒 Authorised teacher access').replace("if (user.role === 'admin') { renderAdminNotice(); return; }", "if (user.role === 'admin') { renderAdminNotice(); return; }\n        if (user.role !== 'teacher') { user = null; renderLogin('Only authorised teacher accounts can access Mock Tests.', submittedUsername, portalConnection); return; }")
s=s.replace('Administrator accounts manage student access. Use the secure admin console to create student credentials and review exam activity.','Administrator accounts manage teacher access. Use the secure admin console to create teacher credentials and review exam activity.')
s=s.replace('Welcome, ${escapeHtml(user.fullName || user.username)}','Welcome, ${escapeHtml(user.fullName || user.username)}')
p.write_text(s)

# Update auth navigation test for teacher role
p=Path('/mnt/data/eps_teacher/test-auth-nav.js'); s=p.read_text().replace("run('student')", "run('teacher')").replace('verified student login','verified teacher login').replace('student: Mock Test','teacher: Mock Test')
p.write_text(s)
# test login assertions
p=Path('/mnt/data/eps_teacher/test-exam-login.js'); s=p.read_text().replace('Student Login','Teacher Login')
p.write_text(s)
# docs update core language
for name in ['README-SECURE-EXAMS.txt','README.txt']:
 p=Path('/mnt/data/eps_teacher')/name
 if p.exists():
  t=p.read_text().replace('student account','teacher account').replace('student accounts','teacher accounts').replace('students','teachers').replace('student','teacher')
  p.write_text(t)
