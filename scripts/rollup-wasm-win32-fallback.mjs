/**
 * Vite 7 uses Rollup with a native .node addon. On Windows, that file is often corrupt or a
 * OneDrive placeholder ("not a valid Win32 application"). Re-point rollup/dist/native.js at
 * @rollup/wasm-node (pure WASM) when the NAPI bridge is still present.
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

export function applyRollupWasmFallbackOnWindows() {
  if (process.platform !== 'win32') return;
  const rollupNative = join(root, 'node_modules', 'rollup', 'dist', 'native.js');
  const wasmNative = join(root, 'node_modules', '@rollup', 'wasm-node', 'dist', 'native.js');
  if (!existsSync(rollupNative) || !existsSync(wasmNative)) return;
  let body;
  try {
    body = readFileSync(rollupNative, 'utf8');
  } catch {
    return;
  }
  if (body.includes('bindings_wasm.js')) return;
  if (!body.includes('bindingsByPlatformAndArch')) return;
  const stub =
    '// Patched by scripts/rollup-wasm-win32-fallback.mjs — Rollup WASM (native .node broken).\n' +
    "module.exports = require('@rollup/wasm-node/dist/native.js');\n";
  writeFileSync(rollupNative, stub, 'utf8');
}

const ranAsScript =
  process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url));
if (ranAsScript) {
  applyRollupWasmFallbackOnWindows();
}
