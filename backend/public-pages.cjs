const about = require('../frontend/about.json');

module.exports = function publicPage(path, data, settings, { shell, escape, image, links, guestCard, episodeCard }) {
  const number = value => value.toLocaleString('fa-IR');
  const render = (title, content, variant, eyebrow) => shell(title, content, settings, { path, variant, eyebrow });
  const sectionHeading = (title, count) => `<div class="section-heading"><h2>${title}</h2>${count === undefined ? '' : `<span class="collection-count">${number(count)} روایت</span>`}</div>`;
  const emptyState = (symbol, title, text, href, label) => `<div class="archive-empty"><span class="empty-symbol" aria-hidden="true">${symbol}</span><h2>${title}</h2><p>${text}</p><a class="text-action" href="${href}">${label} <span aria-hidden="true">↗</span></a></div>`;

  if (path === '/about') {
    return render('هر مسیر، با یک سؤال شروع می‌شود.', `
      <div class="about-layout">
        <section class="about-copy lead prose">
          <p class="section-label"><span class="tiny-line" aria-hidden="true"></span>روایت ما</p>
          <h2>${escape(about.title)}</h2>
          ${about.paragraphs.map(paragraph => `<p>${escape(paragraph)}</p>`).join('')}
          <div class="about-actions"><a class="button team-cta" href="/team">با تیم پشت صحنه آشنا شوید <span aria-hidden="true">↗</span></a><a class="text-action" href="/episodes">شنیدن گفت‌وگوها <span aria-hidden="true">←</span></a></div>
        </section>
        <figure class="about-art">
          <span class="art-orbit orbit-one" aria-hidden="true"></span><span class="art-orbit orbit-two" aria-hidden="true"></span>
          <img src="/files/images/logo_edit_transparent.png" width="300" height="480" alt="نشان بعد هشت" fetchpriority="high">
          <figcaption><span lang="en" dir="ltr">BAADE HASHT</span><span>از یک سؤال، به هزار مسیر.</span></figcaption>
        </figure>
      </div>
      <div class="story-colophon"><span>کنجکاوی، نقطهٔ شروع ماست.</span><span lang="en" dir="ltr">A QUESTION. A CONVERSATION. A NEW PERSPECTIVE.</span></div>
    `, 'about', '01 / OUR STORY');
  }

  if (path === '/team') {
    return render('تیم پشت صحنه', `
      <section class="team-opening"><div><p class="lead">پشت هر گفت‌وگو، یک کار گروهی است.</p><p>اینجا با تیمی آشنا می‌شوید که سؤال‌ها را به گفت‌وگو و گفت‌وگوها را به بعد هشت تبدیل می‌کند.</p></div><div class="crew-mark" aria-hidden="true"><span>پشت</span><span>صحنه.</span><i></i></div></section>
      ${sectionHeading('پشت میکروفن، کنار هم')}
      <div class="team-grid">${data.team.map((member, index) => `<article class="person-card team-member"><div class="member-portrait">${image(member.photo, member.name)}<span class="member-number" aria-hidden="true">${String(index + 1).padStart(2, '0')}</span></div><div class="card-body">${member.role ? `<p class="eyebrow">${escape(member.role)}</p>` : ''}<h2>${escape(member.name)}</h2>${member.bio ? `<p>${escape(member.bio)}</p>` : ''}<div class="link-row">${links(member)}</div></div></article>`).join('') || emptyState('↗', 'معرفی تیم، به‌زودی', 'این قاب به‌زودی با معرفی تیم پشت صحنه کامل می‌شود.', '/about', 'داستان بعد هشت')}</div>
      <div class="page-endnote"><p>ما را از میان گفت‌وگوهایمان بشناسید.</p><a class="text-action" href="/episodes">رفتن به گفت‌وگوها <span aria-hidden="true">←</span></a></div>
    `, 'team', '02 / BEHIND THE SCENES');
  }

  if (path === '/guests') {
    const filtered = data.guests.filter(guest => `${guest.name} ${guest.tagline}`.toLowerCase().includes(data.query.toLowerCase()));
    return render('مهمان‌ها', `
      <form class="search directory-search" method="get"><label for="guest-search">دنبال چه کسی می‌گردید؟<input id="guest-search" name="q" value="${escape(data.query)}" type="search" placeholder="نام مهمان یا حوزهٔ فعالیت…"></label><button class="button">جست‌وجو <span aria-hidden="true">↗</span></button>${data.query ? '<a class="text-action" href="/guests">همهٔ مهمان‌ها</a>' : ''}</form>
      ${sectionHeading(data.query ? 'نتیجهٔ جست‌وجو' : 'فهرست مهمان‌ها', filtered.length)}
      <div class="guest-grid">${filtered.map(guestCard).join('') || emptyState('↗', data.query ? 'هنوز به این نام نرسیده‌ایم.' : 'جای اولین روایت، اینجاست.', data.query ? 'نام دیگری را امتحان کنید یا همهٔ مهمان‌ها را ببینید.' : 'معرفی مهمان‌ها پس از انتشار، در این مجموعه قرار می‌گیرد.', data.query ? '/guests' : '/episodes', data.query ? 'دیدن همهٔ مهمان‌ها' : 'کشف گفت‌وگوها')}</div>
    `, 'guests', '03 / GUEST DIRECTORY');
  }

  if (path.startsWith('/guests/')) {
    const guest = data.guests.find(item => item.slug === path.slice('/guests/'.length));
    if (!guest) return null;
    const episodes = data.episodes.filter(episode => episode.guestId === guest.id);
    return render(guest.name, `<a class="back-link" href="/guests">← بازگشت به مهمان‌ها</a><article class="profile-layout"><div class="profile-portrait">${image(guest.photo, guest.name)}</div><div class="profile-copy">${guest.tagline ? `<p class="section-label">${escape(guest.tagline)}</p>` : ''}<h2>از نزدیک‌تر</h2><div class="prose">${escape(guest.longBio || guest.shortBio)}</div><div class="link-row">${links(guest)}</div></div></article>${sectionHeading('گفت‌وگوها با ' + escape(guest.name), episodes.length)}<div class="episode-grid">${episodes.map(episode => episodeCard(episode)).join('') || emptyState('◌', 'ادامهٔ این مسیر، در گفت‌وگو.', 'گفت‌وگوی این مهمان پس از انتشار، اینجا قرار می‌گیرد.', '/episodes', 'همهٔ گفت‌وگوها')}</div>`, 'profile', '03 / A CLOSER LOOK');
  }

  const guestModalShell = () => `<div class="guest-modal" id="guest-modal" aria-hidden="true">
    <div class="guest-modal-overlay"></div>
    <div class="guest-modal-panel">
      <button type="button" class="guest-modal-close" aria-label="بستن">×</button>
      <div class="guest-modal-body" id="guest-modal-body"></div>
      <a href="/guests" class="button guest-modal-list-btn">مشاهده لیست مهمان‌ها <span aria-hidden="true">↗</span></a>
    </div>
  </div>`;

  if (path === '/episodes') {
    return render('یک گفت‌وگو، یک زاویهٔ تازه.', `
      <section class="episode-opening"><div><span class="section-label">آرشیو گفت‌وگوها</span><p class="lead">از سؤال امروزت شروع کن.</p><p>کار، ادامهٔ تحصیل، اپلای و انتخاب‌های میان راه. مسیرهای مختلف را از زبان کسانی بشنوید که آن‌ها را زندگی کرده‌اند.</p><a class="text-action" href="#episode-library">کشف گفت‌وگوها <span aria-hidden="true">↓</span></a></div><div class="sound-art" aria-hidden="true"><span class="sound-orbit"></span><div class="sound-bars">${Array.from({ length: 19 }, (_, index) => `<i style="--bar:${18 + Math.round((Math.sin(index * 1.7) + 1) * 35)}%"></i>`).join('')}</div><span class="sound-caption" lang="en" dir="ltr">A LITTLE FURTHER. A LITTLE DEEPER.</span></div></section>
      <section id="episode-library" class="episode-library">${sectionHeading('برای دیدن، شنیدن، فکر کردن.', data.episodes.length)}<div class="episode-grid">${data.episodes.map(episode => episodeCard(episode, false, data.guests)).join('') || emptyState('▶', 'اولین گفت‌وگو در راه است.', 'این آرشیو با انتشار گفت‌وگوهای بعد هشت جان می‌گیرد. تا آن موقع، داستان شروع ما را بخوانید.', '/about', 'چرا بعد هشت؟')}</div></section>
      <div class="page-endnote"><p>تجربه‌ها برای به اشتراک گذاشتن‌اند.</p><a class="text-action" href="/guests">آشنایی با مهمان‌ها <span aria-hidden="true">←</span></a></div>
      ${guestModalShell()}
      <script id="baadehasht-guests-data" type="application/json">${JSON.stringify(data.guests)}</script>
    `, 'episodes', '04 / THE CONVERSATIONS');
  }

  if (path === '/privacy' || path === '/terms') {
    const privacy = path === '/privacy';
    return render(privacy ? 'حریم خصوصی' : 'شرایط استفاده', `<div class="legal-layout"><aside class="legal-note"><span class="legal-symbol" aria-hidden="true">${privacy ? '◈' : '§'}</span><h2>${privacy ? 'با احترام به حریم شما.' : 'شفاف، ساده، روشن.'}</h2><p>اطلاعات مربوط به ${privacy ? 'حریم خصوصی' : 'استفاده از وب‌سایت'} بعد هشت.</p><a class="text-action" href="/about">دربارهٔ ما <span aria-hidden="true">←</span></a></aside><section class="legal-copy prose">${escape(settings[privacy ? 'privacy' : 'terms'] || 'متن این صفحه هنوز توسط تیم منتشر نشده است.')}</section></div>`, privacy ? 'privacy' : 'terms', '05 / THE SMALL PRINT');
  }
  return null;
};
