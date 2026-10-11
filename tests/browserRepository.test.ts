import { test } from 'node:test';
import assert from 'node:assert/strict';
import { IDBFactory } from 'fake-indexeddb';
import { BrowserRepository } from '../src/data/browserRepository';
import {
  createDemoDatabase,
  DEMO_DATASET_ID,
  DEMO_DATA_CHANNEL,
  DEMO_SESSION_KEY,
} from '../src/data/demoDatabase';
import { createSeed, DEMO_PASSWORD } from '../src/domain/seed';
import { loginUsername } from '../src/domain/auth';
import { balance, DomainError, totalDays, visibleSnapshot } from '../src/domain/service';
import type { Database } from '../src/domain/types';

class MemoryStorage implements Storage {
  private values = new Map<string, string>();
  get length() {
    return this.values.size;
  }
  clear() {
    this.values.clear();
  }
  getItem(key: string) {
    return this.values.get(key) ?? null;
  }
  key(index: number) {
    return [...this.values.keys()][index] ?? null;
  }
  removeItem(key: string) {
    this.values.delete(key);
  }
  setItem(key: string, value: string) {
    this.values.set(key, String(value));
  }
}

function openDatabase(factory: IDBFactory, name: string): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = factory.open(name, 1);
    request.onupgradeneeded = () => request.result.createObjectStore('database');
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function legacyState(factory: IDBFactory, initial?: Database): Promise<Database> {
  const database = await openDatabase(factory, 'leave-management-v1');
  try {
    return await new Promise((resolve, reject) => {
      const transaction = database.transaction('database', initial ? 'readwrite' : 'readonly');
      const store = transaction.objectStore('database');
      if (initial) store.put(initial, 'state');
      const request = store.get('state');
      transaction.oncomplete = () => resolve(request.result);
      transaction.onabort = () => reject(transaction.error);
      transaction.onerror = () => reject(transaction.error);
    });
  } finally {
    database.close();
  }
}

const hasCode = (code: string) => (error: unknown) =>
  error instanceof DomainError && error.code === code;

test('Browser repository uses the ten-person dataset with isolated storage and role rules', async (t) => {
  const globals = ['indexedDB', 'sessionStorage', 'window', 'BroadcastChannel'] as const;
  const original = new Map(
    globals.map((name) => [name, Object.getOwnPropertyDescriptor(globalThis, name)]),
  );
  const factory = new IDBFactory();
  const storage = new MemoryStorage();
  const events = new EventTarget();
  let updateCount = 0;
  events.addEventListener('leave-data-updated', () => updateCount++);
  const channels: { name: string; closed: boolean; messages: unknown[] }[] = [];
  class TestBroadcastChannel {
    closed = false;
    messages: unknown[] = [];
    constructor(public name: string) {
      channels.push(this);
    }
    postMessage(message: unknown) {
      this.messages.push(message);
    }
    close() {
      this.closed = true;
    }
  }
  const replacements = {
    indexedDB: factory,
    sessionStorage: storage,
    window: events,
    BroadcastChannel: TestBroadcastChannel,
  };
  for (const name of globals)
    Object.defineProperty(globalThis, name, {
      configurable: true,
      writable: true,
      value: replacements[name],
    });
  t.after(() => {
    for (const channel of channels) channel.closed = true;
    for (const name of globals) {
      const descriptor = original.get(name);
      if (descriptor) Object.defineProperty(globalThis, name, descriptor);
      else Reflect.deleteProperty(globalThis, name);
    }
  });

  const expected = createDemoDatabase();
  const legacy = createSeed(new Date('2026-10-10T05:00:00Z'));
  legacy.employees[0].name += ' (legacy data)';
  await legacyState(factory, legacy);
  storage.setItem('leave-demo-session', '999');
  const repository = new BrowserRepository();

  await t.test(
    'Initial data matches the supplied file and leaves legacy data/session intact',
    async () => {
      assert.equal(await repository.session(), null);
      await assert.rejects(repository.snapshot(), hasCode('UNAUTHENTICATED'));
      const hr = await repository.login('hr@demo.local', DEMO_PASSWORD);
      const snapshot = await repository.snapshot();
      assert.equal(snapshot.employees.length, 10);
      assert.equal(snapshot.requests.length, 14);
      assert.equal(snapshot.employees.filter((employee) => employee.role === 'Employee').length, 7);
      assert.equal(snapshot.employees.filter((employee) => employee.role === 'Manager').length, 2);
      assert.equal(snapshot.employees.filter((employee) => employee.role === 'HR').length, 1);
      assert.deepEqual(snapshot, visibleSnapshot(expected, hr.id));
      assert.deepEqual(await legacyState(factory), legacy);
      assert.equal(storage.getItem('leave-demo-session'), '999');
      assert((await factory.databases()).some((database) => database.name === DEMO_DATASET_ID));
    },
  );

  await t.test(
    'All ten demo accounts authenticate with their configured role and scope',
    async () => {
      for (const employee of expected.employees) {
        for (const identifier of [employee.email, loginUsername(employee.email)]) {
          await repository.logout();
          const account = await repository.login(` ${identifier.toUpperCase()} `, DEMO_PASSWORD);
          assert.deepEqual(account, employee);
          assert.equal(storage.getItem(DEMO_SESSION_KEY), String(employee.id));
          assert.deepEqual(await repository.session(), employee);
          const snapshot = await repository.snapshot();
          assert.deepEqual(snapshot, visibleSnapshot(expected, employee.id));
        }
      }
      await repository.logout();
      await assert.rejects(
        repository.login('chutima@demo.local', 'incorrect'),
        hasCode('UNAUTHENTICATED'),
      );
      await assert.rejects(
        repository.login('missing@demo.local', DEMO_PASSWORD),
        hasCode('UNAUTHENTICATED'),
      );
      await assert.rejects(repository.login('pimchanok', 'demo1234'), hasCode('UNAUTHENTICATED'));
      for (const username of ['employee', 'manager', 'hr', 'sales-manager', 'other']) {
        await assert.rejects(repository.login(username, DEMO_PASSWORD), hasCode('UNAUTHENTICATED'));
      }
      assert.equal(await repository.session(), null);
    },
  );

  await t.test(
    'Reading and commands respect the second manager and the new employees',
    async () => {
      await repository.login('manager@demo.local', DEMO_PASSWORD);
      const itSnapshot = await repository.snapshot();
      assert(!itSnapshot.requests.some((request) => [6, 8, 9].includes(request.employeeId)));
      assert(!itSnapshot.employees.some((employee) => [6, 7, 8, 9].includes(employee.id)));
      assert(
        itSnapshot.entitlements.every((entitlement) =>
          [1, 2, 3, 4, 10].includes(entitlement.employeeId),
        ),
      );
      assert(
        itSnapshot.documents.every((document) =>
          itSnapshot.requests.some((request) => request.id === document.leaveId),
        ),
      );
      assert(itSnapshot.notifications.every((notification) => notification.employeeId === 4));
      await assert.rejects(
        repository.execute({ type: 'approve', id: 1010, version: 3, comment: '' }),
        hasCode('FORBIDDEN'),
      );

      await repository.login('sales-manager@demo.local', DEMO_PASSWORD);
      const salesSnapshot = await repository.snapshot();
      assert(salesSnapshot.requests.some((request) => request.employeeId === 8));
      assert(salesSnapshot.requests.some((request) => request.employeeId === 9));
      assert(salesSnapshot.requests.every((request) => [6, 7, 8, 9].includes(request.employeeId)));
      await assert.rejects(
        repository.execute({ type: 'approve', id: 1001, version: 1, comment: '' }),
        hasCode('FORBIDDEN'),
      );

      await repository.login('chutima@demo.local', DEMO_PASSWORD);
      assert((await repository.snapshot()).requests.every((request) => request.employeeId === 8));
      await assert.rejects(
        repository.execute({ type: 'withdraw', id: 1001, version: 1 }),
        hasCode('FORBIDDEN'),
      );
      await assert.rejects(repository.resetDemo(), hasCode('FORBIDDEN'));
      await assert.rejects(
        repository.execute({
          type: 'entitlement',
          employeeId: 8,
          leaveTypeId: 1,
          year: 2026,
          grantedDays: 99,
        }),
        hasCode('FORBIDDEN'),
      );
    },
  );

  await t.test(
    'Saved changes and session survive a new repository instance and a fresh login',
    async () => {
      await repository.login('weeraphat@demo.local', DEMO_PASSWORD);
      await repository.execute({ type: 'work', date: '2026-10-12', statusType: 'WFH' });
      const reopened = new BrowserRepository();
      assert.equal((await reopened.session())?.id, 10);
      const saved = (await reopened.snapshot()).workStatuses.find(
        (status) => status.employeeId === 10 && status.date === '2026-10-12',
      );
      assert.equal(saved?.statusType, 'WFH');
      await reopened.logout();
      assert.equal(await repository.session(), null);
      await reopened.login('weeraphat@demo.local', DEMO_PASSWORD);
      assert.deepEqual(
        (await reopened.snapshot()).workStatuses.find((status) => status.id === saved?.id),
        saved,
      );
    },
  );

  await t.test(
    'Concurrent duplicate approvals commit once and deduct a half day once',
    async () => {
      await repository.login('sales-manager@demo.local', DEMO_PASSWORD);
      const before = await repository.snapshot();
      const request = before.requests.find((request) => request.id === 1006)!;
      const days = totalDays(before, request.id);
      const quota = balance(before, request.employeeId, request.leaveTypeId, 2026);
      assert.equal(days, 0.5);
      const previousUpdates = updateCount;
      const command = {
        type: 'approve' as const,
        id: request.id,
        version: request.version,
        comment: 'อนุมัติทดสอบ',
      };
      const results = await Promise.allSettled([
        repository.execute(command),
        new BrowserRepository().execute(command),
      ]);
      assert.equal(results.filter((result) => result.status === 'fulfilled').length, 1);
      const failure = results.find((result) => result.status === 'rejected');
      assert(failure?.status === 'rejected' && hasCode('CONFLICT')(failure.reason));
      const after = await repository.snapshot();
      assert.equal(after.requests.find((row) => row.id === request.id)?.status, 'Approved');
      assert.equal(
        after.requests.find((row) => row.id === request.id)?.version,
        request.version + 1,
      );
      assert.equal(
        balance(after, request.employeeId, request.leaveTypeId, 2026).used,
        quota.used + days,
      );
      assert.equal(
        balance(after, request.employeeId, request.leaveTypeId, 2026).pending,
        quota.pending - days,
      );
      assert.equal(
        after.approvals.filter(
          (approval) =>
            approval.leaveId === request.id &&
            approval.reviewType === 'Decision' &&
            approval.status === 'Approved' &&
            !approval.cancelled,
        ).length,
        1,
      );
      assert.equal(updateCount, previousUpdates + 1);
      await repository.login('chutima@demo.local', DEMO_PASSWORD);
      assert.equal(
        (await repository.snapshot()).notifications.filter(
          (notification) =>
            notification.leaveId === request.id && notification.text.includes('ได้รับอนุมัติ'),
        ).length,
        1,
      );
    },
  );

  await t.test(
    'HR reset restores the ten-person dataset without modifying the legacy database',
    async () => {
      const hr = await repository.login('hr@demo.local', DEMO_PASSWORD);
      await repository.resetDemo();
      assert.deepEqual(await repository.snapshot(), visibleSnapshot(expected, hr.id));
      assert.deepEqual(await legacyState(factory), legacy);
      assert.equal(storage.getItem('leave-demo-session'), '999');
      assert(channels.length > 0);
      assert(channels.every((channel) => channel.name === DEMO_DATA_CHANNEL && channel.closed));
    },
  );
});
