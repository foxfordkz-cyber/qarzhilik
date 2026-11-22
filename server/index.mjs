import http from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { resolve, extname, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { isIP } from 'node:net';
import { openDatabase } from './database.mjs';
import worker from '../src/worker.js';

const root = fileURLToPath(new URL('../', import.meta.url));
const publicRoot = resolve(root, 'public');
const flutterRoot = resolve(root, 'mobile/build/web');
const DB = openDatabase(process.env.DB_PATH || resolve(root, '.local/qarzhy.sqlite'), resolve(root, 'migrations'));
const port = Number(process.env.PORT || 8787);
const origin = process.env.APP_ORIGIN || `http://localhost:${port}`;
if (process.env.NODE_ENV === 'production' && !origin.startsWith('https://')) throw new Error('APP_ORIGIN must use HTTPS in production');
const types = { '.html': 'text/html; charset=utf-8', '.css': 'text/css', '.js': 'text/javascript', '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml', '.ico': 'image/x-icon', '.wasm': 'application/wasm' };
const ASSETS = { async fetch(req) {
  let pathname;
  try { pathname = decodeURIComponent(new URL(req.url).pathname); } catch { return new Response('Bad path', { status: 400 }); }
  const isApp = pathname === '/app' || pathname.startsWith('/app/');
  const assetRoot = isApp ? flutterRoot : publicRoot;
  const file = resolve(assetRoot, '.' + (isApp ? pathname.slice(4) || '/' : pathname));
  if (!file.startsWith(assetRoot + sep) && file !== assetRoot) return new Response('Forbidden', { status: 403 });
  const candidates = [file, resolve(file, 'index.html'), file + '.html'];
  for (const candidate of candidates) {
    if ((await stat(candidate).catch(() => null))?.isFile()) return new Response(req.method === 'HEAD' ? null : await readFile(candidate), { headers: { 'Content-Type': types[extname(candidate)] || 'application/octet-stream', 'X-Content-Type-Options': 'nosniff' } });
  }
  return new Response(await readFile(resolve(publicRoot, '404.html')), { status: 404, headers: { 'Content-Type': 'text/html; charset=utf-8' } });
} };
const cached = new Map();
globalThis.caches = { default: { match: async r => cached.get(r.url)?.clone(), put: async (r, response) => { cached.set(r.url, response.clone()); setTimeout(() => cached.delete(r.url), 900000).unref(); } } };
const server = http.createServer(async (req, res) => {
  try {
    const chunks = []; let length = 0;
    for await (const chunk of req) { length += chunk.length; if (length > 65536) { res.writeHead(413).end('Body too large'); return; } chunks.push(chunk); }
    const headers = new Headers(); for (const [key, value] of Object.entries(req.headers)) if (value !== undefined) headers.set(key, Array.isArray(value) ? value.join(', ') : value);
    // Only accept a single IP overwritten by our explicitly configured loopback proxy.
    const peer = req.socket.remoteAddress || 'local';
    const proxyIp = req.headers['x-real-ip'];
    const trusted = process.env.TRUST_PROXY_LOOPBACK === '1' && ['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(peer);
    headers.set('CF-Connecting-IP', trusted && typeof proxyIp === 'string' && isIP(proxyIp) ? proxyIp : peer);
    const request = new Request(new URL(req.url, origin), { method: req.method, headers, ...(length ? { body: Buffer.concat(chunks) } : {}) });
    const response = await worker.fetch(request, { ...process.env, DB, ASSETS }, { waitUntil: p => p.catch(console.error) });
    const outgoing = Object.fromEntries(response.headers);
    if (origin.startsWith('http://localhost:') && outgoing['set-cookie']) outgoing['set-cookie'] = outgoing['set-cookie'].replace('; Secure', '');
    outgoing['X-Content-Type-Options'] = 'nosniff'; outgoing['Referrer-Policy'] = 'same-origin'; outgoing['X-Frame-Options'] = 'DENY';
    res.writeHead(response.status, outgoing); res.end(Buffer.from(await response.arrayBuffer()));
  } catch (error) { console.error(error); res.writeHead(500, { 'Content-Type': 'application/json' }).end(JSON.stringify({ error: 'Сервис временно недоступен' })); }
});
server.listen(port, '127.0.0.1', () => console.log(`QARZHY: ${origin} — local database, no cloud writes`));
process.on('SIGINT', () => server.close(() => { DB.close(); process.exit(); }));
