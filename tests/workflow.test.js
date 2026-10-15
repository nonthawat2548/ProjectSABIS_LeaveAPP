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
test('HR consultation cannot approve, manager waits and remains final decision maker', () => {
  const db = createSeed(now);
  const r = db.requests.find((r) => r.id === 1002);
  assert.throws(
    () => command(db, 4, { type: 'approve', id: r.id, version: 1, comment: '' }),
    /รอความเห็น HR/,
  );
  assert.throws(
    () => command(db, 5, { type: 'approve', id: r.id, version: 1, comment: '' }),
    /ไม่มีสิทธิ์/,
  );
  const b = balance(db, 2, 2, 2026);
  command(db, 5, { type: 'consult', id: r.id, version: 1, comment: 'เอกสารครบถ้วน' });
  assert.equal(r.status, 'Pending');
  assert.equal(balance(db, 2, 2, 2026).used, b.used);
  command(db, 4, {
    type: 'approve',
    id: r.id,
    version: r.version,
    comment: 'อนุมัติตามความเห็น HR',
  });
  assert.equal(balance(db, 2, 2, 2026).used, b.used + totalDays(db, r.id));
  assert.equal(balance(db, 1, 2, 2026).used, 0);
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
    /ไม่มีรายการ/,
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
