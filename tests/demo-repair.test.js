import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
import { createDemoDatabase } from '../src/data/demoDatabase.js';
import { repairDemoRecords } from '../scripts/demo-repair.js';

test('targeted repair preserves unrelated data, reassigns child IDs and declines mismatched employee identities', () => {
  const db = createDemoDatabase();
  const other = { ...db.requests[0], id: 8000, reason: 'ข้อมูลที่ต้องเก็บไว้' };
  db.requests.push(other, { ...other, id: 8001, reason: 'ง่วง' });
  const original = structuredClone(db);
  const result = repairDemoRecords(db);
  assert.deepEqual(db, original);
  assert.deepEqual(result.database.requests.find((request) => request.id === 8000), other);
  assert.equal(result.database.requests.some((request) => request.id === 8001), false);
  assert.deepEqual(result.database.entitlements, db.entitlements);
  for (const key of ['days','approvals','notifications'])
    assert.equal(new Set(result.database[key].map((row) => row.id)).size, result.database[key].length);
  db.employees[0].email = 'different@example.test';
  assert.throws(() => repairDemoRecords(db), /identities differ/);
});

test('Supabase repair runs in an isolated database, removes test rows and preserves unrelated requests', async () => {
  const db = new PGlite();
  try {
    await db.exec('CREATE ROLE anon; CREATE ROLE authenticated;');
    await db.exec(await readFile('database/supabase/setup-10-people.sql', 'utf8'));
    await db.exec("UPDATE leave_app.leave_request SET reason='ง่วง',employee_id=1,status='Pending' WHERE leave_id=1001;");
    const untouched = await db.query('SELECT * FROM leave_app.leave_request WHERE leave_id=1009');
    await db.exec(await readFile('database/supabase/repair-demo-records.sql','utf8'));
    const fixed = await db.query('SELECT employee_id,leave_type_id,status FROM leave_app.leave_request WHERE leave_id=1001');
    assert.deepEqual(fixed.rows[0], { employee_id: 3, leave_type_id: 3, status: 'Approved' });
    assert.deepEqual((await db.query('SELECT * FROM leave_app.leave_request WHERE leave_id=1009')).rows, untouched.rows);
    assert.equal(Number((await db.query('SELECT sum(units) AS used FROM leave_app.leave_day WHERE leave_id=1001')).rows[0].used), 1);
  } finally { await db.close(); }
});
