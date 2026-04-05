/**
 * Ensures node_modules matches the project lockfile / package.json.
 * Used by npm run startdev and StartDevServer.bat on a fresh machine or after dependency changes.
 */
import { existsSync, statSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
process.chdir(root);

const nm = join(root, 'node_modules');
const vitePkg = join(nm, 'vite', 'package.json');
const lockRoot = join(root, 'package-lock.json');
const lockInner = join(nm, '.package-lock.json');

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

if (!needsInstall()) {
  process.exit(0);
}

console.log('Dependencies missing or out of date. Running npm install...');
const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';
const result = spawnSync(npm, ['install'], { stdio: 'inherit', shell: true });
process.exit(result.status ?? 1);
