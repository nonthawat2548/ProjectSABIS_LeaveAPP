import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createDemoDatabase } from '../src/data/demoDatabase';
import { applyCommand, DomainError, visibleSnapshot } from '../src/domain/service';
import { searchColleagues } from '../src/domain/colleagues';
import type { Command, Database, RequestInput } from '../src/domain/types';

// go.mjs is plain ESM, shared by npm scripts and this test bridge.
const { findGo } = await import('./go.mjs');
const now = new Date('2026-10-10T05:00:00.000Z');
type Case = {
  name: string;
  database: Database;
  actorId: number;
  command?: Command;
  operation?: string;
  query?: string;
  date?: string;
  now: string;
};
const cases: Case[] = [];
const expected: any[] = [];
const base: RequestInput = {
  leaveTypeId: 1,
  maternityCaseId: null,
  startDate: '2026-12-04',
  endDate: '2026-12-04',
  duration: 'Full',
  reason: 'ทดสอบการลา',
};
const maternity: RequestInput = {
  ...base,
  leaveTypeId: 4,
  maternityCaseId: 1,
  startDate: '2026-12-30',
  endDate: '2027-01-02',
};
function add(name: string, db: Database, actorId: number, command: Command) {
  cases.push({ name, database: structuredClone(db), actorId, command, now: now.toISOString() });
  const copy = structuredClone(db);
  try {
    expected.push({ database: copy, result: applyCommand(copy, actorId, command, now) });
  } catch (e) {
    assert(e instanceof DomainError, name);
    expected.push({ error: { Message: e.message, Code: e.code } });
  }
}
function fresh() {
  const db = createDemoDatabase();
  db.requests = [];
  db.days = [];
  db.approvals = [];
  db.documents = [];
  db.notifications = [];
  return db;
}
function sequence(name: string, db: Database, operations: [number, Command][]) {
  for (const [actor, c] of operations) {
    add(`${name}/${c.type}`, db, actor, c);
    applyCommand(db, actor, c, now);
  }
}
sequence('annual/approve', fresh(), [
  [1, { type: 'submit', input: base }],
  [4, { type: 'approve', id: 1001, version: 1, comment: '' }],
]);
sequence('annual/edit/consult', fresh(), [
  [1, { type: 'submit', input: base }],
  [4, { type: 'refer', id: 1001, version: 1, comment: 'ขอตรวจเอกสาร', hrId: 5 }],
  [5, { type: 'consult', id: 1001, version: 2, comment: 'ตรวจแล้ว' }],
  [1, { type: 'edit', id: 1001, version: 3, input: { ...base, reason: 'แก้ไขคำขอ' } }],
  [4, { type: 'reject', id: 1001, version: 4, comment: 'ติดงาน' }],
]);
sequence('maternity/edit/approve', fresh(), [
  [3, { type: 'submit', input: maternity }],
  [3, { type: 'edit', id: 1001, version: 1, input: maternity }],
  [4, { type: 'approve', id: 1001, version: 2, comment: '' }],
]);
sequence('half days', fresh(), [
  [1, { type: 'submit', input: { ...base, duration: 'AM' } }],
  [1, { type: 'submit', input: { ...base, duration: 'PM' } }],
  [1, { type: 'withdraw', id: 1001, version: 1 }],
]);
for (const actor of [999, 4, 5, 7])
  add(`submit authority ${actor}`, fresh(), actor, { type: 'submit', input: base });
for (const gender of ['Male', 'Other', '', 'female', 'Unknown', null]) {
  const db = fresh();
  Object.assign(db.employees[2], { gender, managerId: null });
  db.maternityCases = [];
  add(`gender ${gender}`, db, 3, {
    type: 'submit',
    input: { ...maternity, maternityCaseId: 999, startDate: 'bad', reason: '', duration: 'AM' },
  });
}
for (const caseId of [null, 2, 999])
  add(`case ${caseId}`, fresh(), 3, {
    type: 'submit',
    input: { ...maternity, maternityCaseId: caseId },
  });
{
  const db = fresh();
  db.maternityCases = [];
  add('no case', db, 3, { type: 'submit', input: { ...maternity, maternityCaseId: null } });
}
for (const i of [
  { ...maternity, duration: 'AM' as const },
  { ...base, startDate: '2026-02-30' },
  { ...base, reason: '' },
  { ...base, endDate: '2027-12-05' },
  { ...base, startDate: '2026-12-05', endDate: '2026-12-06' },
  { ...base, startDate: '2026-10-10', endDate: '2026-10-10' },
  { ...base, leaveTypeId: 2, startDate: '2026-12-07', endDate: '2026-12-09' },
  { ...base, startDate: '2026-12-30', endDate: '2027-01-04' },
])
  add(`validation ${cases.length}`, fresh(), i.leaveTypeId === 4 ? 3 : 1, {
    type: 'submit',
    input: i,
  });
{
  const db = fresh();
  db.maternityCases[0].maximumDays = 3;
  add('case quota', db, 3, { type: 'submit', input: maternity });
}
{
  const db = fresh();
  db.entitlements.find(
    (e) => e.employeeId === 1 && e.leaveTypeId === 1 && e.year === 2026,
  )!.grantedDays = 0;
  add('annual quota', db, 1, { type: 'submit', input: base });
}
{
  const db = fresh();
  applyCommand(db, 1, { type: 'submit', input: base }, now);
  for (const c of [
    { type: 'submit', input: base },
    { type: 'edit', id: 1001, version: 99, input: base },
    { type: 'withdraw', id: 1001, version: 1 },
    { type: 'approve', id: 1001, version: 1, comment: '' },
  ] as Command[])
    add(`pending ${c.type}`, db, c.type === 'submit' ? 1 : 2, c);
}
{
  const db = fresh();
  applyCommand(db, 3, { type: 'submit', input: maternity }, now);
  for (const gender of ['Male', 'Other', 'Female']) {
    db.employees[2].gender = gender as any;
    add(`approval gender ${gender}`, db, 4, { type: 'approve', id: 1001, version: 1, comment: '' });
  }
  db.maternityCases[0].maximumDays = 3;
  add('approval reduced case', db, 4, { type: 'approve', id: 1001, version: 1, comment: '' });
}
{
  const db = fresh();
  sequence('waiting HR', db, [
    [1, { type: 'submit', input: base }],
    [4, { type: 'refer', id: 1001, version: 1, comment: 'ตรวจสิทธิ์', hrId: 5 }],
  ]);
  for (const type of ['approve', 'reject', 'refer'] as const)
    add(`waiting ${type}`, db, 4, { type, id: 1001, version: 2, comment: 'ตรวจแล้ว', hrId: 5 });
  add('wrong HR', db, 1, { type: 'consult', id: 1001, version: 2, comment: 'ตรวจแล้ว' });
}
const pdf = {
  fileName: 'file.pdf',
  fileType: 'application/pdf',
  fileSize: 9,
  dataUrl: 'data:application/pdf;base64,' + Buffer.from('%PDF-1.7\n').toString('base64'),
};
sequence('document preserved', fresh(), [
  [1, { type: 'submit', input: { ...base, attachment: pdf } }],
  [1, { type: 'edit', id: 1001, version: 1, input: { ...base, keepDocument: true } }],
  [4, { type: 'approve', id: 1001, version: 2, comment: 'ครบถ้วน' }],
]);
for (const attachment of [
  { ...pdf, fileSize: 1 },
  { ...pdf, fileType: 'image/png' },
  { ...pdf, fileSize: 26214401 },
  { ...pdf, dataUrl: 'data:application/pdf;base64,@@@' },
  { ...pdf, dataUrl: 'data:application/pdf;base64,' + Buffer.from('not a pdf').toString('base64') },
])
  add('invalid attachment ' + cases.length, fresh(), 1, {
    type: 'submit',
    input: { ...base, attachment },
  });
for (const c of [
  { type: 'work', date: '2026-12-04', statusType: 'WFH' },
  { type: 'readNotifications' },
  { type: 'entitlement', employeeId: 1, leaveTypeId: 1, year: 2026, grantedDays: 11.5 },
  { type: 'maternity', employeeId: 1, maximumDays: 90 },
  { type: 'holiday', date: '2026-12-04', name: 'วันหยุดทดสอบ' },
  { type: 'holiday', date: '2026-12-31', name: '', remove: true },
  {
    type: 'policy',
    policy: { ...fresh().leaveTypes[0], name: 'ลาพักร้อนประจำปี', advanceNoticeDays: 2 },
  },
] as Command[])
  for (const actor of [1, 5]) add(`admin ${c.type} ${actor}`, fresh(), actor, c);
for (const grantedDays of [undefined, null, 0]) {
  add('entitlement required amount ' + grantedDays, fresh(), 5, {
    type: 'entitlement',
    employeeId: 1,
    leaveTypeId: 1,
    year: 2026,
    grantedDays,
  } as unknown as Command);
}
for (const key of [
  'eligibleGender',
  'advanceNoticeDays',
  'defaultQuotaDays',
  'documentRequiredFromDays',
]) {
  const policy = { ...fresh().leaveTypes[0] } as Record<string, unknown>;
  delete policy[key];
  add('policy missing ' + key, fresh(), 5, { type: 'policy', policy } as unknown as Command);
}
add('policy null advance notice', fresh(), 5, {
  type: 'policy',
  policy: { ...fresh().leaveTypes[0], advanceNoticeDays: null },
} as unknown as Command);
for (const actorId of [1, 3, 4, 5, 7, 999]) {
  const db = createDemoDatabase();
  cases.push({
    name: `snapshot ${actorId}`,
    database: db,
    actorId,
    operation: 'snapshot',
    now: now.toISOString(),
  });
  try {
    const result = visibleSnapshot(db, actorId);
    result.documents.forEach((d) => {
      d.dataUrl = '';
      d.remote = true;
    });
    expected.push({ database: db, result });
  } catch (e) {
    assert(e instanceof DomainError);
    expected.push({ error: { Message: e.message, Code: e.code } });
  }
}
for (const query of ['', 'EMP-00008', '8', 'ชุติมา', 'unknown', '  ', 'ｐｉｍ']) {
  const db = createDemoDatabase();
  cases.push({
    name: `colleagues ${query}`,
    database: db,
    actorId: 1,
    operation: 'colleagues',
    query,
    date: '2026-12-05',
    now: now.toISOString(),
  });
  expected.push({ database: db, result: searchColleagues(db, 1, query, '2026-12-05') });
}
function normalize(value: any): any {
  if (Array.isArray(value)) return value.map(normalize);
  if (value && typeof value === 'object') {
    const out: any = {};
    for (const [k, v] of Object.entries(value)) {
      if ((k === 'cancelled' || k === 'remote') && v === false) continue;
      if (k === 'error') {
        out[k] = {
          message: (v as any).message ?? (v as any).Message,
          code: (v as any).code ?? (v as any).Code,
        };
      } else out[k] = normalize(v);
    }
    return out;
  }
  return value;
}
const child = spawn(findGo(), ['run', './scripts/go-contract'], {
  stdio: ['pipe', 'pipe', 'inherit'],
  windowsHide: true,
});
let output = '';
child.stdout.setEncoding('utf8');
child.stdout.on('data', (b) => {
  output += b;
});
child.stdin.end(JSON.stringify(cases));
const code = await new Promise<number | null>((resolve, reject) => {
  child.on('error', reject);
  child.on('exit', resolve);
});
assert.equal(code, 0);
const actual = JSON.parse(output);
assert.equal(actual.length, cases.length);
for (let i = 0; i < cases.length; i++)
  assert.deepEqual(normalize(actual[i]), normalize(expected[i]), cases[i].name);
console.log(`Go / JavaScript contract: ${cases.length} cases passed`);
