'use strict';
require('dotenv').config();
const bcrypt = require('bcryptjs');
const { Pool } = require('pg');

(async () => {
  const username = String(process.env.ADMIN_USERNAME || '').trim().toLowerCase();
  const password = String(process.env.ADMIN_PASSWORD || '');
  const fullName = String(process.env.ADMIN_FULL_NAME || 'Hello EPS Administrator').trim();
  if (!process.env.DATABASE_URL) throw new Error('Set DATABASE_URL in .env first.');
  if (!/^[a-z0-9._-]{3,32}$/.test(username)) throw new Error('Set a valid ADMIN_USERNAME (3–32 letters, numbers, dot, underscore or hyphen).');
  if (Buffer.byteLength(password, 'utf8') < 8 || Buffer.byteLength(password, 'utf8') > 72) throw new Error('ADMIN_PASSWORD must be 8–72 bytes.');
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  try {
    const hash = await bcrypt.hash(password, 12);
    const result = await pool.query(
      `INSERT INTO app_users (username, full_name, password_hash, role)
       VALUES ($1, $2, $3, 'admin')
       ON CONFLICT (username) DO UPDATE SET full_name = EXCLUDED.full_name,
          password_hash = EXCLUDED.password_hash, role = 'admin', active = TRUE, updated_at = NOW()
       RETURNING username`, [username, fullName, hash]
    );
    console.log(`Administrator credentials configured for: ${result.rows[0].username}`);
  } finally { await pool.end(); }
})().catch(error => { console.error(error.message); process.exit(1); });
