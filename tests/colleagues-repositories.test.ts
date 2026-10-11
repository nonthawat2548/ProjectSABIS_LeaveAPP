import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { JSDOM } from 'jsdom';
import { IDBFactory, IDBObjectStore as FakeObjectStore } from 'fake-indexeddb';
import { BrowserRepository } from '../src/data/browserRepository';
import { ApiRepository } from '../src/data/apiRepository';
import { createDemoDatabase } from '../src/data/demoDatabase';
import { DomainError } from '../src/domain/service';
import { searchColleagues } from '../src/domain/colleagues';
import { addDays, today } from '../src/domain/date';
import { pdfAttachment, requestWithAttachment } from './upload-fixtures';

test('IndexedDB colleague lookup requires a session, uses minimal data and skips attachment chunks', async (t) => {
  const dom = new JSDOM('', { url: 'http://localhost/' });
  const replacements = {
    indexedDB: new IDBFactory(),
    sessionStorage: dom.window.sessionStorage,
    window: new EventTarget(),
    BroadcastChannel: undefined,
  };
  const originals = new Map(
    Object.keys(replacements).map((name) => [
      name,
      Object.getOwnPropertyDescriptor(globalThis, name),
    ]),
  );
  for (const [name, value] of Object.entries(replacements))
    Object.defineProperty(globalThis, name, { configurable: true, writable: true, value });
  const originalGet = FakeObjectStore.prototype.get;
  let chunkReads = 0;
  t.after(() => {
    FakeObjectStore.prototype.get = originalGet;
    dom.window.close();
    for (const [name, descriptor] of originals) {
      if (descriptor) Object.defineProperty(globalThis, name, descriptor);
      else Reflect.deleteProperty(globalThis, name);
    }
  });
  const repository = new BrowserRepository(),
    full = createDemoDatabase(),
    date = '2026-12-05';
  await assert.rejects(
    repository.searchColleagues('8', date),
    (error: unknown) => error instanceof DomainError && error.code === 'UNAUTHENTICATED',
  );
  for (const email of [
    'employee@demo.local',
    'manager@demo.local',
    'sales-manager@demo.local',
    'hr@demo.local',
  ]) {
    const actor = await repository.login(email, '1234');
    assert.deepEqual(
      await repository.searchColleagues('EMP-00008', date),
      searchColleagues(full, actor.id, '8', date),
    );
    assert.deepEqual(
      await repository.searchColleagues('', date),
      searchColleagues(full, actor.id, '', date),
    );
  }
  await repository.login('employee@demo.local', '1234');
  let on = addDays(today(), 20);
  while ([0, 6].includes(new Date(on + 'T00:00:00Z').getUTCDay())) on = addDays(on, 1);
  const input = requestWithAttachment(pdfAttachment(3 * 1024 * 1024), on);
  input.leaveTypeId = 2;
  await repository.execute({ type: 'submit', input });
  FakeObjectStore.prototype.get = function (key) {
    if (Array.isArray(key) && key[0] === 'document') chunkReads++;
    return originalGet.call(this, key);
  };
  const results = await repository.searchColleagues('8', date);
  assert.equal(results.length, 1);
  assert.equal(
    chunkReads,
    0,
    'Looking up work availability must not decode unrelated large documents',
  );
  assert(!('documents' in results[0]));
  const before = await repository.snapshot();
  assert(before.requests.every((request) => request.employeeId === 1));
  await repository.searchColleagues('8', date);
  assert.deepEqual(await repository.snapshot(), before);
  await repository.logout();
  await assert.rejects(repository.searchColleagues('8', date), DomainError);
});

test('HTTP colleague lookup authenticates on the server and preserves private snapshot scope and the database', async (t) => {
  const folder = await mkdtemp(join(tmpdir(), 'leave-colleagues-')),
    file = join(folder, 'db.json');
  const full = createDemoDatabase(),
    date = '2026-12-05';
  full.workStatuses.push({
    id: 999,
    employeeId: 8,
    date,
    statusType: 'Outside',
    updatedAt: '2026-12-05T02:00:00Z',
  });
  await writeFile(file, JSON.stringify(full));
  const before = await readFile(file, 'utf8');
  const child = spawn(process.execPath, ['--import', 'tsx', 'server/index.ts'], {
    cwd: process.cwd(),
    env: { ...process.env, MOCK_PORT: '0', MOCK_HOST: '127.0.0.1', MOCK_DATA_FILE: file },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  t.after(async () => {
    if (child.exitCode === null && child.signalCode === null) {
      const stopped = new Promise<void>((accept) => child.once('exit', () => accept()));
      child.kill('SIGTERM');
      await stopped;
    }
    assert.equal(dirname(resolve(folder)), resolve(tmpdir()));
    await rm(folder, { recursive: true, force: true });
  });
  const base = await new Promise<string>((accept, reject) => {
    let output = '',
      errors = '';
    const timer = setTimeout(() => {
      child.kill('SIGTERM');
      reject(new Error('Colleague API startup timed out: ' + errors));
    }, 10000);
    child.stderr.on('data', (data) => {
      errors += String(data);
    });
    child.stdout.on('data', (data) => {
      output += String(data);
      const match = output.match(/Mock API: (http:\/\/127\.0\.0\.1:\d+\/api)/);
      if (match) {
        clearTimeout(timer);
        accept(match[1]);
      }
    });
    child.once('error', (error) => {
      clearTimeout(timer);
      reject(error);
    });
    child.once('exit', (code) => {
      clearTimeout(timer);
      reject(new Error('Colleague API exited: ' + code + ': ' + errors));
    });
  });
  const search = (query: string, on = date, cookie?: string) =>
    fetch(
      base + '/colleagues?' + new URLSearchParams({ query, date: on, actorId: '5', role: 'HR' }),
      { headers: cookie ? { Cookie: cookie } : {} },
    );
  assert.equal((await search('8')).status, 401);
  for (const email of [
    'employee@demo.local',
    'manager@demo.local',
    'sales-manager@demo.local',
    'hr@demo.local',
  ]) {
    const login = await fetch(base + '/session', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password: '1234' }),
    });
    const actor = (await login.json()).employee;
    const cookie = login.headers.get('set-cookie')!.split(';')[0];
    const response = await search('EMP-00008', date, cookie);
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), searchColleagues(full, actor.id, '8', date));
    assert.deepEqual(
      await (await search('', date, cookie)).json(),
      searchColleagues(full, actor.id, '', date),
    );
    const unfiltered = await fetch(base + '/colleagues?date=' + date, {
      headers: { Cookie: cookie },
    });
    assert.deepEqual(await unfiltered.json(), searchColleagues(full, actor.id, '', date));
    const person = full.employees.find((e) => e.id === 8)!;
    assert.equal((await (await search(person.name, date, cookie)).json())[0].employeeId, 8);
    for (const [query, on] of [
      ['ก'.repeat(101), date],
      ['8', '5/12/2569'],
      ['8', '2026-02-30'],
    ])
      assert.equal((await search(query, on, cookie)).status, 400);
    assert.deepEqual(await (await search('ไม่มีชื่อนี้', date, cookie)).json(), []);
    if (actor.id === 1) {
      const snapshot = await (
        await fetch(base + '/snapshot', { headers: { Cookie: cookie } })
      ).json();
      assert(snapshot.requests.every((r: { employeeId: number }) => r.employeeId === 1));
      assert(!snapshot.employees.some((e: { id: number }) => e.id === 8));
    }
  }
  // Search is read-only. Login persists identical JSON using the server's regular formatting.
  assert.deepEqual(JSON.parse(await readFile(file, 'utf8')), JSON.parse(before));
});

test('API adapter encodes Thai names and Gregorian dates without sending actor or role', async (t) => {
  const original = globalThis.fetch,
    calls: { url: string; options?: RequestInit }[] = [];
  t.after(() => {
    globalThis.fetch = original;
  });
  const expected = searchColleagues(createDemoDatabase(), 1, '8', '2026-12-05');
  globalThis.fetch = async (url, options) => {
    calls.push({ url: String(url), options });
    return new Response(JSON.stringify(expected), {
      headers: { 'Content-Type': 'application/json' },
    });
  };
  const repository = new ApiRepository('http://localhost/api');
  assert.deepEqual(await repository.searchColleagues('ชุติมา แสงทอง', '2026-12-05'), expected);
  const url = new URL(calls[0].url);
  assert.equal(url.pathname, '/api/colleagues');
  assert.equal(url.searchParams.get('query'), 'ชุติมา แสงทอง');
  assert.equal(url.searchParams.get('date'), '2026-12-05');
  assert(!url.searchParams.has('actorId') && !url.searchParams.has('role'));
  assert.equal(calls[0].options?.credentials, 'include');
  assert.equal(calls[0].options?.method, 'GET');
});
