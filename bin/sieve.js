#!/usr/bin/env node
import path from 'node:path';
import { spawn } from 'node:child_process';
import { settings } from '../src/config.js';
import { loadAllowlist, readLocalAllowlist, updateLocalAllowlist } from '../src/allowlist.js';
import { startProxy } from '../src/proxy.js';

const config = settings();
const localFile = path.join(config.dataDir, 'allowlist.local.json');
const args = process.argv.slice(2);
const [command, packageName] = args;

const npmCommand = process.platform === 'win32' ? 'npm.cmd' : 'npm';
const npmSpawnOptions = {
  stdio: 'inherit',
  // npm.cmd is a Windows command script, not a directly executable binary.
  // It must be launched through the shell or Node fails with spawn EINVAL.
  shell: process.platform === 'win32'
};

function runNpm(args) {
  return new Promise((resolve, reject) => {
    const child = spawn(npmCommand, args, npmSpawnOptions);
    child.once('error', reject);
    child.once('close', (code, signal) => {
      if (code === 0) resolve({ code, signal });
      else reject(new Error(`npm ${args.join(' ')} exited with ${signal || `code ${code}`}`));
    });
  });
}

async function startWithNpmRegistry() {
  const registry = process.env.SIEVE_HOST && process.env.SIEVE_PORT
    ? `http://${process.env.SIEVE_HOST}:${process.env.SIEVE_PORT}`
    : 'http://127.0.0.1:4873';
  let cleanedUp = false;

  const cleanup = async () => {
    if (cleanedUp) return;
    cleanedUp = true;
    try {
      await runNpm(['config', 'delete', 'registry']);
    } catch (error) {
      console.error(`SIEVE failed to restore npm registry: ${error.message}`);
    }
  };

  try {
    await runNpm(['config', 'set', 'registry', registry]);
    const child = spawn(npmCommand, ['start'], npmSpawnOptions);
    let stopping = false;

    const stop = signal => {
      if (stopping) return;
      stopping = true;
      child.kill(signal);
    };
    process.once('SIGINT', () => stop('SIGINT'));
    process.once('SIGTERM', () => stop('SIGTERM'));

    const result = await new Promise((resolve, reject) => {
      child.once('error', reject);
      child.once('close', (code, signal) => resolve({ code, signal }));
    });
    await cleanup();
    process.exitCode = result.code ?? 1;
  } catch (error) {
    await cleanup();
    console.error(`SIEVE failed to run npm: ${error.message}`);
    process.exitCode = 1;
  }
}

if (args.length === 0) {
  await startWithNpmRegistry();
} else if (command === 'allow' || command === 'deny') {
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