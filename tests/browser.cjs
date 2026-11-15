const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const { spawn } = require('node:child_process');
const { once } = require('node:events');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const { openDatabase, repository, hashPassword } = require('../backend/database.cjs');
const { validate } = require('../backend/validation.cjs');

async function main() {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'baadehasht-browser-'));
  const database = openDatabase(directory);
  const store = repository(database);
  database.prepare('INSERT INTO admins(id,name,email,password,role,created_at) VALUES (?,?,?,?,?,?)').run(crypto.randomUUID(), 'Browser Admin', 'browser@example.com', await hashPassword('Browser-only-password!'), 'super', new Date().toISOString());
  for (let index = 0; index < 3; index += 1) store.save('guests', crypto.randomUUID(), validate('guests', { name: `مهمان ${index}`, slug: `guest-${index}`, shortBio: 'یک گفت‌وگوی تازه', published: true, sortOrder: index }));
  database.close();
  const port = process.env.BROWSER_TEST_PORT || '5214';
  const origin = `http://127.0.0.1:${port}`;
  const server = spawn(process.execPath, ['frontend/server.cjs'], { cwd: path.resolve(__dirname, '..'), env: { ...process.env, PORT: port, DATA_DIR: directory, SITE_URL: origin, NODE_ENV: 'development' }, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
  let output = '';
  server.stdout.on('data', chunk => { output += chunk; });
  server.stderr.on('data', chunk => { output += chunk; });
  let browser;
  try {
    for (let attempt = 0; attempt < 100; attempt += 1) {
      if (server.exitCode !== null) throw new Error(output);
      try { if ((await fetch(origin + '/about')).ok) break; } catch {}
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    browser = await chromium.launch({ headless: true, ...(process.env.BROWSER_CHANNEL ? { channel: process.env.BROWSER_CHANNEL } : {}) });
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    page.on('console', message => { if (message.type() === 'error' && message.text().includes('Content Security Policy')) errors.push(message.text()); });
    fs.mkdirSync(path.resolve('.validation'), { recursive: true });
    for (const width of [1440, 768, 390]) {
      await page.setViewportSize({ width, height: 900 });
      for (const route of ['/guests', '/about', '/team', '/episodes', '/privacy', '/terms', '/admin', '/admin/forgot-password']) {
        assert.equal((await page.goto(origin + route)).status(), 200);
        assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `${route} overflows at ${width}`);
      }
      await page.goto(origin + '/guests');
      const columns = await page.locator('.guest-grid').evaluate(element => getComputedStyle(element).gridTemplateColumns.split(' ').length);
      assert.equal(columns, width <= 600 ? 1 : 2);
      await page.screenshot({ path: `.validation/guests-${width}.png`, fullPage: true });
      for (const theme of ['dark', 'light']) {
        await page.evaluate(value => localStorage.setItem('baadehasht-theme', value), theme);
        for (const route of ['/about', '/team', '/episodes', '/guests', '/guests/guest-0', '/privacy', '/terms']) {
          assert.equal((await page.goto(origin + route)).status(), 200);
          await page.evaluate(() => document.fonts.ready);
          assert.equal(await page.locator('html').getAttribute('data-theme'), theme);
          assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `${route}/${theme} overflows at ${width}`);
          assert.ok(await page.locator('body').evaluate(element => getComputedStyle(element).fontFamily.includes('Estedad')));
          assert.ok(await page.evaluate(() => document.fonts.check('14px Estedad')));
          if (route === '/about') {
            assert.equal(await page.locator('.team-grid').count(), 0);
            assert.equal(await page.locator('.team-cta').getAttribute('href'), '/team');
            assert.equal(await page.locator('.about-art img').getAttribute('src'), '/files/images/logo_edit_transparent.png');
            assert.ok(await page.locator('.about-art img').evaluate(element => element.complete && element.naturalWidth > 0));
            assert.ok(await page.locator('.about-copy').evaluate(element => parseFloat(getComputedStyle(element).fontSize) <= 14));
            if (width > 600) {
              const logo = await page.locator('.about-art').boundingBox();
              const copy = await page.locator('.about-copy').boundingBox();
              assert.ok(logo.x + logo.width <= copy.x, 'About logo belongs to the left of the copy');
            }
          }
          if (width !== 768) await page.screenshot({ path: `.validation/public-${route.slice(1).replaceAll('/', '-')}-${theme}-${width}.png`, fullPage: true });
        }
      }
    }
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(origin + '/admin');
    await page.locator('[name=email]').fill('browser@example.com');
    await page.locator('[name=password]').fill('Browser-only-password!');
    await Promise.all([page.waitForURL('**/admin/dashboard').catch(async error => { console.error(await page.locator('main').innerText()); throw error; }), page.locator('.form-actions button').click()]);
    await page.screenshot({ path: '.validation/admin-dashboard.png', fullPage: true });
    await page.goto(origin + '/admin/guests?edit=new');
    await page.locator('[name=name]').fill('مهمان مرورگر');
    await page.locator('[name=shortBio]').fill('معرفی مهمان');
    const picture = await page.evaluate(() => {
      const canvas = document.createElement('canvas');
      canvas.width = 600; canvas.height = 900;
      const context = canvas.getContext('2d');
      context.fillStyle = '#8660bc'; context.fillRect(0, 0, 600, 900);
      return canvas.toDataURL('image/png').split(',')[1];
    });
    await page.locator('[data-upload=photo]').setInputFiles({ name: 'portrait.png', mimeType: 'image/png', buffer: Buffer.from(picture, 'base64') });
    await page.waitForFunction(() => document.querySelector('[name=photo]').value.startsWith('/media/'));
    await page.locator('[name=published]').check();
    await Promise.all([page.waitForURL('**/admin/guests?message=*'), page.locator('.form-actions button').click()]);
    await page.goto(origin + '/guests?q=' + encodeURIComponent('مهمان مرورگر'));
    assert.equal(await page.locator('.person-card').count(), 1);
    assert.equal(await page.locator('.person-card img').evaluate(element => element.complete && element.naturalWidth === 600 && element.naturalHeight === 600), true);
    assert.ok((await page.locator('.person-card').innerText()).includes('مهمان مرورگر'));
    await page.goto(origin + '/about');
    assert.ok((await page.locator('.lead').innerText()).includes('بعد از هشت ترم کارشناسی، چی؟'));
    assert.equal(await page.locator('.platform-brand img').getAttribute('src'), '/files/images/logo_transparent.png');
    await Promise.all([page.waitForURL(origin + '/team'), page.locator('.team-cta').click()]);
    assert.equal(await page.locator('h1').innerText(), 'تیم پشت صحنه');
    await page.goto(origin + '/about');
    await Promise.all([page.waitForURL(origin + '/'), page.locator('.platform-brand').click()]);
    await page.waitForLoadState('domcontentloaded');
    assert.equal(await page.locator('body').evaluate(element => element.classList.contains('intro-complete')), true);
    await page.waitForFunction(() => document.body.dataset.playback === 'loop', null, { timeout: 60000 });
    assert.deepEqual(await page.locator('.header-links a').evaluateAll(elements => elements.map(element => ({ href: element.getAttribute('href'), text: element.textContent }))), [
      { href: '/guests', text: 'مهمان‌ها' }, { href: '/episodes', text: 'گفت‌وگوها' }, { href: '/about', text: 'دربارهٔ ما' },
    ]);
    assert.ok((await page.locator('.story-opening h1').innerText()).includes('بعد از هشت ترم،'));
    assert.equal(await page.locator('.conversation-card a[href="/guests"]').count(), 1);
    assert.equal(await page.locator('.conversation-card a[href="/about"]').count(), 1);
    assert.equal(await page.locator('.conversation-card a[href="/episodes"]').count(), 1);
    const firstFrame = await page.locator('canvas').getAttribute('data-frame');
    await page.waitForTimeout(1500);
    assert.notEqual(await page.locator('canvas').getAttribute('data-frame'), firstFrame);
    await page.locator('[data-select-theme=dark]').click();
    await page.waitForFunction(() => document.documentElement.dataset.theme === 'dark');
    await page.waitForFunction(() => document.body.dataset.playback === 'loop' && document.querySelector('canvas').dataset.theme === 'dark', null, { timeout: 60000 });
    await page.waitForFunction(() => getComputedStyle(document.querySelector('.story-opening > p:not(.eyebrow)')).opacity === '1');
    await page.setViewportSize({ width: 390, height: 844 });
    assert.ok(await page.locator('.header-links').isVisible());
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    await page.screenshot({ path: '.validation/landing-copy-mobile.png' });
    await Promise.all([page.waitForURL(origin + '/guests'), page.locator('.header-links a[href="/guests"]').click()]);
    await page.goto(origin + '/admin/pipeline');
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    await page.screenshot({ path: '.validation/admin-pipeline-mobile.png', fullPage: true });
    assert.deepEqual(errors, []);
    console.log('Browser checks passed: public layouts in both themes at desktop/tablet/mobile widths, Estedad loading, About logo placement, Team navigation, admin CRUD and landing animation.');
  } finally {
    if (browser) await browser.close();
    if (server.exitCode === null) { const stopped = once(server, 'exit'); server.kill(); await stopped; }
    const resolved = path.resolve(directory);
    assert.ok(resolved.startsWith(path.resolve(os.tmpdir()) + path.sep) && path.basename(resolved).startsWith('baadehasht-browser-'));
    fs.rmSync(resolved, { recursive: true, maxRetries: 5, retryDelay: 200 });
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
