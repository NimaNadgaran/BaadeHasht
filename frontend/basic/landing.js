const video = document.querySelector('.intro-video');
const introLayer = document.querySelector('.intro-layer');
const skipButton = document.querySelector('#skip-intro');
const replayButton = document.querySelector('#replay-intro');
const motionButton = document.querySelector('#motion-toggle');
const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
let introActive = false;
let motionPaused = reducedMotion.matches;
let introTimeout;

function finishIntro() {
  clearTimeout(introTimeout);
  introActive = false;
  video.pause();
  document.body.classList.remove('is-intro');
  skipButton.hidden = true;
  if (document.activeElement === skipButton) replayButton.focus({ preventScroll: true });
}

function syncMotionControl() {
  document.body.classList.toggle('motion-paused', motionPaused);
  motionButton.setAttribute('aria-pressed', String(motionPaused));
  motionButton.setAttribute('aria-label', motionPaused ? 'ادامه حرکت پس‌زمینه' : 'توقف حرکت پس‌زمینه');
  motionButton.title = motionPaused ? 'ادامه حرکت' : 'توقف حرکت';
}

async function playIntro() {
  clearTimeout(introTimeout);
  introActive = true;
  introLayer.hidden = false;
  video.muted = true;
  video.currentTime = 0;
  video.preload = 'auto';
  motionPaused = false;
  syncMotionControl();
  document.body.classList.add('is-intro');
  skipButton.hidden = false;
  introTimeout = setTimeout(finishIntro, 12000);

  try {
    await video.play();
    if (!introActive) video.pause();
  } catch {
    finishIntro();
  }
}

video.addEventListener('ended', finishIntro);
video.addEventListener('error', finishIntro);
video.querySelector('source').addEventListener('error', finishIntro);
skipButton.addEventListener('click', finishIntro);
replayButton.addEventListener('click', () => {
  window.scrollTo({ top: 0, behavior: 'instant' });
  playIntro();
});

motionButton.addEventListener('click', () => {
  motionPaused = !motionPaused;
  syncMotionControl();
  if (!introActive) return;
  clearTimeout(introTimeout);
  if (motionPaused) {
    video.pause();
  } else {
    introTimeout = setTimeout(finishIntro, 12000);
    video.play().catch(finishIntro);
  }
});

reducedMotion.addEventListener('change', () => {
  if (reducedMotion.matches) finishIntro();
  motionPaused = reducedMotion.matches;
  syncMotionControl();
});

document.addEventListener('visibilitychange', () => {
  if (document.hidden && introActive) finishIntro();
});

syncMotionControl();
if (!reducedMotion.matches) playIntro();
