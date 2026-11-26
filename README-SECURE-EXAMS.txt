HELLO EPS — SECURE STUDENT MOCK EXAMINATION PORTAL
=================================================

WHAT HAS CHANGED
----------------
* Public navigation does not show a Student Login item. The visitor opens
  Courses, chooses a course, and clicks “Take Mock Test” on that course page.
* Each course opens its mock examination on a separate page:
  /mock-test.html?course=<course-slug>
* The separate exam page always renders explicit Username and Password fields.
  It shows secure-server status; if the API/database is unavailable, the form
  remains visible with a clear connection/deployment warning instead of an
  error-only page. Credentials are posted only after the /api/health check
  confirms that the secure exam backend is available.
* The selected course is carried into the login screen. After successful sign-in,
  the teacher is taken to that course's exam start screen.
* The Mock Test portal is restricted to the administrator account in this local build.
* The administrator must sign in with a username and password before any exam
  questions or answer choices are sent to the browser.
* Public self-registration is disabled. The institute administrator creates
  teacher usernames and passwords in /exam-admin.html.
* Passwords are stored as bcrypt hashes in PostgreSQL, never as plain text.
* Student sessions are stored in PostgreSQL and use HttpOnly, SameSite cookies.
* Login attempts are rate-limited.
* API responses containing account, exam or result data are marked no-store to reduce shared-device cache exposure.
* Deactivating a teacher or resetting their password revokes their existing sessions.
* Each exam is 10 minutes. The server enforces the deadline and submits saved
  answers when time expires.
* Answers are saved to the server while the teacher works. The server marks
  answers and stores submitted results.
* Students can review their own result and exam history. Administrators can
  review teacher accounts, attempts and website form submissions.
* The 15 existing sample course question sets (75 MCQs total) are private in
  backend/exam-bank.json. Correct answers are not sent before submission.
* Existing website inquiry/admission forms now submit to this server and are
  stored in PostgreSQL; the admin page lists those submissions.

IMPORTANT HOSTING REQUIREMENT
----------------------------
This is no longer a static-only Netlify ZIP. A real login system cannot be
secured by hiding a page with browser JavaScript. The exam questions, password
verification, session and scoring must run on a trusted server. This package
therefore includes a Node.js/Express backend and PostgreSQL database setup.

Do NOT publish only the public/ folder to Netlify and expect password protection
to work. Deploy this project as a Node.js application with PostgreSQL, behind
HTTPS. A static-only deployment would expose no secure authentication backend.

QUICK START WITH DOCKER
-----------------------
1. Install Docker Engine and Docker Compose on a server.
2. Copy .env.example to .env.
3. Set strong, unique values for:
     POSTGRES_PASSWORD (use at least 32 random letters/numbers for Docker Compose)
     SESSION_SECRET (at least 32 random characters)
     ADMIN_USERNAME
     ADMIN_PASSWORD (8–72 bytes; use a unique, strong password)
   Do not use the example values. Keep .env private and never upload it to a
   public repository.
4. Run:
     docker compose up -d --build
5. Put the service behind HTTPS using your hosting provider or a reverse proxy.
   The app listens on port 3000 and is bound to 127.0.0.1 on the host; configure your HTTPS reverse proxy to forward to 127.0.0.1:3000.
6. Open /mock-test.html and sign in with ADMIN_USERNAME / ADMIN_PASSWORD.
   The initial admin account is created on first startup if it does not exist.
7. Open /exam-admin.html to create teacher usernames/passwords.

NODE.JS SETUP WITHOUT DOCKER
----------------------------
1. Create a PostgreSQL database and user.
2. Copy .env.example to .env and set DATABASE_URL, SESSION_SECRET,
   ADMIN_USERNAME, ADMIN_FULL_NAME and ADMIN_PASSWORD.
3. Install Node.js 20 or newer.
4. Run:
     npm install
     npm start
5. Configure HTTPS and the host's persistent PostgreSQL connection. If you
   change the administrator credentials after the first start, run
     npm run create-admin

ADMIN WORKFLOW
--------------
* Sign in at /mock-test.html using the administrator credentials.
* Open /exam-admin.html.
* Create a teacher with a unique username and temporary password.
* Share the credentials privately with that teacher.
* Deactivate an account when the teacher should no longer have access; all sessions are revoked and active exams are submitted with saved answers.
* Reset a teacher's password from the account list when required; all sessions are revoked and the teacher must sign in with the new password.
* Review mock test attempts and website inquiries in the admin page.

STUDENT WORKFLOW
----------------
* Open Courses and choose the desired course.
* On that course detail page, click “Take Mock Test”. A separate
  /mock-test.html?course=<course-slug> page opens.
* Sign in there with the account issued by Hello EPS. The selected course
  remains preselected after login.
* Read the instructions and start the examination.
* The 10-minute countdown begins at the server. Answers are saved as selected.
* Submit before the timer ends. If the time expires, saved answers are
  automatically submitted by the server.
* Review the server-marked score and explanations.

COURSE QUESTION BANK
--------------------
The project carries over the existing 15 course question banks and 75 sample
MCQs. They are sample practice material, not official papers and not a promise
of complete syllabus coverage. The institute should review/update question
quality and syllabus alignment before using these tests as formal assessments.

DATA AND BACKUPS
----------------
PostgreSQL stores teacher accounts, sessions, exam attempts/results and website
inquiries. Configure regular encrypted database backups with the database
host. Restrict database access to the application. Use HTTPS for all teacher
and administrator access. Set a unique strong SESSION_SECRET and keep all
secrets outside the public website directory.

FORMS
-----
All 17 existing admission/contact/inquiry forms have been routed through the
Node backend so they continue to submit after deployment to a Node host. The
teacher registration receipt upload is accepted as JPG, PNG, WebP or PDF up to
8 MB and is stored privately in PostgreSQL for administrator download. Their
submissions are stored in PostgreSQL and visible to the administrator at
/exam-admin.html. These forms are no longer processed by Netlify Forms.

TEACHER-ONLY MOCK TEST ACCESS
-----------------------------
Only accounts with role=teacher can sign in to the mock examination and call any exam API. Student-role accounts from older installations are not permitted to access exams. The administrator signs in to the same portal only to open the separate Exam Admin area; administrator accounts cannot start examinations.

To create teacher logins, sign in with the administrator account, open exam-admin.html, and use the 'Create a teacher account' form. Give each teacher their username and temporary password privately. Teacher accounts can be deactivated or have passwords reset from the same admin panel; those actions revoke their existing sessions.

Existing database installations are upgraded automatically to support the teacher role. Existing student accounts remain in the database but are denied mock-test login. Create teacher accounts for staff who need exam access.


LANGUAGE MOCK TEST TRACKS (ADDED)
---------------------------------
Japanese course page now links to Korean Basic and Korean Advanced practice sets.
Korean course page now links to Basic and Advanced Korean practice sets.
Each new set has 10 original multiple-choice questions and uses the existing
secure server-side exam, answer saving, timed submission and result workflow.
These are original practice questions, not official exam papers or complete
syllabus replicas. The existing exam timer is 10 minutes per attempt.
