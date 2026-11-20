const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '../..');
const initialPort = Number(process.env.PORT || 5173);
let port = initialPort;
const publicFiles = new Set(['/index.html', '/styles.css', '/landing.js']);
const mimeTypes = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
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

  if (pathname === '/') pathname = '/index.html';
  const publicPath = publicFiles.has(pathname) ? `/frontend/basic${pathname}` : pathname;
  const filePath = path.resolve(root, `.${publicPath}`);
  const relativePath = path.relative(root, filePath);
  const normalizedPath = relativePath.split(path.sep).join('/');
  const isAsset = ['files/images/', 'files/videos/', 'files/fonts/'].some(folder => normalizedPath.startsWith(folder));

  if (relativePath.startsWith('..') || path.isAbsolute(relativePath) || pathname.includes('\\') || (!publicFiles.has(pathname) && !isAsset)) {
    response.writeHead(404).end('Not found');
    return;
  }

  fs.stat(filePath, (error, stats) => {
    if (error || !stats.isFile()) {
      response.writeHead(404).end('Not found');
      return;
    }

    const headers = {
      'Content-Type': mimeTypes[path.extname(filePath)] || 'application/octet-stream',
      'Accept-Ranges': 'bytes',
      'Cache-Control': 'no-cache',
      'X-Content-Type-Options': 'nosniff',
    };
    let start = 0;
    let end = stats.size - 1;
    let status = 200;

    if (request.headers.range) {
      const range = /^bytes=(\d*)-(\d*)$/.exec(request.headers.range);
      if (!range || (!range[1] && !range[2])) {
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
    console.log(`Port ${port} is in use; trying ${port + 1}...`);
    port += 1;
    server.listen(port, '127.0.0.1');
    return;
  }

  console.error(`Unable to start the preview on port ${port}: ${error.message}`);
  process.exitCode = 1;
});

server.listen(port, '127.0.0.1', () => {
  console.log(`BaadeHasht preview: http://localhost:${port}`);
});
