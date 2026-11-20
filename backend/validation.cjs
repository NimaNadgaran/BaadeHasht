const { states, defaults, copyLabels } = require('./database.cjs');

function fail(message, status = 400) { throw Object.assign(new Error(message), { status }); }
function text(value, label, max = 500, required = false) {
  if (typeof value !== 'string') value = '';
  value = value.trim();
  if (value.length > max || (required && !value)) fail(`${label}: مقدار معتبر وارد کنید (حداکثر ${max} نویسه).`);
  return value;
}
function integer(value, label, min, max) {
  const number = Number(value);
  if (!Number.isInteger(number) || number < min || number > max) fail(`${label}: عدد بین ${min} و ${max} وارد کنید.`);
  return number;
}
const boolean = value => value === true || value === 'on' || value === 'true';
function choice(value, options, label) {
  if (!options.includes(value)) fail(`${label}: گزینه نامعتبر است.`);
  return value;
}
const domains = { linkedin: ['linkedin.com'], youtube: ['youtube.com', 'youtu.be'], spotify: ['spotify.com'], castbox: ['castbox.fm'] };
function url(value, label, hosts) {
  const input = text(value, label, 2000);
  if (!input) return '';
  let parsed;
  try { parsed = new URL(input); } catch { fail(`${label}: نشانی کامل https وارد کنید.`); }
  if (parsed.protocol !== 'https:' || parsed.username || parsed.password || (hosts && !hosts.some(host => parsed.hostname === host || parsed.hostname.endsWith(`.${host}`)))) fail(`${label}: نشانی معتبر نیست.`);
  return parsed.href;
}
function media(value, label) {
  const input = text(value, label, 2000);
  if (!input || /^\/(media\/[a-f0-9-]+\.(png|jpg|webp|glb)|files\/images\/[a-zA-Z0-9_.-]+\.png|frontend\/3d_(light|dark)\/frames\/frame_\d{4}\.webp)$/.test(input)) return input;
  return url(input, label);
}
function email(value) {
  const input = text(value, 'ایمیل', 254, true).toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(input)) fail('ایمیل معتبر وارد کنید.');
  return input;
}
function password(value) {
  if (typeof value !== 'string' || value.length < 6 || value.length > 128) fail('گذرواژه باید بین ۶ تا ۱۲۸ نویسه باشد.');
  return value;
}
function youtubeId(value) {
  if (!value) return '';
  if (/^[\w-]{11}$/.test(value)) return value;
  const parsed = new URL(url(value, 'YouTube', domains.youtube));
  const id = parsed.hostname === 'youtu.be' ? parsed.pathname.slice(1) : parsed.searchParams.get('v') || parsed.pathname.split('/').pop();
  if (!/^[\w-]{11}$/.test(id || '')) fail('شناسه ویدیوی یوتیوب معتبر نیست.');
  return id;
}
function validate(name, input, existing = {}) {
  const output = {};
  if (name === 'guests' || name === 'team') {
    output.name = text(input.name, 'نام', 150, true);
    output.photo = media(input.photo, 'تصویر');
    output.sortOrder = integer(input.sortOrder ?? 0, 'ترتیب', -10000, 10000);
    output.linkedin = url(input.linkedin, 'LinkedIn', domains.linkedin);
  }
  if (name === 'guests') {
    output.slug = text(input.slug || existing.slug || output.name.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-|-$/g, ''), 'نامک', 180, true);
    if (!/^[\p{L}\p{N}-]+$/u.test(output.slug)) fail('نامک تنها شامل حروف، عدد و خط تیره است.');
    output.tagline = text(input.tagline, 'معرفی کوتاه', 250);
    output.shortBio = text(input.shortBio, 'توضیح', 2000);
    output.longBio = text(input.longBio, 'ادامه توضیح', 15000);
    for (const key of ['youtube', 'spotify', 'castbox']) output[key] = url(input[key], key, domains[key]);
    output.published = boolean(input.published);
  } else if (name === 'pipeline') {
    output.name = text(input.name ?? existing.name, 'نام', 150, true);
    output.state = choice(input.state || existing.state || states[0], states, 'مرحله');
    output.assignedAdmin = text(input.assignedAdmin ?? existing.assignedAdmin, 'مسئول', 100);
    output.notes = text(input.notes ?? existing.notes, 'یادداشت خصوصی', 5000);
    output.topic = text(input.topic ?? existing.topic, 'موضوع گفت‌وگو', 500);
    output.contact = text(input.contact ?? existing.contact, 'راه ارتباط', 500);
    output.stateChangedAt = output.state === existing.state ? existing.stateChangedAt : new Date().toISOString();
  } else if (name === 'episodes') {
    output.title = text(input.title, 'عنوان', 250, true);
    output.description = text(input.description, 'توضیح', 10000);
    output.youtubeId = youtubeId(text(input.youtubeId, 'YouTube', 2000));
    output.thumbnail = media(input.thumbnail, 'تصویر');
    output.status = choice(input.status, ['published', 'archived'], 'وضعیت');
    if (output.status === 'published' && !output.youtubeId) fail('ویدیوی منتشرشده به لینک یوتیوب نیاز دارد.');
    const date = new Date(input.publishAt);
    if (!Number.isFinite(date.getTime())) fail('زمان انتشار معتبر وارد کنید.');
    output.publishAt = date.toISOString();
    output.pinned = boolean(input.pinned);
    output.guestId = text(input.guestId, 'مهمان', 100);
  } else if (name === 'team') {
    output.role = text(input.role, 'نقش', 250);
    output.bio = text(input.bio, 'زندگی‌نامه', 3000);
  } else if (name === 'settings') {
    output.homeCopy = Object.fromEntries(Object.keys(copyLabels).map(key => [key, text(input[`copy_${key}`] ?? input.homeCopy?.[key], copyLabels[key], 15000)]));
    for (const key of ['siteName', 'tagline', 'heroLine1', 'heroLine2']) output[key] = text(input[key], key, 250, true);
    for (const key of ['heroDescription', 'about', 'privacy', 'terms']) output[key] = text(input[key], key, 15000);
    for (const key of ['logo', 'poster', 'heroAsset']) output[key] = media(input[key], key);
    for (const key of ['primary', 'secondary', 'accent']) {
      output[key] = text(input[key], key, 7);
      if (output[key] && !/^#[a-f0-9]{6}$/i.test(output[key])) fail('رنگ باید به صورت #RRGGBB باشد.');
    }
    output.font = choice(input.font || 'Vazirmatn', ['Vazirmatn', 'Tahoma', 'Arial'], 'فونت');
    output.radius = integer(input.radius ?? 3, 'گردی گوشه', 0, 40);
    output.defaultTheme = choice(input.defaultTheme || 'light', ['system', 'light', 'dark'], 'پوسته');
    output.heroEnabled = boolean(input.heroEnabled);
    output.videoMode = choice(input.videoMode, ['manual', 'automatic'], 'حالت ویدیو');
    output.videoCount = integer(input.videoCount, 'تعداد ویدیو', 1, 24);
    for (const key of Object.keys(domains)) output[key] = url(input[key], key, domains[key]);
    output.contactEmail = input.contactEmail ? email(input.contactEmail) : '';
    output.analyticsDomain = text(input.analyticsDomain, 'دامنه آمار', 253);
    if (output.analyticsDomain && !/^(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z]{2,}$/i.test(output.analyticsDomain)) fail('دامنه آمار معتبر نیست.');
  } else fail('نوع محتوا معتبر نیست.');
  return { ...output, ...(name === 'settings' ? {} : { createdAt: existing.createdAt || new Date().toISOString(), updatedAt: new Date().toISOString() }) };
}

module.exports = { fail, text, integer, boolean, choice, url, email, password, youtubeId, validate, defaults };
