const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const http = require('node:http');
const crypto = require('node:crypto');
const { createApp } = require('../backend/app.cjs');
const { hashPassword, digest, token, states } = require('../backend/database.cjs');

const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'baadehasht-test-'));
const originalFetch = global.fetch;
let app;
let server;
let origin;
let root;
let semi;
let guest;
let episode;
const superId = crypto.randomUUID();
const password = 'Test-only-password-2026!';
const mail = [];

function client() {
  const cookies = new Map();
  let csrf = '';
  return {
    async request(route, input, options = {}) {
      const response = await originalFetch(origin + route, {
        method: input ? 'POST' : 'GET', redirect: 'manual',
        ...options,
        headers: { Cookie: [...cookies].map(([key, value]) => `${key}=${value}`).join('; '), ...(input ? { Origin: origin, 'Content-Type': 'application/json', 'X-CSRF-Token': csrf } : {}), ...options.headers },
        ...(input ? { body: JSON.stringify({ ...input }) } : {}),
      });
      for (const header of response.headers.getSetCookie()) {
        const pair = header.split(';')[0];
        const index = pair.indexOf('=');
        cookies.set(pair.slice(0, index), pair.slice(index + 1));
      }
      const text = await response.text();
      let data;
      try { data = JSON.parse(text); } catch {}
      if (route === '/admin' && !input) csrf = /name="csrf" value="([a-f0-9]+)"/.exec(text)?.[1] || '';
      if (route === '/api/admin/session' && data?.csrf) csrf = data.csrf;
      return { status: response.status, headers: response.headers, text, data };
    },
    async login(email, secret = password) {
      await this.request('/admin');
      const response = await this.request('/admin', { email, password: secret });
      assert.equal(response.status, 303, response.text);
      assert.equal((await this.request('/api/admin/session')).status, 200);
    },
  };
}

before(async () => {
  app = createApp({ dataDirectory: directory, config: { origin: '', production: false, resendKey: 'mock-key', emailFrom: 'test@example.com' } });
  app.database.prepare('INSERT INTO admins(id,name,email,password,role,created_at) VALUES (?,?,?,?,?,?)').run(superId, 'Test Super', 'super@example.com', await hashPassword(password), 'super', new Date().toISOString());
  server = http.createServer(async (request, response) => {
    if (!await app.handle(request, response)) response.writeHead(404).end();
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  origin = `http://127.0.0.1:${server.address().port}`;
  global.fetch = async (url, options) => {
    if (String(url) === 'https://api.resend.com/emails') { mail.push(JSON.parse(options.body)); return new Response('{"id":"mock"}', { status: 200 }); }
    return originalFetch(url, options);
  };
  root = client();
  await root.login('super@example.com');
});

after(async () => {
  global.fetch = originalFetch;
  await new Promise(resolve => server.close(resolve));
  app.close();
  const resolved = path.resolve(directory);
  assert.ok(resolved.startsWith(path.resolve(os.tmpdir()) + path.sep));
  assert.ok(path.basename(resolved).startsWith('baadehasht-test-'));
  fs.rmSync(resolved, { recursive: true });
});

test('private routes require authentication; public pages and branded 404 render', async () => {
  const visitor = client();
  assert.equal((await visitor.request('/api/admin/guests')).status, 401);
  const privatePage = await visitor.request('/admin/dashboard');
  assert.equal(privatePage.status, 303);
  assert.equal(privatePage.headers.get('location'), '/admin');
  for (const route of ['/', '/guests', '/about', '/team', '/episodes', '/privacy', '/terms', '/admin', '/admin/forgot-password', '/admin/reset-password']) {
    const response = await visitor.request(route);
    assert.equal(response.status, 200, route);
    assert.match(response.text, /lang="fa" dir="rtl"/);
  }
  assert.equal((await visitor.request('/not-a-page')).status, 404);
  assert.equal((await visitor.request('/admin')).headers.get('x-robots-tag'), 'noindex, nofollow');
  assert.match((await visitor.request('/robots.txt')).text, /Disallow: \/admin/);
});

test('all admin pages render, CSRF and cross-origin mutations are blocked', async () => {
  for (const route of ['dashboard', 'guests', 'episodes', 'pipeline', 'admins', 'guests?edit=new', 'episodes?edit=new', 'pipeline?edit=new']) {
    const response = await root.request('/admin/' + route);
    assert.equal(response.status, 200, route + response.text);
  }
  assert.equal((await root.request('/api/admin/guests/new', { name: 'Attack' }, { headers: { Origin: 'https://evil.example', 'Content-Type': 'application/json' } })).status, 403);
  assert.equal((await root.request('/api/admin/guests/new', { name: 'Attack' }, { headers: { Origin: origin, 'Content-Type': 'application/json', 'X-CSRF-Token': '0'.repeat(64) } })).status, 403);
});

test('settings and team administration are removed, including their APIs', async () => {
  const dashboard = await root.request('/admin/dashboard');
  assert.ok(!dashboard.text.includes('href="/admin/settings"'));
  assert.ok(!dashboard.text.includes('href="/admin/team"'));
  for (const section of ['settings', 'team']) {
    for (const route of [`/admin/${section}`, `/api/admin/${section}`]) {
      assert.equal((await root.request(route)).status, 404, route);
      assert.equal((await root.request(route, { name: 'Not editable', about: 'Not editable' })).status, 404, route);
    }
    assert.equal((await root.request(`/api/admin/${section}/new`, { name: 'Not editable' })).status, 404);
    assert.equal((await root.request(`/api/admin/${section}/${crypto.randomUUID()}`, {}, { method: 'DELETE' })).status, 404);
  }
});

test('About copy and team come from frontend files, and headers use the transparent logo', async () => {
  const about = require('../frontend/about.json');
  const page = await client().request('/about');
  assert.match(page.text, /<h2>بعد از هشت ترم کارشناسی، چی؟<\/h2>/);
  for (const paragraph of about.paragraphs) assert.ok(page.text.includes(paragraph));
  assert.match(page.text, /src="\/files\/images\/logo_transparent.png"/);
  const home = await client().request('/');
  assert.match(home.text, /class="brand-symbol" src="\/files\/images\/logo_transparent.png"/);
  assert.deepEqual((await client().request('/api/public')).data.team, about.team);
  assert.ok(!page.text.includes('class="team-grid"'));
  assert.ok(!page.text.includes('آدم‌های پشت بعد هشت'));
  assert.match(page.text, /href="\/team">با تیم پشت صحنه آشنا شوید/);
  assert.match(page.text, /src="\/files\/images\/logo_edit_transparent.png"/);
  const teamPage = await client().request('/team');
  assert.equal(teamPage.status, 200);
  assert.match(teamPage.text, /<h1>تیم پشت صحنه<\/h1>/);
  assert.match(teamPage.text, /class="team-grid"/);
  for (const member of about.team) assert.ok(teamPage.text.includes(member.name));
  assert.match((await client().request('/sitemap.xml')).text, /\/team<\/loc>/);
});

test('landing navigation and podcast copy are frontend-managed, not replaced by legacy settings', async () => {
  const original = app.store.settings();
  try {
    app.store.saveSettings({ ...original, heroLine1: 'LEGACY HERO', heroLine2: 'LEGACY SECOND LINE', heroDescription: 'LEGACY DESCRIPTION', homeCopy: { ideaText: 'LEGACY COPY', story3More: 'LEGACY STORY' } });
    const home = await client().request('/');
    const navigation = /<nav class="header-links"[^>]*>([\s\S]*?)<\/nav>/.exec(home.text)[1];
    assert.deepEqual([...navigation.matchAll(/href="([^"]+)"/g)].map(match => match[1]), ['/guests', '/episodes', '/about']);
    for (const label of ['مهمان‌ها', 'گفت‌وگوها', 'دربارهٔ ما']) assert.ok(navigation.includes(label));
    for (const text of ['بعد از هشت ترم،', 'داستان ادامه داره.', 'کار، ارشد یا اپلای؟', 'رایگان', 'تجربهٔ دیگران نسخهٔ آماده نیست']) assert.ok(home.text.includes(text), text);
    assert.ok(!home.text.includes('LEGACY'));
    assert.ok(!home.text.includes('این متن‌ها نمونه‌اند'));
    assert.ok(!home.text.includes('نسخهٔ اصلی'));
    assert.match(home.text, /href="\/team">تیم پشت صحنه/);
  } finally {
    app.store.saveSettings(original);
  }
});

test('public pages have purpose-specific layouts and shared self-hosted typography', async () => {
  for (const variant of ['about', 'team', 'guests', 'episodes', 'privacy', 'terms']) {
    const response = await client().request('/' + variant);
    assert.ok(response.text.includes(`class="public-site page-${variant}"`));
    assert.match(response.text, /frontend\/public-pages.css/);
    assert.match(response.text, /files\/fonts\/Estedad.ttf/);
  }
  const admin = await root.request('/admin/dashboard');
  assert.ok(!admin.text.includes('frontend/public-pages.css'));
});

test('super creates semi; server rejects semi account management', async () => {
  const response = await root.request('/api/admin/admins/new', { name: 'Semi', email: 'semi@example.com', password });
  assert.equal(response.status, 200, response.text);
  semi = client();
  await semi.login('semi@example.com');
  assert.equal((await semi.request('/api/admin/admins/new', { name: 'Forbidden', email: 'no@example.com', password })).status, 403);
  const list = await semi.request('/api/admin/admins');
  assert.equal(list.data.length, 2);
  assert.ok(!list.text.includes('password'));
  assert.ok(!(await semi.request('/admin/admins')).text.includes('ساخت حساب مدیر'));
  assert.equal((await root.request(`/api/admin/admins/${superId}/toggle`, {})).status, 403);
});

test('draft pipeline plans are private; publishing is independent of all six states', async () => {
  const response = await semi.request('/api/admin/pipeline/new', { name: 'مهمان آزمایشی', state: 'First Talk', notes: 'PRIVATE-NOTE' });
  assert.equal(response.status, 201, response.text);
  guest = response.data;
  assert.equal(guest.published, false);
  assert.equal((await client().request('/api/public')).data.guests.length, 0);
  for (const state of states) {
    assert.equal((await semi.request(`/api/admin/pipeline/${guest.id}`, { state, notes: 'PRIVATE-NOTE' })).status, 200);
    assert.equal((await client().request('/api/public')).data.guests.length, 0);
  }
  const published = await semi.request(`/api/admin/guests/${guest.id}`, { ...guest, state: states[5], published: true, shortBio: '<script>alert(1)</script>', linkedin: 'https://www.linkedin.com/in/test' });
  assert.equal(published.status, 200);
  guest = published.data;
  const feed = await client().request('/api/public');
  assert.equal(feed.data.guests.length, 1);
  for (const key of ['notes', 'state', 'assignedAdmin', 'stateChangedAt']) assert.ok(!Object.hasOwn(feed.data.guests[0], key), key);
  assert.ok(!feed.text.includes('PRIVATE-NOTE'));
  const page = await client().request('/guests');
  assert.match(page.text, /&lt;script&gt;/);
  assert.ok(!page.text.includes('<script>alert(1)</script>'));
  assert.ok(!page.text.includes('>Castbox ↗'));
  assert.equal((await client().request('/guests/' + encodeURIComponent(guest.slug))).status, 200);
});

test('validation rejects misleading domains, duplicate slugs and invalid relationships', async () => {
  assert.equal((await semi.request('/api/admin/guests/new', { ...guest, linkedin: 'https://linkedin.com.evil.example/test', slug: 'another' })).status, 400);
  assert.equal((await semi.request('/api/admin/guests/new', { ...guest })).status, 400);
  assert.equal((await semi.request('/api/admin/episodes/new', { title: 'bad', status: 'published', publishAt: new Date().toISOString(), youtubeId: 'bad' })).status, 400);
});

test('episodes, manual pins and video display preferences persist', async () => {
  const created = await semi.request('/api/admin/episodes/new', { title: 'Published test', description: 'Test episode', youtubeId: 'abcdefghijk', publishAt: '2020-01-01T00:00:00Z', status: 'published', pinned: true, guestId: guest.id });
  assert.equal(created.status, 201, created.text);
  episode = created.data;
  assert.equal((await semi.request('/api/admin/episodes/new', { title: 'Archived test', publishAt: '2030-01-01T00:00:00Z', status: 'archived' })).status, 201);
  const settings = app.store.settings();
  const saved = await semi.request('/admin/display', { videoMode: 'manual', videoCount: 4, about: 'Not editable', logo: '/files/images/BlackTBack.png' });
  assert.equal(saved.status, 303, saved.text);
  assert.equal(app.store.settings().about, settings.about);
  assert.equal(app.store.settings().logo, settings.logo);
  const home = await client().request('/');
  assert.match(home.text, /Published test/);
  assert.ok(!home.text.includes('Archived test'));
  assert.match(home.text, /frontend\/shared\/experience.js/);
  assert.match(home.text, /frontend\/shared\/experience.css/);
  assert.ok(!Object.hasOwn((await client().request('/api/public')).data, 'upcoming'));
  const secondApp = createApp({ dataDirectory: directory, config: { production: false, origin: '' } });
  assert.equal(secondApp.store.all('episodes').length, 2);
  assert.equal(secondApp.store.settings().videoCount, 4);
  secondApp.close();
});

test('media uploads enforce signatures and limits and serve immutable URLs', async () => {
  const invalid = await semi.request('/api/admin/upload', { data: 'data:image/png;base64,' + Buffer.from('<script>no</script>').toString('base64') });
  assert.equal(invalid.status, 400);
  const png = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jZ9kAAAAASUVORK5CYII=';
  const uploaded = await semi.request('/api/admin/upload', { data: 'data:image/png;base64,' + png });
  assert.equal(uploaded.status, 201, uploaded.text);
  const served = await client().request(uploaded.data.url);
  assert.equal(served.status, 200);
  assert.equal(served.headers.get('content-type'), 'image/png');
  assert.match(served.headers.get('cache-control'), /immutable/);
});

test('disabling immediately revokes sessions; enabling does not restore them', async () => {
  const semiId = (await root.request('/api/admin/admins')).data.find(item => item.role === 'semi').id;
  assert.equal((await root.request(`/api/admin/admins/${semiId}/toggle`, {})).status, 200);
  assert.equal((await semi.request('/api/admin/guests')).status, 401);
  assert.equal((await semi.request('/api/admin/pipeline/new', { name: 'No' })).status, 401);
  assert.equal((await root.request(`/api/admin/admins/${semiId}/toggle`, {})).status, 200);
  assert.equal((await semi.request('/api/admin/session')).status, 401);
  await semi.login('semi@example.com');
});

test('password reset email uses hashed single-use expiring tokens and revokes sessions', async () => {
  const visitor = client();
  await visitor.request('/admin');
  assert.equal((await visitor.request('/admin/forgot-password', { email: 'semi@example.com' })).status, 303);
  assert.equal(mail.length, 1);
  const secret = /token=([a-f0-9]{64})/.exec(mail[0].text)[1];
  assert.ok(!JSON.stringify(app.database.prepare('SELECT * FROM resets').all()).includes(secret));
  assert.ok(app.database.prepare('SELECT * FROM resets WHERE token=?').get(digest(secret)));
  const changed = 'Changed-test-password-2026!';
  assert.equal((await visitor.request('/admin/reset-password', { token: secret, password: changed, confirmation: changed })).status, 303);
  assert.equal((await semi.request('/api/admin/session')).status, 401);
  assert.equal((await visitor.request('/admin/reset-password', { token: secret, password: changed, confirmation: changed })).status, 400);
  await semi.login('semi@example.com', changed);
  const expired = token();
  const semiId = (await root.request('/api/admin/admins')).data.find(item => item.role === 'semi').id;
  app.database.prepare('INSERT INTO resets VALUES (?,?,?)').run(digest(expired), semiId, Date.now() - 1);
  assert.equal((await visitor.request('/admin/reset-password', { token: expired, password: changed, confirmation: changed })).status, 400);
});

test('deleting a guest clears episode relationships', async () => {
  assert.equal((await semi.request(`/api/admin/guests/${guest.id}/delete`, {})).status, 200);
  assert.equal((await semi.request('/api/admin/episodes')).data.find(item => item.id === episode.id).guestId, '');
  assert.equal((await client().request('/api/public')).data.guests.length, 0);
});

test('email delivery failures do not reveal account existence or retain unusable reset tokens', async () => {
  const previousFetch = global.fetch;
  global.fetch = async () => new Response('{"error":"provider unavailable"}', { status: 503 });
  try {
    const visitor = client();
    await visitor.request('/admin');
    const known = await visitor.request('/admin/forgot-password', { email: 'semi@example.com' });
    const unknown = await visitor.request('/admin/forgot-password', { email: 'missing@example.com' });
    assert.equal(known.status, 303);
    assert.equal(unknown.status, known.status);
    assert.equal(unknown.headers.get('location'), known.headers.get('location'));
    assert.equal(app.database.prepare('SELECT COUNT(*) AS count FROM resets').get().count, 0);
    const semiId = (await root.request('/api/admin/admins')).data.find(item => item.role === 'semi').id;
    assert.equal((await root.request(`/api/admin/admins/${semiId}/reset`, {})).status, 503);
    const stillActive = client();
    await stillActive.login('semi@example.com', 'Changed-test-password-2026!');
  } finally { global.fetch = previousFetch; }
});

test('forced reset invalidates the old password and account caps preserve one super plus six semi admins', async () => {
  const semiId = (await root.request('/api/admin/admins')).data.find(item => item.role === 'semi').id;
  assert.equal((await root.request(`/api/admin/admins/${semiId}/reset`, {})).status, 200);
  assert.equal((await semi.request('/api/admin/session')).status, 401);
  const visitor = client();
  await visitor.request('/admin');
  assert.equal((await visitor.request('/admin', { email: 'semi@example.com', password: 'Changed-test-password-2026!' })).status, 401);
  const secret = /token=([a-f0-9]{64})/.exec(mail.at(-1).text)[1];
  assert.equal((await visitor.request('/admin/reset-password', { token: secret, password, confirmation: password })).status, 303);
  for (let index = 0; index < 5; index += 1) assert.equal((await root.request('/api/admin/admins/new', { name: `Semi ${index}`, email: `semi${index}@example.com`, password, role: 'super' })).status, 200);
  assert.equal((await root.request('/api/admin/admins/new', { name: 'Seventh', email: 'seventh@example.com', password })).status, 400);
  const admins = (await root.request('/api/admin/admins')).data;
  assert.equal(admins.filter(admin => admin.role === 'super').length, 1);
  assert.equal(admins.filter(admin => admin.role === 'semi').length, 6);
});

test('expired sessions cannot read admin data and logout revokes the current session', async () => {
  const visitor = client();
  await visitor.login('semi@example.com');
  const session = (await visitor.request('/api/admin/session')).data;
  app.database.prepare('UPDATE sessions SET expires=? WHERE csrf=?').run(Date.now() - 1, session.csrf);
  assert.equal((await visitor.request('/api/admin/guests')).status, 401);
  await visitor.login('semi@example.com');
  assert.equal((await visitor.request('/admin/logout', {})).status, 303);
  assert.equal((await visitor.request('/api/admin/session')).status, 401);
});

test('persistent rate limits stop repeated failed logins', async () => {
  const visitor = client();
  await visitor.request('/admin');
  for (let index = 0; index < 8; index += 1) assert.equal((await visitor.request('/admin', { email: 'nobody@example.com', password: 'wrong' })).status, 401);
  assert.equal((await visitor.request('/admin', { email: 'nobody@example.com', password: 'wrong' })).status, 429);
  const logs = await root.request('/api/admin/audit');
  assert.ok(logs.data.some(entry => entry.action === 'disable'));
  assert.ok(logs.data.some(entry => entry.action === 'password-reset'));
});
