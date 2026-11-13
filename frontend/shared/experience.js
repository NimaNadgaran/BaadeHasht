const body = document.body;
const track = document.querySelector('.scene-track');
const canvas = document.querySelector('.scene-film');
const context = canvas.getContext('2d', { alpha: false });
const poster = document.querySelector('.scene-poster');
const progressLabel = document.querySelector('#scroll-progress');
const preference = window.matchMedia('(prefers-reduced-motion: reduce)');
const adaptive = body.dataset.themeMode === 'adaptive';
const frameCount = 144;
const cache = new Map();
const pending = new Map();
const warmed = new Set();
const clamp = value => Math.max(0, Math.min(1, value));
let activeTheme = adaptive ? document.documentElement.dataset.theme : body.dataset.theme;
let animationRequest = 0;
let displayedProgress = 0;
let desiredFrame = 1;
let requestId = 0;
let previousTimestamp = 0;
let drawnKey = '';

function scrollDistance() {
  return Number(window.innerWidth <= 650 ? body.dataset.mobileScrollDistance : body.dataset.scrollDistance) || 2400;
}

function startOffset() {
  return track.getBoundingClientRect().top + window.scrollY;
}

function frameUrl(theme, frame) {
  return `/frontend/3d_${theme}/frames/frame_${String(frame).padStart(4, '0')}.webp`;
}

function loadFrame(theme, frame) {
  const key = `${theme}:${frame}`;
  if (cache.has(key)) {
    const image = cache.get(key);
    cache.delete(key);
    cache.set(key, image);
    return Promise.resolve(image);
  }
  if (pending.has(key)) return pending.get(key);
  const image = new Image();
  image.decoding = 'async';
  image.src = frameUrl(theme, frame);
  const promise = image.decode().then(() => {
    cache.set(key, image);
    while (cache.size > 24) cache.delete(cache.keys().next().value);
    return image;
  }).finally(() => pending.delete(key));
  pending.set(key, promise);
  return promise;
}

async function warmFrames(theme) {
  if (warmed.has(theme)) return;
  warmed.add(theme);
  const queue = Array.from({ length: frameCount }, (_, index) => index + 1);
  async function worker() {
    while (queue.length && theme === activeTheme) {
      const frame = queue.shift();
      try {
        const response = await fetch(frameUrl(theme, frame), { cache: 'force-cache' });
        if (response.ok) await response.arrayBuffer();
      } catch {}
    }
  }
  await Promise.all([worker(), worker(), worker()]);
  if (queue.length) warmed.delete(theme);
}

async function drawFrame(frame) {
  const theme = activeTheme;
  const lowerFrame = Math.floor(frame);
  const upperFrame = Math.min(frameCount, lowerFrame + 1);
  const blend = frame - lowerFrame;
  const key = `${theme}:${frame.toFixed(3)}`;
  if (key === drawnKey) return;
  const currentRequest = ++requestId;
  try {
    const [image, nextImage] = await Promise.all([loadFrame(theme, lowerFrame), loadFrame(theme, upperFrame)]);
    if (theme !== activeTheme || currentRequest !== requestId) return;
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    context.globalAlpha = blend;
    context.drawImage(nextImage, 0, 0, canvas.width, canvas.height);
    context.globalAlpha = 1;
    canvas.dataset.frame = String(Math.round(frame));
    canvas.dataset.theme = theme;
    drawnKey = key;
    body.classList.remove('media-failed');
  } catch {
    if (theme !== activeTheme || currentRequest !== requestId) return;
    body.classList.add('media-failed');
  }
}

function render(timestamp) {
  animationRequest = 0;
  const target = clamp((window.scrollY - startOffset()) / scrollDistance());
  const elapsed = previousTimestamp ? Math.min(timestamp - previousTimestamp, 50) : 16;
  previousTimestamp = timestamp;
  if (preference.matches) {
    displayedProgress = target;
  } else {
    const difference = target - displayedProgress;
    displayedProgress += difference * (1 - Math.exp(-elapsed / 140));
    if (Math.abs(target - displayedProgress) < 0.0001) displayedProgress = target;
  }
  const progress = clamp(displayedProgress);
  track.style.setProperty('--progress', progress.toFixed(4));
  track.style.setProperty('--intro-opacity', clamp(1 - progress / 0.43).toFixed(4));
  track.style.setProperty('--outro-opacity', clamp((progress - 0.62) / 0.22).toFixed(4));
  body.classList.toggle('is-content', window.scrollY > startOffset() + scrollDistance() + window.innerHeight * 0.45);
  desiredFrame = progress * (frameCount - 1) + 1;
  progressLabel.textContent = `${Math.round(target * 100)}%`;
  drawFrame(desiredFrame);
  if (displayedProgress !== target) scheduleRender();
  else previousTimestamp = 0;
}

function scheduleRender() {
  if (!animationRequest) animationRequest = requestAnimationFrame(render);
}

function setTheme(theme, persist = false) {
  if (!['light', 'dark'].includes(theme)) return;
  activeTheme = theme;
  document.documentElement.dataset.theme = theme;
  body.dataset.theme = theme;
  poster.src = `/files/blender_files/landingpage_logo_${theme}/storyboard/frame_0144.png`;
  document.querySelector('meta[name="theme-color"]').content = theme === 'light' ? '#10142c' : '#0d0e12';
  document.querySelectorAll('[data-select-theme]').forEach(control => {
    control.setAttribute('aria-pressed', String(control.dataset.selectTheme === theme));
  });
  const edition = document.querySelector('.edition');
  edition.textContent = theme === 'light' ? 'VIOLET / DAY' : 'GRAPHITE / NIGHT';
  if (persist) {
    try { localStorage.setItem('baadehasht-theme', theme); } catch {}
  }
  requestId += 1;
  drawnKey = '';
  body.classList.remove('media-failed');
  drawFrame(desiredFrame);
  warmFrames(theme);
  scheduleRender();
}

function resize() {
  track.style.setProperty('--scrub-distance', `${scrollDistance()}px`);
  scheduleRender();
}

window.addEventListener('scroll', scheduleRender, { passive: true });
window.addEventListener('resize', resize, { passive: true });
window.addEventListener('pageshow', scheduleRender);
document.addEventListener('visibilitychange', scheduleRender);
if (adaptive) {
  document.querySelectorAll('[data-select-theme]').forEach(control => {
    control.addEventListener('click', () => setTheme(control.dataset.selectTheme, true));
  });
  window.matchMedia('(prefers-color-scheme: light)').addEventListener('change', event => {
    let stored;
    try { stored = localStorage.getItem('baadehasht-theme'); } catch {}
    if (!stored) setTheme(event.matches ? 'light' : 'dark');
  });
}

resize();
setTheme(activeTheme);
