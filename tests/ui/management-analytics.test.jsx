import { afterEach, beforeEach, expect, jest, test } from '@jest/globals';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { ManagementAnalytics } from '../../src/ManagementAnalytics.jsx';
import { ManagementKpiDialog } from '../../src/ManagementKpiDialog.jsx';
import { createWorkspaceRoutes } from '../../src/routes.jsx';
import { HrWorkLinks } from '../../src/HrAnalyticsCharts.jsx';
import { createDemoDatabase } from '../../src/data/demoDatabase.js';

let db;
beforeEach(() => {
  db = createDemoDatabase();
  jest.useFakeTimers({ now: new Date('2026-10-15T05:00:00Z') });
});
afterEach(() => {
  cleanup();
  jest.runOnlyPendingTimers();
  jest.useRealTimers();
  jest.restoreAllMocks();
});
function open(id = 5) {
  return render(
    <ManagementAnalytics db={db} actor={db.employees.find((person) => person.id === id)} />,
  );
}

test('HR sees four KPIs, twelve trend months, scoped department/type filters and annual quota rows', () => {
  open();
  expect(screen.getByRole('heading', { name: 'ภาพรวมการลา' })).toBeInTheDocument();
  expect(screen.getByLabelText('ตัวชี้วัดการลา 4 ด้าน').children).toHaveLength(4);
  expect(screen.getAllByRole('img', { name: /อนุมัติ.*รอพิจารณา/ }).length).toBeGreaterThanOrEqual(
    12,
  );
  fireEvent.click(screen.getByText('สิทธิ์วันลารายปี'));
  const table = screen.getByRole('table');
  expect(within(table).getAllByRole('row')).toHaveLength(11);
  expect(screen.getByRole('option', { name: 'Human Resources' })).toBeInTheDocument();
  fireEvent.change(screen.getByLabelText('แผนก'), { target: { value: 'Sales Department' } });
  expect(within(table).getAllByRole('row')).toHaveLength(5);
  expect(within(table).queryByText('พิมพ์ชนก วัฒนกุล')).not.toBeInTheDocument();
  fireEvent.change(screen.getByLabelText('ประเภทการลาในรายงาน'), { target: { value: '1' } });
  expect(within(table).queryByRole('columnheader', { name: /ลากิจ/ })).not.toBeInTheDocument();
  expect(within(table).getByRole('columnheader', { name: /ลาพักร้อน/ })).toBeInTheDocument();
});

test('HR ranking filters approved source requests, restores all rows and resets selection with period filters', () => {
  const template = db.requests[0];
  db.requests = [
    {
      ...template,
      id: 1,
      employeeId: 1,
      leaveTypeId: 1,
      status: 'Approved',
      startDate: '2026-10-14',
      endDate: '2026-10-14',
    },
    {
      ...template,
      id: 2,
      employeeId: 1,
      leaveTypeId: 1,
      status: 'Pending',
      startDate: '2026-10-15',
      endDate: '2026-10-15',
    },
    {
      ...template,
      id: 3,
      employeeId: 6,
      leaveTypeId: 3,
      status: 'Approved',
      startDate: '2026-10-16',
      endDate: '2026-10-16',
    },
  ];
  db.days = db.requests.map((request) => ({
    id: request.id,
    leaveId: request.id,
    date: request.startDate,
    units: request.id === 1 ? 0.5 : 1,
  }));
  db.approvals = [];
  const before = structuredClone(db);
  const previousScroll = HTMLElement.prototype.scrollIntoView;
  HTMLElement.prototype.scrollIntoView = jest.fn();
  try {
    const routes = createWorkspaceRoutes({
      db,
      actor: db.employees.find((person) => person.id === 5),
    });
    render(routes.find((route) => route.path === '/leave-summary').element);
    expect(screen.getByRole('heading', { name: 'ภาพรวมการลา', level: 1 })).toBeInTheDocument();
    expect(document.querySelector('.welcome-hero')).toBeNull();
    expect(screen.getByText(/อันดับสูงสุดเท่ากัน:/)).toHaveTextContent('EMP-00001');
    expect(screen.getByText(/อันดับสูงสุดเท่ากัน:/)).toHaveTextContent('EMP-00006');
    const ranking = screen.getByRole('list', { name: 'อันดับตามจำนวนคำขออนุมัติ' });
    fireEvent.click(within(ranking).getByRole('button', { name: /EMP-00001/ }));
    expect(screen.getByRole('heading', { name: 'คำขอในเดือนที่เลือก' })).toHaveFocus();
    expect(screen.getByLabelText('สถานะคำขอ')).toHaveValue('Approved');
    let requests = screen.getByRole('list', { name: 'คำขอในรายงาน HR' });
    expect(within(requests).getAllByRole('listitem')).toHaveLength(1);
    expect(within(requests).getByText('ครึ่งวัน')).toBeInTheDocument();
    expect(within(requests).getByRole('link')).toHaveAttribute('href', '#/request/1');
    fireEvent.click(screen.getByRole('button', { name: 'ดูทุกคน' }));
    expect(screen.getByRole('heading', { name: 'คำขอในเดือนที่เลือก' })).toHaveFocus();
    requests = screen.getByRole('list', { name: 'คำขอในรายงาน HR' });
    expect(within(requests).getAllByRole('listitem')).toHaveLength(3);
    expect(within(requests).getAllByRole('link')[0]).toHaveAttribute('href', '#/request/2');
    fireEvent.click(within(ranking).getByRole('button', { name: /EMP-00001/ }));
    fireEvent.change(screen.getByLabelText('แผนก'), { target: { value: 'Sales Department' } });
    expect(screen.queryByRole('button', { name: 'ดูทุกคน' })).not.toBeInTheDocument();
    expect(screen.getByLabelText('สถานะคำขอ')).toHaveValue('all');
    requests = screen.getByRole('list', { name: 'คำขอในรายงาน HR' });
    expect(within(requests).getAllByRole('link')).toHaveLength(1);
    expect(within(requests).getByRole('link')).toHaveAttribute('href', '#/request/3');
    fireEvent.change(screen.getByLabelText('เดือนของตัวชี้วัด'), { target: { value: '9' } });
    expect(screen.getByText('เดือนนี้ยังไม่มีวันลา')).toBeInTheDocument();
    expect(screen.queryByRole('list', { name: 'คำขอในรายงาน HR' })).not.toBeInTheDocument();
    expect(db).toEqual(before);
  } finally {
    if (previousScroll) HTMLElement.prototype.scrollIntoView = previousScroll;
    else delete HTMLElement.prototype.scrollIntoView;
  }
});

test('HR work links distinguish assigned decisions from consultations and reject a forged HR identity', () => {
  const template = db.requests[0];
  db.requests = [
    { ...template, id: 81, employeeId: 4, status: 'Pending' },
    { ...template, id: 82, employeeId: 1, status: 'Pending' },
    { ...template, id: 83, employeeId: 6, status: 'Pending' },
    { ...template, id: 84, employeeId: 5, status: 'Pending' },
    { ...template, id: 85, employeeId: 2, status: 'Approved' },
  ];
  db.approvals = [
    {
      id: 1,
      leaveId: 81,
      approverId: 5,
      reviewRole: 'HR',
      reviewType: 'Decision',
      status: 'Pending',
    },
    {
      id: 2,
      leaveId: 82,
      approverId: 5,
      reviewRole: 'HR',
      reviewType: 'Consultation',
      status: 'Pending',
    },
    {
      id: 3,
      leaveId: 82,
      approverId: 5,
      reviewRole: 'HR',
      reviewType: 'Consultation',
      status: 'Pending',
    },
    {
      id: 4,
      leaveId: 83,
      approverId: 7,
      reviewRole: 'HR',
      reviewType: 'Consultation',
      status: 'Pending',
    },
    {
      id: 5,
      leaveId: 84,
      approverId: 5,
      reviewRole: 'HR',
      reviewType: 'Consultation',
      status: 'Pending',
    },
    {
      id: 6,
      leaveId: 85,
      approverId: 5,
      reviewRole: 'HR',
      reviewType: 'Consultation',
      status: 'Pending',
    },
  ];
  render(
    <HrWorkLinks
      db={db}
      actor={db.employees.find((person) => person.id === 5)}
      date="2026-10-15"
    />,
  );
  expect(screen.getByRole('link', { name: 'คำขอผู้จัดการ 1 คำขอ' })).toHaveAttribute(
    'href',
    '#/approvals',
  );
  expect(screen.getByRole('link', { name: 'คำขอส่งต่อ 1 คำขอ' })).toHaveAttribute(
    'href',
    '#/requests',
  );
  cleanup();
  render(<HrWorkLinks db={db} actor={{ ...db.employees[0], role: 'HR' }} date="2026-10-15" />);
  expect(screen.queryByRole('link')).not.toBeInTheDocument();
});

test('manager report is team-only and employees cannot open the component by forging their role', () => {
  open(4);
  const table = screen.getByRole('table');
  expect(within(table).getAllByRole('row')).toHaveLength(5);
  expect(within(table).queryByText('ศิริพร ใจดี')).not.toBeInTheDocument();
  expect(screen.queryByRole('option', { name: 'Human Resources' })).not.toBeInTheDocument();
  expect(screen.queryByRole('option', { name: 'Sales Department' })).not.toBeInTheDocument();
  cleanup();
  render(<ManagementAnalytics db={db} actor={{ ...db.employees[0], role: 'HR' }} />);
  expect(screen.getByRole('alert')).toHaveTextContent('เฉพาะผู้จัดการและ HR');
  expect(screen.queryByRole('table')).not.toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'ออกรายงาน CSV' })).not.toBeInTheDocument();
});

test('CSV download uses the active filters, has a Thai-compatible blob and releases the object URL', () => {
  const create = jest.fn(() => 'blob:report');
  const revoke = jest.fn();
  const oldCreate = URL.createObjectURL,
    oldRevoke = URL.revokeObjectURL;
  URL.createObjectURL = create;
  URL.revokeObjectURL = revoke;
  const click = jest.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
  try {
    open();
    fireEvent.change(screen.getByLabelText('เดือนของตัวชี้วัด'), { target: { value: '11' } });
    fireEvent.click(screen.getByRole('button', { name: 'ออกรายงาน CSV' }));
    expect(create).toHaveBeenCalledTimes(1);
    expect(create.mock.calls[0][0].type).toBe('text/csv;charset=utf-8');
    expect(click.mock.instances[0].download).toBe('leave-management-2026-11.csv');
    jest.runOnlyPendingTimers();
    expect(revoke).toHaveBeenCalledWith('blob:report');
  } finally {
    URL.createObjectURL = oldCreate;
    URL.revokeObjectURL = oldRevoke;
  }
});

test('missing approval times and a team without employees show explicit empty states', () => {
  db.requests = [];
  db.days = [];
  db.approvals = [];
  for (const person of db.employees) if (person.role === 'Employee') person.managerId = 7;
  open(4);
  expect(screen.getByText('ไม่มีฐานคำนวณ')).toBeInTheDocument();
  expect(screen.getByText('ยังไม่มีข้อมูล')).toBeInTheDocument();
  expect(
    screen.getByText('ไม่มีพนักงานในขอบเขตที่เลือก', { selector: '.management-balances p' }),
  ).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'ออกรายงาน CSV' })).toBeDisabled();
});

test.each([
  ['อัตราการลาในเดือนที่เลือก', 'รายละเอียดอัตราการลา'],
  ['ระยะเวลาอนุมัติเฉลี่ย', 'รายละเอียดระยะเวลาอนุมัติ'],
  ['แผนกที่มียอดการลาสูงสุด', 'รายละเอียดการลาแยกตามแผนก'],
  ['ประเภทการลาที่ใช้มากที่สุด', 'รายละเอียดการลาแยกตามประเภท'],
])('KPI %s opens a closable dialog and restores focus and filters', (label, title) => {
  const callback = jest.fn();
  render(
    <ManagementAnalytics
      db={db}
      actor={db.employees.find((person) => person.id === 5)}
      onAnalyticsDialogChange={callback}
    />,
  );
  const trigger = screen.getByRole('button', { name: `ดูรายละเอียด${label}` });
  trigger.focus();
  fireEvent.click(trigger);
  const dialog = screen.getByRole('dialog', { name: title });
  expect(dialog).toBeInTheDocument();
  expect(document.querySelector('.management-analytics')).toHaveAttribute('inert');
  expect(document.body.style.overflow).toBe('hidden');
  expect(callback).toHaveBeenLastCalledWith(true);
  fireEvent.click(within(dialog).getByRole('button', { name: 'ปิด', exact: true }));
  jest.runOnlyPendingTimers();
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  expect(callback).toHaveBeenLastCalledWith(false);
  expect(document.querySelector('.management-analytics')).not.toHaveAttribute('inert');
  expect(document.body.style.overflow).toBe('');
  expect(screen.getByLabelText('เดือนของตัวชี้วัด')).toHaveValue('10');
  expect(trigger).toHaveFocus();
});

test('approval detail shows real decision times and links; Escape closes it without changing source data', () => {
  const before = structuredClone(db);
  open();
  fireEvent.change(screen.getByLabelText('แผนก'), { target: { value: 'IT Department' } });
  fireEvent.change(screen.getByLabelText('ประเภทการลาในรายงาน'), { target: { value: '3' } });
  fireEvent.click(screen.getByRole('button', { name: 'ดูรายละเอียดระยะเวลาอนุมัติเฉลี่ย' }));
  const dialog = screen.getByRole('dialog');
  expect(within(dialog).getByText('11/10/2569 · 21:30 น.')).toBeInTheDocument();
  expect(within(dialog).getByText('11/10/2569 · 21:33 น.')).toBeInTheDocument();
  expect(within(dialog).getByRole('link', { name: 'เปิดคำขอ LR-2026-01001' })).toHaveAttribute(
    'href',
    '#/request/1001',
  );
  fireEvent.keyDown(dialog, { key: 'Escape' });
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  expect(screen.getByLabelText('แผนก')).toHaveValue('IT Department');
  expect(screen.getByLabelText('ประเภทการลาในรายงาน')).toHaveValue('3');
  expect(db).toEqual(before);
});

test('department drill-down filters source requests without changing the dashboard selection', () => {
  open();
  fireEvent.click(screen.getByRole('button', { name: 'ดูรายละเอียดแผนกที่มียอดการลาสูงสุด' }));
  const dialog = screen.getByRole('dialog');
  const compare = within(dialog).getByText('เปรียบเทียบทุกแผนก');
  expect(compare.closest('details')).not.toHaveAttribute('open');
  fireEvent.click(compare);
  fireEvent.click(within(dialog).getByRole('button', { name: /Sales Department/ }));
  expect(within(dialog).getByLabelText('เลือกแผนกเพื่อดูคำขอ')).toHaveValue('Sales Department');
  const requests = within(dialog).getByRole('region', { name: 'คำขอที่ประกอบเป็นยอดการลา' });
  expect(
    within(requests).getByRole('link', { name: 'เปิดคำขอ LR-2026-01003' }),
  ).toBeInTheDocument();
  expect(within(requests).queryByText(/พิมพ์ชนก/)).not.toBeInTheDocument();
  fireEvent.mouseDown(document.querySelector('.management-detail-overlay .dialog-shade'));
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  expect(screen.getByLabelText('แผนก')).toHaveValue('');
});

test('rate dialog can compare the previous month and manager dialogs never contain another team or HR', () => {
  open(4);
  fireEvent.click(screen.getByRole('button', { name: 'ดูรายละเอียดอัตราการลาในเดือนที่เลือก' }));
  const dialog = screen.getByRole('dialog');
  expect(within(dialog).queryByText(/กานต์ พรชัย|ศิริพร ใจดี/)).not.toBeInTheDocument();
  fireEvent.click(within(dialog).getByRole('button', { name: 'เดือนก่อน', exact: true }));
  expect(within(dialog).getByText('ไม่มีวันลาที่นำมาคำนวณในเดือนนี้')).toBeInTheDocument();
  fireEvent.click(within(dialog).getByRole('button', { name: 'เดือนที่เลือก', exact: true }));
  expect(
    within(dialog).getByRole('region', { name: 'รายการวันลาที่นำมาคำนวณอัตรา' }),
  ).toBeInTheDocument();
});

test('rate opens with a short person summary and reveals exact counted dates and source requests on demand', () => {
  db.requests = [
    {
      ...db.requests[0],
      id: 9100,
      employeeId: 1,
      leaveTypeId: 1,
      status: 'Approved',
      startDate: '2026-10-14',
      endDate: '2026-10-15',
    },
    {
      ...db.requests[0],
      id: 9101,
      employeeId: 1,
      leaveTypeId: 1,
      status: 'Pending',
      startDate: '2026-10-16',
      endDate: '2026-10-16',
    },
  ];
  db.days = [
    { id: 1, leaveId: 9100, date: '2026-10-14', units: 1 },
    { id: 2, leaveId: 9100, date: '2026-10-15', units: 0.5 },
    { id: 3, leaveId: 9101, date: '2026-10-16', units: 1 },
  ];
  db.approvals = [];
  const before = structuredClone(db);
  open(4);
  fireEvent.click(screen.getByRole('button', { name: 'ดูรายละเอียดอัตราการลาในเดือนที่เลือก' }));
  const dialog = screen.getByRole('dialog');
  const region = within(dialog).getByRole('region', { name: 'รายการวันลาที่นำมาคำนวณอัตรา' });
  const person = within(region).getByText('พิมพ์ชนก วัฒนกุล').closest('li');
  expect(within(person).getByText('2 วันครึ่ง')).toBeVisible();
  const date = within(person).getByText('15/10/2569');
  expect(date).not.toBeVisible();
  const method = within(dialog).getByText('วิธีคิดตัวเลขนี้');
  expect(method.closest('details')).not.toHaveAttribute('open');
  fireEvent.click(within(person).getByText('ดูวันที่ลาและคำขอ'));
  expect(date).toBeVisible();
  expect(within(person).getByText('ครึ่งวัน')).toBeVisible();
  expect(within(person).getAllByRole('link')).toHaveLength(3);
  expect(within(person).getByText('รอพิจารณา')).toBeVisible();
  fireEvent.click(method);
  expect(method.closest('details')).toHaveAttribute('open');
  fireEvent.click(within(dialog).getByRole('button', { name: 'เดือนก่อน', exact: true }));
  fireEvent.click(within(dialog).getByRole('button', { name: 'เดือนที่เลือก', exact: true }));
  expect(within(dialog).getByText('15/10/2569')).not.toBeVisible();
  expect(db).toEqual(before);
});

test('direct KPI dialog rechecks a forged employee role and returns no source links', () => {
  render(
    <ManagementKpiDialog
      db={db}
      actor={{ ...db.employees[0], role: 'HR' }}
      filters={{ year: 2026, month: 10 }}
      kind="rate"
      onClose={jest.fn()}
      trigger={null}
    />,
  );
  const dialog = screen.getByRole('dialog');
  expect(within(dialog).getByRole('alert')).toHaveTextContent('เฉพาะผู้จัดการและ HR');
  expect(within(dialog).queryByRole('link')).not.toBeInTheDocument();
});
