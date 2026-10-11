import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import type { Database } from '../src/domain/types';
import { loginUsername } from '../src/domain/auth';

function startServer(file: string) {
  const child = spawn(process.execPath, ['--import', 'tsx', 'server/index.ts'], {
    cwd: process.cwd(),
    env: { ...process.env, MOCK_PORT: '0', MOCK_HOST: '127.0.0.1', MOCK_DATA_FILE: file },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  const ready = new Promise<string>((resolve, reject) => {
    let output = '',
      errors = '';
    const t = setTimeout(() => {
      child.kill('SIGTERM');
      reject(new Error('Mock API did not start: ' + errors));
    }, 10000);
    child.stderr.on('data', (d) => {
      errors += String(d);
    });
    child.stdout.on('data', (d) => {
      output += String(d);
      const match = output.match(/Mock API: (http:\/\/127\.0\.0\.1:\d+\/api)/);
      if (match) {
        clearTimeout(t);
        resolve(match[1]);
      }
    });
    child.once('error', (e) => {
      clearTimeout(t);
      reject(e);
    });
    child.once('exit', (c) => {
      clearTimeout(t);
      reject(new Error('Mock API exited ' + c + ': ' + errors));
    });
  });
  return { child, ready };
}

async function stopServer(server: ReturnType<typeof startServer>) {
  if (server.child.exitCode !== null || server.child.signalCode !== null) return;
  const stopped = new Promise<void>((resolve) => server.child.once('exit', () => resolve()));
  server.child.kill('SIGTERM');
  await stopped;
}

test('Real HTTP API: ten-person data, role rules, persistence, restart and HR reset', async () => {
  const folder = await mkdtemp(join(tmpdir(), 'leave-api-test-'));
  const file = join(folder, 'db.json');
  let server = startServer(file);
  try {
    let base = await server.ready;
    const session = async (email: string) => {
      const response = await fetch(base + '/session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password: '1234' }),
      });
      assert.equal(response.status, 200);
      return response.headers.get('set-cookie')!.split(';')[0];
    };
    const get = async (cookie?: string) =>
      fetch(base + '/snapshot', { headers: cookie ? { Cookie: cookie } : {} });
    const snapshot = async (cookie: string): Promise<Database> => {
      const response = await get(cookie);
      assert.equal(response.status, 200);
      return response.json();
    };
    const send = async (cookie: string, command: unknown) =>
      fetch(base + '/commands', {
        method: 'POST',
        headers: { Cookie: cookie, 'Content-Type': 'application/json' },
        body: JSON.stringify(command),
      });
    const reset = async (cookie?: string) =>
      fetch(base + '/demo/reset', { method: 'POST', headers: cookie ? { Cookie: cookie } : {} });
    const readDatabase = async (): Promise<Database> => JSON.parse(await readFile(file, 'utf8'));
    const version = async (cookie: string, id: number) =>
      (await snapshot(cookie)).requests.find((r) => r.id === id)!.version;

    assert.equal((await get()).status, 401);
    assert.equal((await reset()).status, 401);
    const employee = await session('employee@demo.local'),
      manager = await session('manager@demo.local'),
      hr = await session('hr@demo.local'),
      salesManager = await session('sales-manager@demo.local');
    const initial = await readDatabase();
    const hrSnapshot = await snapshot(hr);
    assert.equal(hrSnapshot.employees.length, 10);
    assert.equal(hrSnapshot.employees.filter((e) => e.role === 'Employee').length, 7);
    assert.equal(hrSnapshot.employees.filter((e) => e.role === 'Manager').length, 2);
    assert.equal(hrSnapshot.employees.filter((e) => e.role === 'HR').length, 1);
    assert.equal(hrSnapshot.requests.length, 14);
    assert.deepEqual(
      initial,
      JSON.parse(await readFile('src/data/leave-management-10-people.json', 'utf8')),
    );

    for (const account of initial.employees) {
      const cookie = await session(` ${loginUsername(account.email).toUpperCase()} `);
      const current = await fetch(base + '/session', { headers: { Cookie: cookie } });
      assert.equal((await current.json()).employee.id, account.id);
      const scoped = await snapshot(cookie);
      if (account.role === 'Employee')
        assert(scoped.requests.every((r) => r.employeeId === account.id));
    }
    for (const credentials of [
      null,
      { email: 'pimchanok.w', password: 'demo1234' },
      { email: 'missing', password: '1234' },
      { email: 1, password: '1234' },
      ...['employee', 'manager', 'hr', 'sales-manager', 'other'].map((email) => ({
        email,
        password: '1234',
      })),
    ]) {
      const denied = await fetch(base + '/session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(credentials),
      });
      assert.equal(denied.status, 401);
      assert.equal(denied.headers.get('set-cookie'), null);
    }

    const employeeSnapshot = await snapshot(employee);
    assert(employeeSnapshot.requests.every((r) => r.employeeId === 1));
    const salesSnapshot = await snapshot(salesManager);
    const salesEmployeeIds = new Set(
      hrSnapshot.employees.filter((e) => e.id === 7 || e.managerId === 7).map((e) => e.id),
    );
    assert.deepEqual(
      salesSnapshot.requests.map((r) => r.id).sort(),
      hrSnapshot.requests
        .filter((r) => salesEmployeeIds.has(r.employeeId))
        .map((r) => r.id)
        .sort(),
    );
    assert(!salesSnapshot.employees.some((e) => e.id === 1));
    assert(salesSnapshot.entitlements.every((e) => salesEmployeeIds.has(e.employeeId)));
    const salesRequestIds = new Set(salesSnapshot.requests.map((r) => r.id));
    assert(salesSnapshot.documents.every((d) => salesRequestIds.has(d.leaveId)));
    assert(salesSnapshot.days.every((d) => salesRequestIds.has(d.leaveId)));
    assert(salesSnapshot.approvals.every((a) => salesRequestIds.has(a.leaveId)));

    assert.equal(
      (
        await send(employee, {
          type: 'approve',
          id: 1001,
          version: await version(employee, 1001),
          comment: '',
        })
      ).status,
      403,
    );
    assert.equal(
      (
        await send(salesManager, {
          type: 'approve',
          id: 1001,
          version: await version(hr, 1001),
          comment: '',
        })
      ).status,
      403,
    );
    assert.equal(
      (
        await send(manager, {
          type: 'approve',
          id: 1006,
          version: await version(hr, 1006),
          comment: '',
        })
      ).status,
      403,
    );
    assert.equal((await reset(employee)).status, 403);
    assert.equal((await reset(manager)).status, 403);
    assert.equal((await reset(salesManager)).status, 403);
    assert.deepEqual(await readDatabase(), initial);

    assert.equal(
      (
        await send(manager, {
          type: 'approve',
          id: 1002,
          version: await version(manager, 1002),
          comment: '',
        })
      ).status,
      400,
    );
    assert.equal(
      (
        await send(hr, {
          type: 'consult',
          id: 1002,
          version: await version(hr, 1002),
          comment: 'ตรวจเอกสารแล้วครบถ้วน',
        })
      ).status,
      200,
    );
    assert.equal((await snapshot(hr)).requests.find((r) => r.id === 1002)!.status, 'Pending');
    const approvalVersion = await version(manager, 1002);
    assert.equal(
      (await send(manager, { type: 'approve', id: 1002, version: approvalVersion, comment: '' }))
        .status,
      200,
    );
    assert.equal(
      (await send(manager, { type: 'approve', id: 1002, version: approvalVersion, comment: '' }))
        .status,
      409,
    );
    const saved = await readDatabase();
    assert.equal(saved.requests.find((r) => r.id === 1002)!.status, 'Approved');
    assert(saved.notifications.some((n) => n.employeeId === 2 && n.text.includes('ได้รับอนุมัติ')));
    assert.equal(saved.employees.length, 10);
    const malformed = await fetch(base + '/commands', {
      method: 'POST',
      headers: { Cookie: manager, 'Content-Type': 'application/json' },
      body: 'not json',
    });
    assert.equal(malformed.status, 400);
    const malicious = await fetch(base + '/commands', {
      method: 'POST',
      headers: {
        Cookie: manager,
        Origin: 'https://example.com',
        'Content-Type': 'application/json',
      },
      body: '{}',
    });
    assert.equal(malicious.status, 403);

    await stopServer(server);
    server = startServer(file);
    base = await server.ready;
    assert.equal((await get(hr)).status, 401);
    const restartedHr = await session('hr@demo.local');
    const persisted = await snapshot(restartedHr);
    assert.equal(persisted.employees.length, 10);
    assert.equal(persisted.requests.find((r) => r.id === 1002)!.status, 'Approved');
    assert.deepEqual(await readDatabase(), saved);
    assert.equal((await reset(restartedHr)).status, 200);
    assert.deepEqual(await readDatabase(), initial);
    const restored = await snapshot(restartedHr);
    assert.equal(restored.employees.length, 10);
    assert.equal(restored.requests.length, 14);
    assert.equal(restored.requests.find((r) => r.id === 1002)!.status, 'Pending');
    assert.equal(
      restored.approvals.find((a) => a.leaveId === 1002 && a.reviewType === 'Consultation')!.status,
      'Pending',
    );
  } finally {
    await stopServer(server);
    assert.equal(dirname(resolve(folder)), resolve(tmpdir()));
    await rm(folder, { recursive: true, force: true });
  }
});
