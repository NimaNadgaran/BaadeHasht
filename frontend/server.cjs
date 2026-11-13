const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const initialPort = Number(process.env.PORT || 5173);
let port = initialPort;
const frontendExtensions = new Set(['.html', '.css', '.js', '.mp4', '.png', '.jpg', '.webp', '.svg', '.woff2']);
const mimeTypes = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
  '.mp4': 'video/mp4',
  '.woff2': 'font/woff2',
  '.txt': 'text/plain; charset=utf-8',
};

const server = http.createServer((request, response) => {
  if (!['GET', 'HEAD'].includes(request.method)) {
    response.writeHead(405, { Allow: 'GET, HEAD' }).end();
    return;
  }
  let pathname;
  try {
    pathname = decodeURIComponent(new URL(request.url, 'http://localhost').pathname);
  } catch {
    response.writeHead(400).end('Bad request');
    return;
  }
  if (pathname.includes('\\') || pathname.includes('\0')) {
    response.writeHead(404).end('Not found');
    return;
  }
  const aliases = { '/frontend/d3_light': '/frontend/3d_light', '/frontend/d3_dark': '/frontend/3d_dark', '/frontend/basic_web': '/frontend/basic' };
  const alias = Object.keys(aliases).find(prefix => pathname === prefix || pathname.startsWith(`${prefix}/`));
  if (alias) {
    response.writeHead(302, { Location: aliases[alias] + pathname.slice(alias.length) }).end();
    return;
  }
  if (/^\/frontend\/(3d_light|3d_dark|basic)$/.test(pathname) || pathname === '/frontend') {
    response.writeHead(302, { Location: `${pathname}/` }).end();
    return;
  }
  if (pathname === '/') pathname = '/frontend/home.html';
  if (pathname.endsWith('/')) pathname += 'index.html';
  const filePath = path.resolve(root, `.${pathname}`);
  const relative = path.relative(root, filePath);
  const normalized = relative.split(path.sep).join('/');
  const extension = path.extname(filePath);
  const isFrontend = normalized.startsWith('frontend/') && frontendExtensions.has(extension)
    && !normalized.split('/').some(segment => segment.startsWith('.'));
  const isOriginalAsset = /^(files\/(images|videos|fonts)\/)[^/]+\.(png|jpg|mp4|woff2|txt)$/.test(normalized);
  const isStoryboard = /^files\/blender_files\/landingpage_logo_(dark|light)\/(storyboard|frames)\/frame_\d{4}\.png$/.test(normalized);
  if (relative.startsWith('..') || path.isAbsolute(relative) || !(isFrontend || isOriginalAsset || isStoryboard)) {
    response.writeHead(404).end('Not found');
    return;
  }
  fs.stat(filePath, (error, stats) => {
    if (error || !stats.isFile() || stats.size === 0) {
      response.writeHead(404).end('Not found');
      return;
    }
    const headers = {
      'Content-Type': mimeTypes[extension] || 'application/octet-stream',
      'Accept-Ranges': 'bytes',
      'Cache-Control': ['.mp4', '.webp'].includes(extension) ? 'public, max-age=3600' : 'no-cache',
      'X-Content-Type-Options': 'nosniff',
    };
    let start = 0;
    let end = stats.size - 1;
    let status = 200;
    if (request.headers.range) {
      const range = /^bytes=(\d*)-(\d*)$/.exec(request.headers.range);
      if (!range || (!range[1] && !range[2]) || (!range[1] && Number(range[2]) === 0)) {
        response.writeHead(416, { 'Content-Range': `bytes */${stats.size}` }).end();
        return;
      }
      if (!range[1]) {
        start = Math.max(0, stats.size - Number(range[2]));
      } else {
        start = Number(range[1]);
        end = range[2] ? Math.min(Number(range[2]), end) : end;
      }
      if (start > end || start >= stats.size || !Number.isSafeInteger(start) || !Number.isSafeInteger(end)) {
        response.writeHead(416, { 'Content-Range': `bytes */${stats.size}` }).end();
        return;
      }
      status = 206;
      headers['Content-Range'] = `bytes ${start}-${end}/${stats.size}`;
    }
    headers['Content-Length'] = end - start + 1;
    response.writeHead(status, headers);
    if (request.method === 'HEAD') {
      response.end();
      return;
    }
    const stream = fs.createReadStream(filePath, { start, end });
    stream.on('error', () => response.destroy());
    response.on('close', () => stream.destroy());
    stream.pipe(response);
  });
});

server.on('error', error => {
  if (error.code === 'EADDRINUSE' && !process.env.PORT && port < initialPort + 10) {
    port += 1;
    server.listen(port, '127.0.0.1');
    return;
  }
  console.error(`Unable to start the preview: ${error.message}`);
  process.exitCode = 1;
});

server.listen(port, '127.0.0.1', () => {
  console.log(`BaadeHasht frontends: http://localhost:${port}/`);
  for (const variant of ['basic', '3d_light', '3d_dark']) {
    console.log(`  ${variant}: http://localhost:${port}/frontend/${variant}/`);
  }
});
