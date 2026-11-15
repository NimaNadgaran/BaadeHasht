const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const script = fs.readFileSync(path.join(__dirname, '../frontend/shared/experience.js'), 'utf8');

function experience(referrer = '') {
  const listeners = new Map();
  const classes = new Set();
  const element = {
    getContext: () => ({}),
    setAttribute() {},
    addEventListener() {},
    decode: () => Promise.resolve(),
    getBoundingClientRect: () => ({ top: 0, bottom: 0 }),
    style: { setProperty() {} },
  };
  const body = {
    dataset: { theme: 'dark' },
    classList: { add: name => classes.add(name), remove: name => classes.delete(name) },
  };
  const sandbox = vm.createContext({
    document: {
      body,
      referrer,
      documentElement: { dataset: {}, scrollHeight: 1000 },
      querySelector: () => element,
      querySelectorAll: () => [],
      fonts: { ready: Promise.resolve() },
      addEventListener: (name, handler) => listeners.set(name, handler),
    },
    window: { innerHeight: 1000, scrollY: 0, location: { origin: 'https://baadehasht.test' }, addEventListener() {} },
    AbortController,
    URL,
    fetch: () => new Promise(() => {}),
    setTimeout: () => 1,
    clearTimeout() {},
    requestAnimationFrame: () => 1,
    frames: [],
  });
  vm.runInContext(script, sandbox);
  vm.runInContext("media.ready = true; body.dataset.playback = contentRevealed ? 'loop' : 'intro'; drawFrame = frame => frames.push(frame);", sandbox);
  return {
    body,
    classes,
    sandbox,
    click(timeStamp, options = {}) {
      listeners.get('click')({
        timeStamp, button: 0, clientX: 100, clientY: 100,
        target: { closest: () => null }, ...options,
      });
    },
  };
}

test('internal returns start directly in the light loop with readable content', () => {
  for (const route of ['/guests', '/episodes', '/about', '/admin/dashboard', '/']) {
    const page = experience('https://baadehasht.test' + route);
    assert.equal(page.body.dataset.playback, 'loop');
    assert.ok(page.classes.has('intro-complete'));
    vm.runInContext('render(1000);', page.sandbox);
    assert.deepEqual([...page.sandbox.frames], [132]);
    vm.runInContext('render(4000);', page.sandbox);
    assert.equal(page.sandbox.frames.at(-1), 108);
  }
});

test('direct, search and external link arrivals still play the intro', () => {
  for (const referrer of ['', 'https://www.google.com/search?q=baadehasht',
    'https://example.com/link', 'https://baadehasht.test.example.com/', 'invalid']) {
    const page = experience(referrer);
    assert.equal(page.body.dataset.playback, 'intro');
    assert.equal(page.classes.has('intro-complete'), false);
    vm.runInContext('render(1000);', page.sandbox);
    assert.deepEqual([...page.sandbox.frames], [1]);
  }
});

for (const pointerType of ['mouse', 'touch']) {
  test(`two ${pointerType} clicks skip the intro and start the regular loop`, () => {
    const page = experience();
    page.click(100, { pointerType, detail: 1 });
    assert.equal(page.body.dataset.playback, 'intro');
    page.click(300, { pointerType, detail: pointerType === 'mouse' ? 2 : 1 });
    assert.equal(page.body.dataset.playback, 'loop');
    assert.ok(page.classes.has('intro-complete'));
    assert.deepEqual([...page.sandbox.frames], [132]);
    vm.runInContext('render(1000); render(4000);', page.sandbox);
    assert.equal(page.sandbox.frames.at(-1), 108);
    page.click(4500);
    page.click(4700);
    assert.equal(page.sandbox.frames.at(-1), 108);
  });
}

test('slow or distant clicks do not skip the intro', () => {
  const page = experience();
  page.click(100);
  page.click(600);
  page.click(700, { clientX: 200 });
  assert.equal(page.body.dataset.playback, 'intro');
});

test('controls and secondary clicks do not count toward skipping', () => {
  for (const options of [{ button: 2 }, { target: { closest: () => ({}) } }]) {
    const page = experience();
    page.click(100);
    page.click(200, options);
    page.click(300);
    assert.equal(page.body.dataset.playback, 'intro');
  }
});

test('clicks while loading or in fallback do not skip', () => {
  for (const playback of ['loading', 'fallback']) {
    const page = experience();
    page.body.dataset.playback = playback;
    page.click(100);
    page.click(200);
    assert.equal(page.body.dataset.playback, playback);
    page.body.dataset.playback = 'intro';
    page.click(300);
    assert.equal(page.body.dataset.playback, 'intro');
  }
});
