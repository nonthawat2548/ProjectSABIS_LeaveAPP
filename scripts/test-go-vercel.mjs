// Reproduce @vercel/go's module rewrite and generated api/*.go wrapper in a
// temporary project. No .env, runtime data or online database is copied/read.
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { cp, mkdir, mkdtemp, readFile, realpath, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { findGo } from './go.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const testRoot = await realpath(tmpdir());
const temporary = await mkdtemp(join(testRoot, 'leave-vercel-build-'));
try {
  for (const folder of ['api', 'internal', 'serverless']) {
    await cp(join(root, folder), join(temporary, folder), {
      recursive: true,
      filter: (file) => !file.endsWith('_test.go'),
    });
  }
  await mkdir(join(temporary, 'src/data'), { recursive: true });
  for (const file of ['seed.go', 'leave-management-10-people.json']) {
    await cp(join(root, 'src/data', file), join(temporary, 'src/data', file));
  }
  const originalModule = await readFile(join(root, 'go.mod'), 'utf8');
  const moduleName = originalModule.match(/^module\s+(\S+)/m)[1];
  const apiPath = join(temporary, 'api/go.go');
  const apiSource = await readFile(apiPath, 'utf8');
  const packageName = apiSource.match(/^package\s+(\w+)/m)[1];
  const wrappedModule = originalModule.replace(/^module\s+.+$/m, `module ${packageName}`);
  const alias =
    moduleName === packageName
      ? ''
      : `\nrequire ${moduleName} v0.0.0-unpublished\nreplace ${moduleName} => ./\n`;
  await writeFile(join(temporary, 'go.mod'), wrappedModule + alias);
  await cp(join(root, 'go.sum'), join(temporary, 'go.sum'));
  await writeFile(apiPath, apiSource.replace(/ Handler\b/g, ' Handler_api_go_go'));
  await writeFile(
    join(temporary, 'main__vc__go__.go'),
    `package main
import (
  "net/http"
  "${packageName}/api"
)
var _ http.HandlerFunc = ${packageName}.Handler_api_go_go
func main() {}
`,
  );
  const binary = join(temporary, 'bootstrap');
  async function build(captureError = false) {
    const child = spawn(
      findGo(),
      ['build', '-mod=mod', '-ldflags', '-s -w', '-o', binary, 'main__vc__go__.go'],
      {
        cwd: temporary,
        stdio: captureError ? ['ignore', 'ignore', 'pipe'] : 'inherit',
        windowsHide: true,
        env: { ...process.env, GOOS: 'linux', GOARCH: 'amd64', CGO_ENABLED: '0', GOWORK: 'off' },
      },
    );
    let error = '';
    if (captureError)
      child.stderr.on('data', (chunk) => {
        error += chunk;
      });
    const code = await new Promise((resolve, reject) => {
      child.on('error', reject);
      child.on('close', resolve);
    });
    return { code, error };
  }

  // Confirm this harness catches the deployed failure before testing the fix.
  // The fixture is otherwise valid Go, but its import crosses internal's boundary.
  await writeFile(
    apiPath,
    `package ${packageName}
import (
  "net/http"
  "${moduleName}/internal/app"
)
var _ = app.NewCloud
func Handler_api_go_go(w http.ResponseWriter, r *http.Request) {}
`,
  );
  const failed = await build(true);
  assert.notEqual(failed.code, 0, 'Direct internal import unexpectedly compiled in Vercel wrapper');
  assert.match(failed.error, /use of internal package .*\/internal\/app not allowed/);
  console.log('Vercel-style Go wrapper: original internal-import failure reproduced');

  await writeFile(apiPath, apiSource.replace(/ Handler\b/g, ' Handler_api_go_go'));
  const { code } = await build();
  assert.equal(code, 0, 'Vercel-style Go wrapper failed to build');
  const bytes = await readFile(binary);
  assert.deepEqual(bytes.subarray(0, 4), Buffer.from([0x7f, 0x45, 0x4c, 0x46]));
  console.log('Vercel-style Go wrapper: Linux/amd64 build passed');
} finally {
  assert.equal(dirname(await realpath(temporary)), testRoot);
  assert(basename(temporary).startsWith('leave-vercel-build-'));
  await rm(temporary, { recursive: true, force: true });
}
