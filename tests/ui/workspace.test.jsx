import { jest, beforeEach, afterEach, test, expect } from '@jest/globals';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createDemoDatabase } from '../../src/data/demoDatabase.js';
import { findLoginAccount } from '../../src/domain/auth.js';
import { applyCommand, DomainError, visibleSnapshot } from '../../src/domain/service.js';
import { ENTRY_TIMING } from '../../src/motion.js';
import { searchColleagues } from '../../src/domain/colleagues.js';
import { employeeProfile } from '../../src/domain/employeeProfile.js';

const repository = {
  session: jest.fn(),
  login: jest.fn(),
  logout: jest.fn(),
  snapshot: jest.fn(),
  getEmployeeProfile: jest.fn(),
  execute: jest.fn(),
  searchColleagues: jest.fn(),
  resetDemo: jest.fn(),
};
jest.unstable_mockModule('../../src/data/index.js', () => ({ repository, dataMode: 'api' }));
const { default: App } = await import('../../src/App.jsx');
let database, account;
const now = new Date('2026-10-11T05:00:00.000Z');

beforeEach(() => {
  database = createDemoDatabase();
  account = null;
  window.history.replaceState({}, '', '/#/dashboard');
  localStorage.clear();
  document.documentElement.dataset.theme = 'light';
  repository.session.mockImplementation(async () => account);
  repository.login.mockImplementation(async (username, password) => {
    const found = findLoginAccount(database.employees, username);
    if (!found?.active || password !== '1234')
      throw new Error('ชื่อผู้ใช้ อีเมล หรือรหัสผ่านไม่ถูกต้อง');
    account = found;
    return found;
  });
  repository.logout.mockImplementation(async () => {
    account = null;
  });
  repository.snapshot.mockImplementation(async () => visibleSnapshot(database, account.id));
  repository.getEmployeeProfile
    .mockReset()
    .mockImplementation(async (id) => employeeProfile(database, account.id, id));
  repository.execute.mockImplementation(async (command) =>
    applyCommand(database, account.id, command, now),
  );
  repository.searchColleagues.mockImplementation(async (query, date) =>
    searchColleagues(database, account.id, query, date),
  );
});
afterEach(() => {
  cleanup();
  jest.useFakeTimers({
    now,
    doNotFake: [
      'performance',
      'hrtime',
      'nextTick',
      'queueMicrotask',
      'setImmediate',
      'clearImmediate',
      'setTimeout',
      'clearTimeout',
      'setInterval',
      'clearInterval',
      'requestAnimationFrame',
      'cancelAnimationFrame',
    ],
  });
  window.matchMedia.mockImplementation((query) => ({
    matches: query === '(prefers-reduced-motion: reduce)',
    media: query,
    addEventListener: jest.fn(),
    removeEventListener: jest.fn(),
  }));
});

function deferred() {
  let resolve, reject;
  const promise = new Promise((accept, decline) => {
    resolve = accept;
    reject = decline;
  });
  return { promise, resolve, reject };
}

function motionTimers(reduced = false, mobile = false) {
  jest.useFakeTimers({
    now,
    doNotFake: [
      'nextTick',
      'queueMicrotask',
      'setImmediate',
      'clearImmediate',
      'performance',
      'hrtime',
    ],
  });
  window.matchMedia.mockImplementation((query) => ({
    matches:
      query === '(prefers-reduced-motion: reduce)'
        ? reduced
        : query === '(max-width: 760px)' && mobile,
    media: query,
    addEventListener: jest.fn(),
    removeEventListener: jest.fn(),
  }));
}

async function advanceMotion(ms) {
  await act(async () => jest.advanceTimersByTime(ms));
}

async function clickLogout() {
  const button = screen.getByRole('button', { name: 'ออกจากระบบ', exact: true });
  await act(async () => button.click());
  return button;
}

async function openWorkspace(id = 1, path = '/dashboard') {
  account = database.employees.find((employee) => employee.id === id);
  window.history.replaceState({}, '', '/#' + path);
  render(<App />);
  await waitFor(() => expect(document.querySelector('.app-shell')).toBeInTheDocument());
}

test('A manager receives a new request popup through the existing API refresh and logout removes it', async () => {
  motionTimers();
  await openWorkspace(4);
  expect(screen.queryByRole('region', { name: 'การแจ้งเตือนคำขอใหม่' })).not.toBeInTheDocument();
  applyCommand(
    database,
    1,
    {
      type: 'submit',
      input: {
        leaveTypeId: 1,
        startDate: '2026-12-07',
        endDate: '2026-12-07',
        duration: 'Full',
        reason: 'ทดสอบแจ้งเตือนผู้จัดการ',
      },
    },
    now,
  );
  await advanceMotion(15000);
  const popup = screen.getByRole('region', { name: 'การแจ้งเตือนคำขอใหม่' });
  expect(popup).toHaveTextContent('พิมพ์ชนก');
  expect(popup).toHaveTextContent('ส่งคำขอ');
  expect(screen.getByRole('button', { name: /^การแจ้งเตือน \d+ รายการใหม่/ })).toHaveTextContent(
    /\d/,
  );
  await clickLogout();
  expect(screen.queryByRole('region', { name: 'การแจ้งเตือนคำขอใหม่' })).not.toBeInTheDocument();
});

test('logout waits for the server, prevents duplicate calls and reveals login after confirmation', async () => {
  motionTimers();
  const pending = deferred();
  await openWorkspace();
  repository.logout.mockImplementationOnce(() => pending.promise);
  const button = screen.getByRole('button', { name: 'ออกจากระบบ', exact: true });
  await act(async () => {
    button.click();
    button.click();
  });
  expect(repository.logout).toHaveBeenCalledTimes(1);
  expect(button).toBeDisabled();
  const overlay = screen.getByRole('status');
  expect(overlay).toHaveTextContent('กำลังออกจากระบบ');
  expect(overlay).toHaveAttribute('aria-busy', 'true');
  expect(overlay).toHaveFocus();
  expect(document.querySelector('.app-shell')).toHaveAttribute('inert');
  await advanceMotion(ENTRY_TIMING.checking + 2000);
  expect(screen.getByRole('status')).toHaveTextContent('กำลังออกจากระบบ');
  expect(screen.queryByLabelText('ชื่อผู้ใช้หรืออีเมล')).not.toBeInTheDocument();
  await act(async () => pending.resolve());
  expect(screen.getByRole('status')).toHaveTextContent('ออกจากระบบสำเร็จ');
  expect(document.querySelector('.entry-transition')).toHaveClass('phase-ready');
  await advanceMotion(ENTRY_TIMING.ready - 1);
  expect(screen.queryByLabelText('ชื่อผู้ใช้หรืออีเมล')).not.toBeInTheDocument();
  await advanceMotion(1);
  expect(document.querySelector('.entry-transition')).toHaveClass('phase-leaving');
  expect(document.querySelector('.app-shell')).not.toBeInTheDocument();
  expect(document.querySelector('.login-frame')).toHaveAttribute('inert');
  await advanceMotion(ENTRY_TIMING.leaving);
  expect(document.querySelector('.entry-transition')).not.toBeInTheDocument();
  expect(document.querySelector('.login-frame')).not.toHaveAttribute('inert');
  expect(screen.getByLabelText('ชื่อผู้ใช้หรืออีเมล')).toHaveValue('');
  expect(screen.getByLabelText('รหัสผ่าน')).toHaveValue('');
  expect(screen.getByLabelText('ชื่อผู้ใช้หรืออีเมล')).toHaveFocus();
  expect(jest.getTimerCount()).toBe(0);
});

test('failed logout restores the workspace and focus, and allows retry', async () => {
  const user = userEvent.setup();
  const pending = deferred();
  await openWorkspace();
  repository.logout.mockImplementationOnce(() => pending.promise);
  const button = await clickLogout();
  await act(async () => pending.reject(new Error('ออกจากระบบไม่สำเร็จ กรุณาลองอีกครั้ง')));
  expect(screen.getByRole('alert')).toHaveTextContent('ออกจากระบบไม่สำเร็จ กรุณาลองอีกครั้ง');
  expect(document.querySelector('.app-shell')).not.toHaveAttribute('inert');
  expect(document.querySelector('.entry-transition')).not.toBeInTheDocument();
  expect(button).toBeEnabled();
  expect(button).toHaveFocus();
  await user.click(button);
  expect(await screen.findByLabelText('ชื่อผู้ใช้หรืออีเมล')).toHaveFocus();
  expect(repository.logout).toHaveBeenCalledTimes(2);
});

test('reduced motion skips logout presentation delays while still awaiting the server', async () => {
  motionTimers(true);
  const pending = deferred();
  await openWorkspace();
  repository.logout.mockImplementationOnce(() => pending.promise);
  await clickLogout();
  expect(screen.getByRole('status')).toHaveTextContent('กำลังออกจากระบบ');
  expect(jest.getTimerCount()).toBe(0);
  await act(async () => pending.resolve());
  expect(document.querySelector('.entry-transition')).not.toBeInTheDocument();
  expect(screen.getByLabelText('ชื่อผู้ใช้หรืออีเมล')).toHaveFocus();
  expect(jest.getTimerCount()).toBe(0);
});

test.each(['checking', 'ready', 'leaving'])(
  'unmount cancels logout timers during %s',
  async (phase) => {
    motionTimers();
    const pending = deferred();
    await openWorkspace();
    repository.logout.mockImplementationOnce(() => pending.promise);
    await clickLogout();
    if (phase !== 'checking') {
      await act(async () => pending.resolve());
      await advanceMotion(ENTRY_TIMING.checking);
      if (phase === 'leaving') await advanceMotion(ENTRY_TIMING.ready);
    }
    expect(document.querySelector('.entry-transition')).toHaveClass('phase-' + phase);
    cleanup();
    expect(jest.getTimerCount()).toBe(0);
    await act(async () => pending.resolve());
    await advanceMotion(5000);
    expect(jest.getTimerCount()).toBe(0);
    expect(document.querySelector('.entry-transition')).not.toBeInTheDocument();
  },
);

test.each(['snapshot', 'unauthenticated'])(
  'stale background %s cannot interrupt logout',
  async (result) => {
    motionTimers();
    const refresh = deferred(),
      pending = deferred();
    await openWorkspace();
    repository.snapshot.mockImplementationOnce(() => refresh.promise);
    await act(async () => window.dispatchEvent(new Event('focus')));
    repository.logout.mockImplementationOnce(() => pending.promise);
    await clickLogout();
    await act(async () => {
      if (result === 'snapshot') {
        const stale = visibleSnapshot(database, account.id);
        stale.employees = stale.employees.map((e) => ({ ...e, name: 'ข้อมูลเก่า' }));
        refresh.resolve(stale);
      } else refresh.reject(new DomainError('เซสชันหมดอายุ', 'UNAUTHENTICATED'));
    });
    expect(document.querySelector('.app-shell')).toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent('กำลังออกจากระบบ');
    expect(screen.queryByText('ข้อมูลเก่า')).not.toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    await act(async () => pending.resolve());
    await advanceMotion(ENTRY_TIMING.checking);
    await advanceMotion(ENTRY_TIMING.ready);
    await advanceMotion(ENTRY_TIMING.leaving);
    expect(screen.getByLabelText('ชื่อผู้ใช้หรืออีเมล')).toHaveFocus();
  },
);

test('failed mobile logout releases scroll locking and focuses the visible menu button', async () => {
  motionTimers(false, true);
  const pending = deferred();
  await openWorkspace();
  const toggle = screen.getByRole('button', { name: 'เปิดหรือปิดเมนู' });
  await act(async () => toggle.click());
  expect(document.body.style.overflow).toBe('hidden');
  repository.logout.mockImplementationOnce(() => pending.promise);
  await clickLogout();
  expect(document.body.style.overflow).toBe('');
  expect(screen.getByRole('status')).toHaveFocus();
  await act(async () => pending.reject(new Error('ออกจากระบบไม่สำเร็จ')));
  expect(screen.getByRole('alert')).toHaveTextContent('ออกจากระบบไม่สำเร็จ');
  expect(toggle).toHaveFocus();
  expect(toggle).toHaveAttribute('aria-expanded', 'false');
  await advanceMotion(ENTRY_TIMING.menuClose);
  expect(document.body.style.overflow).toBe('');
});

test('login starts empty and role selection only lists accounts in that category', async () => {
  const user = userEvent.setup();
  render(<App />);
  const username = await screen.findByLabelText('ชื่อผู้ใช้หรืออีเมล');
  const password = screen.getByLabelText('รหัสผ่าน');
  expect(username).toHaveValue('');
  expect(password).toHaveValue('');
  expect(document.querySelector('#login-account')).toBeDisabled();
  await user.click(
    within(screen.getByRole('group', { name: 'เลือกบทบาท' })).getByRole('button', {
      name: /พนักงาน/,
    }),
  );
  const select = document.querySelector('#login-account');
  const emails = [...select.options].filter((option) => option.value).map((option) => option.value);
  expect(emails).toHaveLength(7);
  expect(emails).not.toContain('manager@demo.local');
  expect(password).toHaveValue('');
  await user.selectOptions(select, 'orn@demo.local');
  expect(username).toHaveValue('orathai');
  expect(password).toHaveValue('1234');
});

test('manual personal username authenticates with the repository role', async () => {
  const user = userEvent.setup();
  render(<App />);
  await user.click(
    within(await screen.findByRole('group', { name: 'เลือกบทบาท' })).getByRole('button', {
      name: /พนักงาน/,
    }),
  );
  await user.type(await screen.findByLabelText('ชื่อผู้ใช้หรืออีเมล'), 'thanawat');
  await user.type(screen.getByLabelText('รหัสผ่าน'), '1234');
  await user.click(screen.getByRole('button', { name: 'เข้าสู่ระบบ', exact: true }));
  await waitFor(() => expect(document.querySelector('.app-shell')).toBeInTheDocument());
  expect(repository.login).toHaveBeenCalledWith('thanawat', '1234');
  expect(screen.getByRole('link', { name: 'รายการคำขอของทีม', exact: true })).toBeInTheDocument();
  expect(screen.getByRole('link', { name: 'ยื่นคำขอลา', exact: true })).toBeInTheDocument();
});

test('login waits for the scoped snapshot and recovers if it fails', async () => {
  const user = userEvent.setup();
  let fail;
  repository.snapshot.mockImplementationOnce(
    () =>
      new Promise((resolve, reject) => {
        fail = reject;
      }),
  );
  render(<App />);
  await user.type(await screen.findByLabelText('ชื่อผู้ใช้หรืออีเมล'), 'pimchanok');
  await user.type(screen.getByLabelText('รหัสผ่าน'), '1234');
  await user.click(screen.getByRole('button', { name: 'เข้าสู่ระบบ', exact: true }));
  await waitFor(() => expect(repository.snapshot).toHaveBeenCalled());
  expect(document.querySelector('.app-shell')).not.toBeInTheDocument();
  expect(document.querySelector('.entry-transition')).toBeInTheDocument();
  await act(async () => fail(new Error('โหลดข้อมูลไม่สำเร็จ')));
  expect(await screen.findByText('โหลดข้อมูลไม่สำเร็จ')).toBeInTheDocument();
  expect(repository.logout).toHaveBeenCalledTimes(1);
  expect(screen.getByRole('button', { name: 'เข้าสู่ระบบ', exact: true })).toBeEnabled();
});

test.each([
  [1, '/leave-summary', 'สรุปการลา'],
  [4, '/leave-summary', 'สรุปการลา'],
  [5, '/leave-summary', 'สรุปการลา'],
  [1, '/new', 'แบบฟอร์มยื่นคำขอลา'],
  [4, '/new', 'แบบฟอร์มยื่นคำขอลา'],
  [4, '/my-requests', 'ประวัติคำขอลา'],
  [5, '/quota', 'สิทธิ์และโควตาวันลา'],
  [4, '/calendar', 'ปฏิทินการลา'],
  [5, '/admin', 'ข้อมูลพนักงานและสิทธิ์การลา'],
])('React Router restores an allowed deep link for account %i', async (id, path, title) => {
  await openWorkspace(id, path);
  expect(screen.getByRole('heading', { level: 1, name: title })).toBeInTheDocument();
  expect(window.location.hash).toBe('#' + path);
});

test('HR retains personal history and quota but has no submission menu or quick-search action', async () => {
  const user = userEvent.setup();
  await openWorkspace(5);
  const navigation = screen.getByRole('navigation', { name: 'เมนูหลัก' });
  expect(
    within(navigation).queryByRole('link', { name: 'ยื่นคำขอลา', exact: true }),
  ).not.toBeInTheDocument();
  expect(
    within(navigation).getByRole('link', { name: 'ประวัติคำขอของฉัน', exact: true }),
  ).toBeInTheDocument();
  expect(
    within(navigation).getByRole('link', { name: 'สิทธิ์และโควตา', exact: true }),
  ).toBeInTheDocument();
  await user.click(screen.getByRole('button', { name: 'ค้นหาเมนูหรือคำขอ', exact: true }));
  const search = screen.getByRole('dialog', { name: 'ค้นหาเมนูหรือคำขอ' });
  expect(within(search).queryByRole('link', { name: /ยื่นคำขอลา/ })).not.toBeInTheDocument();
});

test('leave summary is available from the workspace menu and quick search', async () => {
  const user = userEvent.setup();
  await openWorkspace();
  const navigation = screen.getByRole('navigation', { name: 'เมนูหลัก' });
  const links = within(navigation).getAllByRole('link');
  expect(links[0]).toHaveTextContent('หน้าหลัก');
  expect(links[1]).toHaveTextContent('สรุปการลา');
  await user.click(within(navigation).getByRole('link', { name: 'สรุปการลา', exact: true }));
  expect(await screen.findByRole('heading', { level: 1, name: 'สรุปการลา' })).toBeInTheDocument();
  expect(window.location.hash).toBe('#/leave-summary');
  expect(within(navigation).getByRole('link', { name: 'สรุปการลา' })).toHaveAttribute(
    'aria-current',
    'page',
  );

  await user.click(within(navigation).getByRole('link', { name: 'หน้าหลัก', exact: true }));
  await user.click(screen.getByRole('button', { name: 'ค้นหาเมนูหรือคำขอ', exact: true }));
  const search = screen.getByRole('dialog', { name: 'ค้นหาเมนูหรือคำขอ' });
  await user.type(within(search).getByRole('textbox', { name: 'ค้นหาเมนูหรือคำขอ' }), 'สรุปการลา');
  await user.click(within(search).getByRole('link', { name: 'สรุปการลา', exact: true }));
  expect(await screen.findByRole('heading', { level: 1, name: 'สรุปการลา' })).toBeInTheDocument();
  expect(window.location.hash).toBe('#/leave-summary');
  expect(screen.queryByRole('dialog', { name: 'ค้นหาเมนูหรือคำขอ' })).not.toBeInTheDocument();
});

test.each([
  [1, '/admin'],
  [4, '/admin'],
  [5, '/new'],
  [5, '/request/1001/edit'],
  [5, '/missing'],
  [1, '/request/abc'],
])('account %i cannot open unavailable route %s', async (id, path) => {
  await openWorkspace(id, path);
  expect(
    screen.getByRole('heading', { name: 'ไม่พบหน้าหรือไม่มีสิทธิ์เข้าถึง' }),
  ).toBeInTheDocument();
  expect(document.querySelector('#leave-reason')).not.toBeInTheDocument();
  expect(document.querySelector('.topbar-title')).toHaveTextContent('ไม่พบหน้า');
});

test('browser back and forward change pages through React Router', async () => {
  const user = userEvent.setup();
  await openWorkspace();
  await user.click(screen.getByRole('link', { name: 'ประวัติคำขอ', exact: true }));
  await screen.findByRole('heading', { level: 1, name: 'ประวัติคำขอลา' });
  await user.click(screen.getByRole('link', { name: 'สิทธิ์และโควตา', exact: true }));
  await screen.findByRole('heading', { level: 1, name: 'สิทธิ์และโควตาวันลา' });
  await act(async () => window.history.back());
  expect(
    await screen.findByRole('heading', { level: 1, name: 'ประวัติคำขอลา' }),
  ).toBeInTheDocument();
  await act(async () => window.history.forward());
  expect(
    await screen.findByRole('heading', { level: 1, name: 'สิทธิ์และโควตาวันลา' }),
  ).toBeInTheDocument();
});

test('KPI details make the workspace inert, block quick search and release it on close', async () => {
  await openWorkspace(5);
  const trigger = screen.getByRole('button', { name: 'ดูรายละเอียดระยะเวลาอนุมัติเฉลี่ย' });
  fireEvent.click(trigger);
  const dialog = screen.getByRole('dialog', { name: 'รายละเอียดระยะเวลาอนุมัติ' });
  expect(document.querySelector('.app-shell')).toHaveAttribute('inert');
  fireEvent.keyDown(window, { key: 'k', ctrlKey: true });
  expect(screen.queryByRole('dialog', { name: 'ค้นหาเมนูหรือคำขอ' })).not.toBeInTheDocument();
  fireEvent.click(within(dialog).getByRole('button', { name: 'ปิด', exact: true }));
  await waitFor(() => expect(document.querySelector('.app-shell')).not.toHaveAttribute('inert'));
  await waitFor(() => expect(trigger).toHaveFocus());
});

test('maternity stays visible but disabled for a male employee', async () => {
  await openWorkspace(2, '/new');
  const maternity = within(screen.getByLabelText(/^ประเภทการลา/)).getByRole('option', {
    name: /ลาคลอด/,
  });
  expect(maternity).toBeDisabled();
  expect(
    screen.getByText('พนักงานชายไม่มีสิทธิ์ยื่นลาคลอดตามนโยบายของโปรเจกต์'),
  ).toBeInTheDocument();
  expect(screen.queryByLabelText(/เพศ/)).not.toBeInTheDocument();
});

test('leave review converts Buddhist dates and submits a PDF only after confirmation', async () => {
  const user = userEvent.setup();
  await openWorkspace(1, '/new');
  for (const label of [/^วันที่เริ่มลา/, /^วันที่สิ้นสุดลา/]) {
    const input = screen.getByLabelText(label);
    await user.clear(input);
    await user.type(input, '7/12/2569');
  }
  await user.type(screen.getByLabelText(/^เหตุผล/), 'พักผ่อนกับครอบครัว');
  const pdf = new File(['%PDF-1.7\nTest document\n%%EOF'], 'test.pdf', { type: 'application/pdf' });
  await user.upload(screen.getByLabelText(/^เอกสารประกอบ/), pdf);
  await screen.findByText('test.pdf');
  await user.click(screen.getByRole('button', { name: 'ตรวจสอบคำขอ', exact: true }));
  expect(await screen.findByRole('heading', { name: 'ตรวจสอบก่อนส่งคำขอ' })).toBeInTheDocument();
  expect(repository.execute).not.toHaveBeenCalled();
  await user.click(screen.getByRole('button', { name: 'ยืนยันส่งคำขอ', exact: true }));
  expect(await screen.findByRole('heading', { name: 'ส่งคำขอเรียบร้อย' })).toBeInTheDocument();
  expect(repository.execute).toHaveBeenCalledTimes(1);
  expect(repository.execute.mock.calls[0][0]).toMatchObject({
    type: 'submit',
    input: {
      startDate: '2026-12-07',
      endDate: '2026-12-07',
      duration: 'Full',
      attachment: { fileName: 'test.pdf', fileSize: pdf.size, fileType: 'application/pdf' },
    },
  });
});

test('notification bell opens a popover without navigating or marking items as read', async () => {
  const user = userEvent.setup();
  await openWorkspace();
  const bell = screen.getByRole('button', { name: /^การแจ้งเตือน \d+ รายการใหม่$/ });
  expect(
    within(screen.getByRole('navigation', { name: 'เมนูหลัก' })).queryByRole('link', {
      name: /^การแจ้งเตือน/,
    }),
  ).toBeInTheDocument();
  await user.click(bell);
  const popover = screen.getByRole('dialog', { name: 'การแจ้งเตือน' });
  expect(window.location.hash).toBe('#/dashboard');
  expect(repository.execute).not.toHaveBeenCalled();
  await user.click(within(popover).getByRole('button', { name: 'อ่านทั้งหมด', exact: true }));
  await waitFor(() =>
    expect(repository.execute).toHaveBeenCalledWith({ type: 'readNotifications' }),
  );
  await user.keyboard('{Escape}');
  expect(screen.queryByRole('dialog', { name: 'การแจ้งเตือน' })).not.toBeInTheDocument();
  expect(bell).toHaveFocus();
  await user.click(bell);
  await user.click(screen.getByRole('link', { name: 'ดูการแจ้งเตือนทั้งหมด' }));
  expect(window.location.hash).toBe('#/notifications');
  expect(
    await screen.findByRole('heading', { level: 1, name: 'การแจ้งเตือน' }),
  ).toBeInTheDocument();
});

test('colleague status loads everyone and only applies draft text after search', async () => {
  const user = userEvent.setup();
  await openWorkspace(1, '/colleagues');
  await waitFor(() => expect(repository.searchColleagues).toHaveBeenCalled());
  expect(repository.searchColleagues.mock.calls[0][0]).toBe('');
  const before = repository.searchColleagues.mock.calls.length;
  await user.type(screen.getByLabelText('ชื่อหรือรหัสพนักงาน'), 'EMP-00008');
  expect(repository.searchColleagues).toHaveBeenCalledTimes(before);
  await user.click(screen.getByRole('button', { name: 'ค้นหาสถานะ', exact: true }));
  await waitFor(() => expect(repository.searchColleagues.mock.lastCall[0]).toBe('EMP-00008'));
  await user.click(screen.getByRole('button', { name: 'แสดงทุกคน', exact: true }));
  await waitFor(() => expect(repository.searchColleagues.mock.lastCall[0]).toBe(''));
});

test('Account menu opens the full own profile, while the sidebar account is plain text', async () => {
  const user = userEvent.setup();
  await openWorkspace();
  const name = database.employees[0].name;
  expect(document.querySelector('.sidebar-person').tagName).toBe('DIV');
  expect(
    within(document.querySelector('.sidebar-person')).queryByRole('link'),
  ).not.toBeInTheDocument();
  const trigger = screen.getByRole('button', { name: 'เมนูบัญชีของ ' + name });
  await user.click(trigger);
  expect(window.location.hash).toBe('#/dashboard');
  const item = within(screen.getByRole('menu', { name: 'บัญชีผู้ใช้' })).getByRole('menuitem', {
    name: 'โปรไฟล์',
  });
  expect(item).toHaveFocus();
  await user.keyboard('{Escape}');
  expect(screen.queryByRole('menu')).not.toBeInTheDocument();
  expect(trigger).toHaveFocus();
  await user.keyboard('{ArrowDown}');
  await user.click(screen.getByRole('menuitem', { name: 'โปรไฟล์' }));
  expect(window.location.hash).toBe('#/employee/1');
  await screen.findByText(database.employees[0].email);
  expect(screen.queryByRole('dialog', { name: 'ประวัติพนักงาน' })).not.toBeInTheDocument();
  expect(screen.queryByRole('menu')).not.toBeInTheDocument();
});

test.each([4, 5, 7])(
  'Account %i can open every active colleague across departments without changing the page',
  async (actorId) => {
    const user = userEvent.setup();
    await openWorkspace(actorId, '/colleagues');
    await screen.findByText(/พนักงานทั้งหมด/);
    const draft = screen.getByLabelText('ชื่อหรือรหัสพนักงาน');
    await user.type(draft, 'เตรียมค้นหา');
    const scrollCalls = window.scrollTo.mock.calls.length;
    for (const employee of database.employees) {
      const trigger = screen.getByRole('link', { name: employee.name, exact: true });
      await user.click(trigger);
      const popup = screen.getByRole('dialog', { name: 'ประวัติพนักงาน' });
      expect(popup).toHaveAttribute('aria-modal', 'true');
      await within(popup).findByText(employee.email);
      expect(window.location.hash).toBe('#/colleagues');
      expect(document.querySelector('.app-shell')).toHaveAttribute('inert');
      const close = within(popup).getByRole('button', { name: 'ปิด', exact: true });
      expect(close).toHaveFocus();
      await user.tab();
      expect(close).toHaveFocus();
      await user.keyboard('{Escape}');
      expect(screen.queryByRole('dialog', { name: 'ประวัติพนักงาน' })).not.toBeInTheDocument();
      expect(document.querySelector('.app-shell')).not.toHaveAttribute('inert');
      expect(trigger).toHaveFocus();
    }
    expect(draft).toHaveValue('เตรียมค้นหา');
    expect(window.scrollTo.mock.calls.length).toBe(scrollCalls);
    expect(repository.snapshot.mock.results.at(-1)).toBeDefined();
  },
);

test('Popup closes with its button or backdrop and restores the existing scroll setting', async () => {
  const user = userEvent.setup();
  await openWorkspace(4, '/colleagues');
  const trigger = await screen.findByRole('link', {
    name: database.employees[5].name,
    exact: true,
  });
  document.body.style.overflow = 'auto';
  await user.click(trigger);
  await within(screen.getByRole('dialog', { name: 'ประวัติพนักงาน' })).findByText(
    database.employees[5].email,
  );
  await user.click(screen.getByRole('button', { name: 'ปิด', exact: true }));
  expect(trigger).toHaveFocus();
  await user.click(trigger);
  fireEvent.mouseDown(document.querySelector('.employee-profile-overlay .dialog-shade'));
  expect(screen.queryByRole('dialog', { name: 'ประวัติพนักงาน' })).not.toBeInTheDocument();
  expect(window.location.hash).toBe('#/colleagues');
  expect(document.body.style.overflow).toBe('auto');
  document.body.style.overflow = '';
});

test('Account menu closes on outside clicks and keeps profile navigation available on phones', async () => {
  motionTimers(true, true);
  const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
  await openWorkspace();
  const trigger = screen.getByRole('button', {
    name: 'เมนูบัญชีของ ' + database.employees[0].name,
  });
  await user.click(trigger);
  await user.click(screen.getByRole('heading', { level: 1 }));
  expect(screen.queryByRole('menu')).not.toBeInTheDocument();
  await user.click(trigger);
  await user.click(screen.getByRole('menuitem', { name: 'โปรไฟล์' }));
  await screen.findByText(database.employees[0].email);
  expect(window.location.hash).toBe('#/employee/1');
});

test('A failed profile can retry and a response arriving after close is ignored', async () => {
  const user = userEvent.setup();
  await openWorkspace(4, '/colleagues');
  const employee = database.employees[5];
  const trigger = await screen.findByRole('link', { name: employee.name, exact: true });
  repository.getEmployeeProfile.mockRejectedValueOnce(new Error('private server details'));
  await user.click(trigger);
  expect(await screen.findByRole('alert')).toHaveTextContent('ไม่สามารถโหลดประวัติพนักงานได้');
  expect(screen.queryByText('private server details')).not.toBeInTheDocument();
  await user.click(screen.getByRole('button', { name: 'ลองอีกครั้ง' }));
  await screen.findByText(employee.email);
  await user.keyboard('{Escape}');
  const response = deferred();
  repository.getEmployeeProfile.mockImplementationOnce(() => response.promise);
  await user.click(screen.getByRole('link', { name: employee.name, exact: true }));
  expect(
    within(screen.getByRole('dialog', { name: 'ประวัติพนักงาน' })).getByRole('status'),
  ).toHaveTextContent('กำลังโหลดประวัติ');
  await user.keyboard('{Escape}');
  await act(async () => response.resolve(employeeProfile(database, account.id, employee.id)));
  expect(screen.queryByRole('dialog', { name: 'ประวัติพนักงาน' })).not.toBeInTheDocument();
  expect(screen.queryByText(employee.email)).not.toBeInTheDocument();
});

test('Direct cross-department employee links load a full profile', async () => {
  await openWorkspace(4, '/employee/6');
  expect(screen.getByRole('heading', { level: 1, name: 'ประวัติพนักงาน' })).toBeInTheDocument();
  await screen.findByText(database.employees[5].email);
});

test.each(['/employee/not-a-number', '/employee/9007199254740993'])(
  'Invalid profile URL %s does not request or show personal data',
  async (path) => {
    await openWorkspace(4, path);
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('ไม่มีสิทธิ์เข้าถึง');
    expect(repository.getEmployeeProfile).not.toHaveBeenCalled();
  },
);

test('A missing employee has a readable error rather than an empty or invented profile', async () => {
  await openWorkspace(4, '/employee/999999');
  await screen.findByRole('alert');
  expect(screen.queryByRole('heading', { name: 'ข้อมูลส่วนตัว' })).not.toBeInTheDocument();
});

test('Employees see all colleague positions but can only open their own profile', async () => {
  const user = userEvent.setup();
  await openWorkspace(1, '/colleagues');
  await screen.findByText(/พนักงานทั้งหมด/);
  for (const employee of database.employees.filter((person) => person.id !== 1)) {
    expect(screen.getByText(employee.name, { exact: true })).toBeInTheDocument();
    expect(
      screen.queryByRole('link', { name: employee.name, exact: true }),
    ).not.toBeInTheDocument();
  }
  expect(screen.getByText(/Sales Representative/)).toBeInTheDocument();
  await user.click(screen.getByRole('link', { name: database.employees[0].name, exact: true }));
  await within(screen.getByRole('dialog', { name: 'ประวัติพนักงาน' })).findByText(
    database.employees[0].email,
  );
});

test('An employee direct link to another profile cannot disclose private data', async () => {
  await openWorkspace(1, '/employee/6');
  await screen.findByRole('alert');
  expect(screen.queryByText(database.employees[5].email)).not.toBeInTheDocument();
  expect(screen.queryByText(database.employees[5].phone)).not.toBeInTheDocument();
});
