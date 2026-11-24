// (From physical-ai-radar.) A tiny static file server for screenshots and the browser test. Local only, read only,
// sends the same CSP header the pages carry in their meta tag.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { CSP } from './render/layout.mjs';

const TYPES = {
  '.html': 'text/html; charset=utf-8', '.css': 'text/css', '.js': 'text/javascript', '.json': 'application/json',
  '.xml': 'application/xml', '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.txt': 'text/plain; charset=utf-8', '.csv': 'text/csv; charset=utf-8', '.jsonl': 'application/x-ndjson',
};

export function serveDir(root, { port = 0 } = {}) {
  const base = path.resolve(root);
  const server = http.createServer((req, res) => {
    let p;
    try {
      p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
    } catch {
      res.writeHead(400).end();
      return;
    }
    if (p.endsWith('/')) p += 'index.html';
    const file = path.resolve(base, `.${p}`);
    if (!file.startsWith(base + path.sep) || !fs.existsSync(file) || !fs.lstatSync(file).isFile()) {
      res.writeHead(404, { 'content-type': 'text/plain' }).end('not found');
      return;
    }
    res.writeHead(200, { 'content-type': TYPES[path.extname(file)] ?? 'application/octet-stream', 'content-security-policy': CSP, 'x-content-type-options': 'nosniff' });
    fs.createReadStream(file).pipe(res);
  });
  return new Promise((resolve) => server.listen(port, '127.0.0.1', () => resolve({ server, port: server.address().port, close: () => new Promise((r) => server.close(r)) })));
}

export function randomPort() {
  return 41000 + Math.floor(Math.random() * 9000);
}
