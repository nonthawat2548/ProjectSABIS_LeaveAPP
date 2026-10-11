import { test } from 'node:test';
import assert from 'node:assert/strict';
import { findLoginAccount, loginUsername } from '../src/domain/auth';
import { createDemoDatabase } from '../src/data/demoDatabase';
import { DEMO_PASSWORD } from '../src/domain/seed';

test('All ten demo usernames are unique and resolve the same account as the full email', () => {
  const employees = createDemoDatabase().employees;
  assert.equal(DEMO_PASSWORD, '1234');
  assert.equal(new Set(employees.map((e) => loginUsername(e.email))).size, 10);
  for (const employee of employees) {
    for (const identifier of [employee.email, loginUsername(employee.email)]) {
      assert.equal(findLoginAccount(employees, ` ${identifier.toUpperCase()} `)?.id, employee.id);
    }
  }
  for (const identifier of ['', ' ', 'missing', 'employee@other.local', 'employee@']) {
    assert.equal(findLoginAccount(employees, identifier), undefined);
  }
});

test('Ambiguous usernames are rejected while distinct full emails remain usable', () => {
  const employees = [
    { id: 1, email: 'same@first.local' },
    { id: 2, email: 'same@second.local' },
  ];
  assert.equal(findLoginAccount(employees, 'same'), undefined);
  assert.equal(findLoginAccount(employees, 'same@first.local')?.id, 1);
  assert.equal(findLoginAccount(employees, ' SAME@SECOND.LOCAL ')?.id, 2);
  assert.equal(
    findLoginAccount(
      [{ email: 'same@first.local' }, { email: 'same@first.local' }],
      'same@first.local',
    ),
    undefined,
  );
});

test('Demo usernames identify people rather than roles, positions or the former generic aliases', () => {
  const employees = createDemoDatabase().employees;
  for (const [email, username] of [
    ['employee@demo.local', 'pimchanok.w'],
    ['manager@demo.local', 'thanawat.k'],
    ['hr@demo.local', 'siriporn.j'],
    ['other@demo.local', 'kan.p'],
    ['sales-manager@demo.local', 'pakorn.r'],
  ]) {
    const account = employees.find((e) => e.email === email)!;
    assert.equal(loginUsername(email), username);
    assert.equal(findLoginAccount(employees, username)?.id, account.id);
    // A job or role change must not change the person's login name.
    assert.equal(
      findLoginAccount([{ ...account, role: 'HR', position: 'New job' }], username)?.id,
      account.id,
    );
  }
  for (const account of employees) {
    assert.equal(findLoginAccount(employees, account.role), undefined);
    assert.equal(findLoginAccount(employees, account.position), undefined);
  }
  for (const username of ['employee', 'manager', 'hr', 'sales-manager', 'other']) {
    assert.equal(findLoginAccount(employees, username), undefined);
  }
});
