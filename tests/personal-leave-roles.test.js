import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createDemoDatabase } from '../src/data/demoDatabase.js';
import { applyCommand, balance, visibleSnapshot } from '../src/domain/service.js';
import { summarizeLeave } from '../src/domain/leaveSummary.js';

const now = new Date('2026-10-10T05:00:00Z');
const input = {
  leaveTypeId: 1,
  maternityCaseId: null,
  startDate: '2026-11-20',
  endDate: '2026-11-20',
  duration: 'Full',
  reason: 'ติดต่อธุระส่วนตัว',
};
function fresh() {
  const db = createDemoDatabase();
  db.requests = [];
  db.days = [];
  db.approvals = [];
  db.documents = [];
  db.notifications = [];
  return db;
}

for (const [ownerId, reviewerId] of [
  [1, 4],
  [4, 5],
  [7, 5],
]) {
  test(`personal leave ${ownerId} routes to ${reviewerId} and never allows self approval`, () => {
    const db = fresh();
    const { id } = applyCommand(db, ownerId, { type: 'submit', input }, now);
    assert.equal(db.approvals[0].approverId, reviewerId);
    assert.ok(db.notifications.some((n) => n.employeeId === reviewerId && n.leaveId === id));
    assert.throws(() => applyCommand(db, ownerId, { type: 'approve', id, version: 1 }, now), {
      code: 'FORBIDDEN',
    });
    assert.ok(visibleSnapshot(db, reviewerId).requests.some((r) => r.id === id));
    applyCommand(db, reviewerId, { type: 'approve', id, version: 1 }, now);
    assert.equal(balance(db, ownerId, 1, 2026).used, 1);
    assert.equal(db.requests[0].status, 'Approved');
    assert.throws(() => applyCommand(db, ownerId, { type: 'withdraw', id, version: 2 }, now), {
      code: 'CONFLICT',
    });
  });
}

test('HR leave never routes down to a department manager, including legacy assignments', () => {
  const db = fresh();
  const hr = db.employees.find((person) => person.id === 5);
  hr.managerId = 4; // Previously configured data must not create an approval right.
  const { id } = applyCommand(db, 1, { type: 'submit', input }, now);
  db.requests[0].employeeId = 5;
  db.documents.push({ id: 1, leaveId: id, fileName: 'private.pdf' });
  const before = structuredClone(db);
  for (const command of [
    { type: 'submit', input },
    { type: 'edit', id, version: 1, input },
  ])
    assert.throws(() => applyCommand(db, 5, command, now), { code: 'FORBIDDEN' });
  for (const type of ['approve', 'reject', 'refer'])
    assert.throws(
      () => applyCommand(db, 4, { type, id, version: 1, comment: 'ตรวจสอบ', hrId: 5 }, now),
      { code: 'FORBIDDEN' },
    );
  assert.deepEqual(db, before);
  const manager = db.employees.find((person) => person.id === 4);
  const scoped = visibleSnapshot(db, 4);
  assert.equal(scoped.requests.length, 0);
  assert.equal(scoped.days.length, 0);
  assert.equal(scoped.documents.length, 0);
  assert.equal(
    scoped.entitlements.some((row) => row.employeeId === 5),
    false,
  );
  assert.equal(summarizeLeave(db, manager, { year: 2026 }).requestCount, 0);
  applyCommand(db, 5, { type: 'withdraw', id, version: 1 }, now);
  assert.equal(db.requests[0].status, 'Withdrawn');
});

test('manager edits and withdraws own pending request; a referral gives HR the final decision', () => {
  const db = fresh();
  const { id } = applyCommand(db, 4, { type: 'submit', input }, now);
  applyCommand(db, 4, { type: 'edit', id, version: 1, input: { ...input, duration: 'AM' } }, now);
  assert.equal(balance(db, 4, 1, 2026).pending, 0.5);
  applyCommand(db, 4, { type: 'withdraw', id, version: 2 }, now);
  assert.equal(balance(db, 4, 1, 2026).pending, 0);
  const request = applyCommand(db, 1, { type: 'submit', input }, now);
  applyCommand(
    db,
    4,
    { type: 'refer', id: request.id, version: 1, hrId: 5, comment: 'ตรวจสิทธิ์วันลา' },
    now,
  );
  assert.throws(
    () =>
      applyCommand(
        db,
        5,
        { type: 'consult', id: request.id, version: 2, comment: 'สิทธิ์เพียงพอ' },
        now,
      ),
    {
      code: 'FORBIDDEN',
    },
  );
  assert.throws(() => applyCommand(db, 4, { type: 'approve', id: request.id, version: 2 }, now), {
    code: 'FORBIDDEN',
  });
  applyCommand(db, 5, { type: 'reject', id: request.id, version: 2, comment: 'ไม่ผ่าน' }, now);
  assert.equal(db.requests.find((r) => r.id === request.id).status, 'Rejected');
});

test('report sample requests match the requested identities, dates, timeline and quota', () => {
  const db = createDemoDatabase();
  const r = db.requests.find((r) => r.id === 1001);
  assert.deepEqual(
    [r.employeeId, r.leaveTypeId, r.startDate, r.endDate, r.status],
    [3, 3, '2026-10-14', '2026-10-14', 'Approved'],
  );
  assert.equal(r.reason, 'ติดต่อทำธุระทางราชการที่สำนักงานเขต');
  assert.equal(r.timeline.at(-1).at, '2026-10-11T14:33:00.000Z');
  assert.equal(balance(db, 3, 3, 2026).remaining, 5);
  assert.equal(db.requests.find((r) => r.id === 1002).employeeId, 1);
  assert.equal(db.requests.find((r) => r.id === 1003).employeeId, 6);
});
