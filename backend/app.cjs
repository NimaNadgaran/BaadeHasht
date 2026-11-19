const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { openDatabase, repository, hashPassword, verifyPassword, digest, token, states } = require('./database.cjs');
const validation = require('./validation.cjs');
const views = require('./views.cjs');
const { sendReset } = require('./integrations.cjs');
const about = require('../frontend/about.json');

function createApp(options = {}) {
  const directory = path.resolve(options.dataDirectory || process.env.DATA_DIR || path.join(__dirname, '..', 'data'));
  const database = openDatabase(directory);
  const store = repository(database);
  const config = {
    origin: process.env.SITE_URL || '', production: process.env.NODE_ENV === 'production',
    resendKey: process.env.RESEND_API_KEY, emailFrom: process.env.EMAIL_FROM, ...options.config,
  };
  if (config.production && (!config.origin || !config.origin.startsWith('https://'))) throw new Error('Production requires an HTTPS SITE_URL.');
  if (config.origin) config.origin = new URL(config.origin).origin;
  const dummyPassword = hashPassword(token());
  const authPaths = ['/admin', '/admin/forgot-password', '/admin/reset-password'];

  function rateLimit(key, max, milliseconds) {
    const now = Date.now();
    database.prepare('DELETE FROM limits WHERE expires<?').run(now);
    const row = database.prepare('SELECT * FROM limits WHERE id=?').get(key);
    if (row && row.count >= max) validation.fail('تلاش‌های زیادی انجام شده است. کمی بعد دوباره امتحان کنید.', 429);
    database.prepare('INSERT INTO limits VALUES (?,1,?) ON CONFLICT(id) DO UPDATE SET count=count+1').run(key, now + milliseconds);
  }
  function transaction(callback) {
    database.exec('BEGIN IMMEDIATE');
    try { const result = callback(); database.exec('COMMIT'); return result; }
    catch (error) { database.exec('ROLLBACK'); throw error; }
  }
  function sessionFor(request) {
    const secret = cookie(request, 'bh_session');
    if (!secret) return null;
    return database.prepare('SELECT admins.id,admins.name,admins.email,admins.role,sessions.csrf FROM sessions JOIN admins ON admins.id=sessions.admin_id WHERE sessions.token=? AND sessions.expires>? AND admins.active=1').get(digest(secret), Date.now());
  }
  function safeAdmin(admin) {
    return { id: admin.id, name: admin.name, email: admin.email, role: admin.role, active: Boolean(admin.active), last_login: admin.last_login, created_at: admin.created_at };
  }
  function admins() { return database.prepare('SELECT id,name,email,role,active,last_login,created_at FROM admins ORDER BY created_at').all(); }
  function requireAdmin(admin, superOnly = false) {
    if (!admin) validation.fail('ابتدا وارد حساب مدیریت شوید.', 401);
    if (superOnly && admin.role !== 'super') validation.fail('این عملیات تنها برای مدیر ارشد مجاز است.', 403);
  }
  function originFor(request) {
    if (config.origin) return config.origin;
    return `http://localhost:${request.socket.localPort}`;
  }
  function checkCsrf(request, input, admin) {
    const origin = request.headers.origin;
    const allowed = config.origin ? [config.origin] : [`http://localhost:${request.socket.localPort}`, `http://127.0.0.1:${request.socket.localPort}`];
    if (!origin || !allowed.includes(origin) || request.headers['sec-fetch-site'] === 'cross-site') validation.fail('درخواست از مبدأ غیرمجاز است.', 403);
    const provided = request.headers['x-csrf-token'] || input.csrf;
    const expected = admin ? admin.csrf : cookie(request, 'bh_csrf');
    if (!provided || !expected || !/^[a-f0-9]{64}$/.test(provided) || provided.length !== expected.length || !crypto.timingSafeEqual(Buffer.from(provided), Buffer.from(expected))) validation.fail('اعتبار فرم منقضی شده است؛ صفحه را تازه کنید.', 403);
  }
  function setCookie(response, name, value, seconds) {
    const existing = response.getHeader('Set-Cookie') || [];
    response.setHeader('Set-Cookie', [...existing, `${name}=${value}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${seconds}${config.production || config.origin.startsWith('https:') ? '; Secure' : ''}`]);
  }
  function anonymousCsrf(request, response) {
    let secret = cookie(request, 'bh_csrf');
    if (!/^[a-f0-9]{64}$/.test(secret || '')) { secret = token(); setCookie(response, 'bh_csrf', secret, 3600); }
    return secret;
  }
  async function publicData(query = '') {
    const settings = store.settings();
    const published = store.all('episodes').filter(episode => episode.status === 'published' && new Date(episode.publishAt).getTime() <= Date.now()).sort((first, second) => second.publishAt.localeCompare(first.publishAt));
    const home = settings.videoMode === 'automatic' ? published.slice(0, settings.videoCount) : published.filter(episode => episode.pinned).slice(0, settings.videoCount);
    const guests = store.all('guests').filter(guest => guest.published).sort(order).map(guest => {
      const { id, name, slug, photo, tagline, shortBio, longBio, linkedin, youtube, castbox, spotify } = guest;
      return { id, name, slug, photo, tagline, shortBio, longBio, linkedin, youtube, castbox, spotify };
    });
    return { guests, team: about.team, episodes: published, home, source: settings.videoMode, query };
  }
  function saveEntity(collection, id, input, admin, pipeline = false) {
    const existing = store.all(collection).find(item => item.id === id);
    if (id !== 'new' && !existing) validation.fail('مورد پیدا نشد.', 404);
    let data;
    if (pipeline) {
      const allowed = ['name', 'state', 'assignedAdmin', 'notes'];
      const changes = Object.fromEntries(allowed.filter(key => Object.hasOwn(input, key)).map(key => [key, input[key]]));
      data = validation.validate('guests', { ...(existing || {}), ...changes }, existing);
    } else data = validation.validate(collection, input, existing);
    if (collection === 'guests' && store.all('guests').some(guest => guest.id !== id && guest.slug === data.slug)) validation.fail('این نامک قبلاً استفاده شده است.');
    if (collection === 'guests' && data.assignedAdmin && !admins().some(item => item.id === data.assignedAdmin && item.active)) validation.fail('مسئول باید یک مدیر فعال باشد.');
    if (collection === 'episodes' && data.guestId && !store.all('guests').some(guest => guest.id === data.guestId)) validation.fail('مهمان مرتبط پیدا نشد.');
    const entityId = existing ? id : crypto.randomUUID();
    transaction(() => { store.save(collection, entityId, data); store.audit(admin, existing ? 'update' : 'create', collection, entityId); });
    return { ...data, id: entityId };
  }

  async function upload(input, admin) {
    if (typeof input.data !== 'string' || input.data.length > 7100000) validation.fail('حجم فایل بیش از حد مجاز است.');
    const match = /^data:(image\/(?:png|jpeg|webp)|model\/gltf-binary|application\/octet-stream);base64,([A-Za-z0-9+/]*={0,2})$/.exec(input.data);
    if (!match) validation.fail('فرمت فایل پشتیبانی نمی‌شود.');
    const bytes = Buffer.from(match[2], 'base64');
    let extension;
    if (match[1] === 'image/png' && bytes.subarray(0, 8).equals(Buffer.from('89504e470d0a1a0a', 'hex'))) extension = 'png';
    if (match[1] === 'image/jpeg' && bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255) extension = 'jpg';
    if (match[1] === 'image/webp' && bytes.toString('ascii', 0, 4) === 'RIFF' && bytes.toString('ascii', 8, 12) === 'WEBP') extension = 'webp';
    if (['model/gltf-binary', 'application/octet-stream'].includes(match[1]) && bytes.length >= 20 && bytes.toString('ascii', 0, 4) === 'glTF' && bytes.readUInt32LE(4) === 2 && bytes.readUInt32LE(8) === bytes.length) extension = 'glb';
    if (!extension || bytes.length > (extension === 'glb' ? 4 : 5) * 1024 * 1024 || bytes.length < 12) validation.fail('نوع یا حجم فایل معتبر نیست.');
    const filename = `${crypto.randomUUID()}.${extension}`;
    fs.mkdirSync(path.join(directory, 'media'), { recursive: true });
    fs.writeFileSync(path.join(directory, 'media', filename), bytes, { flag: 'wx' });
    store.audit(admin, 'upload', 'media', filename);
    return { url: `/media/${filename}` };
  }

  async function handle(request, response) {
    const url = new URL(request.url, 'http://localhost');
    let pathname;
    try { pathname = decodeURIComponent(url.pathname).replace(/\/$/, '') || '/'; }
    catch { response.writeHead(400).end('Bad request'); return true; }
    const managed = pathname === '/' || (!path.extname(pathname) && !pathname.startsWith('/frontend') && !pathname.startsWith('/files/')) || pathname.startsWith('/api/') || pathname === '/admin' || pathname.startsWith('/admin/') || pathname.startsWith('/media/') || ['/guests', '/about', '/episodes', '/privacy', '/terms', '/robots.txt', '/sitemap.xml'].includes(pathname) || pathname.startsWith('/guests/');
    if (!managed) return false;
    response.setHeader('X-Content-Type-Options', 'nosniff');
    response.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    response.setHeader('X-Frame-Options', 'DENY');
    response.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
    response.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self' https://plausible.io; style-src 'self' 'unsafe-inline'; img-src 'self' https: blob: data:; font-src 'self'; connect-src 'self' https://plausible.io; media-src 'self' blob:; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'");
    if (config.production) response.setHeader('Strict-Transport-Security', 'max-age=31536000');
    response.setHeader('Cache-Control', 'no-store');
    const isAdmin = pathname === '/admin' || pathname.startsWith('/admin/') || pathname.startsWith('/api/admin/');
    if (isAdmin) {
      response.setHeader('X-Robots-Tag', 'noindex, nofollow');
      response.setHeader('Referrer-Policy', 'strict-origin');
    }
    const api = pathname.startsWith('/api/');
    let admin;
    try {
      admin = sessionFor(request);
      if (['GET', 'HEAD'].includes(request.method)) {
        if (pathname.startsWith('/media/')) {
          const filename = pathname.slice(7);
          if (!/^[a-f0-9-]+\.(png|jpg|webp|glb)$/.test(filename)) validation.fail('Not found', 404);
          const file = path.join(directory, 'media', filename);
          if (!fs.existsSync(file)) validation.fail('Not found', 404);
          response.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
          response.setHeader('Content-Type', { png: 'image/png', jpg: 'image/jpeg', webp: 'image/webp', glb: 'model/gltf-binary' }[filename.split('.').pop()]);
          response.setHeader('Content-Length', fs.statSync(file).size);
          if (request.method === 'HEAD') response.end();
          else { const stream = fs.createReadStream(file); stream.on('error', () => response.destroy()); response.on('close', () => stream.destroy()); stream.pipe(response); }
          return true;
        }
        if (pathname === '/robots.txt') return send(response, 200, 'User-agent: *\nDisallow: /admin\nDisallow: /api/admin/\n' + (config.origin ? `Sitemap: ${config.origin}/sitemap.xml\n` : ''), 'text/plain');
        if (pathname === '/sitemap.xml') {
          const paths = ['/', '/guests', '/about', '/team', '/episodes', ...store.all('guests').filter(guest => guest.published).map(guest => `/guests/${encodeURIComponent(guest.slug)}`)];
          return send(response, 200, `<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${paths.map(route => `<url><loc>${views.escape(originFor(request) + route)}</loc></url>`).join('')}</urlset>`, 'application/xml');
        }
        if (pathname === '/api/public') {
          const data = await publicData(url.searchParams.get('q') || '');
          const { siteName, tagline, about, logo, youtube, linkedin, spotify, castbox, contactEmail } = store.settings();
          return json(response, 200, { ...data, settings: { siteName, tagline, about, logo, youtube, linkedin, spotify, castbox, contactEmail } });
        }
        if (pathname === '/api/admin/session') { requireAdmin(admin); return json(response, 200, { admin, csrf: admin.csrf, states }); }
        const apiCollection = /^\/api\/admin\/(guests|episodes|admins|audit)$/.exec(pathname);
        if (apiCollection) {
          requireAdmin(admin);
          const collection = apiCollection[1];
          return json(response, 200, collection === 'admins' ? admins().map(safeAdmin) : collection === 'audit' ? database.prepare('SELECT * FROM audit ORDER BY id DESC LIMIT 100').all() : store.all(collection));
        }
        if (authPaths.includes(pathname)) {
          if (admin && pathname === '/admin') return redirect(response, '/admin/dashboard');
          return send(response, 200, views.authPage(pathname, store.settings(), anonymousCsrf(request, response), url.searchParams));
        }
        if (pathname.startsWith('/admin/')) {
          if (!admin) return redirect(response, '/admin');
          const section = pathname.slice(7);
          const content = views.adminPage(section, { admin, csrf: admin.csrf, settings: store.settings(), guests: store.all('guests'), episodes: store.all('episodes'), admins: admins(), query: url.searchParams, audit: database.prepare('SELECT audit.*,admins.name FROM audit LEFT JOIN admins ON admins.id=audit.admin_id ORDER BY audit.id DESC LIMIT 30').all() });
          if (!content) validation.fail('صفحه پیدا نشد.', 404);
          return send(response, 200, content);
        }
        if (api) validation.fail('Not found', 404);
        const data = await publicData(url.searchParams.get('q') || '');
        const settings = store.settings();
        if (pathname === '/') {
          let home = fs.readFileSync(path.join(__dirname, '..', 'frontend', 'home.html'), 'utf8');
          home = home.replace('<template id="managed-episodes"></template>', views.homeEpisodes(data.home));
          const footerLinks = ['linkedin', 'spotify', 'castbox'].filter(key => settings[key]).map(key => `<a href="${views.escape(settings[key])}" target="_blank" rel="noopener noreferrer">${key} ↗</a>`).join('');
          home = home.replace('<template id="managed-footer"></template>', footerLinks + (settings.contactEmail ? `<a href="mailto:${views.escape(settings.contactEmail)}">تماس با ما</a>` : ''));
          home = home.replace(/بعد هشت/g, () => views.escape(settings.siteName));
          home = home.replaceAll('/files/images/BlackTBack.png', views.escape(settings.logo || '/files/images/BlackTBack.png'));
          if (settings.youtube) home = home.replaceAll('https://www.youtube.com/@baadehasht', views.escape(settings.youtube));
          const customized = views.themeStyle(settings);
          home = home.replace('</head>', `${customized}<meta property="og:title" content="${views.escape(settings.siteName)}"><meta property="og:description" content="${views.escape(settings.tagline)}">${settings.analyticsDomain ? `<script defer data-domain="${views.escape(settings.analyticsDomain)}" src="https://plausible.io/js/script.js"></script>` : ''}</head>`);
          if (!settings.heroEnabled) home = home.replace('<script src="/frontend/shared/experience.js" defer></script>', '').replace('</head>', '<style>.scene-film,.scroll-progress{display:none}.scene-poster{display:block}.scene-track{position:fixed;inset:0}.content{position:relative}</style></head>');
          if (settings.poster) home = home.replace('src="/frontend/3d_light/frames/frame_0144.webp"', `src="${views.escape(settings.poster)}"`);
          if (settings.defaultTheme !== 'system') home = home.replace('<html lang="fa" dir="rtl">', `<html lang="fa" dir="rtl" data-default-theme="${settings.defaultTheme}">`);
          return send(response, 200, home);
        }
        const page = views.publicPage(pathname, data, settings);
        if (!page) validation.fail('صفحه پیدا نشد.', 404);
        return send(response, 200, page);
      }
      if (!['POST', 'PUT', 'DELETE'].includes(request.method)) { response.setHeader('Allow', 'GET, HEAD, POST, PUT, DELETE'); validation.fail('Method not allowed', 405); }
      if (!authPaths.includes(pathname)) requireAdmin(admin);
      const input = await body(request);
      admin = sessionFor(request);
      if (!authPaths.includes(pathname)) requireAdmin(admin);
      checkCsrf(request, input, admin);
      const ip = request.socket.remoteAddress;
      if (pathname === '/admin') {
        rateLimit(`login-ip:${ip}`, 30, 15 * 60000);
        const email = validation.email(input.email);
        rateLimit(`login-email:${email}`, 8, 15 * 60000);
        if (typeof input.password !== 'string' || input.password.length > 128) validation.fail('ایمیل یا گذرواژه اشتباه است.', 401);
        const found = database.prepare('SELECT * FROM admins WHERE email=?').get(email);
        const valid = await verifyPassword(input.password, found?.password || await dummyPassword);
        if (!found || !valid || !found.active) validation.fail('ایمیل یا گذرواژه اشتباه است.', 401);
        const secret = token();
        transaction(() => {
          const current = database.prepare('SELECT active,password FROM admins WHERE id=?').get(found.id);
          if (!current?.active || current.password !== found.password) validation.fail('دوباره وارد حساب شوید.', 401);
          database.prepare('DELETE FROM sessions WHERE expires<?').run(Date.now());
          database.prepare('INSERT INTO sessions VALUES (?,?,?,?)').run(digest(secret), found.id, token(), Date.now() + 8 * 3600000);
          database.prepare('UPDATE admins SET last_login=? WHERE id=?').run(new Date().toISOString(), found.id);
          database.prepare('DELETE FROM limits WHERE id=?').run(`login-email:${email}`);
          store.audit(found, 'login', 'admins', found.id);
        });
        setCookie(response, 'bh_session', secret, 8 * 3600);
        return redirect(response, '/admin/dashboard');
      }
      if (pathname === '/admin/forgot-password') {
        rateLimit(`reset-ip:${ip}`, 5, 60 * 60000);
        const email = validation.email(input.email);
        rateLimit(`reset-email:${email}`, 3, 60 * 60000);
        if (!config.resendKey || !config.emailFrom) validation.fail('سرویس ایمیل هنوز پیکربندی نشده است؛ با مدیر سایت تماس بگیرید.', 503);
        const found = database.prepare('SELECT * FROM admins WHERE email=? AND active=1').get(email);
        if (found) {
          try { await sendReset(database, found, { ...config, origin: originFor(request) }); }
          catch { console.warn('A public recovery request could not be delivered. Check the email provider configuration.'); }
        }
        return redirect(response, '/admin/forgot-password?message=' + encodeURIComponent('درخواست ثبت شد. اگر حساب فعال و سرویس ایمیل در دسترس باشد، لینک بازیابی دریافت می‌کنید.'));
      }
      if (pathname === '/admin/reset-password') {
        rateLimit(`set-password:${ip}`, 10, 60 * 60000);
        const password = validation.password(input.password);
        if (password !== input.confirmation) validation.fail('گذرواژه‌ها یکسان نیستند.');
        const resetHash = digest(validation.text(input.token, 'لینک بازیابی', 64, true));
        const reset = database.prepare('SELECT resets.* FROM resets JOIN admins ON admins.id=resets.admin_id WHERE resets.token=? AND resets.expires>? AND admins.active=1').get(resetHash, Date.now());
        if (!reset) validation.fail('لینک بازیابی نامعتبر یا منقضی شده است.');
        const hashed = await hashPassword(password);
        transaction(() => {
          if (!database.prepare('SELECT token FROM resets WHERE token=? AND expires>?').get(resetHash, Date.now())) validation.fail('این لینک قبلاً استفاده شده است.');
          database.prepare('UPDATE admins SET password=? WHERE id=? AND active=1').run(hashed, reset.admin_id);
          database.prepare('DELETE FROM resets WHERE admin_id=?').run(reset.admin_id);
          database.prepare('DELETE FROM sessions WHERE admin_id=?').run(reset.admin_id);
          store.audit({ id: reset.admin_id }, 'password-reset', 'admins', reset.admin_id);
        });
        setCookie(response, 'bh_session', '', 0);
        return redirect(response, '/admin?message=' + encodeURIComponent('گذرواژه تغییر کرد. اکنون وارد شوید.'));
      }
      requireAdmin(admin);
      if (pathname === '/admin/logout') {
        database.prepare('DELETE FROM sessions WHERE token=?').run(digest(cookie(request, 'bh_session') || ''));
        setCookie(response, 'bh_session', '', 0); return redirect(response, '/admin');
      }
      if (pathname === '/api/admin/upload') {
        rateLimit(`upload:${admin.id}`, 40, 3600000);
        return json(response, 201, await upload(input, admin));
      }
      if (pathname === '/admin/display') {
        const current = store.settings();
        const changes = { ...current, ...Object.fromEntries(['videoMode', 'videoCount'].map(key => [key, input[key]])) };
        const settings = validation.validate('settings', changes);
        transaction(() => { store.saveSettings(settings); store.audit(admin, 'update', 'settings'); });
        return redirect(response, `/admin/episodes?message=${encodeURIComponent('تنظیمات ذخیره شد.')}`);
      }
      const adminRoute = /^\/(?:api\/)?admin\/admins\/(new|[a-f0-9-]+)(?:\/(toggle|reset))?$/.exec(pathname);
      if (adminRoute) {
        requireAdmin(admin, true);
        if (adminRoute[1] === 'new') {
          const name = validation.text(input.name, 'نام', 150, true);
          const email = validation.email(input.email);
          const password = await hashPassword(validation.password(input.password));
          transaction(() => {
            if (admins().filter(item => item.role === 'semi').length >= 6) validation.fail('حداکثر شش مدیر نیمه‌ارشد قابل ثبت است.');
            if (database.prepare('SELECT id FROM admins WHERE email=?').get(email)) validation.fail('این ایمیل قبلاً ثبت شده است.');
            const id = crypto.randomUUID();
            database.prepare('INSERT INTO admins(id,name,email,password,role,created_at) VALUES (?,?,?,?,?,?)').run(id, name, email, password, 'semi', new Date().toISOString());
            store.audit(admin, 'create', 'admins', id);
          });
        } else {
          const target = database.prepare('SELECT * FROM admins WHERE id=?').get(adminRoute[1]);
          if (!target) validation.fail('مدیر پیدا نشد.', 404);
          if (adminRoute[2] === 'toggle') {
            if (target.id === admin.id || target.role === 'super') validation.fail('مدیر ارشد نمی‌تواند غیرفعال شود.', 403);
            transaction(() => {
              database.prepare('UPDATE admins SET active=? WHERE id=?').run(target.active ? 0 : 1, target.id);
              database.prepare('DELETE FROM sessions WHERE admin_id=?').run(target.id);
              database.prepare('DELETE FROM resets WHERE admin_id=?').run(target.id);
              store.audit(admin, target.active ? 'disable' : 'enable', 'admins', target.id);
            });
          } else if (adminRoute[2] === 'reset') {
            if (!target.active) validation.fail('حساب غیرفعال است.');
            await sendReset(database, target, { ...config, origin: originFor(request) });
            const unusablePassword = await hashPassword(token());
            transaction(() => {
              database.prepare('UPDATE admins SET password=? WHERE id=?').run(unusablePassword, target.id);
              database.prepare('DELETE FROM sessions WHERE admin_id=?').run(target.id);
              store.audit(admin, 'force-reset', 'admins', target.id);
            });
          } else validation.fail('Not found', 404);
        }
        return api ? json(response, 200, { ok: true }) : redirect(response, '/admin/admins?message=' + encodeURIComponent('عملیات انجام شد.'));
      }
      const entityRoute = /^\/(?:api\/)?admin\/(guests|episodes|pipeline)(?:\/(new|[a-f0-9-]+))?(?:\/(delete))?$/.exec(pathname);
      if (entityRoute) {
        const [, section, requestedId, action] = entityRoute;
        const collection = section === 'pipeline' ? 'guests' : section;
        const id = requestedId || 'new';
        if (request.method === 'DELETE' || action === 'delete') {
          if (!store.all(collection).some(item => item.id === id)) validation.fail('مورد پیدا نشد.', 404);
          transaction(() => {
            store.remove(collection, id);
            if (collection === 'guests') for (const episode of store.all('episodes').filter(item => item.guestId === id)) store.save('episodes', episode.id, { ...episode, guestId: '' });
            store.audit(admin, 'delete', collection, id);
          });
          return api ? json(response, 200, { ok: true }) : redirect(response, `/admin/${section}`);
        }
        const result = saveEntity(collection, id, input, admin, section === 'pipeline');
        return api ? json(response, id === 'new' ? 201 : 200, result) : redirect(response, `/admin/${section}?message=${encodeURIComponent('ذخیره شد.')}`);
      }
      validation.fail('Not found', 404);
    } catch (error) {
      const status = error.status || 500;
      if (status === 500) console.error(error);
      const message = status === 500 ? 'خطای داخلی رخ داد. دوباره تلاش کنید.' : error.message;
      if (status === 429) response.setHeader('Retry-After', '900');
      if (api) return json(response, status, { error: message });
      if (authPaths.includes(pathname)) return send(response, status, views.authPage(pathname, store.settings(), anonymousCsrf(request, response), url.searchParams, message));
      return send(response, status, views.shell(status === 404 ? 'صفحه پیدا نشد' : 'عملیات انجام نشد', `<p role="alert" class="error">${views.escape(message)}</p><p>اطلاعات قبلی شما در سرور بدون تغییر مانده است.</p><a class="button" href="${admin ? '/admin/dashboard' : '/'}">بازگشت</a>`, store.settings(), { admin, csrf: admin?.csrf, noindex: true }));
    }
  }
  return { handle, database, store, close: () => database.close() };
}

function order(first, second) { return first.sortOrder - second.sortOrder || String(second.createdAt).localeCompare(String(first.createdAt)); }
function cookie(request, name) {
  return (request.headers.cookie || '').split(';').map(part => part.trim()).find(part => part.startsWith(`${name}=`))?.slice(name.length + 1);
}
async function body(request) {
  const type = (request.headers['content-type'] || '').split(';')[0];
  if (!['application/json', 'application/x-www-form-urlencoded'].includes(type)) validation.fail('Unsupported content type', 415);
  const limit = request.url.split('?')[0] === '/api/admin/upload' ? 7200000 : 100000;
  const chunks = [];
  let size = 0;
  for await (const chunk of request) {
    size += chunk.length;
    if (size > limit) validation.fail('حجم درخواست بیش از حد مجاز است.', 413);
    chunks.push(chunk);
  }
  const raw = Buffer.concat(chunks).toString('utf8');
  try {
    const parsed = type === 'application/json' ? JSON.parse(raw) : Object.fromEntries(new URLSearchParams(raw));
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) validation.fail('Bad request');
    return parsed;
  } catch { validation.fail('Bad request'); }
}
function send(response, status, content, type = 'text/html') {
  response.writeHead(status, { 'Content-Type': `${type}; charset=utf-8` });
  response.end(content); return true;
}
function json(response, status, data) { return send(response, status, JSON.stringify(data), 'application/json'); }
function redirect(response, location) { response.writeHead(303, { Location: location }).end(); return true; }

module.exports = { createApp };
