import os from 'node:os';
import path from 'node:path';

export const DEFAULT_REGISTRY = 'https://registry.npmjs.org';
export const DEFAULT_ALLOWLIST_URL = 'https://raw.githubusercontent.com/moshmodo/zero-dep-npm-registry/main/config/registry.json';

export function dataDirectory(env = process.env, platform = process.platform) {
  if (platform === 'win32') return path.join(env.APPDATA || path.join(os.homedir(), 'AppData', 'Roaming'), 'sieve');
  if (platform === 'darwin') return path.join(env.HOME || os.homedir(), 'Library', 'Application Support', 'sieve');
  return path.join(env.XDG_CONFIG_HOME || path.join(env.HOME || os.homedir(), '.config'), 'sieve');
}

export function settings(env = process.env) {
  return {
    host: env.SIEVE_HOST || '127.0.0.1',
    port: Number(env.SIEVE_PORT || 4873),
    mode: env.SIEVE_MODE === 'audit' ? 'audit' : 'enforce',
    upstream: env.SIEVE_UPSTREAM || DEFAULT_REGISTRY,
    allowlistUrl: env.SIEVE_ALLOWLIST_URL || DEFAULT_ALLOWLIST_URL,
    dataDir: env.SIEVE_DATA_DIR || dataDirectory(env)
  };
}