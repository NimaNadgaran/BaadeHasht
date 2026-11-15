const fs = require('node:fs');
const path = require('node:path');
const { DatabaseSync } = require('node:sqlite');
const crypto = require('node:crypto');
const { promisify } = require('node:util');
const about = require('../frontend/about.json');

const derive = promisify(crypto.argon2);
const states = ['First Talk', 'Scenario', 'Planned', 'Tool Video', 'Video Checked', 'Video Uploaded'];
const copyLabels = {
  ideaTitle: 'تیتر داستان این فضا', ideaText: 'متن داستان این فضا',
  card1Title: 'عنوان کارت اول', card1Text: 'متن کارت اول',
  card2Title: 'عنوان کارت دوم', card2Text: 'متن کارت دوم',
  card3Title: 'عنوان کارت سوم', card3Text: 'متن کارت سوم',
  story1Title: 'عنوان متن اول', story1Text: 'بند اول متن اول', story1More: 'بند دوم متن اول',
  story2Title: 'عنوان متن دوم', story2Text: 'بند اول متن دوم', story2More: 'بند دوم متن دوم',
  story3Title: 'عنوان متن سوم', story3Text: 'بند اول متن سوم', story3More: 'بند دوم متن سوم',
  invitationTitle: 'عنوان دعوت پایانی',
};
const defaults = {
  siteName: 'بعد هشت', tagline: 'فراتر از روزمرگی.',
  heroLine1: 'یک قدم دورتر', heroLine2: 'از روزمرگی.',
  heroDescription: 'زاویهٔ نگاهت را عوض کن.\nگاهی یک گفت‌وگو، دنیای تازه‌ای پیش روی ما می‌گذارد.',
  about: [about.title, ...about.paragraphs].join('\n\n'),
  logo: '/files/images/logo_transparent.png', poster: '', heroAsset: '', heroEnabled: true,
  primary: '', secondary: '', accent: '', font: 'Vazirmatn', radius: 3, defaultTheme: 'system',
  videoMode: 'manual', videoCount: 4, channel: '', showUpcoming: true,
  youtube: 'https://www.youtube.com/@baadehasht', linkedin: '', spotify: '', castbox: '',
  contactEmail: '', analyticsDomain: '', privacy: '', terms: '',
  homeCopy: {},
};

async function hashPassword(password, salt = crypto.randomBytes(16).toString('hex')) {
  const key = await derive('argon2id', { message: password, nonce: Buffer.from(salt, 'hex'), parallelism: 1, tagLength: 32, memory: 65536, passes: 3 });
  return `${salt}:${key.toString('hex')}`;
}

async function verifyPassword(password, stored) {
  const candidate = await hashPassword(password, stored.split(':')[0]);
  return crypto.timingSafeEqual(Buffer.from(candidate), Buffer.from(stored));
}

const digest = value => crypto.createHash('sha256').update(value).digest('hex');
const token = () => crypto.randomBytes(32).toString('hex');

function openDatabase(directory) {
  fs.mkdirSync(directory, { recursive: true });
  const database = new DatabaseSync(path.join(directory, 'podcast.sqlite'));
  database.exec(`
    PRAGMA journal_mode=WAL;
    PRAGMA foreign_keys=ON;
    CREATE TABLE IF NOT EXISTS admins (
      id TEXT PRIMARY KEY, name TEXT NOT NULL, email TEXT NOT NULL UNIQUE COLLATE NOCASE,
      password TEXT NOT NULL, role TEXT NOT NULL CHECK(role IN ('super','semi')),
      active INTEGER NOT NULL DEFAULT 1, last_login TEXT, created_at TEXT NOT NULL
    );
    CREATE UNIQUE INDEX IF NOT EXISTS single_super ON admins(role) WHERE role='super';
    CREATE TABLE IF NOT EXISTS sessions (
      token TEXT PRIMARY KEY, admin_id TEXT NOT NULL REFERENCES admins(id) ON DELETE CASCADE,
      csrf TEXT NOT NULL, expires INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS resets (
      token TEXT PRIMARY KEY, admin_id TEXT NOT NULL REFERENCES admins(id) ON DELETE CASCADE,
      expires INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS guests (id TEXT PRIMARY KEY, data TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS episodes (id TEXT PRIMARY KEY, data TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS team (id TEXT PRIMARY KEY, data TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS settings (id INTEGER PRIMARY KEY CHECK(id=1), data TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS cache (id TEXT PRIMARY KEY, data TEXT NOT NULL, updated INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS limits (id TEXT PRIMARY KEY, count INTEGER NOT NULL, expires INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS audit (
      id INTEGER PRIMARY KEY, admin_id TEXT, action TEXT NOT NULL, entity TEXT NOT NULL,
      entity_id TEXT, created_at TEXT NOT NULL
    );
    PRAGMA user_version=1;
  `);
  database.prepare('INSERT OR IGNORE INTO settings VALUES (1, ?)').run(JSON.stringify(defaults));
  return database;
}

function repository(database) {
  const tables = new Set(['guests', 'episodes', 'team']);
  function table(name) {
    if (!tables.has(name)) throw new Error('Unknown collection');
    return name;
  }
  return {
    all: name => database.prepare(`SELECT id, data FROM ${table(name)}`).all().map(row => ({ ...JSON.parse(row.data), id: row.id })),
    save(name, id, data) { database.prepare(`INSERT INTO ${table(name)} VALUES (?, ?) ON CONFLICT(id) DO UPDATE SET data=excluded.data`).run(id, JSON.stringify(data)); },
    remove(name, id) { database.prepare(`DELETE FROM ${table(name)} WHERE id=?`).run(id); },
    settings: () => ({ ...defaults, ...JSON.parse(database.prepare('SELECT data FROM settings WHERE id=1').get().data), logo: defaults.logo, about: defaults.about }),
    saveSettings(data) { database.prepare('UPDATE settings SET data=? WHERE id=1').run(JSON.stringify(data)); },
    audit(admin, action, entity, id = '') { database.prepare('INSERT INTO audit(admin_id,action,entity,entity_id,created_at) VALUES (?,?,?,?,?)').run(admin.id, action, entity, id, new Date().toISOString()); },
  };
}

module.exports = { openDatabase, repository, hashPassword, verifyPassword, digest, token, states, defaults, copyLabels };
