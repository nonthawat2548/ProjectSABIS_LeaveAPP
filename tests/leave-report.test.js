import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createDemoDatabase } from '../src/data/demoDatabase.js';
import { applyCommand, canView, visibleSnapshot } from '../src/domain/service.js';
import { leaveSummaryPeople, summarizeLeave } from '../src/domain/leaveSummary.js';
import { isLeaveReport, notificationTitle } from '../src/domain/leaveReport.js';

const command = {
  type: 'sendLeaveReport',
  year: 2026,
  month: 0,
  leaveTypeId: 0,
  employeeId: 1,
  hrId: 5,
};
const now = new Date('2026-10-14T05:00:00.000Z');

test('manager sends a persisted report and a copy, without changing leave records or quotas', () => {
  const db = createDemoDatabase(),
    before = structuredClone(db);
  const result = applyCommand(db, 4, command, now);
  assert.equal(db.notifications.length, before.notifications.length + 2);
  const [received, copy] = db.notifications.slice(-2);
  assert.equal(received.employeeId, 5);
  assert.equal(copy.employeeId, 4);
  assert.equal(received.text, copy.text);
  assert.equal(received.id, result.id);
  assert.equal(received.read, false);
  assert.equal(received.leaveId, null);
  assert.equal(received.createdAt, now.toISOString());
  assert.ok(isLeaveReport(received.text));
  assert.match(notificationTitle(received.text), /ธนวัฒน์/);
  assert.match(received.text, /พนักงาน: พิมพ์ชนก/);
  assert.ok(!received.text.includes('กานต์ พรชัย'));
  assert.equal(visibleSnapshot(db, 5).notifications.at(-1).text, received.text);
  assert.ok(!visibleSnapshot(db, 1).notifications.some((item) => item.id === received.id));
  db.employees.find((person) => person.id === 4).role = 'Employee';
  assert.ok(!visibleSnapshot(db, 4).notifications.some((item) => isLeaveReport(item.text)));
  db.employees.find((person) => person.id === 4).role = 'Manager';
  db.employees.find((person) => person.id === 5).role = 'Manager';
  assert.ok(!visibleSnapshot(db, 5).notifications.some((item) => isLeaveReport(item.text)));
  db.employees.find((person) => person.id === 5).role = 'HR';
  db.notifications = before.notifications;
  assert.deepEqual(db, before);
});

test('report uses selected saved days for half days and cross-year requests and stays immutable', () => {
  const db = createDemoDatabase();
  db.requests = [
    {
      ...db.requests[0],
      id: 1001,
      employeeId: 1,
      leaveTypeId: 1,
      startDate: '2026-12-31',
      endDate: '2027-01-04',
      status: 'Approved',
    },
  ];
  db.days = [
    { id: 1, leaveId: 1001, date: '2026-12-31', units: 0.5, entitlementId: null },
    { id: 2, leaveId: 1001, date: '2027-01-04', units: 1, entitlementId: null },
  ];
  applyCommand(db, 4, { ...command, month: 12, leaveTypeId: 1 }, now);
  const text = db.notifications.at(-1).text;
  assert.match(text, /อนุมัติแล้ว: 1 คำขอ \/ 0.5 วัน/);
  assert.match(text, /ธันวาคม 2569/);
  assert.match(text, /0.5 วันในช่วงที่เลือก/);
  db.requests[0].status = 'Withdrawn';
  db.days[0].units = 1;
  assert.equal(db.notifications.at(-1).text, text);
});

test('direct report commands forbid employees, HR, other teams and HR assigned to the manager', () => {
  for (const [actorId, employeeId] of [
    [1, 1],
    [5, 1],
    [4, 6],
    [4, 5],
    [4, 999],
  ]) {
    const db = createDemoDatabase();
    db.employees.find((p) => p.id === 5).managerId = 4;
    const before = structuredClone(db);
    assert.throws(
      () => applyCommand(db, actorId, { ...command, employeeId }, now),
      (error) => error.code === 'FORBIDDEN',
    );
    assert.deepEqual(db, before);
  }
  const db = createDemoDatabase(),
    manager = db.employees.find((p) => p.id === 4);
  db.employees.find((p) => p.id === 5).managerId = 4;
  assert.ok(!leaveSummaryPeople(db, manager).some((p) => p.id === 5));
  assert.throws(
    () => summarizeLeave(db, manager, { year: 2026, employeeId: 5 }),
    (error) => error.code === 'FORBIDDEN',
  );
  const hrRequest = { ...db.requests[0], id: 9999, employeeId: 5 };
  assert.equal(canView(db, manager, hrRequest), false);
  db.requests.push(hrRequest);
  hrRequest.status = 'Pending';
  hrRequest.version = 1;
  assert.ok(!visibleSnapshot(db, 4).requests.some((r) => r.employeeId === 5));
  assert.ok(!visibleSnapshot(db, 4).entitlements.some((e) => e.employeeId === 5));
  for (const type of ['approve', 'reject', 'refer'])
    assert.throws(
      () => applyCommand(db, 4, { type, id: 9999, version: 1, comment: 'ทดสอบ', hrId: 5 }, now),
      (error) => error.code === 'FORBIDDEN',
    );
});

test('invalid recipient, filters, inactive actor and oversized reports leave notifications unchanged', () => {
  for (const patch of [
    { hrId: 1 },
    { hrId: 999 },
    { year: 1899 },
    { month: 13 },
    { employeeId: -1 },
    { leaveTypeId: 999 },
  ]) {
    const db = createDemoDatabase(),
      before = structuredClone(db);
    assert.throws(() => applyCommand(db, 4, { ...command, ...patch }, now));
    assert.deepEqual(db, before);
  }
  const db = createDemoDatabase();
  db.employees.find((p) => p.id === 5).active = false;
  assert.throws(() => applyCommand(db, 4, command, now));
  db.employees.find((p) => p.id === 5).active = true;
  db.employees.find((p) => p.id === 4).active = false;
  assert.throws(
    () => applyCommand(db, 4, command, now),
    (error) => error.code === 'UNAUTHENTICATED',
  );
  db.employees.find((p) => p.id === 4).active = true;
  db.employees.find((p) => p.id === 1).name = 'ก'.repeat(150000);
  const before = structuredClone(db);
  assert.throws(() => applyCommand(db, 4, command, now), /รายงานมีรายการมากเกินไป/);
  assert.deepEqual(db, before);
});

test('an empty period produces a truthful zero report and ordinary notifications keep their text', () => {
  const db = createDemoDatabase();
  applyCommand(db, 4, { ...command, year: 2030 }, now);
  assert.match(db.notifications.at(-1).text, /คำขอทั้งหมด: 0 คำขอ/);
  assert.equal(notificationTitle('อัปเดตสิทธิ์แล้ว'), 'อัปเดตสิทธิ์แล้ว');
  assert.equal(isLeaveReport('รายงานสรุปการลาอื่น'), false);
});
