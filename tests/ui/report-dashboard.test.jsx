import { afterEach, expect, jest, test } from '@jest/globals';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { createDemoDatabase } from '../../src/data/demoDatabase.js';
import { applyCommand } from '../../src/domain/service.js';
import { LeaveReportDashboardPage } from '../../src/pages/LeaveReportDashboardPage.jsx';
import { createWorkspaceRoutes, WorkspaceRoutes } from '../../src/routes.jsx';

afterEach(cleanup);
function fixture(filters = {}) {
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
  return { db, id: db.notifications.at(-2).id, copyId: db.notifications.at(-1).id };
}
function metric(title) {
  return within(screen.getByText(title).closest('.stat')).getByText((_, element) =>
    element.classList.contains('stat-value'),
  );
}
function mount(db, actorId, notificationId, extra = {}) {
  const run = jest.fn();
  const actor = db.employees.find((person) => person.id === actorId);
  return {
    run,
    ...render(
      <LeaveReportDashboardPage
        db={db}
        actor={actor}
        notificationId={notificationId}
        run={run}
        {...extra}
      />,
    ),
  };
}

test('HR sees a dashboard of frozen sent values with graphs and request details, without changing read status', () => {
  const { db, id } = fixture();
  const original = structuredClone(db);
  const { run, rerender } = mount(db, 5, id);
  expect(screen.getByRole('heading', { level: 1, name: 'รายงานสรุปการลา' })).toBeInTheDocument();
  expect(metric('คำขอทั้งหมด')).toHaveTextContent('2คำขอ');
  expect(metric('วันลาที่อนุมัติ')).toHaveTextContent('1 วัน');
  expect(screen.getByRole('heading', { name: 'สถานะคำขอในรายงาน' })).toBeInTheDocument();
  expect(
    screen.getByRole('img', { name: 'ธันวาคม อนุมัติ 1 วัน รอพิจารณา 0 วัน' }),
  ).toBeInTheDocument();
  expect(screen.getByText('LR-2026-01009')).toBeInTheDocument();
  expect(screen.getByRole('link', { name: 'กลับการแจ้งเตือน' })).toHaveAttribute(
    'href',
    '#/notifications',
  );
  expect(db).toEqual(original);
  expect(run).not.toHaveBeenCalled();
  const changed = structuredClone(db);
  changed.requests = [];
  changed.days = [];
  changed.employees[0].name = 'ชื่อปัจจุบันที่เปลี่ยน';
  rerender(
    <LeaveReportDashboardPage
      db={changed}
      actor={changed.employees[4]}
      notificationId={id}
      run={run}
    />,
  );
  expect(metric('วันลาที่อนุมัติ')).toHaveTextContent('1 วัน');
  expect(screen.getAllByText(/พิมพ์ชนก/).length).toBeGreaterThan(0);
  expect(screen.queryByText(/ชื่อปัจจุบันที่เปลี่ยน/)).not.toBeInTheDocument();
});

test('saved 20.5 days read as twenty days and a half without changing the stored report', () => {
  const db = createDemoDatabase();
  db.requests = [
    {
      ...db.requests[0],
      employeeId: 1,
      status: 'Approved',
      startDate: '2026-10-01',
      endDate: '2026-10-21',
    },
  ];
  db.days = Array.from({ length: 21 }, (_, index) => ({
    id: index + 1,
    leaveId: db.requests[0].id,
    date: `2026-10-${String(index + 1).padStart(2, '0')}`,
    units: index === 20 ? 0.5 : 1,
    entitlementId: null,
  }));
  applyCommand(db, 4, {
    type: 'sendLeaveReport',
    employeeId: 1,
    hrId: 5,
    year: 2026,
    month: 0,
    leaveTypeId: 0,
  });
  const id = db.notifications.at(-2).id;
  const stored = db.notifications.at(-2).text;
  const { container } = mount(db, 5, id);
  expect(metric('วันลาที่อนุมัติ')).toHaveTextContent('20 วันครึ่ง');
  expect(
    within(container.querySelector('.leave-report-frequency')).getByText('20 วันครึ่ง'),
  ).toBeInTheDocument();
  expect(stored).toContain('อนุมัติแล้ว: 1 คำขอ / 20.5 วัน');
  expect(db.notifications.at(-2).text).toBe(stored);
});

test('sender opens only their own copy; HR cannot open the sender notification ID', () => {
  const { db, id, copyId } = fixture();
  mount(db, 4, copyId);
  expect(metric('คำขอทั้งหมด')).toHaveTextContent('2คำขอ');
  cleanup();
  mount(db, 4, id);
  expect(screen.getByRole('alert')).toHaveTextContent('คุณเปิดรายงานนี้ไม่ได้');
  expect(screen.queryByText(/พิมพ์ชนก/)).not.toBeInTheDocument();
  cleanup();
  mount(db, 5, copyId);
  expect(screen.getByRole('alert')).toBeInTheDocument();
});

test('employee, forged role, inactive actor and missing report never receive report details', () => {
  const { db, id } = fixture();
  for (const actor of [db.employees[0], { ...db.employees[0], role: 'HR' }]) {
    mount(db, 1, id, { actor });
    expect(screen.getByRole('alert')).toBeInTheDocument();
    expect(screen.queryByText(/พิมพ์ชนก/)).not.toBeInTheDocument();
    cleanup();
  }
  db.employees[4].active = false;
  mount(db, 5, id);
  expect(screen.getByRole('alert')).toBeInTheDocument();
  cleanup();
  db.employees[4].active = true;
  mount(db, 5, 9999);
  expect(screen.getByRole('alert')).toBeInTheDocument();
});

test('zero reports show zero stats and empty graphs instead of current leave records', () => {
  const { db, id } = fixture({ year: 2030 });
  mount(db, 5, id);
  expect(metric('คำขอทั้งหมด')).toHaveTextContent('0คำขอ');
  expect(metric('วันลาที่อนุมัติ')).toHaveTextContent('0 วัน');
  expect(screen.queryByRole('img')).not.toBeInTheDocument();
  expect(screen.getByText('ยังไม่มีวันลาในรายงานนี้')).toBeInTheDocument();
});

test('unrecognized reports remain readable and never fabricate chart totals', () => {
  const { db, id } = fixture();
  db.notifications.find((item) => item.id === id).text =
    'รายงานสรุปการลา\nผู้ส่ง: ทดสอบ (EMP-00004)\nรายละเอียดเดิม';
  mount(db, 5, id);
  expect(screen.getByRole('status')).toHaveTextContent('รายงานนี้ยังแสดงกราฟไม่ได้');
  expect(screen.getByText(/รายละเอียดเดิม/)).toBeInTheDocument();
  expect(screen.queryByText('คำขอทั้งหมด')).not.toBeInTheDocument();
});

test('custom stored names are escaped, not executed as HTML', () => {
  const db = createDemoDatabase();
  db.employees[0].name = '<script>alert("x")</script>';
  applyCommand(db, 4, {
    type: 'sendLeaveReport',
    employeeId: 1,
    hrId: 5,
    year: 2026,
    month: 0,
    leaveTypeId: 0,
  });
  const { container } = mount(db, 5, db.notifications.at(-2).id);
  expect(container.querySelector('script')).toBeNull();
  expect(screen.getAllByText(/<script>/).length).toBeGreaterThan(0);
});

test('report deep links work for HR and remain unavailable to employees', () => {
  const { db, id } = fixture();
  const props = { db, actor: db.employees[4], run: jest.fn(), reload: jest.fn() };
  render(
    <MemoryRouter initialEntries={[`/leave-report/${id}`]}>
      <WorkspaceRoutes routes={createWorkspaceRoutes(props)} />
    </MemoryRouter>,
  );
  expect(screen.getByRole('heading', { level: 1, name: 'รายงานสรุปการลา' })).toBeInTheDocument();
  cleanup();
  render(
    <MemoryRouter initialEntries={[`/leave-report/${id}`]}>
      <WorkspaceRoutes routes={createWorkspaceRoutes({ ...props, actor: db.employees[0] })} />
    </MemoryRouter>,
  );
  expect(
    screen.getByRole('heading', { level: 1, name: 'ไม่พบหน้าหรือไม่มีสิทธิ์เข้าถึง' }),
  ).toBeInTheDocument();
});

test('long reports show eight requests at a time and reset when switching reports', () => {
  const db = createDemoDatabase();
  const sample = db.requests[0];
  db.requests = Array.from({ length: 12 }, (_, index) => ({
    ...sample,
    id: 2001 + index,
    employeeId: 1,
    startDate: `2026-11-${String(index + 2).padStart(2, '0')}`,
    endDate: `2026-11-${String(index + 2).padStart(2, '0')}`,
    status: 'Approved',
  }));
  db.days = db.requests.map((request, index) => ({
    id: index + 1,
    leaveId: request.id,
    date: request.startDate,
    units: 1,
    entitlementId: null,
  }));
  const command = {
    type: 'sendLeaveReport',
    employeeId: 1,
    hrId: 5,
    year: 2026,
    month: 11,
    leaveTypeId: 0,
  };
  applyCommand(db, 4, command, new Date('2026-10-14T05:00:00Z'));
  const firstId = db.notifications.at(-2).id;
  applyCommand(db, 4, command, new Date('2026-10-14T05:01:00Z'));
  const secondId = db.notifications.at(-2).id;
  const { container, rerender } = mount(db, 5, firstId);
  expect(container.querySelectorAll('.leave-report-request-list li')).toHaveLength(8);
  fireEvent.click(screen.getByRole('button', { name: 'แสดงเพิ่มเติม' }));
  expect(container.querySelectorAll('.leave-report-request-list li')).toHaveLength(12);
  rerender(<LeaveReportDashboardPage db={db} actor={db.employees[4]} notificationId={secondId} />);
  expect(container.querySelectorAll('.leave-report-request-list li')).toHaveLength(8);
});

test('HR scans pending first, filters frozen requests, and sees separate fields without changing the report', () => {
  const { db, id } = fixture();
  const before = structuredClone(db);
  const { container, run } = mount(db, 5, id);
  const rows = () => container.querySelectorAll('.leave-report-request-list li');
  expect(rows()[0]).toHaveTextContent('LR-2026-01002');
  expect(within(rows()[0]).getByText('รอพิจารณา')).toBeInTheDocument();
  expect(rows()[0].querySelectorAll('dl > div')).toHaveLength(5);
  expect(container.querySelector('.stats .stat:first-child .stat-head')).toHaveTextContent(
    'รอพิจารณา',
  );
  fireEvent.change(screen.getByLabelText('สถานะในรายงาน'), { target: { value: 'Approved' } });
  expect(rows()).toHaveLength(1);
  expect(rows()[0]).toHaveTextContent('LR-2026-01009');
  expect(rows()[0]).toHaveTextContent('30/12/2569–4/1/2570');
  expect(rows()[0]).toHaveTextContent('1 วัน');
  expect(metric('คำขอทั้งหมด')).toHaveTextContent('2คำขอ');
  fireEvent.change(screen.getByLabelText('สถานะในรายงาน'), { target: { value: 'Rejected' } });
  expect(rows()).toHaveLength(0);
  expect(screen.getByText('ไม่มีคำขอสถานะนี้ในรายงาน')).toBeInTheDocument();
  expect(db).toEqual(before);
  expect(run).not.toHaveBeenCalled();
});

test('ambiguous custom names stay fully readable and disable field-based filtering', () => {
  const db = createDemoDatabase();
  db.employees[0].name = 'ชื่อ | ชื่อซ้ำ';
  applyCommand(db, 4, {
    type: 'sendLeaveReport',
    employeeId: 1,
    hrId: 5,
    year: 2026,
    month: 0,
    leaveTypeId: 0,
  });
  const { container } = mount(db, 5, db.notifications.at(-2).id);
  expect(container.querySelector('.leave-report-request-list')).toHaveTextContent('ชื่อ | ชื่อซ้ำ');
  expect(screen.queryByLabelText('สถานะในรายงาน')).not.toBeInTheDocument();
  expect(metric('คำขอทั้งหมด')).toHaveTextContent('2คำขอ');
});

test('saved withdrawn labels still support status filtering and keep zero approved totals', () => {
  const db = createDemoDatabase();
  db.requests
    .filter((item) => item.employeeId === 1)
    .forEach((item) => {
      item.status = 'Withdrawn';
    });
  applyCommand(db, 4, {
    type: 'sendLeaveReport',
    employeeId: 1,
    hrId: 5,
    year: 2026,
    month: 0,
    leaveTypeId: 0,
  });
  const { container } = mount(db, 5, db.notifications.at(-2).id);
  fireEvent.change(screen.getByLabelText('สถานะในรายงาน'), { target: { value: 'Withdrawn' } });
  expect(container.querySelectorAll('.leave-report-request-list .badge.withdrawn')).toHaveLength(2);
  expect(metric('วันลาที่อนุมัติ')).toHaveTextContent('0 วัน');
});

test('HR sees the most frequent approved employee from the sent report and keeps the saved ranking', () => {
  const db = createDemoDatabase();
  db.requests.find((item) => item.id === 1002).status = 'Approved';
  applyCommand(db, 4, {
    type: 'sendLeaveReport',
    employeeId: 0,
    hrId: 5,
    year: 2026,
    month: 0,
    leaveTypeId: 0,
  });
  const id = db.notifications.at(-2).id;
  const saved = structuredClone(db);
  const { container, rerender, run } = mount(db, 5, id);
  const chart = within(container.querySelector('.leave-report-frequency'));
  expect(chart.getByRole('heading', { name: 'จำนวนคำขออนุมัติรายพนักงาน' })).toBeInTheDocument();
  expect(chart.getByText(/อนุมัติมากที่สุด:/)).toHaveTextContent(
    'พิมพ์ชนก วัฒนกุล (EMP-00001) · 2 คำขอ',
  );
  expect(
    chart.getByRole('img', { name: /พิมพ์ชนก วัฒนกุล EMP-00001 อนุมัติ 2 คำขอ 2 วัน/ }),
  ).toBeInTheDocument();
  expect(chart.getAllByRole('listitem')).toHaveLength(4);
  db.requests = [];
  db.days = [];
  rerender(
    <LeaveReportDashboardPage db={db} actor={db.employees[4]} notificationId={id} run={run} />,
  );
  expect(chart.getByText(/อนุมัติมากที่สุด:/)).toHaveTextContent('2 คำขอ');
  expect(run).not.toHaveBeenCalled();
  expect(saved.notifications.find((item) => item.id === id).read).toBe(false);
});

test('equal top frequencies show each tied employee and a short shared-rank label', () => {
  const db = createDemoDatabase();
  applyCommand(db, 4, {
    type: 'sendLeaveReport',
    employeeId: 0,
    hrId: 5,
    year: 2026,
    month: 0,
    leaveTypeId: 0,
  });
  const { container } = mount(db, 5, db.notifications.at(-2).id);
  const chart = within(container.querySelector('.leave-report-frequency'));
  expect(chart.getByText(/สูงสุดเท่ากัน/)).toHaveTextContent('4 คน · คนละ 1 คำขอ');
  expect(chart.getAllByRole('listitem')).toHaveLength(4);
});

test('frequency shows an honest empty or unavailable state when saved counts cannot be ranked', () => {
  const { db, id } = fixture({ year: 2030 });
  const { container } = mount(db, 5, id);
  expect(
    within(container.querySelector('.leave-report-frequency')).getByText(
      'ไม่มีคำขออนุมัติในรายงานนี้',
    ),
  ).toBeInTheDocument();
  cleanup();
  const all = createDemoDatabase();
  all.employees[0].name = 'ชื่อ (EMP-99999) | ซ้ำ';
  applyCommand(all, 4, {
    type: 'sendLeaveReport',
    employeeId: 1,
    hrId: 5,
    year: 2026,
    month: 0,
    leaveTypeId: 0,
  });
  const mounted = mount(all, 5, all.notifications.at(-2).id);
  expect(
    within(mounted.container.querySelector('.leave-report-frequency')).getByRole('status'),
  ).toHaveTextContent('รายงานนี้แยกคำขอรายพนักงานไม่ได้');
  expect(metric('คำขอทั้งหมด')).toHaveTextContent('2คำขอ');
});
