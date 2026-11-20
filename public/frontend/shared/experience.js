const body = document.body;
const track = document.querySelector('.scene-track');
const canvas = document.querySelector('.scene-film');
const context = canvas.getContext('2d', { alpha: false });
const poster = document.querySelector('.scene-poster');
const progressLabel = document.querySelector('#scroll-progress');
const statusLabel = document.querySelector('#playback-status');
const header = document.querySelector('.site-header');
const content = document.querySelector('.content');
const adaptive = body.dataset.themeMode === 'adaptive';
const frameCount = 144;
const introDuration = 6000;
const loopDuration = 12000;
const sweepStart = 84;
const sweepEnd = 132;
const clamp = value => Math.max(0, Math.min(1, value));
let activeTheme = adaptive ? document.documentElement.dataset.theme : body.dataset.theme;
let media;
let animationRequest = 0;
let previousTimestamp = null;
let introElapsed = 0;
let loopElapsed = 0;
let contentRevealed = false;
let drawing = false;
let lastIntroClick = null;

function setupTextReveals() {
  if (!('IntersectionObserver' in window)) return;
  const observer = new IntersectionObserver(entries => {
    for (const entry of entries) {
      if (!entry.isIntersecting) continue;
      entry.target.classList.add('is-revealed');
      observer.unobserve(entry.target);
    }
  }, { threshold: 0.12, rootMargin: '0px 0px -10% 0px' });
  document.querySelectorAll('.content-intro, .conversation-card, .reading-story, .invitation').forEach(element => {
    element.classList.add('scroll-reveal');
    observer.observe(element);
  });
}

function updateScrollProgress() {
  const distance = document.documentElement.scrollHeight - window.innerHeight;
  const progress = distance > 0 ? clamp(window.scrollY / distance) : 0;
  progressLabel.textContent = Math.round(progress * 100) + '%';
  if (contentRevealed) {
    const fadeTop = Math.max(0, header.getBoundingClientRect().bottom + 8 - content.getBoundingClientRect().top);
    content.style.setProperty('--content-fade-top', fadeTop + 'px');
  }
}

function revealContent() {
  contentRevealed = true;
  body.classList.add('intro-complete');
  updateScrollProgress();
}

function finishIntro() {
  introElapsed = introDuration;
  loopElapsed = 0;
  revealContent();
  body.dataset.playback = 'loop';
  statusLabel.textContent = 'متن‌ها آماده‌اند. برای خواندن ادامه، اسکرول کنید.';
}

function isInternalEntry() {
  if (!document.referrer) return false;
  try {
    return new URL(document.referrer).origin === window.location.origin;
  } catch {
    return false;
  }
}

function frameUrl(theme, frame) {
  return '/frontend/3d_' + theme + '/frames/frame_' + String(frame).padStart(4, '0') + '.webp';
}

function lightFrame() {
  const sweep = (1 + Math.cos(loopElapsed / loopDuration * Math.PI * 2)) / 2;
  return sweepStart + sweep * (sweepEnd - sweepStart);
}

function loadFrame(source, frame) {
  if (source.cache.has(frame)) {
    const image = source.cache.get(frame);
    source.cache.delete(frame);
    source.cache.set(frame, image);
    return Promise.resolve(image);
  }
  if (source.pending.has(frame)) return source.pending.get(frame);
  const image = new Image();
  image.decoding = 'async';
  image.src = source.urls.get(frame);
  const promise = image.decode().then(() => {
    if (source !== media || source.controller.signal.aborted) return image;
    source.cache.set(frame, image);
    while (source.cache.size > 16) source.cache.delete(source.cache.keys().next().value);
    return image;
  }).finally(() => source.pending.delete(frame));
  source.pending.set(frame, promise);
  return promise;
}

function releaseMedia(source) {
  if (!source) return;
  source.controller.abort();
  for (const url of source.urls.values()) URL.revokeObjectURL(url);
  source.urls.clear();
  source.cache.clear();
}

function showFallback(source, error) {
  if (source !== media) return;
  source.ready = false;
  releaseMedia(source);
  body.classList.add('media-failed');
  body.dataset.playback = 'fallback';
  body.dataset.playbackError = error?.message || 'Background frames unavailable';
  console.warn('Background animation unavailable:', error);
  track.setAttribute('aria-busy', 'false');
  statusLabel.textContent = 'پس‌زمینهٔ ثابت نمایش داده می‌شود. متن‌ها آمادهٔ خواندن هستند.';
  revealContent();
}

async function prepareMedia(source) {
  let timeout;
  const resetLoadingTimeout = () => {
    clearTimeout(timeout);
    timeout = setTimeout(() => source.controller.abort(), 45000);
  };
  resetLoadingTimeout();
  const interfaceReady = Promise.allSettled([
    document.fonts.ready,
    document.querySelector('.brand-symbol').decode(),
  ]);
  let abortLoading;
  const interrupted = new Promise((resolve, reject) => {
    abortLoading = () => reject(new Error('Loading interrupted'));
    source.controller.signal.addEventListener('abort', abortLoading, { once: true });
  });
  const queue = Array.from({ length: frameCount }, (_, index) => index + 1);
  async function worker() {
    while (queue.length && source === media) {
      const frame = queue.shift();
      const response = await fetch(frameUrl(source.theme, frame), {
        cache: 'force-cache', signal: source.controller.signal,
      });
      if (!response.ok) throw new Error('Frame ' + frame + ': ' + response.status);
      const blob = await response.blob();
      if (source !== media || source.controller.signal.aborted) return;
      source.urls.set(frame, URL.createObjectURL(blob));
      resetLoadingTimeout();
    }
  }
  try {
    await Promise.race([
      (async () => {
        await Promise.all(Array.from({ length: 6 }, worker));
        if (source !== media || source.controller.signal.aborted) return;
        await Promise.all([
          Promise.race([interfaceReady, new Promise(resolve => setTimeout(resolve, 2000))]),
          ...Array.from({ length: 8 }, (_, index) => loadFrame(source, index + 1)),
        ]);
      })(),
      interrupted,
    ]);
    if (source !== media || source.controller.signal.aborted) throw new Error('Loading interrupted');
    source.ready = true;
    track.setAttribute('aria-busy', 'false');
    body.classList.remove('media-failed');
    previousTimestamp = null;
    body.dataset.playback = contentRevealed ? 'loop' : 'intro';
    statusLabel.textContent = contentRevealed ? 'متن‌ها آمادهٔ خواندن هستند.' : 'نمایش نشان بعد هشت';
    await drawFrame(contentRevealed ? lightFrame() : Math.min(frameCount, 1 + introElapsed / 1000 * 24));
    scheduleRender();
  } catch (error) {
    showFallback(source, error);
  } finally {
    clearTimeout(timeout);
    source.controller.signal.removeEventListener('abort', abortLoading);
  }
}

async function drawFrame(frame) {
  const source = media;
  if (!source?.ready || drawing) return;
  drawing = true;
  const lowerFrame = Math.floor(frame);
  const upperFrame = Math.min(frameCount, lowerFrame + 1);
  const blend = frame - lowerFrame;
  try {
    const [image, nextImage] = await Promise.all([
      loadFrame(source, lowerFrame),
      loadFrame(source, upperFrame),
    ]);
    if (source !== media) return;
    context.globalAlpha = 1;
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    context.globalAlpha = blend;
    context.drawImage(nextImage, 0, 0, canvas.width, canvas.height);
    context.globalAlpha = 1;
    canvas.dataset.frame = frame.toFixed(3);
    canvas.dataset.theme = source.theme;
    const direction = body.dataset.playback === 'intro' || Math.sin(loopElapsed / loopDuration * Math.PI * 2) < 0 ? 1 : -1;
    for (let offset = 1; offset <= 6; offset++) {
      const nextFrame = Math.max(1, Math.min(frameCount, lowerFrame + offset * direction));
      loadFrame(source, nextFrame).catch(() => {});
    }
  } catch (error) {
    showFallback(source, error);
  } finally {
    if (source === media) drawing = false;
  }
}

function render(timestamp) {
  animationRequest = 0;
  if (document.hidden || !media?.ready) return;
  const elapsed = previousTimestamp === null ? 0 : timestamp - previousTimestamp;
  previousTimestamp = timestamp;
  if (body.dataset.playback === 'intro') {
    introElapsed = Math.min(introDuration, introElapsed + elapsed);
    if (introElapsed < introDuration) {
      drawFrame(Math.min(frameCount, 1 + introElapsed / 1000 * 24));
    } else {
      finishIntro();
      drawFrame(sweepEnd);
    }
  } else if (body.dataset.playback === 'loop') {
    loopElapsed = (loopElapsed + elapsed) % loopDuration;
    drawFrame(lightFrame());
  }
  scheduleRender();
}

function scheduleRender() {
  if (!animationRequest && !document.hidden && media?.ready) {
    animationRequest = requestAnimationFrame(render);
  }
}

function setTheme(theme, persist = false) {
  if (!['light', 'dark'].includes(theme)) return;
  activeTheme = theme;
  releaseMedia(media);
  media = { theme, urls: new Map(), cache: new Map(), pending: new Map(), controller: new AbortController(), ready: false };
  drawing = false;
  previousTimestamp = null;
  body.dataset.playback = 'loading';
  delete body.dataset.playbackError;
  track.setAttribute('aria-busy', 'true');
  statusLabel.textContent = 'در حال آماده‌سازی پس‌زمینه…';
  document.documentElement.dataset.theme = theme;
  body.dataset.theme = theme;
  poster.src = frameUrl(theme, frameCount);
  document.querySelector('meta[name="theme-color"]').content = theme === 'light' ? '#10142c' : '#0d0e12';
  document.querySelectorAll('[data-select-theme]').forEach(control => {
    control.setAttribute('aria-pressed', String(control.dataset.selectTheme === theme));
  });
  document.querySelector('.edition').textContent = theme === 'light' ? 'VIOLET / DAY' : 'GRAPHITE / NIGHT';
  if (persist) {
    try { localStorage.setItem('baadehasht-theme', theme); } catch {}
  }
  prepareMedia(media);
}

document.addEventListener('click', event => {
  if (body.dataset.playback !== 'intro' || event.button !== 0 ||
      event.target.closest('a, button, input, select, textarea, [role="button"]')) {
    lastIntroClick = null;
    return;
  }
  if (lastIntroClick && event.timeStamp - lastIntroClick.timeStamp <= 400 &&
      Math.hypot(event.clientX - lastIntroClick.clientX, event.clientY - lastIntroClick.clientY) <= 32) {
    lastIntroClick = null;
    finishIntro();
    previousTimestamp = null;
    drawFrame(lightFrame());
    return;
  }
  lastIntroClick = { timeStamp: event.timeStamp, clientX: event.clientX, clientY: event.clientY };
});

window.addEventListener('scroll', updateScrollProgress, { passive: true });
window.addEventListener('resize', updateScrollProgress, { passive: true });
window.addEventListener('pageshow', () => { previousTimestamp = null; scheduleRender(); updateScrollProgress(); });
document.addEventListener('visibilitychange', () => { previousTimestamp = null; scheduleRender(); });
document.querySelectorAll('a[href="#discover"], a[href="#conversations"]').forEach(link => {
  link.addEventListener('click', () => {
    if (!contentRevealed) finishIntro();
    if (!media?.ready) body.dataset.playback = 'loading';
  });
});
document.querySelector('.scroll-cue').addEventListener('click', event => {
  event.preventDefault();
  document.querySelector('#the-idea').scrollIntoView({ behavior: 'smooth', block: 'start' });
});
window.addEventListener('online', () => {
  if (body.dataset.playback === 'fallback') setTheme(activeTheme);
});
if (adaptive) {
  document.querySelectorAll('[data-select-theme]').forEach(control => {
    control.addEventListener('click', () => setTheme(control.dataset.selectTheme, true));
  });
  window.matchMedia('(prefers-color-scheme: light)').addEventListener('change', event => {
    const siteDefault = document.documentElement.dataset.defaultTheme;
    if (['light', 'dark'].includes(siteDefault)) return;
    let stored;
    try { stored = localStorage.getItem('baadehasht-theme'); } catch {}
    if (!stored) setTheme(event.matches ? 'light' : 'dark');
  });
}

body.classList.add('has-experience');
setupTextReveals();
if (isInternalEntry()) finishIntro();
setTheme(activeTheme);
updateScrollProgress();
