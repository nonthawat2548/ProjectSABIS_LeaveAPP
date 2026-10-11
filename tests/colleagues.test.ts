import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createDemoDatabase } from '../src/data/demoDatabase';
import { DomainError, visibleSnapshot } from '../src/domain/service';
import { employeeCode, searchColleagues } from '../src/domain/colleagues';

const date = '2026-12-05';
function fixture() {
  const db = createDemoDatabase();
  db.requests = [];
  db.days = [];
  db.approvals = [];
  db.documents = [];
  db.workStatuses = [
    { id: 1, employeeId: 8, date, statusType: 'WFH', updatedAt: '2026-12-05T02:00:00Z' },
  ];
  return db;
}

test('Signed-in staff find colleagues across teams using partial names, exact IDs and display codes with a minimal projection', () => {
  const db = fixture(),
    person = db.employees.find((e) => e.id === 8)!;
  const before = structuredClone(db);
  assert.equal(employeeCode(8), 'EMP-00008');
  for (const actorId of [1, 4, 5, 7])
    for (const query of [
      person.name.split(' ')[0],
      person.name,
      '8',
      '00008',
      'EMP-00008',
      '  emp-00008  ',
      'ｅｍｐ-００００８',
    ]) {
      const result = searchColleagues(db, actorId, query, date);
      assert.equal(result.length, 1);
      assert.equal(result[0].employeeId, 8);
      assert.equal(result[0].workStatus, 'WFH');
      assert.equal(result[0].date, date);
      assert.deepEqual(
        Object.keys(result[0]).sort(),
        [
          'employeeId',
          'name',
          'position',
          'department',
          'date',
          'workStatus',
          'leaveDuration',
          'updatedAt',
        ].sort(),
      );
    }
  assert.deepEqual(
    searchColleagues(db, 1, '1', date).map((e) => e.employeeId),
    [1],
    'ID 1 must not also match employee 10',
  );
  assert.deepEqual(db, before);
  assert(
    !visibleSnapshot(db, 1).employees.some((e) => e.id === 8),
    'A colleague lookup must not widen the private snapshot',
  );
});

test('Colleague lookup authenticates before validation and hides inactive accounts', () => {
  const db = fixture();
  assert.throws(
    () => searchColleagues(db, 999, '', ''),
    (error: unknown) => error instanceof DomainError && error.code === 'UNAUTHENTICATED',
  );
  db.employees.find((e) => e.id === 1)!.active = false;
  assert.throws(
    () => searchColleagues(db, 1, '8', date),
    (error: unknown) => error instanceof DomainError && error.code === 'UNAUTHENTICATED',
  );
  db.employees.find((e) => e.id === 8)!.active = false;
  assert.deepEqual(searchColleagues(db, 4, '8', date), []);
});

test('Excessive or non-string queries and invalid or Buddhist Era API dates are rejected; names can be case-insensitive', () => {
  const db = fixture();
  for (const query of ['ก'.repeat(101), null])
    assert.throws(() => searchColleagues(db, 1, query as string, date), DomainError);
  for (const invalidDate of ['', '5/12/2569', '2569-12-05', '2026-02-30', null])
    assert.throws(() => searchColleagues(db, 1, '8', invalidDate as string), DomainError);
  db.employees.find((e) => e.id === 8)!.name = 'Alex Doe';
  assert.equal(searchColleagues(db, 1, '  ALEX   DOE  ', date)[0].name, 'Alex Doe');
  assert.deepEqual(searchColleagues(db, 1, 'ไม่พบบัญชีนี้', date), []);
});

test('Blank filters show all active staff with only basic availability for every signed-in role', () => {
  const db = fixture();
  db.employees.find((e) => e.id === 2)!.active = false;
  const active = db.employees
    .filter((e) => e.active)
    .sort((a, b) => a.name.localeCompare(b.name, 'th'))
    .map((e) => e.id);
  const before = structuredClone(db);
  for (const actorId of [1, 4, 5, 7])
    for (const query of ['', '   ']) {
      const rows = searchColleagues(db, actorId, query, date);
      assert.deepEqual(
        rows.map((row) => row.employeeId),
        active,
      );
      assert(rows.some((row) => row.employeeId === actorId));
      assert(rows.some((row) => row.employeeId === 8 && row.workStatus === 'WFH'));
      assert(rows.some((row) => row.employeeId === 10 && row.workStatus === null));
      assert(rows.every((row) => !('email' in row) && !('requests' in row) && row.date === date));
    }
  assert.deepEqual(db, before);
  assert(!visibleSnapshot(db, 1).employees.some((e) => e.id === 8));
});

test('Missing work records remain unknown and are not assumed to mean in-office', () => {
  const db = fixture();
  const result = searchColleagues(db, 1, '2', date)[0];
  assert.equal(result.workStatus, null);
  assert.equal(result.leaveDuration, null);
  assert.equal(result.updatedAt, null);
  assert.equal(searchColleagues(db, 1, '8', '2026-12-06')[0].workStatus, null);
});

test('Only approved leave contributes to colleague status, including AM/PM, two half-days and holidays across years', () => {
  const db = fixture(),
    request = createDemoDatabase().requests[0];
  const add = (
    status: typeof request.status,
    duration: typeof request.duration,
    units: number,
    on = date,
  ) => {
    const id = db.requests.length + 1;
    db.requests.push({
      ...request,
      id,
      employeeId: 8,
      status,
      duration,
      startDate: on,
      endDate: on,
    });
    db.days.push({ id, leaveId: id, date: on, entitlementId: null, units });
  };
  for (const status of ['Pending', 'Rejected', 'Withdrawn'] as const) add(status, 'Full', 1);
  assert.equal(searchColleagues(db, 1, '8', date)[0].leaveDuration, null);
  add('Approved', 'AM', 0.5);
  assert.equal(searchColleagues(db, 1, '8', date)[0].leaveDuration, 'AM');
  assert.equal(searchColleagues(db, 1, '8', date)[0].workStatus, 'WFH');
  db.requests.at(-1)!.duration = 'PM';
  assert.equal(searchColleagues(db, 1, '8', date)[0].leaveDuration, 'PM');
  add('Approved', 'AM', 0.5);
  assert.equal(searchColleagues(db, 1, '8', date)[0].leaveDuration, 'Full');
  assert.equal(searchColleagues(db, 1, '8', date)[0].workStatus, null);
  assert.equal(searchColleagues(db, 1, '8', date)[0].updatedAt, null);
  for (const on of ['2026-12-31', '2027-01-01']) {
    add('Approved', 'Full', 1, on);
    db.holidays.push({ date: on, name: 'วันหยุดทดสอบ' });
    assert.equal(searchColleagues(db, 1, '8', on)[0].leaveDuration, 'Full');
  }
  db.requests = [];
  db.days = [];
  add('Approved', 'AM', 0.5);
  db.workStatuses = [];
  const unknownHalf = searchColleagues(db, 1, '8', date)[0];
  assert.equal(unknownHalf.workStatus, null);
  assert.equal(unknownHalf.leaveDuration, 'AM');
});
