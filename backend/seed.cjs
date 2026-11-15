const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { openDatabase, hashPassword } = require('./database.cjs');
const validation = require('./validation.cjs');
const envFile = path.resolve(__dirname, '..', '.env');
if (fs.existsSync(envFile)) process.loadEnvFile(envFile);

async function main() {
  const name = validation.text(process.env.SUPER_ADMIN_NAME, 'SUPER_ADMIN_NAME', 150, true);
  const email = validation.email(process.env.SUPER_ADMIN_EMAIL);
  const password = await hashPassword(validation.password(process.env.SUPER_ADMIN_PASSWORD));
  const database = openDatabase(path.resolve(process.env.DATA_DIR || path.join(__dirname, '..', 'data')));
  try {
    if (database.prepare("SELECT id FROM admins WHERE role='super'").get()) {
      console.log('Super Admin already exists; no accounts or passwords changed.');
      return;
    }
    database.prepare('INSERT INTO admins(id,name,email,password,role,created_at) VALUES (?,?,?,?,?,?)').run(crypto.randomUUID(), name, email, password, 'super', new Date().toISOString());
    console.log('Super Admin created. Sign in at /admin. Remove SUPER_ADMIN_PASSWORD from .env after setup.');
  } finally { database.close(); }
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });
