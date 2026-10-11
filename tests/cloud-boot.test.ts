import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { join, resolve, sep } from 'node:path';
import { pathToFileURL } from 'node:url';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import ts from 'typescript';
import { ApiRepository } from '../src/data/apiRepository';
import { DomainError } from '../src/domain/service';

test('Emitted cloud function boots in native Node without tsx or a bundler', async () => {
    const project = resolve('.');
    const parent = join(project, '.sites-runtime');
    await mkdir(parent, { recursive: true });
    const output = await mkdtemp(join(parent, 'cloud-boot-'));
    try {
        const program = ts.createProgram([join(project, 'api/router.ts')], {
            target: ts.ScriptTarget.ES2022,
            module: ts.ModuleKind.ESNext,
            moduleResolution: ts.ModuleResolutionKind.Bundler,
            resolveJsonModule: true,
            esModuleInterop: true,
            strict: true,
            skipLibCheck: true,
            rootDir: project,
            outDir: output,
        });
        const diagnostics = ts.getPreEmitDiagnostics(program);
        assert.equal(diagnostics.length, 0, ts.formatDiagnosticsWithColorAndContext(diagnostics, {
            getCurrentDirectory: () => project,
            getCanonicalFileName: name => name,
            getNewLine: () => '\n',
        }));
        assert.equal(program.emit().emitSkipped, false);
        await writeFile(join(output, 'package.json'), JSON.stringify({ type: 'module' }));
        const entry = pathToFileURL(join(output, 'api/router.js')).href;
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
        const result = await promisify(execFile)(process.execPath, ['--input-type=module', '-e', script], {
            cwd: project, env: environment, timeout: 15000,
        });
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
            await assert.rejects(repository.login('employee@demo.local', 'demo1234'), (error: unknown) => {
                assert(error instanceof DomainError);
                assert.equal(error.code, response.status >= 500 ? 'UNAVAILABLE' : 'API');
                assert.doesNotMatch(error.message, /FUNCTION_INVOCATION_FAILED|stack trace|<html>/);
                return true;
            });
        }
        globalThis.fetch = async () => new Response(JSON.stringify({ message: 'กรุณาเข้าสู่ระบบ', code: 'UNAUTHENTICATED' }), { status: 401 });
        assert.equal(await repository.session(), null);
    } finally { globalThis.fetch = original; }
});
