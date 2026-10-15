/**
 * @typedef {import('../src/domain/types.js').Database} Database
 * @typedef {import('../src/domain/types.js').RequestInput} RequestInput
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createSeed } from '../src/domain/seed.js';
import {
  applyCommand,
  balance,
  effectiveWorkStatus,
  previewRequest,
  totalDays,
  visibleSnapshot,
} from '../src/domain/service.js';
const now = new Date('2026-10-10T05:00:00Z');
/**
 * @type {RequestInput}
 */
const input = {
  leaveTypeId: 1,
  maternityCaseId: null,
  startDate: '2026-12-04',
  endDate: '2026-12-04',
  duration: 'Full',
  reason: 'ทดสอบการยื่นลา',
};
/**
 * @param {Database} db
 * @param {number} actor
 * @param {Parameters<typeof applyCommand>[2]} c
 */
function command(db, actor, c) {
  return applyCommand(db, actor, c, now);
}
test('Submission, approval, quota and daily leave status agree', () => {
  const db = createSeed(now);
  const before = balance(db, 1, 1, 2026);
  const { id } = command(db, 1, { type: 'submit', input });
  assert.equal(balance(db, 1, 1, 2026).used, before.used);
  assert.equal(balance(db, 1, 1, 2026).pending, before.pending + 1);
  command(db, 4, { type: 'approve', id: id, version: 1, comment: '' });
  assert.equal(balance(db, 1, 1, 2026).used, before.used + 1);
  assert.equal(effectiveWorkStatus(db, 1, '2026-12-04'), 'Leave');
  assert.throws(() => command(db, 4, { type: 'approve', id: id, version: 1, comment: '' }));
  assert.equal(balance(db, 1, 1, 2026).used, before.used + 1);
});
test('HR becomes the final reviewer after referral and cannot return an opinion', () => {
  const db = createSeed(now);
  const r = db.requests.find((r) => r.id === 1002);
  assert.throws(
    () => command(db, 4, { type: 'approve', id: r.id, version: 1, comment: '' }),
    /ไม่มีสิทธิ์/,
  );
  const b = balance(db, 2, 2, 2026);
  const before = structuredClone(db);
  assert.throws(
    () => command(db, 5, { type: 'consult', id: r.id, version: 1, comment: 'เอกสารครบถ้วน' }),
    { code: 'FORBIDDEN' },
  );
  assert.deepEqual(db, before);
  assert.equal(r.status, 'Pending');
  assert.equal(balance(db, 2, 2, 2026).used, b.used);
  assert.throws(
    () => command(db, 5, { type: 'reject', id: r.id, version: r.version, comment: '' }),
    /ระบุข้อความ/,
  );
  command(db, 5, {
    type: 'reject',
    id: r.id,
    version: r.version,
    comment: 'เอกสารไม่ครบถ้วน',
  });
  assert.equal(r.status, 'Rejected');
  assert.equal(balance(db, 2, 2, 2026).used, b.used);
  assert.equal(
    db.approvals.find((a) => a.leaveId === r.id && a.reviewType === 'Decision' && !a.cancelled)
      .approverId,
    5,
  );
  assert.equal(balance(db, 1, 2, 2026).used, 0);
});
test('Assigned HR approval finalizes a referral once, preserves authorship and notifies both parties', () => {
  const db = createSeed(now);
  const r = db.requests.find((r) => r.id === 1002);
  const before = balance(db, 2, 2, 2026);
  command(db, 5, { type: 'approve', id: r.id, version: r.version, comment: 'เอกสารครบถ้วน' });
  assert.equal(r.status, 'Approved');
  assert.equal(balance(db, 2, 2, 2026).used, before.used + totalDays(db, r.id));
  assert.equal(r.timeline.at(-1).actorId, 5);
  const steps = db.approvals.filter((step) => step.leaveId === r.id);
  assert.equal(steps.find((step) => step.approverId === 4).cancelled, true);
  assert.equal(steps.find((step) => step.reviewType === 'Consultation').status, 'Completed');
  const decisions = steps.filter((step) => step.reviewType === 'Decision' && !step.cancelled);
  assert.equal(decisions.length, 1);
  assert.equal(decisions[0].approverId, 5);
  assert.equal(decisions[0].reviewRole, 'HR');
  assert.equal(decisions[0].status, 'Approved');
  assert.equal(decisions[0].reviewedAt, now.toISOString());
  assert.equal(
    steps.some((step) => !step.cancelled && step.status === 'Pending'),
    false,
  );
  for (const recipient of [2, 4])
    assert(
      db.notifications.some(
        (n) => n.employeeId === recipient && n.leaveId === r.id && /อนุมัติ/.test(n.text),
      ),
    );
  const approved = structuredClone(db);
  for (const actor of [4, 5])
    for (const version of [1, r.version])
      assert.throws(
        () => command(db, actor, { type: 'approve', id: r.id, version, comment: '' }),
        (error) => error.code === 'CONFLICT',
      );
  assert.deepEqual(db, approved);
});
test('HR decisions require an active assigned HR and owner', () => {
  const changes = [
    (db) => {
      db.approvals.find((a) => a.reviewType === 'Consultation').cancelled = true;
    },
    (db) => {
      db.approvals.find((a) => a.reviewType === 'Consultation').approverId = 6;
    },
    (db) => {
      db.employees.find((e) => e.id === 2).active = false;
    },
    (db) => {
      db.requests.find((r) => r.id === 1002).employeeId = 5;
    },
  ];
  for (const change of changes) {
    const db = createSeed(now);
    change(db);
    const before = structuredClone(db);
    assert.throws(
      () => command(db, 5, { type: 'approve', id: 1002, version: 1, comment: '' }),
      (error) => error.code === 'FORBIDDEN',
    );
    assert.deepEqual(db, before);
  }
  const db = createSeed(now);
  for (const actor of [1, 2, 6])
    assert.throws(
      () => command(db, actor, { type: 'approve', id: 1002, version: 1, comment: '' }),
      (error) => error.code === 'FORBIDDEN',
    );
  assert.throws(
    () => command(db, 5, { type: 'approve', id: 1001, version: 1, comment: '' }),
    (error) => error.code === 'FORBIDDEN',
  );
});
test('Referral stays with HR after manager changes, old opinions, and multiple referral rounds', () => {
  for (const state of ['completed', 'inactive manager', 'changed manager']) {
    const db = createSeed(now);
    if (state === 'completed')
      db.approvals.find((a) => a.reviewType === 'Consultation').status = 'Completed';
    if (state === 'inactive manager') db.employees.find((e) => e.id === 4).active = false;
    if (state === 'changed manager') db.employees.find((e) => e.id === 2).managerId = 6;
    assert.throws(() => command(db, 4, { type: 'approve', id: 1002, version: 1, comment: '' }));
    command(db, 5, { type: 'approve', id: 1002, version: 1, comment: '' });
    assert.equal(db.requests.find((r) => r.id === 1002).status, 'Approved');
    assert(
      db.notifications.some(
        (n) => n.employeeId === 4 && n.leaveId === 1002 && n.text.includes('HR อนุมัติ'),
      ),
    );
  }
  const db = createSeed(now);
  db.employees.push({ ...db.employees.find((e) => e.id === 5), id: 11, email: 'hr2@demo.local' });
  const old = db.approvals.find((a) => a.reviewType === 'Consultation');
  old.status = 'Completed';
  db.approvals.push({ ...old, id: 99, stepNo: old.stepNo + 1, approverId: 11, status: 'Pending' });
  assert.throws(() => command(db, 5, { type: 'approve', id: 1002, version: 1, comment: '' }), {
    code: 'FORBIDDEN',
  });
  command(db, 11, { type: 'reject', id: 1002, version: 1, comment: 'ไม่ผ่าน' });
  assert.equal(db.requests.find((r) => r.id === 1002).status, 'Rejected');
});
test('HR referral approval rechecks quota, documents and maternity eligibility before changing anything', () => {
  for (const kind of ['quota', 'document', 'gender']) {
    const db = createSeed(now);
    const ownerId = kind === 'gender' ? 3 : 1;
    const { id } = command(db, ownerId, {
      type: 'submit',
      input: kind === 'gender' ? { ...input, leaveTypeId: 4, maternityCaseId: 1 } : input,
    });
    command(db, 4, { type: 'refer', id, version: 1, hrId: 5, comment: 'ตรวจสอบสิทธิ์' });
    if (kind === 'quota')
      db.entitlements.find(
        (e) => e.employeeId === 1 && e.leaveTypeId === 1 && e.year === 2026,
      ).grantedDays = 0;
    if (kind === 'document') db.leaveTypes.find((t) => t.id === 1).documentRequiredFromDays = 1;
    if (kind === 'gender') db.employees.find((e) => e.id === 3).gender = 'Male';
    const before = structuredClone(db);
    assert.throws(
      () => command(db, 5, { type: 'approve', id, version: 2, comment: '' }),
      /โควตา|เอกสาร|พนักงานชาย/,
    );
    assert.deepEqual(db, before);
  }
});
test('Withdrawal and rejection do not deduct quota; reason required', () => {
  const db = createSeed(now);
  const before = balance(db, 1, 1, 2026);
  command(db, 1, { type: 'withdraw', id: 1001, version: 1 });
  assert.equal(balance(db, 1, 1, 2026).used, before.used);
  const { id } = command(db, 1, { type: 'submit', input });
  assert.throws(
    () => command(db, 4, { type: 'reject', id: id, version: 1, comment: ' ' }),
    /ระบุข้อความ/,
  );
  command(db, 4, { type: 'reject', id: id, version: 1, comment: 'ติดงานของทีม' });
  assert.equal(balance(db, 1, 1, 2026).used, before.used);
});
test('Editing invalidates previous reviews and checks optimistic version', () => {
  const db = createSeed(now);
  command(db, 2, {
    type: 'edit',
    id: 1002,
    version: 1,
    input: { ...input, leaveTypeId: 2, reason: 'แก้ไขเป็นลาป่วยวันเดียว', keepDocument: true },
  });
  assert.equal(db.requests.find((r) => r.id === 1002).version, 2);
  assert.equal(
    db.approvals.some((a) => a.leaveId === 1002 && a.reviewType === 'Consultation' && !a.cancelled),
    false,
  );
  assert.throws(
    () => command(db, 4, { type: 'approve', id: 1002, version: 1, comment: '' }),
    /ข้อมูลถูกเปลี่ยน/,
  );
  assert.throws(
    () => command(db, 5, { type: 'consult', id: 1002, version: 2, comment: 'ข้อมูลเดิม' }),
    /ไม่ส่งความเห็นกลับ/,
  );
  assert.throws(
    () => command(db, 5, { type: 'approve', id: 1002, version: 2, comment: '' }),
    /ไม่มีสิทธิ์/,
  );
});
test('Permissions limit records and commands', () => {
  const db = createSeed(now);
  const employee = visibleSnapshot(db, 1);
  assert(employee.requests.every((r) => r.employeeId === 1));
  assert(employee.notifications.every((n) => n.employeeId === 1));
  const manager = visibleSnapshot(db, 4);
  assert(!manager.employees.some((e) => e.id === 6));
  assert.throws(() => command(db, 2, { type: 'withdraw', id: 1001, version: 1 }), /ผู้อื่น/);
  assert.throws(
    () =>
      command(db, 1, {
        type: 'entitlement',
        employeeId: 1,
        leaveTypeId: 1,
        year: 2026,
        grantedDays: 99,
      }),
    /ฝ่ายบุคคล/,
  );
});
test('Document threshold, advance notice, overlap and half days', () => {
  const db = createSeed(now),
    actor = db.employees[0];
  assert.throws(
    () =>
      previewRequest(
        db,
        actor,
        { ...input, leaveTypeId: 2, startDate: '2026-12-07', endDate: '2026-12-09' },
        undefined,
        now,
      ),
    /ใบรับรองแพทย์/,
  );
  assert.throws(() =>
    previewRequest(
      db,
      actor,
      { ...input, startDate: '2026-10-10', endDate: '2026-10-10' },
      undefined,
      now,
    ),
  );
  const { id } = command(db, 1, { type: 'submit', input: { ...input, duration: 'AM' } });
  assert.equal(totalDays(db, id), 0.5);
  assert.throws(
    () => command(db, 1, { type: 'submit', input: { ...input, duration: 'PM' } }),
    /ไม่สามารถยื่นคำขอลาซ้ำ/,
  );
  assert.throws(() => command(db, 1, { type: 'submit', input }), /ไม่สามารถยื่นคำขอลาซ้ำ/);
  assert.throws(
    () =>
      command(db, 1, {
        type: 'submit',
        input: { ...input, endDate: '2026-12-07', duration: 'AM' },
      }),
    /ครึ่งวัน/,
  );
});
test('Cross-year requests deduct each year separately', () => {
  const db = createSeed(now);
  const { id } = command(db, 1, {
    type: 'submit',
    input: { ...input, startDate: '2026-12-31', endDate: '2027-01-01' },
  });
  command(db, 4, { type: 'approve', id: id, version: 1, comment: '' });
  assert.equal(totalDays(db, id), 2);
  assert.equal(balance(db, 1, 1, 2027).used, 1);
  assert(db.days.filter((d) => d.leaveId === id).every((d) => d.entitlementId !== null));
});
test('Maternity uses per-case calendar-day quota', () => {
  const db = createSeed(now);
  const { id } = command(db, 3, {
    type: 'submit',
    input: {
      ...input,
      leaveTypeId: 4,
      maternityCaseId: 1,
      startDate: '2026-12-04',
      endDate: '2026-12-06',
    },
  });
  assert.equal(totalDays(db, id), 3);
  command(db, 4, { type: 'approve', id: id, version: 1, comment: '' });
  assert.equal(balance(db, 3, 4, 0, 1).remaining, 117);
  assert.throws(
    () =>
      command(db, 2, { type: 'submit', input: { ...input, leaveTypeId: 4, maternityCaseId: 1 } }),
    /ไม่มีสิทธิ์/,
  );
});
test('Holiday applies to new requests; manager rechecks latest quota', () => {
  const db = createSeed(now);
  command(db, 5, { type: 'holiday', date: '2026-12-07', name: 'วันหยุดทดสอบ' });
  const { id } = command(db, 1, {
    type: 'submit',
    input: { ...input, startDate: '2026-12-04', endDate: '2026-12-08' },
  });
  assert.equal(totalDays(db, id), 2);
  db.entitlements.find(
    (e) => e.employeeId === 1 && e.leaveTypeId === 1 && e.year === 2026,
  ).grantedDays = balance(db, 1, 1, 2026).used;
  assert.throws(
    () => command(db, 4, { type: 'approve', id: id, version: 1, comment: '' }),
    /โควตาปัจจุบัน/,
  );
});
