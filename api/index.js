/**
 * Vercel serverless entry point.
 *
 * `vercel.json` rewrites the dynamic routes (`/`, `/guests`, `/admin`, `/api/*`,
 * `/media/*`, `robots.txt`, `sitemap.xml`) here. Everything else is served from
 * the `public/` folder built by `scripts/build-vercel.cjs`.
 */
const path = require('node:path');
const crypto = require('node:crypto');

// Vercel's filesystem is read-only except for /tmp, so keep the SQLite
// database and uploads there unless DATA_DIR is configured explicitly.
if (!process.env.DATA_DIR) {
  process.env.DATA_DIR = path.join('/tmp', 'baadehasht', 'data');
}

// app.cjs requires an absolute HTTPS origin in production (CSRF + emails).
// Vercel sets NODE_ENV=production, so derive a fallback when SITE_URL is unset.
if (!process.env.SITE_URL || !/^https?:\/\//.test(process.env.SITE_URL)) {
  const host = process.env.VERCEL_PROJECT_PRODUCTION_URL || process.env.VERCEL_URL;
  if (host) process.env.SITE_URL = `https://${host}`;
}

const { createApp } = require('../backend/app.cjs');
const { hashPassword } = require('../backend/database.cjs');

const app = createApp();

let bootstrap;
function ensureSuperAdmin() {
  if (!bootstrap) {
    bootstrap = (async () => {
      const email = process.env.SUPER_ADMIN_EMAIL;
      const password = process.env.SUPER_ADMIN_PASSWORD;
      if (!email || !password) return;
      if (password.length < 12 || password.length > 128) {
        console.warn('SUPER_ADMIN_PASSWORD must be 12-128 characters; skipping admin bootstrap.');
        return;
      }
      if (app.database.prepare("SELECT id FROM admins WHERE role='super'").get()) return;
      const name = (process.env.SUPER_ADMIN_NAME || 'Super Admin').trim().slice(0, 150) || 'Super Admin';
      const hashed = await hashPassword(password);
      app.database
        .prepare('INSERT OR IGNORE INTO admins(id,name,email,password,role,created_at) VALUES (?,?,?,?,?,?)')
        .run(crypto.randomUUID(), name, email.trim().toLowerCase(), hashed, 'super', new Date().toISOString());
    })().catch(error => console.error('Super Admin bootstrap failed:', error.message));
  }
  return bootstrap;
}

module.exports = async function handler(request, response) {
  await ensureSuperAdmin();
  try {
    if (await app.handle(request, response)) return;
  } catch (error) {
    console.error(error);
    if (!response.headersSent) response.writeHead(500).end('Internal server error');
    else response.destroy();
    return;
  }
  response.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }).end('Not found');
};
