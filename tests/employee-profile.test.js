import { test } from 'node:test';
import assert from 'node:assert/strict';
import { employeeProfile, parseEmployeeProfileId } from '../src/domain/employeeProfile.js';
import { createDemoDatabase } from '../src/data/demoDatabase.js';
import { visibleSnapshot, DomainError } from '../src/domain/service.js';
import { cloudFixture } from './cloud-fixture.js';
import { ApiRepository } from '../src/data/apiRepository.js';
test('Employees read themselves while managers and HR read across departments without widening leave scope', () => {
  const db = createDemoDatabase(),
    before = structuredClone(db);
  for (const actor of db.employees)
    for (const employee of db.employees) {
      if (actor.role === 'Employee' && actor.id !== employee.id) {
        assert.throws(
          () => employeeProfile(db, actor.id, employee.id),
          (error) => error instanceof DomainError && error.code === 'FORBIDDEN',
        );
        continue;
      }
      const result = employeeProfile(db, actor.id, employee.id);
      assert.deepEqual(result.employee, employee);
      assert.deepEqual(
        result.manager,
        employee.managerId == null
          ? null
          : {
              id: employee.managerId,
              name: db.employees.find((person) => person.id === employee.managerId).name,
            },
      );
      assert.deepEqual(Object.keys(result).sort(), ['employee', 'manager']);
      result.employee.name = 'Changed copy';
    }
  assert.deepEqual(db, before);
  assert(visibleSnapshot(db, 1).requests.every((request) => request.employeeId === 1));
});
test('Profile lookup requires an active session and a valid employee, with inactive accounts visible only to HR', () => {
  const db = createDemoDatabase();
  /**
   * @param {string} expected
   */
  const code = (expected) => (error) => error instanceof DomainError && error.code === expected;
  assert.throws(() => employeeProfile(db, 999, 1), code('UNAUTHENTICATED'));
  for (const id of [0, -1, NaN, 1.5, Number.MAX_SAFE_INTEGER + 1])
    assert.throws(() => employeeProfile(db, 1, id), code('VALIDATION'));
  assert.throws(() => employeeProfile(db, 4, 999), code('NOT_FOUND'));
  db.employees[5].active = false;
  assert.throws(() => employeeProfile(db, 4, 6), code('NOT_FOUND'));
  assert.equal(employeeProfile(db, 5, 6).employee.active, false);
  db.employees[0].active = false;
  assert.throws(() => employeeProfile(db, 1, 5), code('UNAUTHENTICATED'));
  for (const value of [null, '', '1e0', '+1', '1.0', 'abc'])
    assert(Number.isNaN(parseEmployeeProfileId(value)));
});
test('Cloud profile endpoint rechecks the session and reads cross-department profiles without changing the private snapshot', async () => {
  const fixture = await cloudFixture();
  try {
    const client = fixture.client();
    assert.equal((await client.request('/employee-profile?employeeId=6')).status, 401);
    await client.login('pimchanok');
    const before = await (await client.request('/snapshot')).json();
    const result = await client.request('/employee-profile?employeeId=6&actorId=5&role=HR');
    assert.equal(result.status, 403);
    assert(!('employee' in (await result.json())));
    assert.deepEqual(
      await (await client.request('/employee-profile?employeeId=1')).json(),
      employeeProfile(createDemoDatabase(), 1, 1),
    );
    assert.deepEqual(await (await client.request('/snapshot')).json(), before);
    for (const id of ['', '0', '1e0', 'bad', '9007199254740993'])
      assert.equal((await client.request('/employee-profile?employeeId=' + id)).status, 400);
    await client.login('thanawat');
    assert.deepEqual(
      await (await client.request('/employee-profile?employeeId=6')).json(),
      employeeProfile(createDemoDatabase(), 4, 6),
    );
    await fixture.db.exec("UPDATE leave_app.employee SET role='Employee' WHERE employee_id=4");
    assert.equal((await client.request('/employee-profile?employeeId=6')).status, 403);
    await fixture.db.exec("UPDATE leave_app.employee SET role='Manager' WHERE employee_id=4");
    await fixture.db.exec('UPDATE leave_app.employee SET active=0 WHERE employee_id=6');
    assert.equal((await client.request('/employee-profile?employeeId=6')).status, 404);
    await client.login('pimchanok');
    await fixture.db.exec('UPDATE leave_app.employee SET active=0 WHERE employee_id=1');
    assert.equal((await client.request('/employee-profile?employeeId=5')).status, 401);
  } finally {
    await fixture.close();
  }
});
test('Profile REST adapter sends only the requested employee ID and session credentials', async (t) => {
  const original = globalThis.fetch;
  t.after(() => {
    globalThis.fetch = original;
  });
  const expected = employeeProfile(createDemoDatabase(), 4, 6);
  globalThis.fetch = async (input, options) => {
    const url = new URL(String(input));
    assert.equal(url.pathname, '/api/employee-profile');
    assert.deepEqual([...url.searchParams], [['employeeId', '6']]);
    assert.equal(options?.credentials, 'include');
    assert.equal(options?.method, 'GET');
    return new Response(JSON.stringify(expected));
  };
  assert.deepEqual(
    await new ApiRepository('https://leave.test/api').getEmployeeProfile(6),
    expected,
  );
});
