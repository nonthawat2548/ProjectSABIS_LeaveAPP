import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createDemoDatabase } from '../src/data/demoDatabase.js';
import { applyCommand } from '../src/domain/service.js';
import {
  readReportDashboard,
  readReportRequestLine,
  reportEmployeeFrequency,
} from '../src/domain/reportDashboard.js';

function report(filters = {}) {
  const db = createDemoDatabase();
  applyCommand(
    db,
    4,
    {
      type: 'sendLeaveReport',
      employeeId: 1,
      hrId: 5,
      year: 2026,
      month: 0,
      leaveTypeId: 0,
      ...filters,
    },
    new Date('2026-10-14T05:00:00Z'),
  );
  return { db, text: db.notifications.at(-1).text };
}

test('existing reports provide frozen dashboard totals, status counts, months and request details', () => {
  const { db, text } = report(),
    before = structuredClone(db);
  const parsed = readReportDashboard(text);
  assert.ok(parsed);
  assert.equal(parsed.requestCount, 2);
  assert.equal(parsed.monthly.length, 12);
  assert.equal(parsed.requestLines.length, 2);
  assert.match(parsed.sender, /ธนวัฒน์/);
  assert.match(parsed.employee, /พิมพ์ชนก/);
  assert.equal(parsed.year, 2026);
  assert.equal(parsed.month, 0);
  db.requests = [];
  db.days = [];
  assert.deepEqual(readReportDashboard(text), parsed);
  db.requests = before.requests;
  db.days = before.days;
  assert.deepEqual(db, before);
});

test('selected months, cross-year days, half days and zero reports keep saved values', () => {
  const { text } = report({ month: 12 });
  const parsed = readReportDashboard(text);
  assert.ok(parsed);
  assert.equal(parsed.month, 12);
  assert.equal(parsed.monthly.length, 1);
  const zero = readReportDashboard(report({ year: 2030 }).text);
  assert.ok(zero);
  assert.equal(zero.requestCount, 0);
  assert.equal(zero.approvedDays, 0);
  assert.deepEqual(zero.byType, []);
  assert.deepEqual(zero.requestLines, []);
  const { db } = report();
  db.requests = [
    {
      ...db.requests[0],
      id: 1001,
      employeeId: 1,
      status: 'Approved',
      startDate: '2026-12-31',
      endDate: '2027-01-04',
    },
  ];
  db.days = [
    { id: 1, leaveId: 1001, date: '2026-12-31', units: 0.5, entitlementId: null },
    { id: 2, leaveId: 1001, date: '2027-01-04', units: 1, entitlementId: null },
  ];
  applyCommand(db, 4, {
    type: 'sendLeaveReport',
    employeeId: 1,
    hrId: 5,
    year: 2026,
    month: 12,
    leaveTypeId: 0,
  });
  assert.equal(readReportDashboard(db.notifications.at(-1).text).approvedDays, 0.5);
});

test('custom names containing separators are preserved as text without guessing request fields', () => {
  const db = createDemoDatabase();
  db.employees[0].name = 'พิมพ์ | ทดสอบ <script>';
  db.leaveTypes[0].name = 'ลาทดสอบ | (EMP-00005)';
  applyCommand(db, 4, {
    type: 'sendLeaveReport',
    employeeId: 1,
    hrId: 5,
    year: 2026,
    month: 0,
    leaveTypeId: 0,
  });
  const parsed = readReportDashboard(db.notifications.at(-1).text);
  assert.ok(parsed);
  assert.match(parsed.employee, /พิมพ์ \| ทดสอบ <script>/);
  assert.equal(parsed.byType[0].name, 'ลาทดสอบ | (EMP-00005)');
  assert.ok(parsed.requestLines.some((line) => line.includes('พิมพ์ | ทดสอบ <script>')));
});

test('incomplete, inconsistent and unknown reports fail without inventing chart values', () => {
  const { text } = report();
  for (const invalid of [
    '',
    'ธรรมดา',
    text.slice(0, 100),
    text.replace('คำขอทั้งหมด: 2', 'คำขอทั้งหมด: 999'),
    text.replace('ปี 2569', 'ปี 9999'),
    text.replace('รอพิจารณา 2 วัน', 'รอพิจารณา 999 วัน'),
    text + 'x'.repeat(150001),
  ])
    assert.equal(readReportDashboard(invalid), null);
  assert.deepEqual(readReportDashboard(text.replace(/\n/g, '\r\n')), readReportDashboard(text));
});

test('request columns preserve saved half days and dates; ambiguous custom separators retain original text', () => {
  const line =
    'LR-2026-01009 | ชื่อทดสอบ (EMP-00001) | ลาพักร้อน | 31/12/2569–4/1/2570 | 0.5 วันในช่วงที่เลือก | อนุมัติแล้ว';
  assert.deepEqual(readReportRequestLine(line), {
    code: 'LR-2026-01009',
    employee: 'ชื่อทดสอบ (EMP-00001)',
    leaveType: 'ลาพักร้อน',
    dates: '31/12/2569–4/1/2570',
    days: 0.5,
    status: 'Approved',
  });
  assert.equal(readReportRequestLine(line.replace('ชื่อทดสอบ', 'ชื่อ | ทดสอบ')), null);
  assert.equal(readReportRequestLine(line.replace('ลาพักร้อน', 'ประเภท | ทดสอบ')), null);
  assert.equal(readReportRequestLine(line.replace('อนุมัติแล้ว', 'สถานะอื่น')), null);
  for (const [label, status] of [
    ['รอพิจารณา', 'Pending'],
    ['อนุมัติแล้ว', 'Approved'],
    ['ไม่อนุมัติ', 'Rejected'],
    ['ยกเลิก', 'Withdrawn'],
    ['ยกเลิกแล้ว', 'Withdrawn'],
  ])
    assert.equal(readReportRequestLine(line.replace('อนุมัติแล้ว', label)).status, status);
});

test('frequency ranks approved requests by employee code, keeps namesakes separate, and uses frozen days', () => {
  const db = createDemoDatabase();
  db.employees[2].name = db.employees[0].name;
  db.requests.find((item) => item.id === 1001).status = 'Approved';
  applyCommand(db, 4, {
    type: 'sendLeaveReport',
    employeeId: 0,
    hrId: 5,
    year: 2026,
    month: 0,
    leaveTypeId: 0,
  });
  const frozen = db.notifications.at(-1).text;
  const parsed = readReportDashboard(frozen);
  assert.ok(parsed);
  const people = reportEmployeeFrequency(parsed);
  assert.ok(people);
  assert.equal(people[0].employeeCode, 'EMP-00001');
  assert.equal(people[0].approvedRequests, 2);
  assert.equal(people[0].approvedDays, 3);
  assert.equal(people.find((person) => person.employeeCode === 'EMP-00003').approvedRequests, 1);
  assert.equal(people.filter((person) => person.name === db.employees[0].name).length, 2);
  assert.equal(
    people.reduce((sum, person) => sum + person.approvedRequests, 0),
    parsed.statusCounts.Approved,
  );
  db.requests = [];
  db.days = [];
  assert.deepEqual(reportEmployeeFrequency(readReportDashboard(frozen)), people);
});

test('frequency handles empty and single-person reports and declines ambiguous saved ownership', () => {
  const zero = readReportDashboard(report({ year: 2030 }).text);
  assert.ok(zero);
  assert.deepEqual(reportEmployeeFrequency(zero), []);
  const single = readReportDashboard(report().text);
  assert.ok(single);
  assert.equal(reportEmployeeFrequency(single).length, 1);
  assert.equal(reportEmployeeFrequency(single)[0].approvedRequests, 1);
  const ambiguous = {
    ...single,
    requestLines: single.requestLines.map((line) =>
      line.replace('พิมพ์ชนก', 'พิมพ์ชนก (EMP-99999) | ทดสอบ'),
    ),
  };
  assert.equal(reportEmployeeFrequency(ambiguous), null);
});
