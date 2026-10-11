import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  addDays,
  formatDate,
  formatDateTime,
  parseThaiDate,
  today,
  workingDates,
} from '../src/domain/date.js';
test('Thai Buddhist Era d/m/yyyy round trip', () => {
  assert.equal(formatDate('2026-12-05'), '5/12/2569');
  assert.equal(parseThaiDate('5/12/2569'), '2026-12-05');
  assert.equal(parseThaiDate('05/12/2569'), '2026-12-05');
  assert.equal(formatDate('2026-01-02'), '2/1/2569');
});
test('Rejects ambiguous and impossible dates; handles leap years', () => {
  for (const value of [
    '31/4/2569',
    '29/2/2569',
    '0/1/2569',
    '5/13/2569',
    '5/12/2026',
    '2026-12-05',
    '5/12/69',
  ])
    assert.equal(parseThaiDate(value), null, value);
  assert.equal(parseThaiDate('29/2/2571'), '2028-02-29');
});
test('Bangkok timezone at UTC midnight boundary', () => {
  assert.equal(today(new Date('2026-12-04T18:00:00Z')), '2026-12-05');
  assert.equal(formatDateTime('2026-12-04T18:30:00Z'), '5/12/2569 · 01:30 น.');
});
test('Working days exclude weekends and configured holidays', () => {
  assert.deepEqual(workingDates('2026-12-04', '2026-12-08', ['2026-12-07']), [
    '2026-12-04',
    '2026-12-08',
  ]);
  assert.equal(addDays('2026-12-31', 1), '2027-01-01');
});
