/**
 * @typedef {import('../src/domain/types.js').Command} Command
 * @typedef {import('../src/domain/types.js').WorkStatus} WorkStatus
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
/**
 * @typedef {import('react').FunctionComponent} FunctionComponent
 */
import { act, createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { JSDOM } from 'jsdom';
import { Login } from '../src/App.jsx';
import { Dashboard } from '../src/Dashboard.jsx';
import { WorkspaceNavigation } from '../src/Navigation.jsx';
import { WorkPage, SettingsPage } from '../src/pages.jsx';
import { TeamOverview } from '../src/ui.jsx';
import { createSeed } from '../src/domain/seed.js';
import { applyCommand, visibleSnapshot } from '../src/domain/service.js';
import { today } from '../src/domain/date.js';
function fixture() {
  const full = createSeed();
  full.requests = [];
  full.days = [];
  full.documents = [];
  full.approvals = [];
  full.workStatuses = [
    {
      id: 1,
      employeeId: 1,
      date: today(),
      statusType: 'In-office',
      updatedAt: new Date().toISOString(),
    },
  ];
  return full;
}
const tasks = { run: async () => ({ message: 'test' }), reload: async () => {} };
/**
 * @template {object} P
 * @param {FunctionComponent<P>} Component
 * @param {P} props
 */
function render(Component, props) {
  return new JSDOM(renderToStaticMarkup(createElement(Component, props)));
}
test('Work status labels agree across dashboards, team summaries, tables and phone cards without changing stored values', () => {
  const full = fixture(),
    originalRequest = createSeed().requests[0];
  for (const [raw, label] of /** @type {const} */ ([
    ['In-office', 'ทำงานที่สำนักงาน'],
    ['WFH', 'ทำงานจากบ้าน (WFH)'],
    ['Outside', 'ปฏิบัติงานนอกสถานที่'],
  ])) {
    full.workStatuses[0].statusType = raw;
    for (const units of [0, 0.5, 1]) {
      full.requests = units
        ? [
            {
              ...originalRequest,
              employeeId: 1,
              status: 'Approved',
              duration: units === 0.5 ? 'AM' : 'Full',
              startDate: today(),
              endDate: today(),
            },
          ]
        : [];
      full.days = units
        ? [{ id: 1, leaveId: originalRequest.id, date: today(), entitlementId: null, units }]
        : [];
      const expected = units === 1 ? 'ลา' : units === 0.5 ? label + ' / ลาครึ่งวัน' : label;
      const employee = full.employees.find((e) => e.id === 1);
      const before = structuredClone(full);
      const dashboard = render(Dashboard, {
        ...tasks,
        db: visibleSnapshot(full, 1),
        actor: employee,
      });
      assert.equal(dashboard.window.document.querySelector('.work-stat')?.textContent, expected);
      dashboard.window.close();
      for (const id of [1, 4, 5]) {
        const actor = full.employees.find((e) => e.id === id);
        const props = { ...tasks, actor, db: visibleSnapshot(full, id) };
        const work = render(WorkPage, props),
          document = work.window.document;
        const row = [...document.querySelectorAll('.work-table tr')].find((e) =>
          e.textContent?.includes(employee.name),
        );
        const card = [...document.querySelectorAll('.work-cards li')].find((e) =>
          e.textContent?.includes(employee.name),
        );
        assert.equal(row.querySelector('.work-badge')?.textContent, expected);
        assert.equal(card.querySelector('.work-badge')?.textContent, expected);
        const options = [...document.querySelectorAll('#work-status option')];
        assert.deepEqual(
          options.map((option) => option.value),
          ['In-office', 'WFH', 'Outside'],
        );
        assert.deepEqual(
          options.map((option) => option.textContent),
          ['ทำงานที่สำนักงาน', 'ทำงานจากบ้าน (WFH)', 'ปฏิบัติงานนอกสถานที่'],
        );
        if (id === 1) assert.equal(document.querySelector('form button')?.disabled, units > 0);
        work.window.close();
        if (id !== 1) {
          const team = render(TeamOverview, props);
          const person = [...team.window.document.querySelectorAll('.team-person')].find((e) =>
            e.textContent?.includes(employee.name.split(' ')[0]),
          );
          assert.equal(person.querySelector('.team-status')?.textContent, expected);
          team.window.close();
        }
      }
      assert.deepEqual(
        full,
        before,
        'Translation is display-only and must not mutate a snapshot or stored enums',
      );
    }
  }
});
test('Brand names keep English language metadata while operational and administrative copy uses clear Thai', () => {
  const full = fixture(),
    actor = full.employees.find((e) => e.role === 'HR');
  const navigation = render(WorkspaceNavigation, {
    actor,
    menus: [],
    route: '/dashboard',
    open: false,
    onClose() {},
    onLogout() {},
  });
  assert.equal(
    navigation.window.document.querySelector('.sidebar-label')?.textContent,
    'พื้นที่ทำงาน',
  );
  assert.equal(
    navigation.window.document.querySelector('.brand [lang="en"] small')?.textContent,
    'Space for your balance',
  );
  navigation.window.close();
  const login = render(Login, {
    onLogin: async () => {},
    initialError: '',
    theme: 'light',
    onToggleTheme() {},
  });
  assert.equal(
    login.window.document.querySelector('.login-topline [lang="en"]')?.textContent,
    'Leave Management',
  );
  assert.equal(
    login.window.document.querySelector('.demo-accounts button:last-child strong')?.textContent,
    'ฝ่ายบุคคล (HR)',
  );
  assert.equal(
    login.window.document.querySelector('.login-card h2')?.textContent?.trim(),
    'เข้าสู่ระบบ ✦',
  );
  assert.equal(
    login.window.document.querySelector('.login-submit span')?.textContent,
    'เข้าสู่ระบบ',
  );
  login.window.close();
  const settings = render(SettingsPage, { ...tasks, db: visibleSnapshot(full, actor.id), actor });
  const copy = settings.window.document.body.textContent;
  assert(copy.includes('เฉพาะข้อมูลที่คุณมีสิทธิ์ดู'));
  assert(copy.includes('(IndexedDB)'));
  assert(!/mock JSON database|adapter|snapshot|Data Dictionary/.test(copy));
  settings.window.close();
});
test('Selecting a Thai work status submits the original English enum and ISO date', async (t) => {
  const dom = new JSDOM('<!doctype html><html><body><div id="root"></div></body></html>');
  const replacements = {
    window: dom.window,
    document: dom.window.document,
    HTMLElement: dom.window.HTMLElement,
    IS_REACT_ACT_ENVIRONMENT: true,
  };
  const originals = new Map(
    Object.keys(replacements).map((name) => [
      name,
      Object.getOwnPropertyDescriptor(globalThis, name),
    ]),
  );
  for (const [name, value] of Object.entries(replacements))
    Object.defineProperty(globalThis, name, { configurable: true, writable: true, value });
  const { createRoot } = await import('react-dom/client');
  const root = createRoot(dom.window.document.getElementById('root'));
  t.after(async () => {
    await act(() => root.unmount());
    dom.window.close();
    for (const [name, descriptor] of originals) {
      if (descriptor) Object.defineProperty(globalThis, name, descriptor);
      else Reflect.deleteProperty(globalThis, name);
    }
  });
  const full = fixture(),
    actor = full.employees.find((e) => e.id === 1),
    commands = [];
  await act(() =>
    root.render(
      createElement(WorkPage, {
        ...tasks,
        actor,
        db: visibleSnapshot(full, 1),
        run: async (command) => {
          commands.push(command);
          return applyCommand(full, 1, command);
        },
      }),
    ),
  );
  for (const status of /** @type {WorkStatus['statusType'][]} */ ([
    'WFH',
    'Outside',
    'In-office',
  ])) {
    await act(() => {
      const select = dom.window.document.querySelector('#work-status');
      select.value = status;
      select.dispatchEvent(new dom.window.Event('change', { bubbles: true }));
    });
    await act(async () => {
      dom.window.document
        .querySelector('form')
        .dispatchEvent(new dom.window.Event('submit', { bubbles: true, cancelable: true }));
      await Promise.resolve();
    });
    assert.deepEqual(commands.at(-1), { type: 'work', date: today(), statusType: status });
    assert.equal(full.workStatuses[0].statusType, status);
    assert.match(full.workStatuses[0].date, /^\d{4}-\d{2}-\d{2}$/);
  }
});
