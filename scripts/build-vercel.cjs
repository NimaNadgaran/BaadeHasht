/**
 * Assembles the static half of the site into `public/` for Vercel.
 *
 * Vercel serves `public/` from its CDN. Server-rendered routes (`/`, `/guests`,
 * `/admin`, ...) and `/media/*` are handled by `api/index.cjs`; see vercel.json.
 *
 * Only browser-facing files are copied. Source files (server.cjs, Python
 * helpers, about.json), ignored folders and Blender sources stay out of the
 * deployment.
 */
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const out = path.join(root, 'public');

fs.rmSync(out, { recursive: true, force: true });
fs.mkdirSync(out, { recursive: true });

const frontendSkip = new Set([
  '.validation',
  '.gitignore',
  'about.json', // bundled into the serverless function, not fetched by the browser
  'home.html', // rendered by the function so admin settings are applied
  'prepare_media.log',
  'prepare_media.py',
  'server.cjs',
]);

function copy(source, destination, skip = new Set()) {
  const stats = fs.statSync(source);
  if (stats.isDirectory()) {
    fs.mkdirSync(destination, { recursive: true });
    for (const entry of fs.readdirSync(source)) {
      if (skip.has(entry)) continue;
      copy(path.join(source, entry), path.join(destination, entry), skip);
    }
    return;
  }
  if (!stats.isFile() || stats.size === 0) return;
  fs.copyFileSync(source, destination);
}

copy(path.join(root, 'frontend'), path.join(out, 'frontend'), frontendSkip);

// Give Vercel a direct root document so `/` works even before the API function
// initializes. The page still uses the API for its dynamic content.
copy(path.join(root, 'frontend', 'home.html'), path.join(out, 'index.html'));

for (const folder of ['fonts', 'images', 'videos']) {
  copy(path.join(root, 'files', folder), path.join(out, 'files', folder));
}

const files = [];
const walk = directory => {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const full = path.join(directory, entry.name);
    if (entry.isDirectory()) walk(full);
    else files.push(full);
  }
};
walk(out);
console.log(`Vercel static output ready: ${files.length} files in public/`);
