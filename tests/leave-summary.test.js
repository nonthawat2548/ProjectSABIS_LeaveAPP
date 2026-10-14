import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createDemoDatabase } from '../src/data/demoDatabase.js';
import { datesBetween } from '../src/domain/date.js';
import { leaveSummaryYears, summarizeLeave } from '../src/domain/leaveSummary.js';

/** @returns {import('../src/domain/types.js').Database} */
function database() {
  const db = createDemoDatabase();
  db.requests = [];
  db.days = [];
  db.approvals = [];
  return db;
}

/**
 * @param {import('../src/domain/types.js').Database} db
 * @param {object} input
 * @param {number} input.id
 * @param {number} [input.employeeId]
 * @param {number} [input.leaveTypeId]
 * @param {import('../src/domain/types.js').RequestStatus} [input.status]
 * @param {{date: string, units: number}[]} input.days
 */
function addRequest(db, { id, employeeId = 1, leaveTypeId = 1, status = 'Approved', days }) {
  const dates = days.map((day) => day.date).sort();
  db.requests.push({
    id,
    employeeId,
    leaveTypeId,
    maternityCaseId: null,
    startDate: dates[0],
    endDate: dates.at(-1),
    requestDate: '2025-12-01T18:00:00.000Z',
    status,
    duration: days[0]?.units === 0.5 ? 'AM' : 'Full',
    reason: 'ทดสอบสรุปการลา',
    version: 1,
    timeline: [],
  });
  for (const day of days)
    db.days.push({
      id: db.days.length + 1,
      leaveId: id,
      entitlementId: null,
      ...day,
    });
}

function actor(db, id = 1) {
  return db.employees.find((employee) => employee.id === id);
}

test('summary keeps half-day units and separates rejected and withdrawn request counts', () => {
  const db = database();
  addRequest(db, { id: 1, days: [{ date: '2026-01-05', units: 0.5 }] });
  addRequest(db, {
    id: 2,
    status: 'Pending',
    days: [{ date: '2026-01-06', units: 0.5 }],
  });
  addRequest(db, {
    id: 3,
    status: 'Rejected',
    days: [{ date: '2026-02-02', units: 1 }],
  });
  addRequest(db, {
    id: 4,
    status: 'Withdrawn',
    days: [{ date: '2026-03-02', units: 1 }],
  });
  const result = summarizeLeave(db, actor(db), { year: 2026 });
  assert.equal(result.requestCount, 4);
  assert.deepEqual(result.statusCounts, { Pending: 1, Approved: 1, Rejected: 1, Withdrawn: 1 });
  assert.equal(result.approvedDays, 0.5);
  assert.equal(result.pendingDays, 0.5);
  assert.equal(result.employeeCount, 1);
  assert.equal(result.monthly.length, 12);
  assert.deepEqual(result.monthly[0], { month: 1, approvedDays: 0.5, pendingDays: 0.5 });
  assert.equal(result.monthly[1].approvedDays, 0);
  assert.equal(result.monthly[2].pendingDays, 0);
  assert.deepEqual(
    result.requests.map((row) => row.request.id),
    [4, 3, 2, 1],
  );
  assert.deepEqual(
    result.requests.map((row) => row.periodDays),
    [1, 1, 0.5, 0.5],
  );
  assert.deepEqual(result.byType[0], {
    leaveTypeId: 1,
    name: db.leaveTypes.find((type) => type.id === 1).name,
    requestCount: 4,
    approvedDays: 0.5,
    pendingDays: 0.5,
  });
});

test('saved dates preserve working-day calculations when holiday policies later change', () => {
  const db = database();
  addRequest(db, {
    id: 1,
    days: [
      { date: '2026-12-04', units: 1 },
      { date: '2026-12-08', units: 1 },
    ],
  });
  db.holidays = [{ date: '2026-12-04', name: 'วันหยุดที่เพิ่มภายหลัง' }];
  const result = summarizeLeave(db, actor(db), { year: 2026 });
  assert.equal(result.approvedDays, 2);
  assert.equal(result.requestCount, 1);
  assert.equal(result.monthly[11].approvedDays, 2);
});

test('cross-month requests are counted once while their days are split by month', () => {
  const db = database();
  addRequest(db, {
    id: 1,
    days: [
      { date: '2026-01-30', units: 1 },
      { date: '2026-02-02', units: 1 },
      { date: '2026-02-03', units: 1 },
    ],
  });
  db.requests.push(structuredClone(db.requests[0]));
  const result = summarizeLeave(db, actor(db), { year: 2026 });
  assert.equal(result.requestCount, 1);
  assert.equal(result.statusCounts.Approved, 1);
  assert.equal(result.approvedDays, 3);
  assert.equal(result.monthly[0].approvedDays, 1);
  assert.equal(result.monthly[1].approvedDays, 2);
  assert.equal(result.byEmployee[0].requestCount, 1);
});

test('maternity days cross years without turning the case limit into an annual quota', () => {
  const db = database();
  const maternity = db.leaveTypes.find((type) => type.quotaScope === 'Pregnancy');
  addRequest(db, {
    id: 1,
    employeeId: 3,
    leaveTypeId: maternity.id,
    days: datesBetween('2026-12-30', '2027-01-03').map((date) => ({ date, units: 1 })),
  });
  db.requests[0].maternityCaseId = 900;
  db.maternityCases = [{ id: 900, employeeId: 3, caseNo: 1, maximumDays: 120 }];
  const thisYear = summarizeLeave(db, actor(db, 3), { year: 2026 });
  const nextYear = summarizeLeave(db, actor(db, 3), { year: 2027 });
  assert.equal(thisYear.approvedDays, 2);
  assert.equal(nextYear.approvedDays, 3);
  assert.equal(thisYear.requestCount, 1);
  assert.equal(nextYear.requestCount, 1);
  assert.equal(thisYear.requests[0].periodDays, 2);
  assert.equal(nextYear.requests[0].periodDays, 3);
  assert.equal(nextYear.monthly[0].approvedDays, 3);
  assert.equal(nextYear.byType[0].approvedDays, 3);
});

test('raw databases are scoped to own records, manager reports and all HR records', () => {
  const db = database();
  for (const [id, employeeId] of [
    [1, 1],
    [2, 2],
    [3, 4],
    [4, 6],
  ])
    addRequest(db, { id, employeeId, days: [{ date: '2026-01-05', units: 1 }] });
  const employee = summarizeLeave(db, actor(db), { year: 2026 });
  const manager = summarizeLeave(db, actor(db, 4), { year: 2026 });
  const hr = summarizeLeave(db, actor(db, 5), { year: 2026 });
  assert.deepEqual(
    employee.requests.map((row) => row.request.id),
    [1],
  );
  assert.deepEqual(
    manager.requests.map((row) => row.request.id),
    [3, 2, 1],
  );
  assert.deepEqual(
    hr.requests.map((row) => row.request.id),
    [4, 3, 2, 1],
  );
  assert.equal(hr.employeeCount, 4);
  assert.equal(hr.approvedDays, 4);
  assert.equal(db.approvals.length, 0, 'HR summary does not require consultation assignments');
  db.employees.find((employee) => employee.id === 2).active = false;
  assert.equal(summarizeLeave(db, actor(db, 4), { year: 2026 }).requestCount, 3);
});

test('actor identity and active status come from the database, not the supplied role', () => {
  const db = database();
  addRequest(db, { id: 1, employeeId: 6, days: [{ date: '2026-01-05', units: 1 }] });
  const forgedRole = { ...actor(db), role: 'HR' };
  assert.equal(summarizeLeave(db, forgedRole, { year: 2026 }).requestCount, 0);
  const staleActor = structuredClone(actor(db));
  db.employees.find((employee) => employee.id === staleActor.id).active = false;
  for (const operation of [
    () => summarizeLeave(db, staleActor, { year: 2026 }),
    () => leaveSummaryYears(db, staleActor, 2026),
  ])
    assert.throws(operation, (error) => error.code === 'UNAUTHENTICATED');
});

test('month and type filters restrict every breakdown and ignore submission year', () => {
  const db = database();
  addRequest(db, {
    id: 1,
    days: [
      { date: '2026-01-05', units: 1 },
      { date: '2026-02-02', units: 1 },
    ],
  });
  addRequest(db, {
    id: 2,
    leaveTypeId: 2,
    status: 'Pending',
    days: [{ date: '2026-02-03', units: 0.5 }],
  });
  addRequest(db, { id: 3, days: [{ date: '2027-01-04', units: 1 }] });
  const february = summarizeLeave(db, actor(db), { year: 2026, month: 2, leaveTypeId: 1 });
  assert.equal(february.requestCount, 1);
  assert.equal(february.approvedDays, 1);
  assert.equal(february.pendingDays, 0);
  assert.equal(february.requests[0].periodDays, 1);
  assert.deepEqual(
    february.monthly.map((row) => row.approvedDays),
    [0, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
  );
  assert.equal(february.byType.length, 1);
  assert.equal(february.byEmployee[0].approvedDays, 1);
  assert.equal(summarizeLeave(db, actor(db), { year: 2027 }).approvedDays, 1);
  assert.equal(summarizeLeave(db, actor(db), { year: 2025 }).requestCount, 0);
  assert.equal(summarizeLeave(db, actor(db), { year: 2026, leaveTypeId: 999 }).requestCount, 0);
});

test('year options include the current year and saved scoped dates in descending order', () => {
  const db = database();
  addRequest(db, {
    id: 1,
    days: [
      { date: '2024-01-05', units: 1 },
      { date: '2027-01-05', units: 1 },
    ],
  });
  addRequest(db, { id: 2, employeeId: 6, days: [{ date: '2030-01-07', units: 1 }] });
  db.requests[0].requestDate = '2050-12-01T00:00:00.000Z';
  db.days.push({ id: 999, leaveId: 999, date: '2040-01-05', units: 1, entitlementId: null });
  assert.deepEqual(leaveSummaryYears(db, actor(db), 2026), [2027, 2026, 2024]);
  assert.deepEqual(leaveSummaryYears(db, actor(db, 4), 2026), [2027, 2026, 2024]);
  assert.deepEqual(leaveSummaryYears(db, actor(db, 5), 2026), [2030, 2027, 2026, 2024]);
});

test('empty periods stay empty and do not invent leave dates from request boundaries', () => {
  const db = database();
  addRequest(db, { id: 1, days: [{ date: '2026-01-05', units: 1 }] });
  db.days = [];
  const result = summarizeLeave(db, actor(db), { year: 2026 });
  assert.equal(result.requestCount, 0);
  assert.equal(result.approvedDays, 0);
  assert.equal(result.pendingDays, 0);
  assert.equal(result.employeeCount, 0);
  assert.deepEqual(result.statusCounts, { Pending: 0, Approved: 0, Rejected: 0, Withdrawn: 0 });
  assert.deepEqual(result.byType, []);
  assert.deepEqual(result.byEmployee, []);
  assert.deepEqual(result.requests, []);
  assert.ok(result.monthly.every((row) => row.approvedDays === 0 && row.pendingDays === 0));
  assert.deepEqual(leaveSummaryYears(db, actor(db), 2026), [2026]);
});

test('summary and year discovery do not change source data or array order', () => {
  const db = database();
  addRequest(db, { id: 8, employeeId: 2, days: [{ date: '2026-02-02', units: 1 }] });
  addRequest(db, { id: 2, employeeId: 1, days: [{ date: '2026-01-05', units: 0.5 }] });
  const before = structuredClone(db);
  const summary = summarizeLeave(db, actor(db, 5), { year: 2026 });
  leaveSummaryYears(db, actor(db, 5), 2026);
  assert.deepEqual(db, before);
  assert.deepEqual(
    summary.byEmployee.map((row) => row.employeeId),
    [2, 1],
  );
});

test('invalid year, month and type selections fail without querying or modifying data', () => {
  const db = database();
  for (const year of [0, 1899, 2201, 2026.5, Number.NaN]) {
    assert.throws(() => summarizeLeave(db, actor(db), { year }), /ปีที่เลือกไม่ถูกต้อง/);
    assert.throws(() => leaveSummaryYears(db, actor(db), year), /ปีที่เลือกไม่ถูกต้อง/);
  }
  for (const month of [-1, 13, 1.5, Number.NaN])
    assert.throws(
      () => summarizeLeave(db, actor(db), { year: 2026, month }),
      /เดือนที่เลือกไม่ถูกต้อง/,
    );
  for (const leaveTypeId of [-1, 1.5, Number.NaN])
    assert.throws(
      () => summarizeLeave(db, actor(db), { year: 2026, leaveTypeId }),
      /ประเภทการลาที่เลือกไม่ถูกต้อง/,
    );
});
