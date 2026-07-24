#!/usr/bin/env node
import path from 'node:path';
import { settings } from '../src/config.js';
import { loadAllowlist, readLocalAllowlist, updateLocalAllowlist } from '../src/allowlist.js';
import { startProxy } from '../src/proxy.js';

const config = settings();
const localFile = path.join(config.dataDir, 'allowlist.local.json');
const [command = 'start', packageName] = process.argv.slice(2);

if (command === 'allow' || command === 'deny') {
  if (!packageName) { console.error(`Usage: sieve ${command} <package-name>`); process.exitCode = 2; }
  else { await updateLocalAllowlist(localFile, packageName, command === 'allow'); console.log(`${command === 'allow' ? 'Allowed' : 'Removed'} ${packageName} in ${localFile}`); }
} else if (command === 'start') {
  try {
    const allowlist = await loadAllowlist(config);
    const localAllowlist = await readLocalAllowlist(localFile);
    const server = await startProxy({ ...config, allowlist, localAllowlist });
    console.log(`SIEVE listening at http://${config.host}:${server.address().port} (mode: ${config.mode})`);
  } catch (error) { console.error(`SIEVE failed to start: ${error.message}`); process.exitCode = 1; }
} else {
  console.error('Usage: sieve start | sieve allow <package-name> | sieve deny <package-name>');
  process.exitCode = 2;
}