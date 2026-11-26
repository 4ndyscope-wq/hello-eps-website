'use strict';

require('dotenv').config();
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const express = require('express');
const helmet = require('helmet');
const session = require('express-session');
const PgSession = require('connect-pg-simple')(session);
const rateLimit = require('express-rate-limit');
const bcrypt = require('bcryptjs');
const multer = require('multer');
const { Pool } = require('pg');
const BANK = require('./backend/exam-bank.json');

const app = express();
const PORT = Number(process.env.PORT || 3000);
const SESSION_SECRET = process.env.SESSION_SECRET;
const NODE_ENV = process.env.NODE_ENV || 'development';
const EXAM_DURATION_SECONDS = 10 * 60;

if (!SESSION_SECRET || SESSION_SECRET.length < 32) {
  throw new Error('SESSION_SECRET must be set to a random value of at least 32 characters.');
}
if (!process.env.DATABASE_URL) {
  throw new Error('DATABASE_URL is required. Configure a PostgreSQL database before starting the server.');
}
if (process.env.ADMIN_PASSWORD && (Buffer.byteLength(process.env.ADMIN_PASSWORD, 'utf8') < 8 || Buffer.byteLength(process.env.ADMIN_PASSWORD, 'utf8') > 72)) {
  throw new Error('ADMIN_PASSWORD must be 8–72 bytes long.');
}

if (NODE_ENV === 'production') app.set('trust proxy', 1);
app.disable('x-powered-by');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.PGSSLMODE === 'no-verify' ? { rejectUnauthorized: false } : undefined,
  max: Number(process.env.DB_POOL_SIZE || 10),
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 10000
});

app.use(helmet({
  contentSecurityPolicy: false,
  crossOriginEmbedderPolicy: false,
  referrerPolicy: { policy: 'strict-origin-when-cross-origin' }
}));
app.use(express.json({ limit: '48kb' }));
app.use(express.urlencoded({ extended: false, limit: '48kb', parameterLimit: 150 }));
const contentUploadDir = path.join(__dirname, 'public', 'media-uploads');
fs.mkdirSync(contentUploadDir, { recursive: true });
const contentStorage = multer.diskStorage({
  destination: (_req, _file, callback) => callback(null, contentUploadDir),
  filename: (_req, file, callback) => {
    const extByMime = { 'image/jpeg': '.jpg', 'image/png': '.png', 'image/webp': '.webp', 'image/gif': '.gif', 'video/mp4': '.mp4', 'video/webm': '.webm', 'video/quicktime': '.mov' };
    callback(null, `${crypto.randomUUID()}${extByMime[file.mimetype] || '.bin'}`);
  }
});
const contentUpload = multer({
  storage: contentStorage,
  limits: { fileSize: 100 * 1024 * 1024, files: 1 },
  fileFilter(_req, file, callback) {
    const allowed = ['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'video/mp4', 'video/webm', 'video/quicktime'];
    callback(allowed.includes(file.mimetype) ? null : new Error('Only JPG, PNG, WebP, GIF, MP4, WebM or MOV files are accepted.'), allowed.includes(file.mimetype));
  }
});
const receiptUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 8 * 1024 * 1024, files: 1 },
  fileFilter(_req, file, callback) {
    const allowed = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'];
    callback(allowed.includes(file.mimetype) ? null : new Error('Only JPG, PNG, WebP or PDF receipts are accepted.'), allowed.includes(file.mimetype));
  }
});
app.use(session({
  store: new PgSession({ pool, tableName: 'app_sessions', createTableIfMissing: true, ttl: 8 * 60 * 60 }),
  name: 'hello_eps_exam_session',
  secret: SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  rolling: true,
  cookie: {
    httpOnly: true,
    secure: NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 8 * 60 * 60 * 1000
  }
}));

// Reject browser requests originating from a different site. The session cookie
// is also SameSite=Lax and the application does not enable cross-origin access.
app.use('/api', (req, res, next) => {
  // Authentication, exam questions, saved answers, results and admin records
  // must never be stored in a browser/shared-computer HTTP cache.
  res.setHeader('Cache-Control', 'no-store, private, max-age=0');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');
  const origin = req.get('origin');
  if (req.get('sec-fetch-site') === 'cross-site') return jsonError(res, 403, 'Cross-site requests are not allowed.');
  if (origin) {
    const expected = `${req.protocol}://${req.get('host')}`;
    if (origin !== expected) return jsonError(res, 403, 'Cross-origin requests are not allowed.');
  }
  next();
});

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 8,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { error: 'Too many login attempts. Please wait 15 minutes and try again.' }
});
const examLimiter = rateLimit({ windowMs: 60 * 1000, limit: 90, standardHeaders: 'draft-7', legacyHeaders: false });
const inquiryLimiter = rateLimit({ windowMs: 60 * 60 * 1000, limit: 12, standardHeaders: 'draft-7', legacyHeaders: false });

const COURSES = {
  loksewa: 'Loksewa Preparation',
  'teacher-service': 'Teacher Service Commission',
  banking: 'Banking Preparation',
  'health-institutional': 'Health & Institutional Service',
  'police-army': 'Nepal Police, Army & Armed Police',
  'technical-service': 'Technical Service',
  english: 'English Language',
  japanese: 'Japanese Language',
  korean: 'Korean Language',
  'korean-basic': 'Korean • Basic Mock Test',
  'korean-advanced': 'Korean • Advanced Mock Test',
  computer: 'Computer Courses',
  tuition: 'Tuition Classes',
  'ielts-pte': 'IELTS & PTE',
  'gr-indian-army': 'GR & Indian Army',
  'british-army': 'British Army',
  'singapore-police': 'Singapore Police'
};

async function initDatabase() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS app_users (
      id BIGSERIAL PRIMARY KEY,
      username VARCHAR(32) NOT NULL UNIQUE,
      full_name VARCHAR(100) NOT NULL,
      password_hash TEXT NOT NULL,
      role VARCHAR(16) NOT NULL DEFAULT 'student' CHECK (role IN ('admin', 'student', 'teacher')),
      active BOOLEAN NOT NULL DEFAULT TRUE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE TABLE IF NOT EXISTS exam_attempts (
      id UUID PRIMARY KEY,
      user_id BIGINT NOT NULL REFERENCES app_users(id),
      course_slug VARCHAR(64) NOT NULL,
      started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      expires_at TIMESTAMPTZ NOT NULL,
      submitted_at TIMESTAMPTZ,
      status VARCHAR(16) NOT NULL DEFAULT 'in_progress' CHECK (status IN ('in_progress', 'submitted')),
      answers JSONB NOT NULL DEFAULT '{}'::jsonb,
      score INTEGER,
      total_questions INTEGER NOT NULL,
      result JSONB,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS exam_attempts_user_course_idx ON exam_attempts(user_id, course_slug, started_at DESC);
    CREATE INDEX IF NOT EXISTS exam_attempts_status_idx ON exam_attempts(user_id, status);
    CREATE UNIQUE INDEX IF NOT EXISTS exam_attempts_one_active_idx ON exam_attempts(user_id, course_slug) WHERE status = 'in_progress';
    CREATE TABLE IF NOT EXISTS site_inquiries (
      id BIGSERIAL PRIMARY KEY,
      form_name VARCHAR(100) NOT NULL,
      payload JSONB NOT NULL,
      file_name TEXT,
      file_mime TEXT,
      file_data BYTEA,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    ALTER TABLE site_inquiries ADD COLUMN IF NOT EXISTS file_name TEXT;
    ALTER TABLE site_inquiries ADD COLUMN IF NOT EXISTS file_mime TEXT;
    ALTER TABLE site_inquiries ADD COLUMN IF NOT EXISTS file_data BYTEA;
    CREATE INDEX IF NOT EXISTS site_inquiries_created_idx ON site_inquiries(created_at DESC);
    CREATE TABLE IF NOT EXISTS site_posts (
      id BIGSERIAL PRIMARY KEY,
      category VARCHAR(20) NOT NULL CHECK (category IN ('vacancy', 'announcement', 'media')),
      title VARCHAR(180) NOT NULL,
      body TEXT NOT NULL DEFAULT '',
      media_url TEXT,
      media_mime VARCHAR(100),
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS site_posts_category_created_idx ON site_posts(category, created_at DESC);
  `);

  // Upgrade existing installations to support teacher-only exam accounts.
  await pool.query(`ALTER TABLE app_users DROP CONSTRAINT IF EXISTS app_users_role_check`);
  await pool.query(`ALTER TABLE app_users ADD CONSTRAINT app_users_role_check CHECK (role IN ('admin', 'student', 'teacher'))`);

  if (process.env.ADMIN_USERNAME && process.env.ADMIN_PASSWORD) {
    const username = normalizeUsername(process.env.ADMIN_USERNAME);
    if (!isValidUsername(username)) throw new Error('ADMIN_USERNAME must be 3–32 characters: letters, numbers, dot, underscore or hyphen.');
    const existing = await pool.query('SELECT id, role FROM app_users WHERE username = $1', [username]);
    if (existing.rowCount === 0) {
      const hash = await bcrypt.hash(process.env.ADMIN_PASSWORD, 12);
      await pool.query(
        'INSERT INTO app_users (username, full_name, password_hash, role) VALUES ($1, $2, $3, $4)',
        [username, process.env.ADMIN_FULL_NAME || 'Hello EPS Administrator', hash, 'admin']
      );
      console.log(`Initial administrator created: ${username}`);
    } else if (existing.rows[0].role !== 'admin') {
      throw new Error('ADMIN_USERNAME already exists as a student account. Choose a different administrator username.');
    }
  }
}

function normalizeUsername(value) { return String(value || '').trim().toLowerCase(); }
function isValidUsername(value) { return /^[a-z0-9._-]{3,32}$/.test(value); }
function isValidPassword(value) { return typeof value === 'string' && Buffer.byteLength(value, 'utf8') >= 10 && Buffer.byteLength(value, 'utf8') <= 72; }
function isValidUuid(value) { return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(String(value || '')); }
function jsonError(res, status, message) { return res.status(status).json({ error: message }); }
function publicQuestions(slug) {
  return (BANK[slug] || []).map((question, index) => ({
    id: index,
    question: question.q,
    options: question.o
  }));
}
function buildResult(slug, answers) {
  const questions = BANK[slug] || [];
  const items = questions.map((question, index) => {
    const raw = answers && Object.prototype.hasOwnProperty.call(answers, String(index)) ? answers[String(index)] : null;
    const selected = Number.isInteger(raw) && raw >= 0 && raw < question.o.length ? raw : null;
    return {
      number: index + 1,
      question: question.q,
      yourAnswer: selected === null ? 'Not answered' : question.o[selected],
      yourAnswerIndex: selected,
      correctAnswer: question.o[question.a],
      correctAnswerIndex: question.a,
      isCorrect: selected === question.a,
      explanation: question.e
    };
  });
  const score = items.filter(item => item.isCorrect).length;
  return { score, total: questions.length, percentage: Math.round((score / Math.max(questions.length, 1)) * 100), items };
}
function toAttemptPayload(row) {
  const isSubmitted = row.status === 'submitted';
  return {
    id: row.id,
    courseSlug: row.course_slug,
    courseTitle: COURSES[row.course_slug],
    status: row.status,
    startedAt: row.started_at,
    expiresAt: row.expires_at,
    serverNow: new Date().toISOString(),
    answers: row.answers || {},
    questions: isSubmitted ? undefined : publicQuestions(row.course_slug),
    result: isSubmitted ? row.result : undefined
  };
}

async function finalizeAttempt(row) {
  if (row.status === 'submitted') return row;
  const result = buildResult(row.course_slug, row.answers || {});
  const updated = await pool.query(
    `UPDATE exam_attempts
       SET status = 'submitted', submitted_at = NOW(), score = $2, result = $3::jsonb
     WHERE id = $1 AND status = 'in_progress'
     RETURNING *`,
    [row.id, result.score, JSON.stringify(result)]
  );
  if (updated.rowCount) return updated.rows[0];
  const latest = await pool.query('SELECT * FROM exam_attempts WHERE id = $1', [row.id]);
  return latest.rows[0];
}

async function requireAuth(req, res, next) {
  try {
    if (!req.session.userId) return jsonError(res, 401, 'Please sign in to continue.');
    const found = await pool.query(
      'SELECT id, username, full_name, role, active FROM app_users WHERE id = $1',
      [req.session.userId]
    );
    if (!found.rowCount || !found.rows[0].active) {
      req.session.destroy(() => {});
      return jsonError(res, 401, 'Your account is unavailable. Contact the institute.');
    }
    req.user = found.rows[0];
    next();
  } catch (error) { next(error); }
}
function requireAdmin(req, res, next) {
  if (!req.user || req.user.role !== 'admin') return jsonError(res, 403, 'Administrator access is required.');
  next();
}
function requireTeacher(req, res, next) {
  // The local Hello EPS build is configured for administrator-only access.
  // Keep this shared guard for legacy routes, but allow the authenticated admin.
  if (!req.user || !['admin', 'teacher'].includes(req.user.role)) return jsonError(res, 403, 'Administrator access is required to open mock examinations.');
  next();
}
async function findOwnedAttempt(id, userId) {
  const found = await pool.query('SELECT * FROM exam_attempts WHERE id = $1 AND user_id = $2', [id, userId]);
  return found.rowCount ? found.rows[0] : null;
}

app.get('/api/health', async (_req, res) => {
  try { await pool.query('SELECT 1'); res.json({ status: 'ok' }); }
  catch { res.status(503).json({ status: 'unavailable' }); }
});

app.post('/api/auth/login', loginLimiter, async (req, res, next) => {
  try {
    const username = normalizeUsername(req.body.username);
    const password = typeof req.body.password === 'string' ? req.body.password : '';
    if (!isValidUsername(username) || password.length < 1 || Buffer.byteLength(password, 'utf8') > 72) {
      return jsonError(res, 400, 'Enter your username and password.');
    }
    const found = await pool.query('SELECT id, username, full_name, password_hash, role, active FROM app_users WHERE username = $1', [username]);
    const user = found.rows[0];
    if (!user || !user.active || !(await bcrypt.compare(password, user.password_hash))) {
      return jsonError(res, 401, 'Incorrect username or password, or the account is inactive.');
    }
    if (user.role === 'student') return jsonError(res, 403, 'Mock Test access is restricted to the Hello EPS administrator.');
    await new Promise((resolve, reject) => req.session.regenerate(error => error ? reject(error) : resolve()));
    req.session.userId = user.id;
    await new Promise((resolve, reject) => req.session.save(error => error ? reject(error) : resolve()));
    res.json({ user: { username: user.username, fullName: user.full_name, role: user.role } });
  } catch (error) { next(error); }
});

app.get('/api/auth/me', requireAuth, (req, res) => {
  res.json({ user: { username: req.user.username, fullName: req.user.full_name, role: req.user.role } });
});

app.post('/api/auth/logout', (req, res, next) => {
  if (!req.session) return res.json({ ok: true });
  req.session.destroy(error => {
    if (error) return next(error);
    res.clearCookie('hello_eps_exam_session', { httpOnly: true, sameSite: 'lax', secure: NODE_ENV === 'production' });
    res.json({ ok: true });
  });
});

app.get('/api/exams/courses', requireAuth, requireTeacher, (req, res) => {
  res.json({ courses: Object.entries(COURSES).map(([slug, title]) => ({ slug, title })) });
});

app.get('/api/exams/active', requireAuth, requireTeacher, examLimiter, async (req, res, next) => {
  try {
    const slug = String(req.query.course || '');
    if (!BANK[slug]) return jsonError(res, 400, 'Choose a valid course.');
    const found = await pool.query(
      `SELECT * FROM exam_attempts WHERE user_id = $1 AND course_slug = $2 AND status = 'in_progress'
       ORDER BY started_at DESC LIMIT 1`, [req.user.id, slug]
    );
    if (!found.rowCount) return res.json({ active: false });
    let row = found.rows[0];
    if (new Date(row.expires_at).getTime() <= Date.now()) row = await finalizeAttempt(row);
    res.json({ active: true, attempt: toAttemptPayload(row) });
  } catch (error) { next(error); }
});

app.post('/api/exams/start', requireAuth, requireTeacher, examLimiter, async (req, res, next) => {
  try {
    const slug = String(req.body.courseSlug || '');
    if (!BANK[slug]) return jsonError(res, 400, 'Choose a valid course.');
    const existing = await pool.query(
      `SELECT * FROM exam_attempts WHERE user_id = $1 AND course_slug = $2 AND status = 'in_progress'
       ORDER BY started_at DESC LIMIT 1`, [req.user.id, slug]
    );
    if (existing.rowCount) {
      let row = existing.rows[0];
      if (new Date(row.expires_at).getTime() <= Date.now()) row = await finalizeAttempt(row);
      return res.json({ attempt: toAttemptPayload(row), resumed: row.status === 'in_progress' });
    }
    const id = crypto.randomUUID();
    try {
      const created = await pool.query(
        `INSERT INTO exam_attempts (id, user_id, course_slug, expires_at, total_questions)
         VALUES ($1, $2, $3, NOW() + ($4 * INTERVAL '1 second'), $5) RETURNING *`,
        [id, req.user.id, slug, EXAM_DURATION_SECONDS, BANK[slug].length]
      );
      return res.status(201).json({ attempt: toAttemptPayload(created.rows[0]), resumed: false });
    } catch (insertError) {
      // The partial unique index prevents two tabs from opening two active exams
      // for the same student/course. If requests raced, resume the winner.
      if (insertError.code !== '23505') throw insertError;
      const raced = await pool.query(
        `SELECT * FROM exam_attempts WHERE user_id = $1 AND course_slug = $2 AND status = 'in_progress'
         ORDER BY started_at DESC LIMIT 1`, [req.user.id, slug]
      );
      if (!raced.rowCount) throw insertError;
      return res.json({ attempt: toAttemptPayload(raced.rows[0]), resumed: true });
    }
  } catch (error) { next(error); }
});

app.get('/api/exams/:id', requireAuth, requireTeacher, examLimiter, async (req, res, next) => {
  try {
    if (!isValidUuid(req.params.id)) return jsonError(res, 400, 'Invalid exam session.');
    let row = await findOwnedAttempt(req.params.id, req.user.id);
    if (!row) return jsonError(res, 404, 'Exam session not found.');
    if (row.status === 'in_progress' && new Date(row.expires_at).getTime() <= Date.now()) row = await finalizeAttempt(row);
    res.json({ attempt: toAttemptPayload(row) });
  } catch (error) { next(error); }
});

app.put('/api/exams/:id/answers', requireAuth, requireTeacher, examLimiter, async (req, res, next) => {
  try {
    if (!isValidUuid(req.params.id)) return jsonError(res, 400, 'Invalid exam session.');
    const row = await findOwnedAttempt(req.params.id, req.user.id);
    if (!row) return jsonError(res, 404, 'Exam session not found.');
    if (row.status !== 'in_progress') return jsonError(res, 409, 'This exam has already been submitted.');
    if (new Date(row.expires_at).getTime() <= Date.now()) {
      await finalizeAttempt(row);
      return jsonError(res, 409, 'The exam time has ended. Your saved answers have been submitted.');
    }
    const incoming = req.body.answers;
    if (!incoming || typeof incoming !== 'object' || Array.isArray(incoming)) return jsonError(res, 400, 'Invalid answer data.');
    const nextAnswers = { ...(row.answers || {}) };
    for (const [key, value] of Object.entries(incoming)) {
      if (!/^\d+$/.test(key)) return jsonError(res, 400, 'Invalid question number.');
      const index = Number(key);
      const q = BANK[row.course_slug][index];
      if (!q) return jsonError(res, 400, 'Invalid question number.');
      if (value !== null && (!Number.isInteger(value) || value < 0 || value >= q.o.length)) return jsonError(res, 400, 'Invalid answer option.');
      nextAnswers[key] = value;
    }
    await pool.query(
      `UPDATE exam_attempts SET answers = $2::jsonb
       WHERE id = $1 AND user_id = $3 AND status = 'in_progress'`,
      [row.id, JSON.stringify(nextAnswers), req.user.id]
    );
    res.json({ saved: true });
  } catch (error) { next(error); }
});

app.post('/api/exams/:id/submit', requireAuth, requireTeacher, examLimiter, async (req, res, next) => {
  try {
    if (!isValidUuid(req.params.id)) return jsonError(res, 400, 'Invalid exam session.');
    let row = await findOwnedAttempt(req.params.id, req.user.id);
    if (!row) return jsonError(res, 404, 'Exam session not found.');
    if (row.status === 'in_progress') row = await finalizeAttempt(row);
    res.json({ attempt: toAttemptPayload(row) });
  } catch (error) { next(error); }
});

app.get('/api/student/history', requireAuth, requireTeacher, async (req, res, next) => {
  try {
    const found = await pool.query(
      `SELECT id, course_slug, started_at, submitted_at, score, total_questions, status
       FROM exam_attempts WHERE user_id = $1 ORDER BY started_at DESC LIMIT 50`, [req.user.id]
    );
    res.json({ attempts: found.rows.map(row => ({ ...row, courseTitle: COURSES[row.course_slug] || row.course_slug })) });
  } catch (error) { next(error); }
});

// Inquiry forms are handled by this server too, so changing away from static-only
// Netlify hosting does not silently break the institute's contact/admission forms.
app.post('/api/inquiries', inquiryLimiter, receiptUpload.single('paymentProof'), async (req, res, next) => {
  try {
    const payload = { ...req.body };
    const honeypot = String(payload['bot-field'] || '').trim();
    const formName = String(payload['form-name'] || payload.formName || 'website-inquiry').trim().slice(0, 100);
    if (honeypot) return res.redirect(303, '/thanks.html');
    delete payload['bot-field'];
    delete payload['form-name'];
    if (!Object.keys(payload).length) return jsonError(res, 400, 'The form appears to be empty. Please review and submit again.');
    if (formName === 'student-registration' && !req.file) return jsonError(res, 400, 'Please upload the required payment receipt (JPG, PNG, WebP or PDF; maximum 8 MB).');
    if (req.file && !hasValidFileSignature(req.file)) return jsonError(res, 400, 'The uploaded receipt file does not match its declared file type.');
    const file = req.file || null;
    await pool.query(
      'INSERT INTO site_inquiries (form_name, payload, file_name, file_mime, file_data) VALUES ($1, $2::jsonb, $3, $4, $5)',
      [formName, JSON.stringify(payload), file ? path.basename(file.originalname).slice(0, 180) : null, file ? file.mimetype : null, file ? file.buffer : null]
    );
    res.redirect(303, '/thanks.html');
  } catch (error) { next(error); }
});

// Public institute updates: vacancies, announcements and media posts.
app.get('/api/content', async (req, res, next) => {
  try {
    const category = String(req.query.category || '').trim();
    if (category && !['vacancy', 'announcement', 'media'].includes(category)) return jsonError(res, 400, 'Invalid content category.');
    const found = category
      ? await pool.query('SELECT id, category, title, body, media_url, media_mime, created_at FROM site_posts WHERE category = $1 ORDER BY created_at DESC LIMIT 100', [category])
      : await pool.query('SELECT id, category, title, body, media_url, media_mime, created_at FROM site_posts ORDER BY created_at DESC LIMIT 150');
    res.json({ posts: found.rows });
  } catch (error) { next(error); }
});

app.post('/api/admin/content', requireAuth, requireAdmin, contentUpload.single('media'), async (req, res, next) => {
  try {
    const category = String(req.body.category || '').trim();
    const title = String(req.body.title || '').trim().slice(0, 180);
    const body = String(req.body.body || '').trim().slice(0, 12000);
    if (!['vacancy', 'announcement', 'media'].includes(category)) return jsonError(res, 400, 'Choose Vacancy, Announcement or Media.');
    if (!title) return jsonError(res, 400, 'Please enter a post title.');
    if (!body && !req.file) return jsonError(res, 400, 'Add post details or upload a photo/video.');
    const mediaUrl = req.file ? `/media-uploads/${req.file.filename}` : null;
    const saved = await pool.query(
      'INSERT INTO site_posts (category, title, body, media_url, media_mime) VALUES ($1, $2, $3, $4, $5) RETURNING id, category, title, body, media_url, media_mime, created_at',
      [category, title, body, mediaUrl, req.file ? req.file.mimetype : null]
    );
    res.status(201).json({ post: saved.rows[0] });
  } catch (error) {
    if (req.file) fs.promises.unlink(req.file.path).catch(() => {});
    next(error);
  }
});

app.delete('/api/admin/content/:id', requireAuth, requireAdmin, async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isSafeInteger(id) || id < 1) return jsonError(res, 400, 'Invalid post.');
    const deleted = await pool.query('DELETE FROM site_posts WHERE id = $1 RETURNING media_url', [id]);
    if (!deleted.rowCount) return jsonError(res, 404, 'Post not found.');
    const mediaUrl = deleted.rows[0].media_url;
    if (mediaUrl && /^\/media-uploads\/[a-f0-9-]+\.(jpg|png|webp|gif|mp4|webm|mov)$/i.test(mediaUrl)) {
      const filePath = path.join(contentUploadDir, path.basename(mediaUrl));
      fs.promises.unlink(filePath).catch(() => {});
    }
    res.json({ ok: true });
  } catch (error) { next(error); }
});

app.get('/api/admin/users', requireAuth, requireAdmin, async (_req, res, next) => {
  try {
    const found = await pool.query(
      `SELECT id, username, full_name, role, active, created_at FROM app_users ORDER BY role, username`
    );
    res.json({ users: found.rows });
  } catch (error) { next(error); }
});

app.post('/api/admin/users', requireAuth, requireAdmin, async (req, res, next) => {
  try {
    const username = normalizeUsername(req.body.username);
    const fullName = String(req.body.fullName || '').trim();
    const password = typeof req.body.password === 'string' ? req.body.password : '';
    if (!isValidUsername(username)) return jsonError(res, 400, 'Username must be 3–32 characters using letters, numbers, dot, underscore or hyphen.');
    if (fullName.length < 2 || fullName.length > 100) return jsonError(res, 400, 'Enter the teacher’s full name.');
    if (!isValidPassword(password)) return jsonError(res, 400, 'Password must be 10–72 bytes.');
    const hash = await bcrypt.hash(password, 12);
    const created = await pool.query(
      `INSERT INTO app_users (username, full_name, password_hash, role)
       VALUES ($1, $2, $3, 'teacher')
       RETURNING id, username, full_name, role, active, created_at`,
      [username, fullName, hash]
    );
    res.status(201).json({ user: created.rows[0] });
  } catch (error) {
    if (error.code === '23505') return jsonError(res, 409, 'That username already exists. Choose another username.');
    next(error);
  }
});

app.patch('/api/admin/users/:id', requireAuth, requireAdmin, async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isSafeInteger(id) || id < 1) return jsonError(res, 400, 'Invalid user.');
    if (id === Number(req.user.id)) return jsonError(res, 400, 'You cannot deactivate the administrator account you are using.');
    if (typeof req.body.active !== 'boolean') return jsonError(res, 400, 'Choose whether the account should be active.');
    const updated = await pool.query(
      `UPDATE app_users SET active = $2, updated_at = NOW() WHERE id = $1 AND role = 'teacher'
       RETURNING id, username, full_name, role, active, created_at`, [id, req.body.active]
    );
    if (!updated.rowCount) return jsonError(res, 404, 'Teacher account not found.');
    // Revoke every existing session immediately, including sessions on other devices.
    await pool.query("DELETE FROM app_sessions WHERE sess->>'userId' = $1", [String(id)]);
    if (!req.body.active) {
      // A disabled teacher account must not leave an exam running in the background.
      const activeAttempts = await pool.query(
        `SELECT * FROM exam_attempts WHERE user_id = $1 AND status = 'in_progress'`, [id]
      );
      for (const row of activeAttempts.rows) await finalizeAttempt(row);
    }
    res.json({ user: updated.rows[0] });
  } catch (error) { next(error); }
});

app.put('/api/admin/users/:id/password', requireAuth, requireAdmin, async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const password = typeof req.body.password === 'string' ? req.body.password : '';
    if (!Number.isSafeInteger(id) || id < 1) return jsonError(res, 400, 'Invalid user.');
    if (!isValidPassword(password)) return jsonError(res, 400, 'Password must be 10–72 bytes.');
    const hash = await bcrypt.hash(password, 12);
    const updated = await pool.query(
      `UPDATE app_users SET password_hash = $2, updated_at = NOW() WHERE id = $1 AND role = 'teacher' RETURNING id`,
      [id, hash]
    );
    if (!updated.rowCount) return jsonError(res, 404, 'Teacher account not found.');
    // A password reset signs the teacher out everywhere. They must use the new password.
    await pool.query("DELETE FROM app_sessions WHERE sess->>'userId' = $1", [String(id)]);
    res.json({ ok: true });
  } catch (error) { next(error); }
});

app.get('/api/admin/attempts', requireAuth, requireAdmin, async (_req, res, next) => {
  try {
    const found = await pool.query(
      `SELECT a.id, a.course_slug, a.started_at, a.submitted_at, a.score, a.total_questions, a.status,
              u.username, u.full_name
       FROM exam_attempts a JOIN app_users u ON u.id = a.user_id
       ORDER BY a.started_at DESC LIMIT 300`
    );
    res.json({ attempts: found.rows.map(row => ({ ...row, courseTitle: COURSES[row.course_slug] || row.course_slug })) });
  } catch (error) { next(error); }
});

app.get('/api/admin/inquiries', requireAuth, requireAdmin, async (_req, res, next) => {
  try {
    const found = await pool.query(
      'SELECT id, form_name, payload, file_name, file_mime, (file_data IS NOT NULL) AS has_file, created_at FROM site_inquiries ORDER BY created_at DESC LIMIT 300'
    );
    res.json({ inquiries: found.rows });
  } catch (error) { next(error); }
});

app.get('/api/admin/inquiries/:id/file', requireAuth, requireAdmin, async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isSafeInteger(id) || id < 1) return jsonError(res, 400, 'Invalid inquiry.');
    const found = await pool.query('SELECT file_name, file_mime, file_data FROM site_inquiries WHERE id = $1 AND file_data IS NOT NULL', [id]);
    if (!found.rowCount) return jsonError(res, 404, 'Receipt file not found.');
    const file = found.rows[0];
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Content-Type', file.file_mime);
    res.setHeader('Content-Disposition', `attachment; filename="${String(file.file_name || 'receipt').replace(/[\"\r\n]/g, '_')}"`);
    res.send(file.file_data);
  } catch (error) { next(error); }
});

function hasValidFileSignature(file) {
  const b = file.buffer;
  if (!b || b.length < 4) return false;
  if (file.mimetype === 'application/pdf') return b.subarray(0, 4).toString() === '%PDF';
  if (file.mimetype === 'image/png') return b.subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10]));
  if (file.mimetype === 'image/jpeg') return b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff;
  if (file.mimetype === 'image/webp') return b.subarray(0, 4).toString() === 'RIFF' && b.subarray(8, 12).toString() === 'WEBP';
  return false;
}

// Public files are served only from /public. The private question bank, database
// credentials and application source are never within this web root.
app.use(express.static(path.join(__dirname, 'public'), {
  index: ['index.html'],
  extensions: ['html'],
  etag: true,
  maxAge: NODE_ENV === 'production' ? '1h' : 0,
  setHeaders(res, filePath) {
    if (filePath.endsWith('.html')) res.setHeader('Cache-Control', 'no-store');
  }
}));
app.get('*', (req, res) => {
  if (req.path.startsWith('/api/')) return jsonError(res, 404, 'API endpoint not found.');
  res.status(404).sendFile(path.join(__dirname, 'public', '404.html'));
});

app.use((error, _req, res, _next) => {
  console.error(error && error.stack ? error.stack : error);
  if (res.headersSent) return;
  const status = error && (error.name === 'MulterError' || String(error.message || '').startsWith('Only JPG, PNG, WebP')) ? 400 : 500;
  res.status(status).json({ error: status === 400 ? 'The uploaded file type is not supported or the file exceeds the 100 MB limit.' : 'A server error occurred. Please try again or contact the institute.' });
});

initDatabase()
  .then(() => {
    const server = app.listen(PORT, '0.0.0.0', () => console.log(`Hello EPS server listening on port ${PORT}`));
    const shutdown = () => server.close(() => pool.end().finally(() => process.exit(0)));
    process.on('SIGTERM', shutdown);
    process.on('SIGINT', shutdown);
  })
  .catch(error => {
    console.error('Unable to initialise Hello EPS. Check PostgreSQL and environment settings.', error);
    process.exit(1);
  });
