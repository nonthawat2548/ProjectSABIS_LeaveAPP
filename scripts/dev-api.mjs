import { spawn, spawnSync } from 'node:child_process';
import { resolve } from 'node:path';
import { mkdirSync } from 'node:fs';
import { findGo } from './go.mjs';
try {
  process.loadEnvFile('.env');
} catch (e) {
  if (e.code !== 'ENOENT') throw e;
}
// Starts both processes without shell quoting; works on Windows, macOS and Linux.
const node = process.execPath;
const legacy = process.argv.includes('--legacy');
let api;
if (legacy) {
  api = spawn(
    node,
    [process.argv.includes('--cloud') ? 'server/cloud-dev.js' : 'server/index.js'],
    { stdio: 'inherit', env: process.env },
  );
} else {
  mkdirSync('.sites-runtime', { recursive: true });
  const binary = resolve('.sites-runtime', process.platform === 'win32' ? 'go-api.exe' : 'go-api');
  const build = spawnSync(findGo(), ['build', '-o', binary, './cmd/server'], {
    stdio: 'inherit',
    windowsHide: true,
  });
  if (build.status !== 0) process.exit(build.status ?? 1);
  api = spawn(binary, [], {
    stdio: 'inherit',
    windowsHide: true,
    env: { ...process.env, GO_DATA_MODE: process.argv.includes('--cloud') ? 'postgres' : 'json' },
  });
}
const web = spawn(node, [resolve('node_modules/vite/bin/vite.js'), '--host', '0.0.0.0'], {
  stdio: 'inherit',
  env: { ...process.env, VITE_DATA_MODE: 'api' },
});
let stopping = false;
function stop(code = 0) {
  if (stopping) return;
  stopping = true;
  api.kill();
  web.kill();
  setTimeout(() => process.exit(code), 250);
}
api.on('exit', (code) => stop(code ?? 0));
web.on('exit', (code) => stop(code ?? 0));
process.on('SIGINT', () => stop());
process.on('SIGTERM', () => stop());
