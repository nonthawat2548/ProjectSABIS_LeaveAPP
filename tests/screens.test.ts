import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { createSeed } from '../src/domain/seed';
import { createDemoDatabase } from '../src/data/demoDatabase';
import { requestCode, visibleSnapshot } from '../src/domain/service';
import { today } from '../src/domain/date';
import { Login, ThemeButton } from '../src/App';
import { searchWorkspace } from '../src/ui';
import {
  Dashboard,
  Requests,
  RequestDetail,
  LeaveForm,
  Quotas,
  WorkPage,
  CalendarPage,
  NotificationsPage,
  AdminPage,
  SettingsPage,
} from '../src/pages';
test('All role screens render and visible dates use Buddhist Era d/m/yyyy', () => {
  // Components do not need a browser for this server-render smoke test.
  const full = createSeed(new Date('2026-10-10T05:00:00Z'));
  const run = async () => ({ message: 'test' }),
    reload = async () => {};
  for (const id of [1, 4, 5]) {
    const db = visibleSnapshot(full, id),
      actor = full.employees.find((e) => e.id === id)!;
    const props = { db, actor, run, reload };
    const screens = [
      Dashboard,
      Requests,
      WorkPage,
      NotificationsPage,
      ...(id === 1 ? [LeaveForm, Quotas] : [CalendarPage]),
      ...(id === 5 ? [AdminPage, SettingsPage] : []),
    ];
    for (const Screen of screens) {
      const html = renderToStaticMarkup(createElement(Screen, props));
      assert(html.includes('<'));
      assert(!html.includes('type="date"'));
      assert(!html.includes('undefined'));
    }
    const html = renderToStaticMarkup(createElement(RequestDetail, { ...props, id: 1001 }));
    assert(html.includes('13/10/2569'));
  }
  const login = renderToStaticMarkup(
    createElement(Login, {
      onLogin: async () => {},
      initialError: '',
      theme: 'light',
      onToggleTheme: () => {},
    }),
  );
  assert(/autocomplete="username"/i.test(login) && /autocomplete="current-password"/i.test(login));
  assert(login.includes('aria-label="แสดงรหัสผ่าน"') && login.includes('aria-pressed="false"'));
  const darkButton = renderToStaticMarkup(
    createElement(ThemeButton, { theme: 'dark', onToggle: () => {} }),
  );
  assert(darkButton.includes('aria-label="เปลี่ยนเป็นธีมสว่าง"'));
});

test('Workspace search matches request code/name/reason and respects the role snapshot', () => {
  const full = createSeed(new Date('2026-10-10T05:00:00Z'));
  full.requests.find((r) => r.id === 1001)!.reason = 'ค้นหาคำขอวันพักผ่อน';
  full.requests.find((r) => r.id === 1002)!.reason = 'ค้นหาคำขอวันพักผ่อน';
  const db = visibleSnapshot(full, 1),
    menus = [
      { path: '/quota', label: 'สิทธิ์และโควตา' },
      { path: '/requests', label: 'ประวัติคำขอ' },
    ];
  assert.deepEqual(
    searchWorkspace(menus, db, '  โควตา  ').pages.map((p) => p.path),
    ['/quota'],
  );
  assert.deepEqual(
    searchWorkspace(menus, db, 'ค้นหาคำขอวันพักผ่อน').requests.map((r) => r.id),
    [1001],
  );
  assert.deepEqual(
    searchWorkspace(
      menus,
      db,
      ' ' + requestCode(db.requests.find((r) => r.id === 1001)!).toLowerCase() + ' ',
    ).requests.map((r) => r.id),
    [1001],
  );
  assert(searchWorkspace(menus, db, 'พิมพ์ชนก').requests.every((r) => r.employeeId === 1));
  assert.equal(
    searchWorkspace(menus, db, requestCode(full.requests.find((r) => r.id === 1002)!)).requests
      .length,
    0,
  );
  assert.equal(searchWorkspace(menus, db, '   ').requests.length, 0);
});

test('Dashboard counts a person with two approved half-days once and scopes the manager team', () => {
  const db = createSeed();
  const date = today(),
    base = db.requests[0];
  db.requests = [
    {
      ...base,
      id: 2001,
      employeeId: 1,
      status: 'Approved',
      duration: 'AM',
      startDate: date,
      endDate: date,
    },
    {
      ...base,
      id: 2002,
      employeeId: 1,
      status: 'Approved',
      duration: 'PM',
      startDate: date,
      endDate: date,
    },
    { ...base, id: 2003, employeeId: 6, status: 'Approved', startDate: date, endDate: date },
  ];
  db.days = [
    { id: 1, leaveId: 2001, date, entitlementId: null, units: 0.5 },
    { id: 2, leaveId: 2002, date, entitlementId: null, units: 0.5 },
    { id: 3, leaveId: 2003, date, entitlementId: null, units: 1 },
  ];
  const actor = db.employees.find((e) => e.id === 4)!;
  const html = renderToStaticMarkup(
    createElement(Dashboard, {
      db,
      actor,
      run: async () => ({ message: 'test' }),
      reload: async () => {},
    }),
  );
  const value = html
    .match(/พนักงานลาในวันนี้[\s\S]*?<div class="stat-value">(.*?)<\/div>/)?.[1]
    .replace(/<[^>]+>/g, '');
  assert.equal(value, '1คน');
});

test('Connected ten-person dataset renders HR accounts and the second manager team', () => {
  const full = createDemoDatabase(),
    run = async () => ({ message: 'test' }),
    reload = async () => {};
  const hr = full.employees.find((e) => e.role === 'HR')!;
  const hrProps = { db: visibleSnapshot(full, hr.id), actor: hr, run, reload };
  const admin = renderToStaticMarkup(createElement(AdminPage, hrProps));
  for (const person of full.employees) assert(admin.includes(person.name));
  const salesManager = full.employees.find((e) => e.email === 'sales-manager@demo.local')!;
  const salesProps = {
    db: visibleSnapshot(full, salesManager.id),
    actor: salesManager,
    run,
    reload,
  };
  const dashboard = renderToStaticMarkup(createElement(Dashboard, salesProps));
  const count = dashboard
    .match(/สมาชิกในทีม[\s\S]*?<div class="stat-value">(.*?)<\/div>/)?.[1]
    .replace(/<[^>]+>/g, '');
  assert.equal(count, '3คน');
  assert(dashboard.includes('ปกรณ์'));
  const newEmployee = full.employees.find((e) => e.email === 'chutima@demo.local')!;
  const props = { db: visibleSnapshot(full, newEmployee.id), actor: newEmployee, run, reload };
  const request = props.db.requests.find((r) => r.duration === 'AM')!;
  const detail = renderToStaticMarkup(createElement(RequestDetail, { ...props, id: request.id }));
  assert(detail.includes('17/11/2569'));
  assert(detail.includes('ครึ่งวันเช้า'));
  assert(!detail.includes('undefined'));
});

test('Login asks for a role before listing demo accounts in both themes', () => {
  const accounts = createDemoDatabase().employees.filter((employee) => employee.active);
  assert.equal(accounts.length, 10);
  for (const theme of ['light', 'dark'] as const) {
    const html = renderToStaticMarkup(
      createElement(Login, {
        onLogin: async () => {},
        initialError: '',
        theme,
        onToggleTheme: () => {},
      }),
    );
    const select = html.match(/<select\b([^>]*)>([\s\S]*?)<\/select>/);
    assert(select, 'Login must expose an account selector after role selection');
    const id = select[1].match(/\bid="([^"]+)"/)?.[1];
    assert(
      id && html.includes(`for="${id}"`),
      'The account selector must have a linked visible label',
    );
    assert(html.includes('เลือกบัญชีทดลอง'));
    for (const label of ['พนักงาน', 'ผู้จัดการ', 'ฝ่ายบุคคล (HR)'])
      assert(html.includes(`<strong>${label}</strong>`));
    for (const count of [7, 2, 1]) assert(!html.includes(`${count} บัญชี`));
    const options = [...select[2].matchAll(/<option\b([^>]*)>([\s\S]*?)<\/option>/g)].filter(
      (option) => !/value=""/.test(option[1]),
    );
    assert.equal(options.length, 0, 'Accounts from all three roles must not be shown together');
    assert(/\bdisabled(?:="[^"]*")?/.test(select[1]));
    assert(select[2].includes('เลือกบทบาทด้านบนก่อน'));
    assert(!html.includes('aria-pressed="true"'));
    assert(/<input\b[^>]*id="login-email"[^>]*value=""/.test(html));
  }
});
