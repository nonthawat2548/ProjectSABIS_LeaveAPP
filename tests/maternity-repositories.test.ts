import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { IDBFactory } from 'fake-indexeddb';
import { JSDOM } from 'jsdom';
import { BrowserRepository } from '../src/data/browserRepository';
import { createDemoDatabase, DEMO_DATASET_ID } from '../src/data/demoDatabase';
import { addDays, today } from '../src/domain/date';
import { balance, DomainError, totalDays } from '../src/domain/service';
import type { Database, RequestInput } from '../src/domain/types';

function fixture(): Database {
  const db = createDemoDatabase();
  db.requests = [];
  db.days = [];
  db.approvals = [];
  db.documents = [];
  db.notifications = [];
  db.maternityCases = [{ id: 1, employeeId: 3, caseNo: 1, maximumDays: 3 }];
  return db;
}
function input(): RequestInput {
  const year = Number(today().slice(0, 4)) + 1;
  return {
    leaveTypeId: 4,
    maternityCaseId: 1,
    startDate: year + '-12-31',
    endDate: year + 1 + '-01-02',
    duration: 'Full',
    reason: 'ลาเพื่อคลอดบุตร',
  };
}
const issue = (pattern: RegExp) => (error: unknown) =>
  error instanceof DomainError && pattern.test(error.message);

test('IndexedDB transactions enforce maternity rules against fresh stored data', async (t) => {
  const factory = new IDBFactory(),
    dom = new JSDOM('', { url: 'http://localhost' });
  const globals = {
    indexedDB: factory,
    sessionStorage: dom.window.sessionStorage,
    window: new EventTarget(),
    BroadcastChannel: undefined,
  };
  const saved = new Map(
    Object.keys(globals).map((name) => [name, Object.getOwnPropertyDescriptor(globalThis, name)]),
  );
  for (const [name, value] of Object.entries(globals))
    Object.defineProperty(globalThis, name, { configurable: true, writable: true, value });
  const connection = await new Promise<IDBDatabase>((accept, reject) => {
    const request = factory.open(DEMO_DATASET_ID, 1);
    request.onupgradeneeded = () => request.result.createObjectStore('database');
    request.onsuccess = () => accept(request.result);
    request.onerror = () => reject(request.error);
  });
  async function save(db: Database) {
    await new Promise<void>((accept, reject) => {
      const tx = connection.transaction('database', 'readwrite');
      tx.objectStore('database').put(db, 'state');
      tx.oncomplete = () => accept();
      tx.onabort = () => reject(tx.error);
    });
  }
  t.after(() => {
    connection.close();
    dom.window.close();
    for (const [name, descriptor] of saved) {
      if (descriptor) Object.defineProperty(globalThis, name, descriptor);
      else Reflect.deleteProperty(globalThis, name);
    }
  });
  const repository = new BrowserRepository();
  const login = (email: string) => repository.login(email, '1234');
  await t.test('Gender from storage wins over a forged body and stale login identity', async () => {
    const db = fixture();
    await save(db);
    await login('nat@demo.local');
    await assert.rejects(
      repository.execute({
        type: 'submit',
        input: { ...input(), startDate: '', reason: '', gender: 'Female' },
      } as never),
      issue(/พนักงานชาย/),
    );
    for (const gender of ['Other', undefined, 'invalid']) {
      Object.assign(
        db.employees.find((e) => e.id === 2)!,
        { gender },
      );
      await save(db);
      await assert.rejects(
        repository.execute({ type: 'submit', input: input() }),
        issue(/ข้อมูลเพศ/),
      );
    }
    await login('employee@demo.local');
    await assert.rejects(
      repository.execute({ type: 'submit', input: { ...input(), maternityCaseId: null } }),
      issue(/ยังไม่มีกรณีลาคลอด/),
    );
    await assert.rejects(
      repository.execute({ type: 'submit', input: input() }),
      issue(/ไม่ใช่ของเจ้าของคำขอ/),
    );
  });
  await t.test(
    'A female request edits at full capacity then a male manager approves it once',
    async () => {
      const db = fixture();
      db.holidays.push({ date: input().startDate, name: 'วันหยุดทดสอบ' });
      await save(db);
      await login('orn@demo.local');
      const id = (await repository.execute({ type: 'submit', input: input() })).id!;
      await repository.execute({
        type: 'edit',
        id,
        version: 1,
        input: { ...input(), reason: 'แก้ไขเหตุผล' },
      });
      assert.equal(balance(await repository.snapshot(), 3, 4, 0, 1).pending, 3);
      await login('manager@demo.local');
      const outcomes = await Promise.allSettled([
        repository.execute({ type: 'approve', id, version: 2, comment: '' }),
        repository.execute({ type: 'approve', id, version: 2, comment: '' }),
      ]);
      assert.equal(outcomes.filter((o) => o.status === 'fulfilled').length, 1);
      const after = await repository.snapshot();
      assert.equal(totalDays(after, id), 3);
      assert.equal(balance(after, 3, 4, 0, 1).used, 3);
      assert(after.days.every((d) => d.entitlementId === null));
    },
  );
  await t.test('Approval rereads gender and case capacity after submission', async () => {
    const db = fixture();
    await save(db);
    await login('orn@demo.local');
    const id = (await repository.execute({ type: 'submit', input: input() })).id!;
    const pending = await repository.snapshot();
    await login('manager@demo.local');
    Object.assign(
      pending.employees.find((e) => e.id === 3)!,
      { gender: 'Male' },
    );
    await save(pending);
    await assert.rejects(
      repository.execute({ type: 'approve', id, version: 1, comment: '' }),
      issue(/พนักงานชาย/),
    );
    Object.assign(
      pending.employees.find((e) => e.id === 3)!,
      { gender: 'Female' },
    );
    pending.maternityCases[0].maximumDays = 2;
    await save(pending);
    await assert.rejects(
      repository.execute({ type: 'approve', id, version: 1, comment: '' }),
      (error) =>
        error instanceof DomainError && error.code === 'CONFLICT' && /โควตา/.test(error.message),
    );
    assert.equal(balance(await repository.snapshot(), 3, 4, 0, 1).used, 0);
  });
});

test('Direct REST commands cannot bypass maternity eligibility, case or fresh approval checks', async (t) => {
  const folder = await mkdtemp(join(tmpdir(), 'leave-maternity-api-')),
    file = join(folder, 'db.json');
  await writeFile(file, JSON.stringify(fixture()));
  const child = spawn(process.execPath, ['--import', 'tsx', 'server/index.ts'], {
    cwd: process.cwd(),
    env: { ...process.env, MOCK_PORT: '0', MOCK_HOST: '127.0.0.1', MOCK_DATA_FILE: file },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  t.after(async () => {
    if (child.exitCode === null && child.signalCode === null) {
      const closed = new Promise<void>((accept) => child.once('exit', () => accept()));
      child.kill('SIGTERM');
      await closed;
    }
    assert.equal(dirname(resolve(folder)), resolve(tmpdir()));
    await rm(folder, { recursive: true, force: true });
  });
  const base = await new Promise<string>((accept, reject) => {
    let output = '',
      errors = '';
    const timer = setTimeout(() => {
      child.kill('SIGTERM');
      reject(new Error('Mock API startup timed out: ' + errors));
    }, 10000);
    child.stderr.on('data', (d) => {
      errors += String(d);
    });
    child.stdout.on('data', (d) => {
      output += String(d);
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
      reject(new Error('Mock API exited: ' + code + ' ' + errors));
    });
  });
  const login = async (email: string) => {
    const response = await fetch(base + '/session', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password: '1234' }),
    });
    assert.equal(response.status, 200);
    return response.headers.get('set-cookie')!.split(';')[0];
  };
  const send = async (cookie: string | undefined, command: unknown) =>
    fetch(base + '/commands', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(cookie ? { Cookie: cookie } : {}) },
      body: JSON.stringify(command),
    });
  const read = async (): Promise<Database> => JSON.parse(await readFile(file, 'utf8'));
  const save = async (db: Database) => writeFile(file, JSON.stringify(db));
  const denied = async (
    cookie: string | undefined,
    command: unknown,
    pattern: RegExp,
    status = 400,
  ) => {
    const before = await read(),
      response = await send(cookie, command);
    assert.equal(response.status, status);
    assert.match((await response.json()).message, pattern);
    assert.deepEqual(await read(), before);
  };
  const male = await login('nat@demo.local'),
    other = await login('other@demo.local'),
    female = await login('orn@demo.local'),
    noCase = await login('employee@demo.local'),
    manager = await login('manager@demo.local'),
    hr = await login('hr@demo.local');

  await t.test(
    'Authentication, authority and saved gender take precedence over forged fields',
    async () => {
      const bad = {
        type: 'submit',
        actorId: 3,
        role: 'HR',
        gender: 'Female',
        input: {
          ...input(),
          employeeId: 3,
          gender: 'Female',
          startDate: '',
          endDate: '',
          reason: '',
          duration: 'AM',
        },
      };
      await denied(undefined, bad, /เข้าสู่ระบบ/, 401);
      await denied(hr, bad, /บทบาทพนักงาน/, 403);
      await denied(male, bad, /พนักงานชาย/);
      await denied(other, bad, /ติดต่อ HR.*ข้อมูลเพศ/);
      for (const gender of [null, undefined, '', 'female']) {
        const db = fixture();
        Object.assign(
          db.employees.find((e) => e.id === 2)!,
          { gender },
        );
        await save(db);
        await denied(male, bad, /ติดต่อ HR.*ข้อมูลเพศ/);
      }
      await save(fixture());
    },
  );
  await t.test(
    'No case, foreign case, nonexistent case, half-day and excess quota are denied',
    async () => {
      await denied(female, { type: 'submit', input: null }, /ข้อมูลคำขอไม่ถูกต้อง/);
      await denied(
        noCase,
        { type: 'submit', input: { ...input(), maternityCaseId: null, startDate: '', reason: '' } },
        /^ยังไม่มีกรณีลาคลอด/,
      );
      await denied(noCase, { type: 'submit', input: input() }, /ไม่ใช่ของเจ้าของคำขอ/);
      await denied(
        female,
        { type: 'submit', input: { ...input(), maternityCaseId: 999 } },
        /ไม่พบกรณีลาคลอด/,
      );
      await denied(
        female,
        { type: 'submit', input: { ...input(), startDate: { date: input().startDate } } },
        /วันที่ไม่ถูกต้อง/,
      );
      await denied(
        female,
        { type: 'submit', input: { ...input(), duration: 'AM' } },
        /ลาคลอดใช้การลาเต็มวัน/,
      );
      await denied(
        female,
        { type: 'submit', input: { ...input(), endDate: addDays(input().endDate, 1) } },
        /โควตา/,
      );
    },
  );
  await t.test('Male HR opens a case only for an eligible selected female employee', async () => {
    const db = fixture();
    db.employees.find((e) => e.id === 5)!.gender = 'Male';
    await save(db);
    await denied(
      hr,
      { type: 'maternity', employeeId: 2, maximumDays: 0, gender: 'Female' },
      /พนักงานชาย/,
    );
    await denied(
      hr,
      { type: 'maternity', employeeId: 6, maximumDays: 0, gender: 'Female' },
      /ข้อมูลเพศ/,
    );
    const response = await send(hr, { type: 'maternity', employeeId: 1, maximumDays: 17 });
    assert.equal(response.status, 200);
    assert((await read()).maternityCases.some((c) => c.employeeId === 1 && c.maximumDays === 17));
  });
  let id: number;
  await t.test(
    'A female request crosses the year, includes a holiday and edits without duplicate quota',
    async () => {
      const db = fixture();
      db.holidays.push({ date: input().startDate, name: 'วันหยุดทดสอบ' });
      await save(db);
      const response = await send(female, {
        type: 'submit',
        actorId: 2,
        gender: 'Male',
        input: { ...input(), gender: 'Male', employeeId: 2 },
      });
      assert.equal(response.status, 200);
      id = (await response.json()).id;
      let saved = await read();
      assert.equal(saved.requests[0].employeeId, 3);
      assert.equal(saved.requests[0].startDate, input().startDate);
      assert.equal(totalDays(saved, id), 3);
      assert.equal(balance(saved, 3, 4, 0, 1).used, 0);
      await denied(female, { type: 'submit', input: input() }, /วันที่ลาซ้อน/);
      const edited = await send(female, {
        type: 'edit',
        id,
        version: 1,
        input: { ...input(), reason: 'แก้ไขเหตุผล' },
      });
      assert.equal(edited.status, 200);
      saved = await read();
      assert.equal(balance(saved, 3, 4, 0, 1).pending, 3);
      assert.equal(saved.requests[0].version, 2);
      assert(saved.days.every((d) => d.entitlementId === null));
    },
  );
  await t.test(
    'Approval rechecks changed owner gender, case identity and capacity from storage',
    async () => {
      const original = await read();
      for (const gender of ['Male', 'Other', null, 'invalid']) {
        const changed = structuredClone(original);
        Object.assign(
          changed.employees.find((e) => e.id === 3)!,
          { gender },
        );
        changed.maternityCases = [];
        await save(changed);
        await denied(
          manager,
          { type: 'approve', id, version: 2, comment: '', gender: 'Female' },
          gender === 'Male' ? /พนักงานชาย/ : /ข้อมูลเพศ/,
        );
        await denied(
          female,
          { type: 'edit', id, version: 2, input: { ...input(), gender: 'Female' } },
          gender === 'Male' ? /พนักงานชาย/ : /ข้อมูลเพศ/,
        );
      }
      const missing = structuredClone(original);
      missing.maternityCases = [];
      await save(missing);
      await denied(manager, { type: 'approve', id, version: 2, comment: '' }, /ไม่พบกรณีลาคลอด/);
      const foreign = structuredClone(original);
      foreign.maternityCases[0].employeeId = 1;
      await save(foreign);
      await denied(
        manager,
        { type: 'approve', id, version: 2, comment: '' },
        /ไม่ใช่ของเจ้าของคำขอ/,
      );
      const reduced = structuredClone(original);
      reduced.maternityCases[0].maximumDays = 2;
      await save(reduced);
      await denied(manager, { type: 'approve', id, version: 2, comment: '' }, /โควตา/, 409);
      await save(original);
    },
  );
  await t.test(
    'Concurrent male-manager approvals commit once and deduct case quota once',
    async () => {
      const responses = await Promise.all([
        send(manager, { type: 'approve', id, version: 2, comment: '' }),
        send(manager, { type: 'approve', id, version: 2, comment: '' }),
      ]);
      assert.deepEqual(responses.map((r) => r.status).sort(), [200, 409]);
      const saved = await read();
      assert.equal(saved.requests.find((r) => r.id === id)!.status, 'Approved');
      assert.deepEqual(balance(saved, 3, 4, 0, 1), { total: 3, used: 3, pending: 0, remaining: 0 });
    },
  );
});
