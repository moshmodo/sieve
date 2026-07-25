```                      
       ▀▀                  
 ▄██▀█ ██ ▄█▀█▄▀█▄ ██▀▄█▀█▄
 ▀███▄ ██ ██▄█▀ ██▄██ ██▄█▀
█▄▄██▀▄██▄▀█▄▄▄  ▀█▀ ▄▀█▄▄▄
                           
```
![Zero Dependency Badge](https://img.shields.io/badge/%F0%9F%92%9A%20Zero%20dependency-B6DBC1?style=flat&link=https%3A%2F%2Fgithub.com%2Fmoshmodo%2Fzero-dep-npm-registry)

SIEVE is a local, zero-dependency npm registry proxy. It helps keep dependency
choices explicit by checking packages against the allowlist published in
[`moshmodo/zero-dep-npm-registry`](https://github.com/moshmodo/zero-dep-npm-registry/blob/main/config/registry.json).

## Status

This is an early MVP. It requires **Node.js 18 or newer** and has no runtime or
development dependencies. The implementation uses only Node.js built-ins.

## How it works

SIEVE listens on `127.0.0.1` and forwards requests to the public npm registry.
It downloads and validates the GitHub allowlist at startup, caching the
last valid copy under the platform configuration directory. If GitHub is
unavailable, the cache is used with an explicit warning. Startup fails closed
when neither source is available.

The default mode is `enforce`: a package absent from the official or local
allowlist receives `403 Forbidden` with an English JSON explanation. Set
`SIEVE_MODE=audit` to forward disallowed requests while logging them.

When package metadata is returned, SIEVE inspects `dependencies`,
`optionalDependencies`, and `peerDependencies`. Missing transitive packages are
reported in structured logs. A proxy cannot reliably pause an `npm install` and
ask an interactive question, so the workflow is: inspect the log, decide, add a
package to the local allowlist, and rerun npm.

## Quick start

There are two primary ways to run SIEVE:

### 1. Recommended: Using `npx` (Easiest for quick use and testing)

This method downloads and runs the latest published version of SIEVE and automatically configures your npm client to use it. It also restores npm's default registry when SIEVE exits.

```sh
npx sieve
```

This command will start SIEVE and set your npm registry to `http://127.0.0.1:4873` (or the configured `SIEVE_HOST` and `SIEVE_PORT`). You can then run your npm commands as usual in a separate terminal:

```sh
npm install <package-name>
```

When SIEVE exits, your npm registry will be automatically reset to `https://registry.npmjs.org/`.

### 2. For Local Development: Running from the Repository

If you have cloned this repository and want to run SIEVE directly from your local copy (e.g., to test changes you've made), use the `npm start` command.

```sh
npm start
```

This command starts the SIEVE proxy but **does not** automatically configure your npm client. You will need to manually set the registry in a separate terminal:

```sh
npm config set registry http://127.0.0.1:4873
```

After starting SIEVE with `npm start` and configuring your npm registry, you can install packages:

```sh
npm install <package-name>
```

**Important:** Remember to restore your npm registry to the public one when you are finished:

```sh
npm config delete registry
# or: npm config set registry https://registry.npmjs.org/
```

In another terminal, configure npm to use the local proxy:

```sh
npm config set registry http://127.0.0.1:4873
npm install <package-name>
```

Restore the public registry when finished:

```sh
npm config delete registry
# or: npm config set registry https://registry.npmjs.org/
```

## Local allowlist commands

The local allowlist and the GitHub cache are stored in the platform's standard
application-data directory:

| Platform | Directory |
| --- | --- |
| Windows | `%APPDATA%/sieve` (normally `AppData/Roaming`) |
| macOS | `~/Library/Application Support/sieve` |
| Linux and other Unix systems | `$XDG_CONFIG_HOME/sieve`, or `~/.config/sieve` |

The local allowlist is saved as `allowlist.local.json` and the GitHub cache as
`registry.json` within that directory.

```sh
node bin/sieve.js allow <package-name>
node bin/sieve.js deny <package-name>
```

The local allowlist is intentionally separate from the GitHub-controlled list.
It is an explicit developer override and should be reviewed like source code.

## Configuration

Environment variables:

| Variable | Default | Purpose |
| --- | --- | --- |
| `SIEVE_HOST` | `127.0.0.1` | Bind address; keep loopback for local-only use |
| `SIEVE_PORT` | `4873` | Listening port |
| `SIEVE_MODE` | `enforce` | `enforce` or `audit` |
| `SIEVE_UPSTREAM` | `https://registry.npmjs.org` | Upstream registry |
| `SIEVE_ALLOWLIST_URL` | GitHub raw `registry.json` URL | Official allowlist source |
| `SIEVE_DATA_DIR` | Platform config directory | Cache and local allowlist location |

For example:

```sh
SIEVE_MODE=audit SIEVE_PORT=4874 npm start
```

## Security and limitations

- SIEVE is local-only by default and does not provide HTTPS or authentication.
  Do not bind it to a network interface without adding an authenticated,
  encrypted boundary.
- All HTTP methods are forwarded through SIEVE, but package routes are checked
  against the allowlist. This keeps npm's normal request flow intact while
  still blocking unlisted packages.
- Audit mode reports disallowed metadata but does not enforce it.
- Metadata inspection reports declared transitive dependencies; it cannot fully
  model npm's resolved graph, platform-specific optional dependencies, install
  scripts, or packages embedded in tarballs.
- npm may use cache behavior and lockfiles. Enforcement is strongest when npm is
  configured to use SIEVE consistently and the lockfile is reviewed.
- The GitHub list is trusted input. SIEVE validates its JSON and requires at
  least one package name, but it does not cryptographically sign the file.
- “No dependencies” means SIEVE itself has no npm dependencies. Node.js and npm
  remain required, and packages installed through SIEVE can of course have their
  own dependencies.

## Tests

Run the built-in Node test suite:

```sh
npm test
```

Tests use local HTTP servers and Node's built-in `node:test`; no network or
third-party package is required.
