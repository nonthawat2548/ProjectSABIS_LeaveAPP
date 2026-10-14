import { afterEach, expect, jest, test } from '@jest/globals';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { LeaveSummaryPage } from '../../src/pages/LeaveSummaryPage.jsx';
import { createDemoDatabase } from '../../src/data/demoDatabase.js';
import { NotificationsPage } from '../../src/pages/NotificationsPage.jsx';
import { applyCommand, visibleSnapshot } from '../../src/domain/service.js';

afterEach(cleanup);

function fixture() {
  const db = createDemoDatabase();
  db.requests = [];
  db.days = [];
  db.approvals = [];
  function add(id, employeeId, leaveTypeId, status, dates) {
    const allDates = dates.map(([date]) => date).sort();
    db.requests.push({
      id,
      employeeId,
      leaveTypeId,
      maternityCaseId: null,
      startDate: allDates[0],
      endDate: allDates.at(-1),
      requestDate: '2026-09-01T05:00:00.000Z',
      status,
      duration: 'Full',
      reason: 'ข้อมูลทดสอบหน้าสรุป',
      version: 1,
      timeline: [],
    });
    dates.forEach(([date, units]) =>
      db.days.push({
        id: db.days.length + 1,
        leaveId: id,
        date,
        units,
        entitlementId: null,
      }),
    );
  }
  add(1001, 1, 1, 'Approved', [
    ['2026-12-31', 0.5],
    ['2027-01-04', 1],
  ]);
  add(1002, 1, 2, 'Pending', [['2026-10-14', 1]]);
  add(1003, 1, 2, 'Rejected', [
    ['2026-11-02', 1],
    ['2026-11-03', 1],
  ]);
  add(1004, 1, 3, 'Withdrawn', [['2026-12-02', 1]]);
  add(1005, 6, 1, 'Approved', [['2026-10-15', 1]]);
  return { db, add };
}

function mount(db, actorId, run = jest.fn()) {
  const reload = jest.fn();
  const actor = db.employees.find((person) => person.id === actorId);
  render(<LeaveSummaryPage db={db} actor={actor} run={run} reload={reload} />);
  return { run, reload };
}

function metric(title) {
  return within(screen.getByText(title).closest('.stat')).getByText((_, element) =>
    element.classList.contains('stat-value'),
  );
}

test('manager chooses individual team members including people with no requests, never HR or another team', () => {
  const { db, add } = fixture();
  add(1006, 2, 1, 'Approved', [['2026-12-10', 1]]);
  db.employees.find((p) => p.id === 5).managerId = 4;
  mount(db, 4);
  const picker = screen.getByLabelText('พนักงานที่สรุป');
  const options = within(picker)
    .getAllByRole('option')
    .map((item) => item.value);
  expect(options).toContain('2');
  expect(options).not.toContain('5');
  expect(options).not.toContain('6');
  fireEvent.change(picker, { target: { value: '1' } });
  expect(metric('คำขอทั้งหมด')).toHaveTextContent('4คำขอ');
  expect(screen.queryByRole('link', { name: /LR-2026-01006/ })).not.toBeInTheDocument();
  fireEvent.change(screen.getByLabelText('เดือนที่สรุป'), { target: { value: '12' } });
  expect(
    screen.getByRole('heading', { name: 'รายละเอียดวันลาในเดือนที่เลือก' }),
  ).toBeInTheDocument();
  expect(
    screen.getByLabelText('วันที่ 31/12/2569 อนุมัติ ครึ่งวัน รอพิจารณา 0 วัน'),
  ).toBeInTheDocument();
  fireEvent.change(picker, { target: { value: '10' } });
  expect(metric('คำขอทั้งหมด')).toHaveTextContent('0คำขอ');
});

test('send report waits for completion, prevents duplicate clicks, uses filters and supports retry after failure', async () => {
  const { db } = fixture();
  let finish;
  const run = jest
    .fn()
    .mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    )
    .mockRejectedValueOnce(new Error('ส่งไม่สำเร็จ'))
    .mockResolvedValue({ message: 'ส่งแล้ว' });
  mount(db, 4, run);
  fireEvent.change(screen.getByLabelText('พนักงานที่สรุป'), { target: { value: '1' } });
  fireEvent.change(screen.getByLabelText('เดือนที่สรุป'), { target: { value: '12' } });
  fireEvent.click(screen.getByRole('button', { name: 'ส่งรายงานให้ HR', exact: true }));
  fireEvent.click(screen.getByRole('button', { name: 'กำลังส่งรายงาน…' }));
  expect(run).toHaveBeenCalledTimes(1);
  expect(run).toHaveBeenCalledWith({
    type: 'sendLeaveReport',
    employeeId: 1,
    hrId: 5,
    year: 2026,
    month: 12,
    leaveTypeId: 0,
  });
  expect(screen.getByLabelText('พนักงานที่สรุป')).toBeDisabled();
  expect(screen.queryByRole('status')).not.toBeInTheDocument();
  await act(async () => finish({ message: 'ส่งแล้ว' }));
  expect(screen.getByRole('status')).toHaveTextContent('ส่งรายงานแล้ว');
  fireEvent.click(screen.getByRole('button', { name: 'ส่งรายงานให้ HR', exact: true }));
  await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('ส่งไม่สำเร็จ'));
  expect(screen.queryByRole('status')).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'ส่งรายงานให้ HR', exact: true }));
  await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('ส่งรายงานแล้ว'));
  expect(run).toHaveBeenCalledTimes(3);
});

test('HR opens the saved report from notifications; employee accounts have no report send control', () => {
  const { db } = fixture();
  applyCommand(
    db,
    4,
    { type: 'sendLeaveReport', employeeId: 1, hrId: 5, year: 2026, month: 12, leaveTypeId: 0 },
    new Date('2026-10-14T05:00:00Z'),
  );
  render(
    <NotificationsPage
      db={visibleSnapshot(db, 5)}
      actor={db.employees.find((p) => p.id === 5)}
      run={jest.fn()}
    />,
  );
  const trigger = screen.getByRole('link', { name: 'เปิดอ่านรายงาน' });
  expect(trigger).toHaveAttribute('href', `#/leave-report/${db.notifications.at(-2).id}`);
  cleanup();
  mount(db, 1);
  expect(
    screen.queryByRole('button', { name: 'ส่งรายงานให้ HR', exact: true }),
  ).not.toBeInTheDocument();
});

test('team reassignment during refresh removes the person and blocks sending until a new selection', () => {
  const { db } = fixture();
  const actor = db.employees.find((p) => p.id === 4);
  const { rerender } = render(<LeaveSummaryPage db={db} actor={actor} run={jest.fn()} />);
  fireEvent.change(screen.getByLabelText('พนักงานที่สรุป'), { target: { value: '1' } });
  const changed = structuredClone(db);
  changed.employees.find((p) => p.id === 1).managerId = 7;
  rerender(<LeaveSummaryPage db={changed} actor={actor} run={jest.fn()} />);
  expect(screen.getByRole('alert')).toHaveTextContent('สิทธิ์ของพนักงานที่เลือกเปลี่ยนแล้ว');
  expect(screen.getByRole('button', { name: 'ส่งรายงานให้ HR', exact: true })).toBeDisabled();
  expect(screen.queryByRole('link', { name: /LR-2026-01001/ })).not.toBeInTheDocument();
  fireEvent.change(screen.getByLabelText('พนักงานที่สรุป'), { target: { value: '2' } });
  expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'ส่งรายงานให้ HR', exact: true })).toBeEnabled();
});

test.each([
  [1, 4],
  [4, 4],
  [5, 5],
])(
  'Account %i sees %i authorized requests and the correct summary scope',
  (actorId, requestCount) => {
    const { db } = fixture();
    mount(db, actorId);
    expect(screen.getByRole('heading', { level: 1, name: 'สรุปการลา' })).toBeInTheDocument();
    expect(metric('คำขอทั้งหมด')).toHaveTextContent(`${requestCount}คำขอ`);
    if (actorId !== 5)
      expect(screen.queryByRole('link', { name: /LR-2026-01005/ })).not.toBeInTheDocument();
    if (actorId === 1)
      expect(screen.queryByRole('heading', { name: 'สรุปรายพนักงาน' })).not.toBeInTheDocument();
    else expect(screen.getByRole('heading', { name: 'สรุปรายพนักงาน' })).toBeInTheDocument();
  },
);

test('Year, month and type selections update saved day totals and reset without writing data', () => {
  const { db } = fixture();
  const original = structuredClone(db);
  const { run, reload } = mount(db, 1);
  expect(metric('วันลาที่อนุมัติ')).toHaveTextContent('ครึ่งวัน');
  expect(screen.getByLabelText('ปีที่สรุป (พ.ศ.)')).toHaveDisplayValue('2569');
  expect(screen.getByRole('table')).toHaveTextContent('31/12/2569 – 4/1/2570');
  fireEvent.change(screen.getByLabelText('ปีที่สรุป (พ.ศ.)'), { target: { value: '2027' } });
  expect(metric('คำขอทั้งหมด')).toHaveTextContent('1คำขอ');
  expect(metric('วันลาที่อนุมัติ')).toHaveTextContent('1 วัน');
  fireEvent.change(screen.getByLabelText('ประเภทการลา'), { target: { value: '2' } });
  expect(metric('คำขอทั้งหมด')).toHaveTextContent('0คำขอ');
  expect(screen.getByText(/ไม่พบคำขอในช่วงที่เลือก/)).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'ล้างตัวกรอง' }));
  expect(metric('คำขอทั้งหมด')).toHaveTextContent('4คำขอ');
  fireEvent.change(screen.getByLabelText('เดือนที่สรุป'), { target: { value: '11' } });
  expect(metric('คำขอทั้งหมด')).toHaveTextContent('1คำขอ');
  expect(metric('วันลาที่อนุมัติ')).toHaveTextContent('0 วัน');
  expect(screen.getByRole('table')).toHaveTextContent('ไม่อนุมัติ');
  expect(run).not.toHaveBeenCalled();
  expect(reload).not.toHaveBeenCalled();
  expect(db).toEqual(original);
});

test('twenty full days plus a half day read as twenty days and a half throughout the summary', () => {
  const { db, add } = fixture();
  db.requests = [];
  db.days = [];
  add(
    1010,
    1,
    1,
    'Approved',
    Array.from({ length: 21 }, (_, index) => [
      `2026-10-${String(index + 1).padStart(2, '0')}`,
      index === 20 ? 0.5 : 1,
    ]),
  );
  mount(db, 1);
  expect(metric('วันลาที่อนุมัติ')).toHaveTextContent('20 วันครึ่ง');
  expect(screen.getByRole('table')).toHaveTextContent('20 วันครึ่ง');
  expect(screen.queryByText('20.5 วัน')).not.toBeInTheDocument();
});

test('An empty history displays zeros and empty states without inventing requests', () => {
  const { db } = fixture();
  db.requests = [];
  db.days = [];
  mount(db, 5);
  expect(metric('คำขอทั้งหมด')).toHaveTextContent('0คำขอ');
  expect(metric('วันลาที่อนุมัติ')).toHaveTextContent('0 วัน');
  expect(screen.queryByRole('table')).not.toBeInTheDocument();
  expect(screen.queryByRole('link', { name: /LR-/ })).not.toBeInTheDocument();
  expect(screen.getByText('ยังไม่มีวันลาในช่วงที่เลือก')).toBeInTheDocument();
  expect(screen.getByText('ยังไม่มีพนักงานที่มีคำขอในช่วงที่เลือก')).toBeInTheDocument();
});

test('Request details remain reachable and more rows can be shown without losing the summary', () => {
  const { db, add } = fixture();
  db.requests = [];
  db.days = [];
  for (let index = 0; index < 12; index++)
    add(2000 + index, 1, 1, 'Approved', [[`2026-11-${String(index + 10).padStart(2, '0')}`, 1]]);
  mount(db, 1);
  expect(metric('คำขอทั้งหมด')).toHaveTextContent('12คำขอ');
  expect(within(screen.getByRole('table')).getAllByRole('row')).toHaveLength(9);
  expect(screen.getByRole('link', { name: /LR-2026-02011/ })).toHaveAttribute(
    'href',
    '#/request/2011',
  );
  fireEvent.click(screen.getByRole('button', { name: 'แสดงเพิ่มเติม' }));
  expect(within(screen.getByRole('table')).getAllByRole('row')).toHaveLength(13);
  expect(screen.queryByRole('button', { name: 'แสดงเพิ่มเติม' })).not.toBeInTheDocument();
  fireEvent.change(screen.getByLabelText('ประเภทการลา'), { target: { value: '1' } });
  expect(within(screen.getByRole('table')).getAllByRole('row')).toHaveLength(9);
});
