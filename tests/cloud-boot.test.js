import { test } from 'node:test';
import assert from 'node:assert/strict';
import { copyFile, mkdir, mkdtemp, readdir, rm, writeFile } from 'node:fs/promises';
import { join, resolve, sep } from 'node:path';
import { pathToFileURL } from 'node:url';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { ApiRepository } from '../src/data/apiRepository.js';
import { DomainError } from '../src/domain/service.js';
test('Previous Node cloud reference boots with native JavaScript and no compiler or bundler', async () => {
  const project = resolve('.');
  const parent = join(project, '.sites-runtime');
  await mkdir(parent, { recursive: true });
  const output = await mkdtemp(join(parent, 'cloud-boot-'));
  try {
    for (const directory of ['server', 'src/domain', 'src/data']) {
      await mkdir(join(output, directory), { recursive: true });
      const names =
        directory === 'src/data'
          ? ['demoDatabase.js', 'leave-management-10-people.json']
          : (await readdir(join(project, directory))).filter((name) => name.endsWith('.js'));
      for (const name of names)
        await copyFile(join(project, directory, name), join(output, directory, name));
    }
    await writeFile(join(output, 'package.json'), JSON.stringify({ type: 'module' }));
    const entry = pathToFileURL(join(output, 'server/referenceHandler.js')).href;
    const environment = { ...process.env };
    delete environment.POSTGRES_URL;
    delete environment.DATABASE_URL;
    delete environment.ENABLE_DEMO_LOGIN;
    delete environment.NODE_OPTIONS;
    const script = `
            import assert from 'node:assert/strict';
            const { default: api } = await import(${JSON.stringify(entry)});
            assert.equal(typeof api.fetch, 'function');
            for (const path of ['/api/health', '/api/router?endpoint=health', '/api/session']) {
                const response = await api.fetch(new Request('https://leave.test' + path));
                assert.equal(response.headers.get('content-type'), 'application/json; charset=utf-8');
                const error = await response.json();
                assert.equal(response.status, 503);
                assert.equal(error.code, 'UNAVAILABLE');
            }
            const login = await api.fetch(new Request('https://leave.test/api/session', {method:'POST',body:'{}'}));
            assert.equal(login.status,503);
            assert.equal((await login.json()).code,'UNAVAILABLE');
            console.log('native-cloud-boot-ok');
        `;
    const result = await promisify(execFile)(
      process.execPath,
      ['--input-type=module', '-e', script],
      {
        cwd: project,
        env: environment,
        timeout: 15000,
      },
    );
    assert.match(result.stdout, /native-cloud-boot-ok/);
  } finally {
    assert(output.startsWith(parent + sep), 'Cleanup must stay within the test directory');
    await rm(output, { recursive: true, force: true });
  }
});
test('API adapter rejects platform errors and invalid successful responses without showing their contents', async () => {
  const original = globalThis.fetch;
  try {
    const repository = new ApiRepository('https://leave.test/api');
    for (const response of [
      new Response('FUNCTION_INVOCATION_FAILED private stack trace', { status: 500 }),
      new Response('<html>Deployment unavailable</html>', { status: 503 }),
      new Response('<html>SPA fallback</html>', { status: 200 }),
      new Response('null', { status: 200, headers: { 'Content-Type': 'application/json' } }),
      new Response('"unexpected"', { status: 200 }),
    ]) {
      globalThis.fetch = async () => response;
      await assert.rejects(repository.login('employee@demo.local', '1234'), (error) => {
        assert(error instanceof DomainError);
        assert.equal(error.code, response.status >= 500 ? 'UNAVAILABLE' : 'API');
        assert.doesNotMatch(error.message, /FUNCTION_INVOCATION_FAILED|stack trace|<html>/);
        return true;
      });
    }
    globalThis.fetch = async () =>
      new Response(JSON.stringify({ message: 'กรุณาเข้าสู่ระบบ', code: 'UNAUTHENTICATED' }), {
        status: 401,
      });
    assert.equal(await repository.session(), null);
  } finally {
    globalThis.fetch = original;
  }
});
