// Locate Go on PATH, or a standard Windows installation. No toolchain is vendored.
import { spawn, spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

export function findGo() {
  const candidates = [process.env.GO_BINARY, 'go'];
  if (process.platform === 'win32') {
    for (const root of [
      process.env.ProgramFiles,
      process.env.LOCALAPPDATA && join(process.env.LOCALAPPDATA, 'Programs'),
    ]) {
      if (root) candidates.push(join(root, 'Go', 'bin', 'go.exe'));
    }
  }
  for (const command of candidates.filter(Boolean)) {
    if (command !== 'go' && !existsSync(command)) continue;
    if (spawnSync(command, ['version'], { windowsHide: true }).status === 0) return command;
  }
  throw new Error('ไม่พบ Go กรุณาติดตั้ง Go 1.26 ขึ้นไป แล้วเปิด Terminal ใหม่');
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const child = spawn(findGo(), process.argv.slice(2), { stdio: 'inherit', windowsHide: true });
  child.on('error', (error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
  child.on('exit', (code) => {
    process.exitCode = code ?? 1;
  });
}
