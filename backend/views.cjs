const { states } = require('./database.cjs');
const renderPublicPage = require('./public-pages.cjs');
const escape = value => String(value ?? '').replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]);
const links = record => ['linkedin', 'youtube', 'castbox', 'spotify'].filter(key => record[key]).map(key => `<a class="button subtle" href="${escape(record[key])}" target="_blank" rel="noopener noreferrer">${{ linkedin: 'LinkedIn', youtube: 'YouTube', castbox: 'Castbox', spotify: 'Spotify' }[key]} ↗</a>`).join('');
const image = (src, alt, className = '') => src ? `<img class="${className}" src="${escape(src)}" alt="${escape(alt)}" loading="lazy" width="640" height="640">` : '<div class="portrait-placeholder" aria-hidden="true">∞</div>';
const date = value => value ? new Date(value).toLocaleDateString('fa-IR', { timeZone: 'Asia/Tehran' }) : '—';
const adminNav = [['dashboard', 'پیشخوان'], ['guests', 'مهمان‌ها'], ['episodes', 'ویدیوها'], ['pipeline', 'روند تولید'], ['admins', 'مدیران']];
const titles = Object.fromEntries(adminNav);

function themeStyle(settings) {
  const declarations = [];
  if (settings.primary) declarations.push(`--button:${settings.primary}`);
  if (settings.secondary) declarations.push(`--muted:${settings.secondary}`);
  if (settings.accent) declarations.push(`--accent:${settings.accent}`);
  if (settings.radius !== 3) declarations.push(`--radius:${settings.radius}px`);
  return declarations.length ? `<style>body{${declarations.join(';')}}.primary-button{border-radius:var(--radius,3px)}</style>` : '';
}

function shell(title, content, settings, { admin, csrf = '', path = '', status = '', noindex = false, variant = '', eyebrow = '' } = {}) {
  const navigation = admin
    ? adminNav.map(([slug, label]) => `<a ${path === `/admin/${slug}` ? 'aria-current="page"' : ''} href="/admin/${slug}">${label}</a>`).join('')
    : [['/', 'خانه'], ['/guests', 'مهمان‌ها'], ['/episodes', 'گفت‌وگوها'], ['/about', 'دربارهٔ ما']].map(([href, label]) => `<a href="${href}" ${path === href || (href === '/about' && path === '/team') || (href === '/guests' && path.startsWith('/guests/')) ? 'aria-current="page"' : ''}>${label}</a>`).join('');
  return `<!doctype html><html lang="fa" dir="rtl" data-default-theme="${escape(settings.defaultTheme)}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escape(title)} — ${escape(settings.siteName)}</title><meta name="description" content="${escape(settings.tagline)}">${admin || noindex ? '<meta name="robots" content="noindex,nofollow">' : ''}<link rel="icon" href="${escape(settings.logo)}"><script src="/frontend/shared/theme-init.js"></script><link rel="stylesheet" href="/frontend/shared/themes.css"><link rel="stylesheet" href="/frontend/platform.css">${!admin && !noindex ? '<link rel="stylesheet" href="/frontend/public-pages.css">' : ''}<link rel="preload" href="/files/fonts/Estedad.ttf" as="font" type="font/ttf" crossorigin>${themeStyle(settings)}<script src="/frontend/platform.js" defer></script>${!admin && !noindex && settings.analyticsDomain ? `<script defer data-domain="${escape(settings.analyticsDomain)}" src="https://plausible.io/js/script.js"></script>` : ''}</head><body class="${admin ? 'workspace-site' : noindex ? 'utility-site' : 'public-site'}${variant ? ' page-' + escape(variant) : ''}"><a class="skip" href="#main">رفتن به محتوا</a><header class="platform-header"><a class="platform-brand" href="/">${settings.logo ? `<img src="${escape(settings.logo)}" width="24" height="39" alt="">` : ''}<strong>${escape(settings.siteName)}</strong></a><nav aria-label="ناوبری">${navigation}</nav><button type="button" class="theme-toggle" aria-label="تغییر پوسته">◐</button>${admin ? `<form method="post" action="/admin/logout">${csrfField(csrf)}<button class="button subtle">خروج</button></form>` : ''}</header><main id="main" class="page ${admin ? 'admin-page' : ''}"><p class="eyebrow" dir="ltr">BAADE HASHT / ${eyebrow || (admin ? 'WORKSPACE' : 'CONVERSATIONS')}</p><div class="page-heading"><h1>${escape(title)}</h1>${admin ? `<span class="muted">${escape(admin.name)} · ${admin.role === 'super' ? 'مدیر ارشد' : 'مدیر'}</span>` : ''}</div>${status ? `<p role="status" class="notice">${escape(status)}</p>` : ''}${content}</main><footer class="platform-footer"><span>${escape(settings.siteName)}؛ ${escape(settings.tagline)}</span><nav>${links(settings)}${settings.contactEmail ? `<a href="mailto:${escape(settings.contactEmail)}">تماس با ما</a>` : ''}<a href="/team">تیم پشت صحنه</a></nav><small>© ${new Date().getFullYear()}</small></footer></body></html>`;
}

const csrfField = csrf => `<input type="hidden" name="csrf" value="${escape(csrf)}">`;
const hidden = (name, value) => `<input type="hidden" name="${name}" value="${escape(value)}">`;
function field(name, label, value = '', type = 'text', extra = '') {
  if (type === 'checkbox') return `<label class="check"><input type="checkbox" name="${name}" ${value ? 'checked' : ''}>${label}</label>`;
  if (type === 'textarea') return `<label>${label}<textarea name="${name}" rows="4" ${extra}>${escape(value)}</textarea></label>`;
  return `<label>${label}<input name="${name}" type="${type}" value="${escape(value)}" ${extra}></label>`;
}
function select(name, label, value, options) {
  return `<label>${label}<select name="${name}">${options.map(option => { const [key, text] = Array.isArray(option) ? option : [option, option]; return `<option value="${escape(key)}" ${String(key) === String(value) ? 'selected' : ''}>${escape(text)}</option>`; }).join('')}</select></label>`;
}
function upload(name, label, value, asset = false) {
  return `<div class="upload-field">${field(name, label, value)}<label class="muted">${asset ? 'فایل GLB (حداکثر ۴ مگابایت)' : 'بارگذاری تصویر (PNG، JPEG، WebP؛ حداکثر ۵ مگابایت)'}<input type="file" data-upload="${name}" accept="${asset ? '.glb' : 'image/png,image/jpeg,image/webp'}"></label>${name === 'photo' ? '<small class="muted">تصویر به‌صورت مربع از مرکز برش داده می‌شود.</small>' : ''}<output aria-live="polite"></output></div>`;
}
function form(action, csrf, content, label = 'ذخیره', extra = '') {
  return `<form class="editor" action="${action}" method="post" ${extra}>${csrfField(csrf)}${content}<div class="form-actions"><button class="button">${label}</button></div></form>`;
}
function deleteForm(collection, id, csrf) {
  return `<form method="post" action="/admin/${collection}/${escape(id)}/delete" data-confirm="این مورد حذف شود؟">${csrfField(csrf)}<button class="button danger">حذف</button></form>`;
}
function guestCard(guest) {
  const shortBio = guest.shortBio || '';
  const more = shortBio.length > 260 ? [shortBio, guest.longBio].filter(Boolean).join('\n\n') : guest.longBio;
  return `<article class="person-card">${image(guest.photo, guest.name)}<div class="card-body"><p class="eyebrow">${escape(guest.tagline)}</p><h2><a href="/guests/${encodeURIComponent(guest.slug)}">${escape(guest.name)}</a></h2><p>${escape(shortBio.slice(0, 260))}${shortBio.length > 260 ? '…' : ''}</p>${more ? `<details><summary>بیشتر بخوانید</summary><p>${escape(more)}</p></details>` : ''}<div class="link-row">${links(guest)}</div></div></article>`;
}
function episodeCard(episode, home = false, guests = []) {
  const thumbnail = episode.thumbnail || (episode.youtubeId ? `https://i.ytimg.com/vi/${episode.youtubeId}/hqdefault.jpg` : '');
  const title = episode.youtubeId && episode.status === 'published' ? `<a href="https://www.youtube.com/watch?v=${escape(episode.youtubeId)}" target="_blank" rel="noopener noreferrer">${escape(episode.title)} ↗</a>` : escape(episode.title);
  if (home) return `<article class="conversation-card"><div class="card-top"><time datetime="${escape(episode.publishAt)}">${date(episode.publishAt)}</time></div>${thumbnail ? `<img src="${escape(thumbnail)}" alt="" loading="lazy" width="320" height="180" style="width:100%;height:auto;aspect-ratio:16/9;object-fit:cover">` : ''}<h3>${title}</h3><p>${escape(episode.description.slice(0, 350))}</p></article>`;
  const available = episode.youtubeId && episode.status === 'published';
  const artwork = thumbnail ? image(thumbnail, episode.title) : '<div class="episode-art-placeholder" aria-hidden="true">◌</div>';
  const cover = available ? `<a class="episode-art" href="https://www.youtube.com/watch?v=${escape(episode.youtubeId)}" target="_blank" rel="noopener noreferrer" aria-label="${escape('تماشای ' + episode.title)}">${artwork}<span class="play-badge" aria-hidden="true">▶</span></a>` : `<div class="episode-art">${artwork}</div>`;
  const guest = guests.find(g => g.id === episode.guestId);
  const guestBtn = guest && episode.guestId ? `<button type="button" class="guest-btn" data-guest-id="${escape(guest.id)}">${escape(guest.name)}</button>` : '';
  return `<article class="episode-card">${cover}<div class="card-body"><div class="episode-meta"><span class="episode-kind">${available ? 'گفت‌وگو' : 'به‌زودی'}</span><time datetime="${escape(episode.publishAt)}">${date(episode.publishAt)}</time></div><h2>${title}</h2><p>${escape(episode.description || '')}</p>${guestBtn}</div></article>`;
}
function homeEpisodes(published) {
  if (!published.length) return '';
  return `<div class="reading-stories"><section aria-labelledby="published-title"><h2 id="published-title">گفت‌وگوهای منتشرشده</h2><div class="conversation-grid">${published.map(item => episodeCard(item, true)).join('')}</div></section><a class="text-link" href="/episodes">همهٔ گفت‌وگوها ↗</a></div>`;
}
function publicPage(path, data, settings) {
  return renderPublicPage(path, data, settings, { shell, escape, image, links, guestCard, episodeCard });
}

function authPage(path, settings, csrf, query, error = '') {
  let title = 'ورود مدیران';
  let content = field('email', 'ایمیل', '', 'email', 'required autocomplete="username"') + field('password', 'گذرواژه', '', 'password', 'required autocomplete="current-password" maxlength="128"');
  let button = 'ورود';
  if (path === '/admin/forgot-password') {
    title = 'بازیابی گذرواژه'; button = 'ارسال لینک بازیابی';
    content = '<p class="muted">لینک یک‌بارمصرف تا ۶۰ دقیقه معتبر است.</p>' + field('email', 'ایمیل', '', 'email', 'required autocomplete="email"');
  } else if (path === '/admin/reset-password') {
    title = 'گذرواژهٔ جدید'; button = 'ثبت گذرواژه';
    content = hidden('token', query.get('token') || '') + field('password', 'گذرواژهٔ جدید', '', 'password', 'required minlength="12" maxlength="128" autocomplete="new-password"') + field('confirmation', 'تکرار گذرواژه', '', 'password', 'required minlength="12" maxlength="128" autocomplete="new-password"');
  }
  return shell(title, `<div class="auth-card">${error ? `<p class="error" role="alert">${escape(error)}</p>` : ''}${form(path, csrf, content, button)}<a class="back-link" href="${path === '/admin' ? '/admin/forgot-password' : '/admin'}">${path === '/admin' ? 'گذرواژه را فراموش کرده‌اید؟' : 'بازگشت به ورود'}</a></div>`, settings, { noindex: true, status: query.get('message') || '' });
}

function guestEditor(guest, admins, csrf, pipeline = false) {
  const identity = field('name', 'نام مهمان', guest.name, 'text', 'required maxlength="150"');
  const notes = field('notes', 'یادداشت خصوصی (هرگز عمومی نمی‌شود)', guest.notes, 'textarea');
  const production = select('state', 'مرحلهٔ تولید', guest.state || states[0], states) + select('assignedAdmin', 'مسئول', guest.assignedAdmin || '', [['', 'تعیین نشده'], ...admins.filter(admin => admin.active).map(admin => [admin.id, admin.name])]) + notes;
  const profile = upload('photo', 'تصویر', guest.photo) + field('tagline', 'معرفی کوتاه', guest.tagline) + field('shortBio', 'بخشی از توضیح', guest.shortBio, 'textarea') + field('longBio', 'ادامه توضیح', guest.longBio, 'textarea') + ['linkedin', 'youtube', 'castbox', 'spotify'].map(key => field(key, key, guest[key], 'url')).join('') + field('sortOrder', 'ترتیب نمایش', guest.sortOrder ?? 0, 'number') + field('published', 'انتشار عمومی', guest.published, 'checkbox') + notes;
  return form(`/admin/${pipeline ? 'pipeline' : 'guests'}/${guest.id || 'new'}`, csrf, identity + (pipeline ? production : profile), 'ذخیره', 'data-editor');
}

function videoDisplayEditor(settings, csrf) {
  const videoFields = select('videoMode', 'حالت نمایش صفحهٔ اصلی', settings.videoMode, [['manual', 'دستی — انتخاب ویدیوها'], ['automatic', 'خودکار — آخرین ویدیوها']]) + field('videoCount', 'تعداد ویدیوهای صفحهٔ اصلی', settings.videoCount, 'number', 'min="1" max="24" required');
  return `<h2>نمایش صفحهٔ اصلی</h2><p class="muted">در حالت دستی ویدیوهایی که «نمایش در صفحهٔ اصلی» را تیک زده‌اید نمایش داده می‌شوند؛ در حالت خودکار آخرین ویدیوهای منتشرشده.</p>${form('/admin/display', csrf, videoFields)}`;
}

function adminPage(section, context) {
  const { admin, csrf, settings, guests, episodes, admins, query, audit } = context;
  const editId = query.get('edit');
  const commonList = (collection, items, titleKey) => `<div class="toolbar"><a class="button" href="/admin/${collection}?edit=new">افزودن</a></div><div class="table-wrap"><table><thead><tr><th>عنوان</th><th>وضعیت</th><th>ویرایش</th></tr></thead><tbody>${items.map(item => `<tr><td>${escape(item[titleKey])}</td><td>${escape(item.status || (collection === 'guests' ? (item.published ? 'منتشرشده' : 'پیش‌نویس') : item.role))}</td><td><div class="link-row"><a class="button subtle" href="/admin/${collection}?edit=${item.id}">ویرایش</a>${deleteForm(collection, item.id, csrf)}</div></td></tr>`).join('') || '<tr><td colspan="3">هنوز موردی ثبت نشده است.</td></tr>'}</tbody></table></div>`;
  let content = '';
  if (section === 'dashboard') {
    const counts = [['کل مهمان‌ها', guests.length], ['مهمان‌های منتشرشده', guests.filter(guest => guest.published).length], ['ویدیوهای منتشرشده', episodes.filter(episode => episode.status === 'published').length], ['ویدیوهای آرشیوشده', episodes.filter(episode => episode.status === 'archived').length], ...states.map(state => [state, guests.filter(guest => guest.state === state).length])];
    content = `<div class="stats">${counts.map(([label, count]) => `<article><strong>${count}</strong><span>${label}</span></article>`).join('')}</div><div class="toolbar"><a class="button" href="/admin/guests?edit=new">افزودن مهمان</a><a class="button subtle" href="/admin/episodes?edit=new">افزودن ویدیو</a><a class="button subtle" href="/admin/pipeline">روند تولید</a></div><h2>فعالیت‌های اخیر</h2><ul class="activity">${audit.map(item => `<li><span>${escape(item.name || 'مدیر')} · ${escape(item.action)} · ${escape(item.entity)}</span><time>${date(item.created_at)}</time></li>`).join('') || '<li>هنوز فعالیتی ثبت نشده است.</li>'}</ul>`;
  } else if (section === 'guests') {
    const guest = guests.find(item => item.id === editId) || {};
    content = editId ? guestEditor(guest, admins, csrf) : commonList('guests', guests, 'name');
  } else if (section === 'pipeline') {
    if (editId) content = guestEditor(guests.find(item => item.id === editId) || {}, admins, csrf, true);
    else {
      const filtered = guests.filter(guest => (!query.get('state') || guest.state === query.get('state')) && guest.name.toLowerCase().includes((query.get('q') || '').toLowerCase()));
      content = `<div class="toolbar"><a class="button" href="/admin/pipeline?edit=new">افزودن برنامه</a><a href="/admin/guests">انتشار مهمان‌ها ←</a></div><form method="get" class="search">${field('q', 'جست‌وجوی نام', query.get('q') || '', 'search')}${select('state', 'مرحله', query.get('state') || '', [['', 'همهٔ مراحل'], ...states])}<button class="button">فیلتر</button></form><div class="table-wrap"><table><thead><tr><th>مهمان</th><th>مرحله / مسئول / یادداشت</th><th>از آخرین تغییر</th><th>ویرایش</th></tr></thead><tbody>${filtered.map(guest => `<tr><td>${escape(guest.name)}<br><span class="badge state-${states.indexOf(guest.state)}">${escape(guest.state)}</span></td><td>${form(`/admin/pipeline/${guest.id}`, csrf, select('state', 'مرحله', guest.state, states) + select('assignedAdmin', 'مسئول', guest.assignedAdmin || '', [['', 'تعیین نشده'], ...admins.filter(item => item.active).map(item => [item.id, item.name])]) + field('notes', 'یادداشت خصوصی', guest.notes, 'textarea'))}</td><td>${Math.max(0, Math.floor((Date.now() - new Date(guest.stateChangedAt || guest.updatedAt).getTime()) / 86400000))} روز<br>${date(guest.updatedAt)}</td><td><a href="/admin/pipeline?edit=${guest.id}">ویرایش</a></td></tr>`).join('') || '<tr><td colspan="4">برنامه‌ای پیدا نشد.</td></tr>'}</tbody></table></div>`;
    }
  } else if (section === 'episodes') {
    const episode = episodes.find(item => item.id === editId) || {};
    content = editId ? form(`/admin/episodes/${episode.id || 'new'}`, csrf, field('title', 'عنوان', episode.title, 'text', 'required') + field('description', 'توضیح', episode.description, 'textarea') + field('youtubeId', 'لینک یا شناسهٔ یوتیوب', episode.youtubeId) + upload('thumbnail', 'تصویر (خالی: تصویر یوتیوب)', episode.thumbnail) + field('publishAt', 'زمان انتشار (UTC)', episode.publishAt?.slice(0, 16), 'datetime-local', 'required') + select('status', 'وضعیت', episode.status || 'published', [['published', 'منتشرشده'], ['archived', 'آرشیوشده']]) + select('guestId', 'مهمان مرتبط', episode.guestId || '', [['', 'بدون مهمان'], ...guests.map(guest => [guest.id, guest.name])]) + field('pinned', 'نمایش در صفحهٔ اصلی (حالت دستی)', episode.pinned, 'checkbox'), 'ذخیره', 'data-editor') : commonList('episodes', [...episodes].sort((first, second) => String(second.publishAt || '').localeCompare(String(first.publishAt || ''))), 'title') + videoDisplayEditor(settings, csrf);
  } else if (section === 'admins') {
    content = `<div class="table-wrap"><table><thead><tr><th>نام / ایمیل</th><th>نقش</th><th>وضعیت</th><th>آخرین ورود</th>${admin.role === 'super' ? '<th>مدیریت</th>' : ''}</tr></thead><tbody>${admins.map(item => `<tr><td>${escape(item.name)}<br><span dir="ltr">${escape(item.email)}</span></td><td>${item.role === 'super' ? 'ارشد' : 'مدیر'}</td><td>${item.active ? 'فعال' : 'غیرفعال'}</td><td>${date(item.last_login)}</td>${admin.role === 'super' ? `<td>${item.role !== 'super' ? form(`/admin/admins/${item.id}/toggle`, csrf, '', item.active ? 'غیرفعال کردن' : 'فعال کردن') : ''}${form(`/admin/admins/${item.id}/reset`, csrf, '', 'ارسال بازیابی گذرواژه')}</td>` : ''}</tr>`).join('')}</tbody></table></div>`;
    if (admin.role === 'super') content += `<h2>ساخت حساب مدیر (${admins.filter(item => item.role === 'semi').length}/6)</h2>${form('/admin/admins/new', csrf, field('name', 'نام', '', 'text', 'required') + field('email', 'ایمیل', '', 'email', 'required') + field('password', 'گذرواژه (حداقل ۱۲ نویسه)', '', 'password', 'required minlength="12" maxlength="128" autocomplete="new-password"'), 'ساخت حساب')}`;
  } else return null;
  return shell(titles[section], content, settings, { admin, csrf, path: `/admin/${section}`, status: query.get('message') || '' });
}

module.exports = { escape, shell, authPage, adminPage, publicPage, homeEpisodes, themeStyle };
