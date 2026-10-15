/**
 * @typedef {import('../src/domain/types.js').Command} Command
 * @typedef {import('../src/domain/types.js').Database} Database
 * @typedef {import('../src/domain/types.js').RequestInput} RequestInput
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createSeed } from '../src/domain/seed.js';
import {
  applyCommand,
  balance,
  DomainError,
  previewRequest,
  totalDays,
} from '../src/domain/service.js';
const now = new Date('2026-10-10T05:00:00Z');
/**
 * @type {RequestInput}
 */
const input = {
  leaveTypeId: 4,
  maternityCaseId: 1,
  startDate: '2026-12-04',
  endDate: '2026-12-06',
  duration: 'Full',
  reason: 'เตรียมคลอดและพักฟื้น',
};
/**
 * @param {any} [maximumDays]
 */
function fixture(maximumDays = 9) {
  const db = createSeed(now);
  db.requests = [];
  db.days = [];
  db.approvals = [];
  db.documents = [];
  db.notifications = [];
  db.maternityCases[0].maximumDays = maximumDays;
  return db;
}
/**
 * @param {Database} db
 * @param {number} actor
 * @param {Command} command
 * @param {any} [at]
 */
const send = (db, actor, command, at = now) => applyCommand(db, actor, command, at);
/**
 * @param {Database} db
 */
const owner = (db) => db.employees.find((e) => e.id === 3);
/**
 * @param {Database} db
 * @param {number} actor
 * @param {Command} command
 * @param {RegExp} message
 * @param {string} [code]
 */
function fails(db, actor, command, message, code) {
  const before = structuredClone(db);
  assert.throws(
    () => send(db, actor, command),
    (error) =>
      error instanceof DomainError && message.test(error.message) && (!code || error.code === code),
  );
  assert.deepEqual(
    db,
    before,
    'Failed validation must not alter requests, reviews, documents or quotas',
  );
}
/**
 * @param {Database} db
 * @param {any} [data]
 */
function submit(db, data = input) {
  return send(db, 3, { type: 'submit', input: data }).id;
}
/**
 * @param {Database} db
 * @param {number} id
 * @param {any} [at]
 */
function approve(db, id, at = now) {
  return send(
    db,
    4,
    { type: 'approve', id, version: db.requests.find((r) => r.id === id).version, comment: '' },
    at,
  );
}
test('Maternity checks authentication and authority before the stored owner gender', () => {
  const db = fixture();
  fails(db, 999, { type: 'submit', input }, /เข้าสู่ระบบ/, 'UNAUTHENTICATED');
  fails(db, 4, { type: 'submit', input }, /พนักงานชาย/);
  const id = submit(db);
  fails(db, 5, { type: 'approve', id, version: 1, comment: '' }, /ไม่มีสิทธิ์/, 'FORBIDDEN');
  fails(db, 2, { type: 'edit', id, version: 1, input }, /ผู้อื่น/, 'FORBIDDEN');
});
test('Male, Other and malformed stored gender stop before case, manager, dates, reason or quota', () => {
  for (const gender of ['Male', 'Other', null, undefined, '', 'female', 'Unknown']) {
    const db = fixture(1);
    Object.assign(owner(db), { gender, managerId: null });
    db.maternityCases = [];
    const invalid = {
      ...input,
      maternityCaseId: 999,
      startDate: '',
      endDate: '',
      reason: '',
      duration: /** @type {const} */ ('AM'),
    };
    fails(
      db,
      3,
      { type: 'submit', input: invalid },
      gender === 'Male' ? /พนักงานชายไม่มีสิทธิ์ยื่นลาคลอด/ : /ติดต่อ HR.*ข้อมูลเพศ/,
    );
    const forgedActor = { ...owner(db), gender: /** @type {const} */ ('Female'), managerId: 4 };
    assert.throws(
      () => previewRequest(db, forgedActor, invalid, undefined, now),
      gender === 'Male' ? /พนักงานชาย/ : /ข้อมูลเพศ/,
    );
  }
  const db = fixture();
  Reflect.deleteProperty(owner(db), 'gender');
  fails(db, 3, { type: 'submit', input }, /ติดต่อ HR.*ข้อมูลเพศ/);
});
test('Maternity case must exist and belong to the owner before checking a manager or dates', () => {
  const db = fixture();
  db.maternityCases = [];
  owner(db).managerId = null;
  fails(
    db,
    3,
    { type: 'submit', input: { ...input, maternityCaseId: null, startDate: '', reason: '' } },
    /^ยังไม่มีกรณีลาคลอด กรุณาติดต่อ HR เพื่อเปิดกรณีก่อนยื่นคำขอ$/,
  );
  db.maternityCases.push({ id: 1, employeeId: 1, caseNo: 1, maximumDays: 9 });
  fails(db, 3, { type: 'submit', input }, /ไม่ใช่ของเจ้าของคำขอ/);
  fails(db, 3, { type: 'submit', input: { ...input, maternityCaseId: 999 } }, /ไม่พบกรณีลาคลอด/);
  db.maternityCases[0].employeeId = 3;
  fails(db, 3, { type: 'submit', input: { ...input, maternityCaseId: null } }, /เลือกกรณีลาคลอด/);
});
test('Maternity validates manager, then dates/full day, then reason and existing policy', () => {
  const db = fixture();
  for (const managerId of [null, 999, 2]) {
    owner(db).managerId = managerId;
    fails(db, 3, { type: 'submit', input: { ...input, startDate: '', reason: '' } }, /ผู้จัดการ/);
  }
  owner(db).managerId = 4;
  db.employees.find((e) => e.id === 4).active = false;
  fails(
    db,
    3,
    { type: 'submit', input: { ...input, startDate: '', reason: '' } },
    /ผู้จัดการผู้พิจารณา/,
  );
  db.employees.find((e) => e.id === 4).active = true;
  fails(
    db,
    3,
    { type: 'submit', input: { ...input, startDate: '', reason: '' } },
    /วันที่ไม่ถูกต้อง/,
  );
  for (const duration of /** @type {const} */ (['AM', 'PM']))
    fails(
      db,
      3,
      { type: 'submit', input: { ...input, duration, reason: '' } },
      /ลาคลอดใช้การลาเต็มวัน/,
    );
  fails(db, 3, { type: 'submit', input: { ...input, reason: ' ' } }, /ระบุเหตุผล/);
  fails(
    db,
    3,
    { type: 'submit', input: { ...input, startDate: '2026-10-10', endDate: '2026-10-10' } },
    /กรุณายื่นขอล่วงหน้าอย่างน้อย 1 วัน/,
  );
  const policy = db.leaveTypes.find((t) => t.id === 4);
  policy.documentRequiredFromDays = 3;
  policy.requiredDocumentType = 'Medical Certificate';
  fails(db, 3, { type: 'submit', input }, /ต้องแนบใบรับรองแพทย์/);
  const pdf = '%PDF-1.4\nmaternity test';
  const documentInput = {
    ...input,
    attachment: {
      fileName: 'certificate.pdf',
      fileType: 'application/pdf',
      fileSize: Buffer.byteLength(pdf),
      dataUrl: 'data:application/pdf;base64,' + Buffer.from(pdf).toString('base64'),
    },
  };
  const id = submit(db, documentInput);
  fails(db, 3, { type: 'submit', input }, /ต้องแนบใบรับรองแพทย์/); // Policy before overlap.
  fails(db, 3, { type: 'submit', input: documentInput }, /ไม่สามารถยื่นคำขอลาซ้ำ/);
  send(db, 3, { type: 'edit', id, version: 1, input: { ...input, keepDocument: true } });
  assert.equal(db.documents.filter((d) => d.leaveId === id).length, 1);
  fails(
    db,
    3,
    { type: 'edit', id, version: 2, input: { ...input, keepDocument: false } },
    /ต้องแนบใบรับรองแพทย์/,
  );
});
test('Maternity counts holidays, weekends and cross-year dates against the selected case only', () => {
  const db = fixture(7);
  db.holidays = [
    { date: '2026-12-04', name: 'วันหยุดทดสอบ' },
    { date: '2026-12-05', name: 'วันหยุดทดสอบ 2' },
  ];
  const id = submit(db);
  assert.equal(totalDays(db, id), 3, 'Friday holiday, Saturday and Sunday all count');
  const cross = submit(db, { ...input, startDate: '2026-12-31', endDate: '2027-01-03' });
  assert.equal(totalDays(db, cross), 4);
  assert(db.days.every((d) => d.entitlementId === null && d.units === 1));
  const annual = db.entitlements
    .filter((e) => e.employeeId === 3)
    .map((e) => balance(db, 3, e.leaveTypeId, e.year).used);
  approve(db, id);
  approve(db, cross);
  assert.deepEqual(balance(db, 3, 4, 0, 1), { total: 7, used: 7, remaining: 0, pending: 0 });
  assert.deepEqual(
    db.entitlements
      .filter((e) => e.employeeId === 3)
      .map((e) => balance(db, 3, e.leaveTypeId, e.year).used),
    annual,
  );
});
test('Maternity allows 120 calendar days and rejects an oversized case or request', () => {
  const db = fixture(120);
  const data = { ...input, startDate: '2026-11-01', endDate: '2027-02-28' };
  fails(db, 5, { type: 'maternity', employeeId: 3, maximumDays: 121 }, /กรณีลาคลอดไม่ถูกต้อง/);
  fails(db, 3, { type: 'submit', input: { ...data, endDate: '2027-03-01' } }, /โควตา/);
  db.maternityCases[0].maximumDays = 121;
  fails(db, 3, { type: 'submit', input: data }, /ข้อมูลสิทธิ์ของกรณีลาคลอดไม่ถูกต้อง/);
  db.maternityCases[0].maximumDays = 120;
  const id = submit(db, data);
  assert.equal(totalDays(db, id), 120);
});

test('Used and pending days block excess maternity requests, after overlap is checked', () => {
  const db = fixture(9);
  const used = submit(db);
  approve(db, used);
  const pending = submit(db, { ...input, startDate: '2026-12-10', endDate: '2026-12-12' });
  assert.deepEqual(balance(db, 3, 4, 0, 1), { total: 9, used: 3, pending: 3, remaining: 6 });
  fails(
    db,
    3,
    { type: 'submit', input: { ...input, startDate: '2026-12-20', endDate: '2026-12-23' } },
    /โควตา/,
  );
  fails(
    db,
    3,
    { type: 'submit', input: { ...input, startDate: '2026-12-10', endDate: '2026-12-23' } },
    /ไม่สามารถยื่นคำขอลาซ้ำ/,
  );
  send(db, 3, { type: 'withdraw', id: pending, version: 1 });
  assert.equal(balance(db, 3, 4, 0, 1).pending, 0);
  assert.equal(balance(db, 3, 4, 0, 1).used, 3);
});
test('Editing maternity excludes its original days, restarts reviews and clears case on annual leave', () => {
  const db = fixture(3),
    id = submit(db);
  send(db, 4, { type: 'refer', id, version: 1, hrId: 5, comment: 'ตรวจสอบกรณี' });
  send(db, 3, { type: 'edit', id, version: 2, input: { ...input, reason: 'แก้ไขเหตุผล' } });
  assert.equal(balance(db, 3, 4, 0, 1).pending, 3);
  assert.equal(balance(db, 3, 4, 0, 1, id).pending, 0);
  assert.equal(totalDays(db, id), 3);
  assert(
    db.approvals
      .filter((a) => a.leaveId === id && a.reviewType === 'Consultation')
      .every((a) => a.cancelled),
  );
  fails(
    db,
    3,
    { type: 'edit', id, version: 3, input: { ...input, endDate: '2026-12-07' } },
    /โควตา/,
  );
  send(db, 3, {
    type: 'edit',
    id,
    version: 3,
    input: { ...input, leaveTypeId: 1, startDate: '2026-12-07', endDate: '2026-12-07' },
  });
  assert.equal(db.requests.find((r) => r.id === id).maternityCaseId, null);
  assert.equal(balance(db, 3, 4, 0, 1).pending, 0);
  assert.equal(balance(db, 3, 1, 2026).pending, 1);
});
test('A male manager approves a female owner once, including after the leave starts', () => {
  const db = fixture(3),
    id = submit(db);
  assert.equal(db.employees.find((e) => e.id === 4).gender, 'Male');
  approve(db, id, new Date('2026-12-05T05:00:00Z'));
  assert.deepEqual(balance(db, 3, 4, 0, 1), { total: 3, used: 3, pending: 0, remaining: 0 });
  fails(
    db,
    4,
    { type: 'approve', id, version: 1, comment: '' },
    /ไม่ได้อยู่ในสถานะรอพิจารณา/,
    'CONFLICT',
  );
  assert.equal(balance(db, 3, 4, 0, 1).used, 3);
});
test('Approval measures notice from the latest edit instead of the decision date or old submission', () => {
  const db = fixture(),
    id = submit(db);
  send(db, 3, { type: 'edit', id, version: 1, input }, new Date('2026-12-03T05:00:00Z'));
  db.leaveTypes.find((t) => t.id === 4).advanceNoticeDays = 2;
  assert.throws(
    () => approve(db, id, new Date('2026-12-05T05:00:00Z')),
    /กรุณายื่นขอล่วงหน้าอย่างน้อย 2 วัน/,
  );
  assert.equal(db.requests[0].status, 'Pending');
  assert.equal(balance(db, 3, 4, 0, 1).used, 0);
});
test('Editing and approval recheck the latest owner gender before missing case or quota', () => {
  for (const gender of ['Male', 'Other', undefined]) {
    const db = fixture(3),
      id = submit(db);
    Object.assign(owner(db), { gender });
    db.maternityCases = [];
    const pattern = gender === 'Male' ? /พนักงานชาย/ : /ติดต่อ HR.*ข้อมูลเพศ/;
    fails(db, 3, { type: 'edit', id, version: 1, input: { ...input, startDate: '' } }, pattern);
    fails(db, 4, { type: 'approve', id, version: 1, comment: '' }, pattern);
  }
});
test('Approval rechecks case ownership, case existence, full day, documents and current quota', () => {
  for (const mutation of /** @type {const} */ ([
    'owner',
    'missing',
    'duration',
    'document',
    'quota',
    'pending',
  ])) {
    const db = fixture(6),
      id = submit(db);
    if (mutation === 'owner') db.maternityCases[0].employeeId = 1;
    if (mutation === 'missing') db.maternityCases = [];
    if (mutation === 'duration') db.requests[0].duration = 'AM';
    if (mutation === 'document') {
      db.leaveTypes.find((t) => t.id === 4).documentRequiredFromDays = 3;
    }
    if (mutation === 'quota') db.maternityCases[0].maximumDays = 2;
    if (mutation === 'pending') {
      submit(db, { ...input, startDate: '2026-12-10', endDate: '2026-12-12' });
      db.maternityCases[0].maximumDays = 5;
    }
    const patterns = {
      owner: /ไม่ใช่ของเจ้าของคำขอ/,
      missing: /ไม่พบกรณีลาคลอด/,
      duration: /ลาคลอดใช้การลาเต็มวัน/,
      document: /ต้องแนบ/,
      quota: /โควตา/,
      pending: /โควตา/,
    };
    fails(
      db,
      4,
      { type: 'approve', id, version: 1, comment: '' },
      patterns[mutation],
      mutation === 'quota' || mutation === 'pending' ? 'CONFLICT' : undefined,
    );
    assert.equal(db.requests.find((r) => r.id === id).status, 'Pending');
    assert.equal(balance(db, 3, 4, 0, 1).used, 0);
  }
});
test('HR opens maternity cases from the selected employee gender, not the HR account', () => {
  const db = fixture();
  db.employees.find((e) => e.id === 5).gender = 'Male';
  const id = send(db, 5, { type: 'maternity', employeeId: 1, maximumDays: 17 }).id;
  assert.equal(db.maternityCases.find((c) => c.id === id).maximumDays, 17);
  fails(db, 5, { type: 'maternity', employeeId: 2, maximumDays: 0 }, /พนักงานชาย/);
  for (const gender of ['Other', null, undefined, 'invalid']) {
    Object.assign(
      db.employees.find((e) => e.id === 2),
      { gender },
    );
    fails(db, 5, { type: 'maternity', employeeId: 2, maximumDays: 0 }, /ติดต่อ HR.*ข้อมูลเพศ/);
  }
  fails(db, 3, { type: 'maternity', employeeId: 1, maximumDays: 17 }, /ฝ่ายบุคคล/, 'FORBIDDEN');
});
test('Maternity referral delegates the final decision to HR', () => {
  const db = fixture(),
    id = submit(db);
  send(db, 4, { type: 'refer', id, version: 1, hrId: 5, comment: 'ตรวจเอกสาร' });
  fails(db, 4, { type: 'approve', id, version: 2, comment: '' }, /ไม่มีสิทธิ์/, 'FORBIDDEN');
  assert.equal(balance(db, 3, 4, 0, 1).used, 0);
  send(db, 5, { type: 'approve', id, version: 2, comment: 'ตรวจแล้ว' });
  assert.equal(balance(db, 3, 4, 0, 1).used, 3);
});
