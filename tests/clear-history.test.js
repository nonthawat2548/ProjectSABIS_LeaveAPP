/**
 * @typedef {import('../src/domain/types.js').WorkStatus} WorkStatus
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { isAbsolute, join, relative } from 'node:path';
import { PGlite } from '@electric-sql/pglite';
import { clearLocalFile, clearRequestHistory } from '../scripts/clear-local-history.js';
import { createDemoDatabase } from '../src/data/demoDatabase.js';
import { applyCommand, balance } from '../src/domain/service.js';
import { IDBFactory } from 'fake-indexeddb';
import { clearIndexedDbHistory } from '../scripts/clear-browser-history.js';
/**
 * @param {unknown} state
 */
async function browserFixture(state) {
  const factory = new IDBFactory();
  const db = await new Promise((resolve, reject) => {
    const request = factory.open('leave-management-10-people-v1', 1);
    request.onupgradeneeded = () => request.result.createObjectStore('database');
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
  await new Promise((resolve, reject) => {
    const tx = db.transaction('database', 'readwrite');
    const store = tx.objectStore('database');
    store.put(state, 'state');
    store.put({ version: 1, documents: [{ id: 1, count: 1, length: 5 }] }, 'document-chunks');
    store.put('chunk', ['document', 1, 0]);
    store.put('keep', 'other-setting');
    tx.oncomplete = () => resolve();
    tx.onabort = () => reject(tx.error);
  });
  return { factory, db };
}
/**
 * @param {IDBDatabase} db
 */
async function browserRecords(db) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction('database');
    const request = tx.objectStore('database').getAll();
    tx.oncomplete = () => resolve(request.result);
    tx.onabort = () => reject(tx.error);
  });
}
test('Browser cleanup commits history and file chunks together, retaining granted rights', async () => {
  const before = createDemoDatabase();
  const { factory, db } = await browserFixture(before);
  try {
    assert.deepEqual(await clearIndexedDbHistory(factory), {
      before: before.requests.length,
      after: 0,
    });
    assert.deepEqual(await browserRecords(db), ['keep', clearRequestHistory(before)]);
    assert.deepEqual(await clearIndexedDbHistory(factory), { before: 0, after: 0 });
  } finally {
    db.close();
  }
});
test('Invalid browser state aborts cleanup without losing history or chunks', async () => {
  const { factory, db } = await browserFixture({ ...createDemoDatabase(), schemaVersion: 2 });
  try {
    const before = await browserRecords(db);
    await assert.rejects(clearIndexedDbHistory(factory), /Unsupported local database/);
    assert.deepEqual(await browserRecords(db), before);
  } finally {
    db.close();
  }
});
test('Browser cleanup never creates or reseeds a missing database', async () => {
  const factory = new IDBFactory();
  await assert.rejects(clearIndexedDbHistory(factory), /ไม่พบฐานข้อมูลเดิม/);
  assert.deepEqual(await factory.databases(), []);
});
/**
 * @param {string} directory
 */
async function removeTestDirectory(directory) {
  const path = relative(tmpdir(), directory);
  assert(path.startsWith('leave-history-') && !path.startsWith('..') && !isAbsolute(path));
  await rm(directory, { recursive: true, force: true });
}
test('Clearing leave history preserves accounts, granted rights and independent work data', () => {
  const before = createDemoDatabase();
  before.notifications.push({
    id: 90000,
    employeeId: 1,
    leaveId: null,
    text: 'ข้อความอื่น',
    createdAt: '2026-10-11T00:00:00Z',
    read: false,
  });
  before.workStatuses.push(
    /** @type {WorkStatus} */ (
      /** @type {unknown} */ ({
        id: 90000,
        employeeId: 1,
        date: '2099-12-05',
        statusType: 'Leave',
        leaveId: before.requests[0].id,
      })
    ),
  );
  const original = structuredClone(before);
  const clean = clearRequestHistory(before);
  assert.deepEqual(before, original, 'cleanup must not mutate a shared source fixture');
  for (const key of /** @type {const} */ ([
    'employees',
    'leaveTypes',
    'entitlements',
    'maternityCases',
    'holidays',
  ]))
    assert.deepEqual(clean[key], before[key]);
  for (const key of /** @type {const} */ (['requests', 'days', 'documents', 'approvals']))
    assert.deepEqual(clean[key], []);
  assert.deepEqual(clean.notifications, [before.notifications.at(-1)]);
  assert.deepEqual(clean.workStatuses, before.workStatuses.slice(0, -1));
  for (const entitlement of clean.entitlements) {
    const rights = balance(
      clean,
      entitlement.employeeId,
      entitlement.leaveTypeId,
      entitlement.year,
    );
    assert.equal(rights.used, 0);
    assert.equal(rights.pending, 0);
    assert.equal(rights.remaining, entitlement.grantedDays);
  }
  for (const maternityCase of clean.maternityCases)
    assert.equal(
      balance(clean, maternityCase.employeeId, 4, 2026, maternityCase.id).remaining,
      maternityCase.maximumDays,
    );
  assert.deepEqual(
    clearRequestHistory(clean),
    clean,
    'cleanup can be repeated without deleting independent data',
  );
  applyCommand(
    clean,
    1,
    {
      type: 'submit',
      input: {
        leaveTypeId: 1,
        maternityCaseId: null,
        startDate: '2026-12-04',
        endDate: '2026-12-04',
        duration: 'Full',
        reason: 'ทดสอบคำขอใหม่',
      },
    },
    new Date('2026-10-11T05:00:00Z'),
  );
  assert.equal(clean.requests.length, 1);
  assert.equal(clean.requests[0].status, 'Pending');
});
test('Local cleanup saves an exact backup and persists only the cleared history', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'leave-history-'));
  try {
    const file = join(directory, 'database.json');
    const original = JSON.stringify(createDemoDatabase(), null, 2);
    await writeFile(file, original);
    const result = await clearLocalFile(file);
    assert.equal(await readFile(result.backup, 'utf8'), original);
    assert(result.before.requests > 0);
    assert(Object.values(result.after).every((count) => count === 0));
    assert.deepEqual(
      JSON.parse(await readFile(file, 'utf8')),
      clearRequestHistory(createDemoDatabase()),
    );
  } finally {
    await removeTestDirectory(directory);
  }
});
test('An unsupported local database is left intact', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'leave-history-invalid-'));
  try {
    const file = join(directory, 'database.json');
    const original = '{"schemaVersion":2,"requests":[{"id":1}]}';
    await writeFile(file, original);
    await assert.rejects(clearLocalFile(file), /Unsupported local database/);
    assert.equal(await readFile(file, 'utf8'), original);
  } finally {
    await removeTestDirectory(directory);
  }
});
test('Supabase cleanup respects foreign keys, preserves master data and restores balances', async () => {
  const db = new PGlite();
  try {
    await db.exec('CREATE ROLE anon; CREATE ROLE authenticated;');
    for (const name of ['setup-10-people.sql', '002-cloud-api.sql'])
      await db.exec(
        await readFile(new URL('../database/supabase/' + name, import.meta.url), 'utf8'),
      );
    const sql = await readFile(
      new URL('../database/supabase/clear-leave-history.sql', import.meta.url),
      'utf8',
    );
    const masters = [
      'employee',
      'leave_type',
      'leave_entitlement',
      'maternity_case',
      'app_holiday',
    ];
    const before = await Promise.all(
      masters.map((name) => db.query(`SELECT * FROM leave_app.${name}`)),
    );
    await db.exec(`
      INSERT INTO leave_app.app_notification VALUES (90000, 1, NULL, 'ข้อความอื่น', CURRENT_TIMESTAMP, 0);
      INSERT INTO leave_app.work_status VALUES (90000, 1, '2099-12-05', 'Leave', 1001, CURRENT_TIMESTAMP);
      INSERT INTO leave_app.app_session VALUES (repeat('a',64), 5, CURRENT_TIMESTAMP + interval '1 hour');
      INSERT INTO leave_app.app_upload VALUES ('00000000-0000-0000-0000-000000000001',1,'test.pdf','application/pdf',3,4,CURRENT_TIMESTAMP + interval '1 hour');
      INSERT INTO leave_app.app_upload_part VALUES ('00000000-0000-0000-0000-000000000001',0,'AAAA');
      CREATE TABLE leave_app.cleanup_guard (leave_id INTEGER REFERENCES leave_app.leave_request);
      INSERT INTO leave_app.cleanup_guard VALUES (1001);
    `);
    const snapshot = await db.query('SELECT * FROM leave_app.leave_request');
    const days = await db.query('SELECT * FROM leave_app.leave_day');
    await assert.rejects(db.exec(sql), /foreign key/);
    await db.exec('ROLLBACK;');
    assert.deepEqual((await db.query('SELECT * FROM leave_app.leave_request')).rows, snapshot.rows);
    assert.deepEqual((await db.query('SELECT * FROM leave_app.leave_day')).rows, days.rows);
    await db.exec('DROP TABLE leave_app.cleanup_guard;');
    for (let run = 0; run < 2; run++) {
      const results = await db.exec(sql);
      assert(Object.values(results.at(-1).rows[0]).every((value) => Number(value) === 0));
    }
    const after = await Promise.all(
      masters.map((name) => db.query(`SELECT * FROM leave_app.${name}`)),
    );
    assert.deepEqual(
      after.map((result) => result.rows),
      before.map((result) => result.rows),
    );
    assert.equal(
      (await db.query('SELECT count(*)::integer AS count FROM leave_app.app_upload_part')).rows[0]
        .count,
      0,
    );
    assert.equal(
      (await db.query('SELECT count(*)::integer AS count FROM leave_app.app_session')).rows[0]
        .count,
      1,
    );
    assert.equal(
      (await db.query('SELECT notification_id FROM leave_app.app_notification')).rows[0]
        .notification_id,
      90000,
    );
    for (const view of ['leave_entitlement_balance', 'maternity_case_balance']) {
      const rights = await db.query(`SELECT * FROM leave_app.${view}`);
      for (const row of rights.rows) {
        assert.equal(Number(row.used_days), 0);
        assert.equal(Number(row.remaining_days), Number(row.granted_days ?? row.maximum_days));
      }
    }
  } finally {
    await db.close();
  }
});
