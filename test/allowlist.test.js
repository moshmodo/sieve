import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { dataDirectory } from '../src/config.js';
import { namesFromRegistryJson, loadAllowlist, updateLocalAllowlist } from '../src/allowlist.js';

test('normalizes array and object allowlist formats', () => {
  assert.deepEqual([...namesFromRegistryJson(['left-pad', '@scope/pkg'])], ['left-pad', '@scope/pkg']);
  assert.deepEqual([...namesFromRegistryJson({ 'left-pad': true, blocked: false })], ['left-pad']);
});

test('reads npm package names from an array-valued registry property', () => {
  const names = namesFromRegistryJson({ packages: ['left-pad', '@scope/pkg'] });

  assert.deepEqual([...names], ['left-pad', '@scope/pkg']);
  assert.equal(names.has('packages'), false);
});

test('only reads npm names from registry entries', () => {
  const names = namesFromRegistryJson([{
    name: 'allowed-project',
    fullName: 'owner/allowed-project',
    keywords: ['unlisted-package'],
    npmName: ['allowed-package']
  }]);

  assert(names.has('allowed-package'));
  assert.equal(names.has('allowed-project'), false);
  assert.equal(names.has('unlisted-package'), false);
});

test('falls back to the last valid cache when GitHub is unavailable', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'sieve-'));
  await fs.writeFile(path.join(dir, 'registry.json'), JSON.stringify(['cached-package']));
  const logs = [];
  const names = await loadAllowlist({ dataDir: dir, url: 'https://example.invalid', fetchImpl: async () => { throw new Error('offline'); }, log: { info: () => {}, warn: message => logs.push(message) } });
  assert(names.has('cached-package'));
  assert.match(logs[0], /last valid local allowlist/);
});

test('accepts the configuration name allowlistUrl', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'sieve-'));
  let requestedUrl;
  const names = await loadAllowlist({
    dataDir: dir,
    allowlistUrl: 'https://raw.githubusercontent.com/example/registry.json',
    fetchImpl: async url => {
      requestedUrl = url;
      return { ok: true, text: async () => JSON.stringify(['configured-package']) };
    },
    log: { info: () => {}, warn: () => {} }
  });
  assert.equal(requestedUrl, 'https://raw.githubusercontent.com/example/registry.json');
  assert(names.has('configured-package'));
});

test('updates the local allowlist', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'sieve-'));
  const file = path.join(dir, 'allowlist.local.json');
  await updateLocalAllowlist(file, '@scope/pkg', true);
  assert.deepEqual(JSON.parse(await fs.readFile(file, 'utf8')), ['@scope/pkg']);
  await updateLocalAllowlist(file, '@scope/pkg', false);
  assert.deepEqual(JSON.parse(await fs.readFile(file, 'utf8')), []);
});

test('uses the platform equivalent of AppData/Roaming', () => {
  const env = { APPDATA: 'C:/Users/test/AppData/Roaming', HOME: '/home/test', XDG_CONFIG_HOME: '/custom/config' };
  assert.equal(dataDirectory(env, 'win32'), path.join('C:/Users/test/AppData/Roaming', 'sieve'));
  assert.equal(dataDirectory(env, 'darwin'), path.join('/home/test', 'Library', 'Application Support', 'sieve'));
  assert.equal(dataDirectory(env, 'linux'), path.join('/custom/config', 'sieve'));
  assert.equal(dataDirectory({ HOME: '/home/test' }, 'linux'), path.join('/home/test', '.config', 'sieve'));
});