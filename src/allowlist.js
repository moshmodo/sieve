import fs from 'node:fs/promises';
import path from 'node:path';

function packageNames(value, output = new Set()) {
  if (Array.isArray(value)) {
    for (const item of value) {
      if (typeof item === 'string') output.add(item);
      else if (item && typeof item === 'object') {
        // Registry entries contain many descriptive fields. Only npmName
        // identify packages that are actually allowed.
        if ('npmName' in item) packageNames(item.npmName, output);
        else packageNames(item, output);
      }
    }
    return output;
  }
  if (value && typeof value === 'object') {
    if ('npmName' in value) return packageNames(value.npmName, output);
    for (const [key, item] of Object.entries(value)) {
      if (typeof item === 'boolean') {
        if (item) output.add(key);
      } else if (Array.isArray(item)) {
        // Keep supporting a simple grouped format such as
        // { "packages": ["left-pad"] }, but do not inspect arbitrary
        // descriptive arrays such as keywords.
        if (key === 'packages' || key === 'npmName') packageNames(item, output);
      } else if (item && typeof item === 'object') {
        // Preserve the historical object format where package names are keys.
        if (key.startsWith('@') || /^[a-z0-9][a-z0-9._~-]*$/i.test(key)) {
          if (!('name' in item) && !('fullName' in item)) output.add(key);
        }
        if (key === 'npmName' || key === 'packages') packageNames(item, output);
      } else if (key.startsWith('@') || /^[a-z0-9][a-z0-9._~-]*$/i.test(key)) output.add(key);
    }
  }
  return output;
}

export function normalizePackageName(name) {
  return decodeURIComponent(name).replace(/^\/+|\/+$/g, '').replace(/\\/g, '/');
}

export function namesFromRegistryJson(json) {
  const names = packageNames(json);
  // The upstream list has historically been an object; accepting arrays makes
  // the cache format resilient to future registry.json revisions.
  return new Set([...names].map(normalizePackageName).filter(Boolean));
}

export async function readNames(file) {
  const json = JSON.parse(await fs.readFile(file, 'utf8'));
  return namesFromRegistryJson(json);
}

export async function loadAllowlist({ dataDir, url, allowlistUrl, fetchImpl = fetch, log = console }) {
  const sourceUrl = url || allowlistUrl;
  if (!sourceUrl) throw new Error('No allowlist URL was configured. Set SIEVE_ALLOWLIST_URL.');
  await fs.mkdir(dataDir, { recursive: true });
  const cache = path.join(dataDir, 'registry.json');
  let remoteError;
  try {
    const response = await fetchImpl(sourceUrl);
    if (!response.ok) throw new Error(`GitHub returned HTTP ${response.status}`);
    const text = await response.text();
    const names = namesFromRegistryJson(JSON.parse(text));
    if (!names.size) throw new Error('registry.json contains no package names');
    await fs.writeFile(cache, text + '\n', 'utf8');
    log.info(`Loaded ${names.size} allowed packages from GitHub.`);
    return names;
  } catch (error) {
    remoteError = error;
  }
  try {
    const names = await readNames(cache);
    if (!names.size) throw new Error('cached registry.json contains no package names');
    log.warn(`GitHub unavailable (${remoteError.message}); using the last valid local allowlist.`);
    return names;
  } catch (cacheError) {
    throw new Error(`Cannot load the allowlist from GitHub and no valid cache exists: ${remoteError.message}`);
  }
}

export async function readLocalAllowlist(file) {
  try { return await readNames(file); } catch (error) {
    if (error.code === 'ENOENT') return new Set();
    throw error;
  }
}

export async function updateLocalAllowlist(file, name, allowed) {
  const names = await readLocalAllowlist(file);
  name = normalizePackageName(name);
  if (allowed) names.add(name); else names.delete(name);
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, JSON.stringify([...names].sort(), null, 2) + '\n');
  return names;
}