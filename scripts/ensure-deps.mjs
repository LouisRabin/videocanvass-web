/**
 * Ensures node_modules matches the project lockfile / package.json.
 * Used by npm run startdev and StartDevServer.bat on a fresh machine or after dependency changes.
 */
import { existsSync, rmSync, statSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { applyRollupWasmFallbackOnWindows } from './rollup-wasm-win32-fallback.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
process.chdir(root);

const nm = join(root, 'node_modules');
const vitePkg = join(nm, 'vite', 'package.json');
const lockRoot = join(root, 'package-lock.json');
const lockInner = join(nm, '.package-lock.json');
const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';

function needsInstall() {
  if (!existsSync(nm)) return true;
  if (!existsSync(vitePkg)) return true;
  if (existsSync(lockRoot) && existsSync(lockInner)) {
    try {
      if (statSync(lockRoot).mtimeMs > statSync(lockInner).mtimeMs) return true;
    } catch {
      return true;
    }
  }
  return false;
}

/** @esbuild/* is OS-specific; copying node_modules between Windows and Mac (e.g. OneDrive) leaves the wrong binary. */
function esbuildNativeDirForCurrentPlatform() {
  switch (process.platform) {
    case 'win32':
      if (process.arch === 'ia32') return 'win32-ia32';
      if (process.arch === 'arm64') return 'win32-arm64';
      return 'win32-x64';
    case 'darwin':
      return process.arch === 'arm64' ? 'darwin-arm64' : 'darwin-x64';
    case 'linux':
      if (process.arch === 'arm64') return 'linux-arm64';
      if (process.arch === 'ia32') return 'linux-ia32';
      return 'linux-x64';
    default:
      return null;
  }
}

function repairEsbuildNativePlatform() {
  const tag = esbuildNativeDirForCurrentPlatform();
  if (!tag) return 0;
  if (!existsSync(join(nm, 'esbuild', 'package.json'))) return 0;
  const hostPkg = join(nm, '@esbuild', tag);
  if (existsSync(hostPkg)) return 0;
  console.log(
    `Missing @esbuild/${tag} (common when node_modules is synced from another OS). Re-installing optional native deps...`,
  );
  const esbuildOptionalRoot = join(nm, '@esbuild');
  if (existsSync(esbuildOptionalRoot)) {
    rmSync(esbuildOptionalRoot, { recursive: true, force: true });
  }
  const r = spawnSync(npm, ['install', '--no-audit', '--no-fund'], { stdio: 'inherit', shell: true });
  return r.status ?? 1;
}

/** OneDrive / interrupted installs often leave package.json but no dist/ — Vite then fails to pre-bundle. */
function reinstallPackagesWithMissingFiles() {
  const toInstall = [];
  if (!existsSync(join(nm, '@supabase', 'postgrest-js', 'dist', 'index.mjs'))) {
    toInstall.push('@supabase/postgrest-js');
  }
  if (!existsSync(join(nm, '@supabase', 'storage-js', 'dist', 'index.mjs'))) {
    toInstall.push('@supabase/storage-js');
  }
  if (!existsSync(join(nm, '@supabase', 'realtime-js', 'dist', 'module', 'index.js'))) {
    toInstall.push('@supabase/realtime-js');
  }
  if (!existsSync(join(nm, '@supabase', 'auth-js', 'dist', 'module', 'index.js'))) {
    toInstall.push('@supabase/auth-js');
  }
  if (!existsSync(join(nm, '@supabase', 'functions-js', 'dist', 'module', 'index.js'))) {
    toInstall.push('@supabase/functions-js');
  }
  if (!existsSync(join(nm, 'iceberg-js', 'dist', 'index.mjs'))) {
    toInstall.push('iceberg-js');
  }
  if (!existsSync(join(nm, 'tslib', 'tslib.es6.js'))) {
    toInstall.push('tslib');
  }
  if (!existsSync(join(nm, 'maplibre-gl', 'dist', 'maplibre-gl.d.ts'))) {
    toInstall.push('maplibre-gl');
  }
  if (!existsSync(join(nm, 'react-map-gl', 'dist', 'maplibre.d.ts'))) {
    toInstall.push('react-map-gl');
  }
  if (!existsSync(join(nm, '@vis.gl', 'react-maplibre', 'dist', 'index.d.ts'))) {
    toInstall.push('@vis.gl/react-maplibre');
  }
  if (!existsSync(join(nm, 'magic-string', 'dist', 'magic-string.es.mjs'))) {
    toInstall.push('magic-string');
  }
  if (!existsSync(join(nm, 'hermes-parser', 'dist', 'index.js'))) {
    toInstall.push('hermes-parser');
  }
  if (toInstall.length === 0) return 0;
  console.log(
    'Re-installing packages with missing files (cloud-synced or interrupted installs hurt node_modules; prefer a non-OneDrive copy):',
    toInstall.join(', '),
  );
  const r = spawnSync(npm, ['install', ...toInstall, '--no-audit', '--no-fund'], {
    stdio: 'inherit',
    shell: true,
  });
  return r.status ?? 1;
}

let code = 0;
if (needsInstall()) {
  console.log('Dependencies missing or out of date. Running npm install...');
  const result = spawnSync(npm, ['install'], { stdio: 'inherit', shell: true });
  code = result.status ?? 1;
}
if (code === 0) {
  code = repairEsbuildNativePlatform();
}
if (code === 0) {
  code = reinstallPackagesWithMissingFiles();
}
applyRollupWasmFallbackOnWindows();
process.exit(code);
