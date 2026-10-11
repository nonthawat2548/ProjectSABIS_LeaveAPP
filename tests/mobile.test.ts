import { test } from 'node:test';
import assert from 'node:assert/strict';
import { act, createElement, useState } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { JSDOM } from 'jsdom';
import { IDBFactory } from 'fake-indexeddb';
import { WorkspaceNavigation } from '../src/Navigation';
import { createDemoDatabase } from '../src/data/demoDatabase';
import { visibleSnapshot } from '../src/domain/service';
import { Requests, WorkPage } from '../src/pages';

test('Phone request and work lists preserve table data and role scope', () => {
  const full = createDemoDatabase();
  for (const id of [1, 7, 8, 5]) {
    const actor = full.employees.find((employee) => employee.id === id)!;
    const props = {
      db: visibleSnapshot(full, id),
      actor,
      run: async () => ({ message: 'test' }),
      reload: async () => {},
    };
    const requests = new JSDOM(renderToStaticMarkup(createElement(Requests, props)));
    const document = requests.window.document;
    const rows = [...document.querySelectorAll('.request-table tbody tr')];
    const cards = [...document.querySelectorAll('.request-cards>li')];
    assert.equal(cards.length, rows.length, `Phone view must show the same ${actor.role} requests`);
    for (const [index, row] of rows.entries()) {
      const card = cards[index];
      assert.equal(
        card.querySelector('a')?.getAttribute('href'),
        row.querySelector('a')?.getAttribute('href'),
      );
      assert.equal(
        card.querySelector('.badge')?.textContent,
        row.querySelector('.badge')?.textContent,
      );
      assert.equal(
        card.querySelector('time')?.textContent,
        row.querySelector('td small')?.textContent,
      );
      assert.equal(
        card.querySelector('.request-card-dates dd')?.textContent,
        row.querySelector('td.nowrap')?.textContent,
      );
      assert.equal(
        card.querySelector('.request-card-details dd')?.textContent,
        row.querySelector('.leave-type-tag')?.textContent,
      );
      assert(
        card
          .querySelectorAll('dd')[1]
          .textContent?.startsWith(row.querySelector('.days-number')!.textContent! + ' วัน'),
      );
      if (actor.role !== 'Employee')
        assert.equal(
          card.querySelector('.request-card-person')?.textContent,
          row.querySelector('.person-cell>span:last-child')?.textContent,
        );
      else assert.equal(card.querySelector('.request-card-person'), null);
    }
    if (id === 8)
      assert(document.querySelector('.request-cards')?.textContent?.includes('ครึ่งวันเช้า'));
    requests.window.close();

    const work = new JSDOM(renderToStaticMarkup(createElement(WorkPage, props)));
    const workRows = [...work.window.document.querySelectorAll('.work-table tbody tr')];
    const workCards = [...work.window.document.querySelectorAll('.work-cards>li')];
    assert.equal(workCards.length, workRows.length);
    for (const [index, row] of workRows.entries()) {
      assert.equal(
        workCards[index].querySelector('strong')?.textContent,
        row.querySelector('td')?.firstChild?.textContent,
      );
      assert.equal(
        workCards[index].querySelector('.work-badge')?.textContent,
        row.querySelector('.work-badge')?.textContent,
      );
    }
    if (id === 1) assert.equal(workCards.length, 1);
    if (id === 7) {
      const names = workCards.map((card) => card.querySelector('strong')?.textContent);
      assert(names.includes(actor.name));
      assert(!names.includes(full.employees.find((employee) => employee.id === 1)!.name));
    }
    work.window.close();
  }
});

test('Phone navigation closes reliably and contains focus without changing page data', async (t) => {
  const dom = new JSDOM('<!doctype html><html><body><div id="root"></div></body></html>', {
    url: 'http://localhost/#/dashboard',
  });
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
  const root = createRoot(dom.window.document.getElementById('root')!);
  dom.window.document.body.style.overflow = 'auto';
  t.after(async () => {
    await act(() => root.unmount());
    dom.window.close();
    for (const [name, descriptor] of originals) {
      if (descriptor) Object.defineProperty(globalThis, name, descriptor);
      else Reflect.deleteProperty(globalThis, name);
    }
  });
  const actor = createDemoDatabase().employees[0];
  function Harness() {
    const [open, setOpen] = useState(false);
    return createElement(
      'div',
      null,
      createElement(WorkspaceNavigation, {
        actor,
        route: '/dashboard',
        menus: [{ path: '/dashboard', label: 'หน้าหลัก', icon: null }],
        open,
        onClose: () => setOpen(false),
        onLogout: () => {},
      }),
      createElement(
        'main',
        { inert: open },
        createElement(
          'button',
          {
            id: 'toggle',
            'aria-expanded': open,
            'aria-controls': 'workspace-navigation',
            onClick: () => setOpen(true),
          },
          'เปิดเมนู',
        ),
      ),
    );
  }
  let mount = 0;
  const document = dom.window.document;
  const toggle = () => document.querySelector<HTMLButtonElement>('#toggle')!;
  const panel = () => document.querySelector<HTMLElement>('#workspace-navigation')!;
  const close = () => document.querySelector<HTMLButtonElement>('.mobile-menu-close')!;
  async function open() {
    toggle().focus();
    await act(() => toggle().click());
  }
  async function render() {
    await act(() => root.render(createElement(Harness, { key: ++mount })));
  }

  await t.test(
    'Opening keeps the background inert, locks scroll, and focuses the close button',
    async () => {
      await render();
      assert.equal(panel().getAttribute('aria-modal'), null);
      await open();
      assert.equal(panel().getAttribute('role'), 'dialog');
      assert.equal(panel().getAttribute('aria-modal'), 'true');
      assert.equal(toggle().getAttribute('aria-expanded'), 'true');
      assert(document.querySelector('main')?.hasAttribute('inert'));
      assert.equal(document.body.style.overflow, 'hidden');
      assert.equal(document.activeElement, close());
      assert.equal(panel().querySelector('[aria-current="page"]')?.textContent, 'หน้าหลัก');
      assert.equal(panel().querySelector('nav a[href="#/notifications"]'), null);
    },
  );

  await t.test(
    'Tab stays inside the drawer and Escape restores scroll and trigger focus',
    async () => {
      const last = panel().querySelector<HTMLButtonElement>('.logout')!;
      last.focus();
      await act(() => {
        last.dispatchEvent(
          new dom.window.KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true }),
        );
      });
      assert.equal(document.activeElement, close());
      await act(() => {
        close().dispatchEvent(
          new dom.window.KeyboardEvent('keydown', {
            key: 'Tab',
            shiftKey: true,
            bubbles: true,
            cancelable: true,
          }),
        );
      });
      assert.equal(document.activeElement, last);
      await act(() => {
        last.dispatchEvent(
          new dom.window.KeyboardEvent('keydown', {
            key: 'Escape',
            bubbles: true,
            cancelable: true,
          }),
        );
      });
      assert.equal(panel().getAttribute('aria-modal'), null);
      assert.equal(document.body.style.overflow, 'auto');
      assert.equal(document.activeElement, toggle());
      assert(!document.querySelector('main')?.hasAttribute('inert'));
    },
  );

  await t.test(
    'Close button, backdrop, and selecting even the current route dismiss the drawer',
    async () => {
      for (const selector of [
        '.mobile-menu-close',
        '.mobile-menu-backdrop',
        'nav a[href="#/dashboard"]',
      ]) {
        await open();
        await act(() => document.querySelector<HTMLElement>(selector)!.click());
        assert.equal(panel().getAttribute('aria-modal'), null);
        assert.equal(document.body.style.overflow, 'auto');
        assert.equal(document.querySelector('.mobile-menu-backdrop'), null);
      }
    },
  );

  await t.test('Unmounting an open drawer restores the previous body scroll setting', async () => {
    await open();
    await act(() => root.render(null));
    assert.equal(document.body.style.overflow, 'auto');
  });

  await t.test(
    'App wires the phone drawer and releases its background when resized to desktop',
    async () => {
      const appGlobals = {
        indexedDB: new IDBFactory(),
        sessionStorage: dom.window.sessionStorage,
        localStorage: dom.window.localStorage,
        location: dom.window.location,
        BroadcastChannel: undefined,
      };
      const saved = new Map(
        Object.keys(appGlobals).map((name) => [
          name,
          Object.getOwnPropertyDescriptor(globalThis, name),
        ]),
      );
      for (const [name, value] of Object.entries(appGlobals))
        Object.defineProperty(globalThis, name, { configurable: true, writable: true, value });
      const listeners = new Set<() => void>();
      const viewport = {
        matches: true,
        addEventListener: (_: string, listener: () => void) => listeners.add(listener),
        removeEventListener: (_: string, listener: () => void) => listeners.delete(listener),
      };
      dom.window.matchMedia = () => viewport as unknown as MediaQueryList;
      dom.window.scrollTo = () => {};
      const { default: App } = await import('../src/App');
      const { repository } = await import('../src/data');
      try {
        await repository.login(actor.email, '1234');
        await act(() => root.render(createElement(App)));
        await act(async () => {
          await repository.snapshot();
          await repository.snapshot();
        });
        const trigger = document.querySelector<HTMLButtonElement>('.mobile-toggle')!;
        assert(trigger, 'The authenticated app must expose phone navigation');
        assert.equal(trigger.getAttribute('aria-controls'), 'workspace-navigation');
        trigger.focus();
        await act(() => trigger.click());
        assert.equal(panel().getAttribute('aria-modal'), 'true');
        assert(document.querySelector('.app-body')?.hasAttribute('inert'));
        assert.equal(panel().querySelector('a[href="#/admin"]'), null);
        await act(() => {
          viewport.matches = false;
          listeners.forEach((listener) => listener());
        });
        assert.equal(panel().getAttribute('aria-modal'), null);
        assert(!document.querySelector('.app-body')?.hasAttribute('inert'));
        assert.equal(document.body.style.overflow, 'auto');
      } finally {
        await act(() => root.render(null));
        await repository.logout();
        for (const [name, descriptor] of saved) {
          if (descriptor) Object.defineProperty(globalThis, name, descriptor);
          else Reflect.deleteProperty(globalThis, name);
        }
      }
      assert.equal(listeners.size, 0);
    },
  );
});
