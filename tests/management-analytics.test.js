import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createDemoDatabase } from '../src/data/demoDatabase.js';
import { visibleSnapshot } from '../src/domain/service.js';
import { managementAnalytics } from '../src/domain/managementAnalytics.js';
import { managementCsv, csvCell } from '../src/domain/managementExport.js';
import { workingDates } from '../src/domain/date.js';

const now = new Date('2026-10-15T05:00:00Z');
const filters = { year: 2026, month: 10 };
const person = (db, id) => db.employees.find((entry) => entry.id === id);
function fresh() {
  const db = createDemoDatabase();
  for (const key of ['requests', 'days', 'approvals', 'workStatuses']) db[key] = [];
  return db;
}
function add(
  db,
  id,
  employeeId,
  { type = 1, date = '2026-10-14', units = 1, status = 'Approved', minutes = 3 } = {},
) {
  const submitted = '2026-10-11T14:30:00.000Z';
  db.requests.push({
    id,
    employeeId,
    leaveTypeId: type,
    maternityCaseId: type === 4 ? 1 : null,
    startDate: date,
    endDate: date,
    requestDate: submitted,
    status,
    duration: units === 0.5 ? 'AM' : 'Full',
    reason: 'ข้อมูลส่วนตัวที่ไม่ส่งออก',
    version: 1,
    timeline: [],
  });
  db.days.push({
    id,
    leaveId: id,
    date,
    units,
    entitlementId:
      db.entitlements.find(
        (entry) =>
          entry.employeeId === employeeId &&
          entry.leaveTypeId === type &&
          entry.year === Number(date.slice(0, 4)),
      )?.id ?? null,
  });
  if (status === 'Approved' && minutes !== null)
    db.approvals.push({
      id,
      leaveId: id,
      approverId: 4,
      reviewRole: 'Manager',
      reviewType: 'Decision',
      stepNo: 1,
      status: 'Approved',
      comment: '',
      assignedAt: submitted,
      reviewedAt: new Date(Date.parse(submitted) + minutes * 60000).toISOString(),
    });
}

test('KPIs use saved units, active scoped headcount, real final decisions and annual balances', () => {
  const db = fresh();
  add(db, 1, 1);
  add(db, 2, 3, { type: 2, date: '2026-10-15', units: 0.5, minutes: 9 });
  add(db, 3, 6, { status: 'Pending', date: '2026-10-16' });
  add(db, 4, 2, { status: 'Rejected' });
  add(db, 5, 5, { date: '2026-10-15', minutes: null });
  add(db, 6, 4, { date: '2026-10-16', minutes: null });
  add(db, 7, 1, { status: 'Pending', date: '2026-11-20', units: 0.5 });
  db.approvals.push({
    ...db.approvals[0],
    id: 100,
    stepNo: 9,
    reviewType: 'Consultation',
    status: 'Completed',
    reviewedAt: '2026-10-11T14:31:00Z',
  });
  db.approvals.push({
    ...db.approvals[0],
    id: 101,
    stepNo: 10,
    cancelled: true,
    reviewedAt: '2026-10-11T15:30:00Z',
  });
  const before = structuredClone(db);
  const hr = managementAnalytics(db, person(db, 5), filters, now);
  assert.equal(hr.headcount, 10);
  assert.equal(hr.summary.approvedDays, 3.5);
  assert.equal(hr.summary.pendingDays, 1);
  assert.equal(hr.rate.denominator, 220);
  assert.equal(hr.rate.numerator, 4.5);
  assert.equal(hr.averageApprovalMs, 6 * 60000);
  assert.equal(hr.approvalCount, 2);
  assert.equal(hr.approvalDetails.find((row) => row.requestId === 1).elapsedMs, 180000);
  assert.equal(hr.approvalDetails.find((row) => row.requestId === 5).elapsedMs, null);
  assert.equal(hr.missingApprovalTimes, 2);
  const employee = hr.rows.find((row) => row.employeeId === 1);
  assert.equal(employee.balances[0].used, 1);
  assert.equal(employee.balances[0].remaining, 9);
  assert.equal(employee.pendingDays, 0.5, 'annual pending is not truncated to October');
  assert.equal(hr.rows.find((row) => row.employeeId === 2).status, 'ยังไม่ได้ระบุสถานะ');
  const manager = managementAnalytics(db, person(db, 4), filters, now);
  assert.equal(manager.headcount, 4);
  assert.equal(manager.rate.denominator, 88);
  assert.equal(manager.rate.numerator, 1.5);
  assert.equal(
    manager.rate.details.reduce((sum, row) => sum + row.units, 0),
    manager.rate.numerator,
  );
  assert.ok(manager.rate.details.every((row) => [1, 2, 3, 10].includes(row.employeeId)));
  assert.deepEqual(
    manager.rows.map((row) => row.employeeId).sort((a, b) => a - b),
    [1, 2, 3, 10],
  );
  assert.deepEqual(
    managementAnalytics(visibleSnapshot(db, 4), person(db, 4), filters, now),
    manager,
  );
  assert.deepEqual(db, before);
});

test('scope rechecks the actual actor, excludes HR despite legacy manager assignment and never exports private fields', () => {
  const db = fresh();
  person(db, 5).managerId = 4;
  add(db, 1, 5);
  assert.throws(() => managementAnalytics(db, { ...person(db, 1), role: 'HR' }, filters, now), {
    code: 'FORBIDDEN',
  });
  assert.throws(() => managementCsv(db, person(db, 1), filters, now), { code: 'FORBIDDEN' });
  assert.throws(
    () =>
      managementAnalytics(db, person(db, 4), { ...filters, department: 'Human Resources' }, now),
    { code: 'FORBIDDEN' },
  );
  assert.equal(managementAnalytics(db, person(db, 4), filters, now).summary.requestCount, 0);
  const csv = managementCsv(db, person(db, 4), filters, now);
  assert.ok(!csv.includes(person(db, 5).name));
  assert.ok(!csv.includes(person(db, 6).name));
  assert.ok(!csv.includes('ข้อมูลส่วนตัวที่ไม่ส่งออก'));
  assert.ok(!csv.includes(person(db, 1).email));
  person(db, 4).active = false;
  assert.throws(() => managementAnalytics(db, person(db, 4), filters, now), {
    code: 'UNAUTHENTICATED',
  });
});

test('calendar maternity days, half-days and cross-year comparison stay distinct from working person-days', () => {
  const db = fresh();
  add(db, 1, 3, { type: 4, date: '2027-01-02' }); // Saturday is saved and shown, but not a working person-day.
  add(db, 2, 3, { type: 4, date: '2027-01-04' });
  add(db, 3, 1, { date: '2027-01-05', units: 0.5 });
  add(db, 4, 3, { type: 4, date: '2026-12-31' }); // Configured holiday.
  const options = { year: 2027, month: 1 };
  const report = managementAnalytics(db, person(db, 5), options, new Date('2027-01-04T05:00:00Z'));
  assert.equal(report.summary.approvedDays, 2.5);
  assert.equal(report.rate.numerator, 1.5);
  assert.equal(report.previousRate.numerator, 0);
  assert.equal(report.monthly[0].approvedDays, 2.5);
  assert.equal(report.rows.find((row) => row.employeeId === 3).status, 'ลางาน');
  const annualOnly = managementAnalytics(
    db,
    person(db, 5),
    { ...options, leaveTypeId: 1 },
    new Date('2027-01-04T05:00:00Z'),
  );
  assert.equal(
    annualOnly.rows.find((row) => row.employeeId === 3).status,
    'ลางาน',
    'status must not change when the leave type filter changes',
  );
  assert.equal(annualOnly.summary.approvedDays, 0.5);
  const cases = managementAnalytics(db, person(db, 5), { ...options, leaveTypeId: 4 }, now);
  assert.equal(cases.annualTypes.length, 0);
  assert.ok(cases.rows.find((row) => row.employeeId === 3).maternity.length);
});

test('empty periods, zero working days, invalid filters, ties and missing approval timestamps are explicit', () => {
  const db = fresh();
  const empty = managementAnalytics(db, person(db, 5), filters, now);
  assert.equal(empty.rate.percent, 0);
  assert.equal(empty.averageApprovalMs, null);
  assert.deepEqual(empty.topTypes, []);
  add(db, 1, 1, { minutes: null });
  add(db, 2, 6, { minutes: -1 });
  const tied = managementAnalytics(db, person(db, 5), filters, now);
  assert.equal(tied.topDepartments.length, 2);
  assert.equal(tied.averageApprovalMs, null);
  assert.equal(tied.missingApprovalTimes, 2);
  for (const date of workingDates('2026-10-01', '2026-10-31'))
    db.holidays.push({ date, name: 'วันหยุด' });
  const zero = managementAnalytics(db, person(db, 5), filters, now);
  assert.equal(zero.rate.denominator, 0);
  assert.equal(zero.rate.percent, null);
  for (const invalid of [{ month: 0 }, { month: 13 }, { year: NaN }, { leaveTypeId: 999 }])
    assert.throws(() => managementAnalytics(db, person(db, 5), { ...filters, ...invalid }, now), {
      code: 'VALIDATION',
    });
  person(db, 1).active = false;
  assert.ok(
    !managementAnalytics(db, person(db, 5), filters, now).rows.some((row) => row.employeeId === 1),
  );
});

test('official Orathai example uses the final 21:33 decision instead of the 21:32 HR opinion', () => {
  const db = createDemoDatabase();
  const report = managementAnalytics(
    db,
    person(db, 5),
    { ...filters, department: 'IT Department', leaveTypeId: 3 },
    now,
  );
  assert.equal(report.averageApprovalMs, 180000);
  assert.equal(report.approvalCount, 1);
  assert.equal(report.summary.approvedDays, 1);
});

test('rate detail groups person/date by employee ID, caps overlaps and retains all source request links', () => {
  const db = fresh();
  person(db, 2).name = person(db, 1).name;
  add(db, 1, 1);
  add(db, 2, 1, { status: 'Pending' });
  add(db, 3, 2, { units: 0.5 });
  const report = managementAnalytics(db, person(db, 4), filters, now);
  assert.equal(report.rate.details.length, 2);
  assert.equal(report.rate.numerator, 1.5);
  assert.deepEqual(report.rate.details[0], {
    employeeId: 1,
    date: '2026-10-14',
    units: 1,
    rawUnits: 2,
    requestIds: [1, 2],
  });
  assert.equal(report.rate.details[1].employeeId, 2);
  assert.equal(report.rate.details[1].units, 0.5);
});

test('CSV handles Thai, commas, quotes, newlines and formulas without altering source data', () => {
  assert.equal(csvCell('=1+2'), '"\'=1+2"');
  assert.equal(csvCell(-1), '"-1"');
  assert.equal(csvCell(' \t@SUM(A1)'), '"\' \t@SUM(A1)"');
  assert.equal(csvCell('ชื่อ, "ทดสอบ"\nใหม่'), '"ชื่อ, ""ทดสอบ""\nใหม่"');
  const db = fresh();
  person(db, 1).name = '=HYPERLINK("https://example.test")';
  const original = structuredClone(db);
  const csv = managementCsv(db, person(db, 4), filters, now);
  assert.ok(csv.startsWith('\uFEFF'));
  assert.ok(csv.includes('"\'=HYPERLINK(""https://example.test"")"'));
  assert.ok(csv.includes('ลาพักร้อน ใช้แล้ว (วัน)'));
  assert.deepEqual(db, original);
});
