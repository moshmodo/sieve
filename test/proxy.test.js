import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { createProxy } from '../src/proxy.js';

function listen(server) { return new Promise(resolve => server.listen(0, '127.0.0.1', () => resolve(server.address().port))); }
function request(port, path, method = 'GET') {
  return new Promise((resolve, reject) => {
    const req = http.request({ hostname: '127.0.0.1', port, path, method }, res => { let body = ''; res.setEncoding('utf8'); res.on('data', data => body += data); res.on('end', () => resolve({ status: res.statusCode, body })); });
    req.on('error', reject); req.end();
  });
}

test('blocks disallowed packages and proxies non-read operations', async t => {
  let upstreamMethod;
  const upstream = http.createServer((req, res) => { upstreamMethod = req.method; res.end('{}'); });
  const upstreamPort = await listen(upstream);
  const proxy = createProxy({ allowlist: new Set(['allowed']), upstream: `http://127.0.0.1:${upstreamPort}` });
  const proxyPort = await listen(proxy);
  t.after(() => { upstream.close(); proxy.close(); });
  assert.equal((await request(proxyPort, '/blocked')).status, 403);
  assert.equal((await request(proxyPort, '/allowed', 'POST')).status, 200);
  assert.equal(upstreamMethod, 'POST');
});

test('proxies allowed metadata and reports missing transitive packages', async t => {
  const logs = [];
  const upstream = http.createServer((req, res) => { res.setHeader('content-type', 'application/json'); res.end(JSON.stringify({ dependencies: { missing: '^1.0.0' } })); });
  const upstreamPort = await listen(upstream);
  const proxy = createProxy({ allowlist: new Set(['root']), upstream: `http://127.0.0.1:${upstreamPort}`, logger: { info: () => {}, warn: value => logs.push(value), error: () => {} } });
  const proxyPort = await listen(proxy);
  t.after(() => { upstream.close(); proxy.close(); });
  const response = await request(proxyPort, '/root');
  assert.equal(response.status, 200);
  assert.match(response.body, /missing/);
  assert.match(logs[0], /transitive-dependencies/);
});

test('does not allow a package found only in registry metadata fields', async t => {
  const upstream = http.createServer((req, res) => res.end('{}'));
  const upstreamPort = await listen(upstream);
  const proxy = createProxy({ allowlist: new Set(['allowed-package']), upstream: `http://127.0.0.1:${upstreamPort}` });
  const proxyPort = await listen(proxy);
  t.after(() => { upstream.close(); proxy.close(); });

  assert.equal((await request(proxyPort, '/unlisted-package')).status, 403);
  assert.equal((await request(proxyPort, '/-/package/unlisted-package/dist-tags')).status, 403);
});