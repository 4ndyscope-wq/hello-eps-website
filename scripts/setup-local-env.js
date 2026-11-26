'use strict';
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const envPath = path.join(__dirname, '..', '.env');
const dbPassword = 'i3FJ-52asnKooHHsWDit9IHRCGdxYYCcIp7dyU2QwCo';
let values = {};
if (fs.existsSync(envPath)) {
  const text = fs.readFileSync(envPath, 'utf8');
  for (const line of text.split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
    if (match) values[match[1]] = match[2].replace(/^(['"])(.*)\1$/, '$2');
  }
}

const defaults = {
  NODE_ENV: 'development',
  PORT: '3000',
  DATABASE_URL: `postgresql://hello_eps:${dbPassword}@127.0.0.1:5432/hello_eps`,
  SESSION_SECRET: crypto.randomBytes(48).toString('hex'),
  ADMIN_USERNAME: 'helloeps',
  ADMIN_FULL_NAME: 'Hello EPS Test Administrator',
  ADMIN_PASSWORD: 'hello111@',
  DB_POOL_SIZE: '10'
};

for (const [key, value] of Object.entries(defaults)) {
  if (!values[key] || values[key].includes('CHANGE_THIS') || values[key] === 'REPLACE_WITH_RANDOM_SECRET') {
    values[key] = value;
  }
}

const orderedKeys = Object.keys(defaults);
const output = orderedKeys.map(key => `${key}=${values[key]}`).join('\n') + '\n';
fs.writeFileSync(envPath, output, { mode: 0o600 });
console.log(`Local environment is ready. Test login username: ${values.ADMIN_USERNAME}`);
