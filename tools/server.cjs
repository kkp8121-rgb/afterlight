#!/usr/bin/env node
'use strict';

const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const port = Number(process.env.PORT) || 4173;
const mime = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.txt': 'text/plain; charset=utf-8'
};

function safePath(requestUrl) {
  let pathname;
  try {
    pathname = decodeURIComponent(new URL(requestUrl, 'http://localhost').pathname);
  } catch (_) {
    return null;
  }
  if (pathname.includes('\0')) return null;
  const clean = pathname.replace(/\\/g, '/');
  const candidates = [clean];
  // GitHub Pages commonly mounts the project under /afterlight/.
  if (clean === '/afterlight' || clean.startsWith('/afterlight/')) candidates.push(clean.slice('/afterlight'.length) || '/');
  let relative = clean;
  for (const candidate of candidates) {
    const resolved = path.resolve(root, '.' + candidate);
    if (resolved === root || resolved.startsWith(root + path.sep)) {
      const stat = fs.existsSync(resolved) ? fs.statSync(resolved) : null;
      if (stat && (stat.isFile() || stat.isDirectory())) return resolved;
    }
  }
  // Also allow an arbitrary first path segment when the project is mounted there.
  const stripped = clean.replace(/^\/[^/]+(?=\/|$)/, '') || '/';
  const resolved = path.resolve(root, '.' + stripped);
  if (resolved === root || resolved.startsWith(root + path.sep)) return resolved;
  return null;
}

function resolveFile(requestUrl) {
  const target = safePath(requestUrl);
  if (!target) return null;
  try {
    const stat = fs.statSync(target);
    if (stat.isFile()) return target;
    if (stat.isDirectory()) {
      const index = path.join(target, 'index.html');
      if (fs.statSync(index).isFile()) return index;
    }
  } catch (_) {}
  return null;
}

const server = http.createServer((request, response) => {
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    response.writeHead(405, { Allow: 'GET, HEAD' });
    response.end();
    return;
  }
  const file = resolveFile(request.url || '/');
  if (!file) {
    response.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    response.end('Not found');
    return;
  }
  const type = mime[path.extname(file).toLowerCase()] || 'application/octet-stream';
  const stat = fs.statSync(file);
  response.writeHead(200, { 'Content-Type': type, 'Content-Length': stat.size, 'Cache-Control': 'no-cache' });
  if (request.method === 'HEAD') response.end();
  else fs.createReadStream(file).pipe(response);
});

server.listen(port, () => {
  console.log(`AFTERLIGHT server: http://localhost:${port}/`);
});
