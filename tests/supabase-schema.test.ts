import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
import { createDemoDatabase } from '../src/data/demoDatabase';
import { balance } from '../src/domain/service';

const generator = await import(new URL('../scripts/generate-supabase.mjs', import.meta.url).href);
const sql = readFileSync(new URL('../database/supabase/setup-10-people.sql', import.meta.url), 'utf8');
const source = createDemoDatabase();
let db: PGlite;
before(async () => {
  db = new PGlite();
  // Supabase supplies these roles. This is an isolated PostgreSQL engine, not the live project.
  await db.exec('CREATE ROLE anon; CREATE ROLE authenticated;');
  await db.exec(sql);
});
after(async () => { await db?.close(); });

test('PostgreSQL delivery matches the current source and imports the 9 core + 2 supporting tables', async () => {
  assert.equal(sql.replaceAll('\r\n', '\n'), generator.buildSupabaseSql());
  const tables = await db.query<{table_name:string}>("SELECT table_name FROM information_schema.tables WHERE table_schema='leave_app' AND table_type='BASE TABLE' ORDER BY table_name");
  assert.deepEqual(tables.rows.map(row => row.table_name), ['app_holiday','app_notification','employee','leave_approval','leave_day','leave_document','leave_entitlement','leave_request','leave_type','maternity_case','work_status']);
  const roles = await db.query('SELECT role, count(*)::integer AS count FROM leave_app.employee GROUP BY role ORDER BY role');
  assert.deepEqual(roles.rows, [{role:'Employee',count:7},{role:'HR',count:1},{role:'Manager',count:2}]);
  const protection = await db.query<{enabled:boolean}>("SELECT bool_and(relrowsecurity) AS enabled FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='leave_app' AND c.relkind='r'");
  assert.equal(protection.rows[0].enabled, true);
});

test('PostgreSQL preserves Thai employees, policy, ISO dates, audit timelines and attachment bytes', async () => {
  const employees = await db.query("SELECT employee_id AS id,name,gender,email,phone,position,role,manager_id AS \"managerId\",department,(active=1) AS active FROM leave_app.employee ORDER BY employee_id");
  assert.deepEqual(employees.rows, [...source.employees].sort((a,b)=>a.id-b.id));
  const requests = await db.query<{id:number;startDate:string;endDate:string;requestDate:Date;timeline:unknown}>(`SELECT leave_id AS id, start_date::text AS "startDate", end_date::text AS "endDate", request_date AS "requestDate", timeline_json AS timeline FROM leave_app.leave_request ORDER BY leave_id`);
  for (const row of requests.rows) {
    const original = source.requests.find(request => request.id === row.id)!;
    assert.equal(row.startDate, original.startDate);
    assert.equal(row.endDate, original.endDate);
    assert.equal(row.requestDate.toISOString(), original.requestDate);
    assert.deepEqual(row.timeline, original.timeline);
  }
  const documents = await db.query<{id:number;size:string;data:string;mime:string}>('SELECT document_id AS id,file_size::text AS size,data_url AS data,file_type AS mime FROM leave_app.leave_document ORDER BY document_id');
  assert.equal(documents.rows.length, source.documents.length);
  for (const row of documents.rows) {
    const original = source.documents.find(document => document.id === row.id)!;
    assert.equal(Number(row.size), original.fileSize);
    assert.equal(row.data, original.dataUrl);
    assert.equal(row.mime, original.fileType);
  }
  const policies = await db.query<{id:number;quota:string;notice:number;document:number|null;gender:string|null}>('SELECT leave_type_id AS id,default_quota_days::text AS quota,advance_notice_days AS notice,document_required_from_days AS document,eligible_gender AS gender FROM leave_app.leave_type');
  for (const row of policies.rows) {
    const original = source.leaveTypes.find(type => type.id === row.id)!;
    assert.equal(Number(row.quota), original.defaultQuotaDays);
    assert.equal(row.notice, original.advanceNoticeDays);
    assert.equal(row.document, original.documentRequiredFromDays);
    assert.equal(row.gender, original.eligibleGender);
  }
  for (const [table, collection] of generator.mappings as [string, keyof typeof source][]) {
    const result = await db.query<{count:number}>(`SELECT count(*)::integer AS count FROM leave_app.${table}`);
    assert.equal(result.rows[0].count, (source[collection] as unknown[]).length, table);
  }
});

test('SQL balances agree with domain balances including pending, half days and cross-year requests', async () => {
  const entitlements = await db.query<{id:number;used:string;remaining:string;pending:string}>('SELECT entitlement_id AS id,used_days::text AS used,remaining_days::text AS remaining,pending_days::text AS pending FROM leave_app.leave_entitlement_balance');
  for (const row of entitlements.rows) {
    const entitlement = source.entitlements.find(item=>item.id===row.id)!;
    const expected = balance(source, entitlement.employeeId, entitlement.leaveTypeId, entitlement.year);
    assert.equal(Number(row.used), expected.used);
    assert.equal(Number(row.remaining), expected.remaining);
    assert.equal(Number(row.pending), expected.pending);
  }
  const cases = await db.query<{id:number;used:string;remaining:string}>('SELECT maternity_case_id AS id,used_days::text AS used,remaining_days::text AS remaining FROM leave_app.maternity_case_balance');
  const maternity = source.leaveTypes.find(type=>type.quotaScope==='Pregnancy')!;
  for (const row of cases.rows) {
    const maternityCase = source.maternityCases.find(item=>item.id===row.id)!;
    const expected = balance(source,maternityCase.employeeId,maternity.id,2026,row.id);
    assert.equal(Number(row.used), expected.used);
    assert.equal(Number(row.remaining), expected.remaining);
  }
});

test('browser roles cannot read tables or views; RLS still denies access after accidental SELECT grants', async () => {
  for (const role of ['anon','authenticated']) {
    const access = await db.query<{allowed:boolean}>(`SELECT has_schema_privilege('${role}','leave_app','USAGE') AS allowed`);
    assert.equal(access.rows[0].allowed, false);
    await db.exec(`BEGIN; SET LOCAL ROLE ${role};`);
    await assert.rejects(db.query('SELECT * FROM leave_app.employee'), {code:'42501'});
    await db.exec('ROLLBACK;');
    await db.exec(`BEGIN; GRANT USAGE ON SCHEMA leave_app TO ${role}; GRANT SELECT ON ALL TABLES IN SCHEMA leave_app TO ${role}; SET LOCAL ROLE ${role};`);
    try {
      assert.deepEqual((await db.query('SELECT * FROM leave_app.employee')).rows, []);
      assert.deepEqual((await db.query('SELECT * FROM leave_app.leave_entitlement_balance')).rows, []);
      assert.deepEqual((await db.query('SELECT * FROM leave_app.maternity_case_balance')).rows, []);
    } finally { await db.exec('ROLLBACK;'); }
  }
});

test('repeat import fails atomically and preserves already changed runtime data', async () => {
  await db.exec("UPDATE leave_app.employee SET department='ข้อมูลที่แก้หลังนำเข้า' WHERE employee_id=1");
  await assert.rejects(db.exec(sql), {code:'42P06'});
  await db.exec('ROLLBACK;');
  const value = await db.query<{department:string}>('SELECT department FROM leave_app.employee WHERE employee_id=1');
  assert.equal(value.rows[0].department, 'ข้อมูลที่แก้หลังนำเข้า');
  assert.equal((await db.query<{count:number}>('SELECT count(*)::integer AS count FROM leave_app.employee')).rows[0].count, 10);
});

test('SQL generation safely preserves quote and backslash characters in seeded names', async () => {
  const isolated = new PGlite();
  try {
    await isolated.exec('CREATE ROLE anon; CREATE ROLE authenticated;');
    const modified = createDemoDatabase();
    modified.employees[0].name = "ชื่อ O'Brien \\ /* ทดสอบ */ ; SELECT 'x';";
    await isolated.exec(generator.buildSupabaseSql(modified));
    const rows = await isolated.query<{name:string}>('SELECT name FROM leave_app.employee WHERE employee_id=1');
    assert.equal(rows.rows[0].name, modified.employees[0].name);
  } finally { await isolated.close(); }
});
