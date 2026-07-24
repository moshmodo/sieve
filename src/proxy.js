import http from 'node:http';
import https from 'node:https';
import { URL } from 'node:url';
import { normalizePackageName } from './allowlist.js';

const dependencyFields = ['dependencies', 'optionalDependencies', 'peerDependencies'];

function packageFromPath(requestPath) {
  const path = requestPath.split('?')[0];
  const parts = path.split('/').filter(Boolean).map(decodeURIComponent);
  if (!parts.length) return null;
  if (parts[0] === '-' && parts[1] === 'package') {
    return parts[2] ? normalizePackageName(parts[2]) : null;
  }
  if (parts[0].startsWith('-')) return null;
  return normalizePackageName(parts[0].startsWith('@') ? parts.slice(0, 2).join('/') : parts[0]);
}

function dependencyNames(metadata) {
  const result = new Set();
  for (const field of dependencyFields) for (const name of Object.keys(metadata?.[field] || {})) result.add(normalizePackageName(name));
  return result;
}

function responseJson(res, status, message) {
  const body = JSON.stringify({ error: message });
  res.writeHead(status, { 'content-type': 'application/json', 'content-length': Buffer.byteLength(body) });
  res.end(body);
}

export function createProxy({ allowlist, localAllowlist = new Set(), mode = 'enforce', upstream, logger = console }) {
  const allowed = name => allowlist.has(name) || localAllowlist.has(name);
  return http.createServer((req, res) => {
    const name = packageFromPath(req.url || '/');
    const log = (decision, reason = '') => logger.info(JSON.stringify({ method: req.method, path: req.url, package: name, decision, reason }));
    if (name && !allowed(name)) {
      log(mode === 'audit' ? 'audited' : 'blocked', 'Package is not in the allowlist.');
      if (mode !== 'audit') return responseJson(res, 403, `Package "${name}" is not allowed by SIEVE.`);
    } else log('allowed');

    const target = new URL(req.url || '/', upstream);
    const client = target.protocol === 'https:' ? https : http;
    const upstreamReq = client.request(target, { method: req.method, headers: { ...req.headers, host: target.host } }, upstreamRes => {
      const chunks = [];
      const isMetadata = req.method === 'GET' && name && (upstreamRes.headers['content-type'] || '').includes('json');
      upstreamRes.on('data', chunk => { chunks.push(chunk); });
      upstreamRes.on('end', () => {
        const body = Buffer.concat(chunks);
        if (isMetadata && body.length) {
          try {
            const metadata = JSON.parse(body);
            const missing = [...dependencyNames(metadata)].filter(dep => !allowed(dep));
            if (missing.length) logger.warn(JSON.stringify({ package: name, decision: 'transitive-dependencies', missing }));
          } catch { /* npm tarballs and non-JSON responses are passed through unchanged */ }
        }
        res.writeHead(upstreamRes.statusCode || 502, upstreamRes.headers);
        res.end(body);
      });
    });
    upstreamReq.on('error', error => { logger.error(`Upstream request failed: ${error.message}`); if (!res.headersSent) responseJson(res, 502, 'The upstream npm registry could not be reached.'); else res.end(); });
    req.pipe(upstreamReq);
  });
}

export async function startProxy(options) {
  const server = createProxy(options);
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(options.port, options.host, resolve); });
  return server;
}