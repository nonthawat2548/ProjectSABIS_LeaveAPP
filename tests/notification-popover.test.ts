import { test } from 'node:test';
import assert from 'node:assert/strict';
import { act, createElement } from 'react';
import { JSDOM } from 'jsdom';
import { NotificationPopover } from '../src/NotificationPopover';
import { today } from '../src/domain/date';
import type { Notification } from '../src/domain/types';

test('Notification dropdown keeps navigation explicit, scopes items and handles keyboard and saved read state', async (t) => {
  const dom = new JSDOM(
    '<!doctype html><html><body><div id="root"></div><button id="outside">outside</button></body></html>',
    { url: 'http://localhost/#/dashboard' },
  );
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
  const document = dom.window.document;
  const original: Notification[] = [
    {
      id: 1,
      employeeId: 1,
      leaveId: 1001,
      text: 'คำขอได้รับอนุมัติแล้ว',
      createdAt: today() + 'T01:00:00Z',
      read: false,
    },
    {
      id: 2,
      employeeId: 1,
      leaveId: null,
      text: 'แจ้งเตือนที่อ่านแล้ว',
      createdAt: '2026-01-01T01:00:00Z',
      read: true,
    },
    {
      id: 3,
      employeeId: 2,
      leaveId: 2001,
      text: 'ข้อมูลส่วนตัวของคนอื่น',
      createdAt: today() + 'T02:00:00Z',
      read: false,
    },
  ];
  let notifications = original,
    route = '/dashboard',
    disabled = false,
    calls = 0;
  let onReadAll = async () => {
    calls++;
  };
  const render = () =>
    act(() =>
      root.render(
        createElement(NotificationPopover, {
          notifications,
          employeeId: 1,
          route,
          disabled,
          onReadAll,
        }),
      ),
    );
  const trigger = () => document.querySelector<HTMLButtonElement>('.bell')!;
  const panel = () => document.querySelector<HTMLElement>('.notification-popover');
  const button = (label: string) =>
    [...document.querySelectorAll<HTMLButtonElement>('button')].find(
      (b) => b.textContent === label,
    )!;
  const click = (element: HTMLElement) => act(() => element.click());
  t.after(async () => {
    await act(() => root.unmount());
    dom.window.close();
    for (const [name, descriptor] of originals) {
      if (descriptor) Object.defineProperty(globalThis, name, descriptor);
      else Reflect.deleteProperty(globalThis, name);
    }
  });

  await t.test(
    'Opening does not navigate or mark read; filters and links expose only the account notification',
    async () => {
      await render();
      await click(trigger());
      assert.equal(dom.window.location.hash, '#/dashboard');
      assert.equal(calls, 0);
      assert.equal(trigger().getAttribute('aria-expanded'), 'true');
      assert.equal(document.activeElement?.getAttribute('aria-label'), 'ปิดการแจ้งเตือน');
      assert.equal(document.querySelectorAll('.notification-preview').length, 2);
      assert(!panel()!.textContent!.includes('ข้อมูลส่วนตัวของคนอื่น'));
      assert(panel()!.textContent!.includes('วันนี้'));
      assert(panel()!.textContent!.includes('ก่อนหน้านี้'));
      assert.equal(
        document.querySelector('.notification-preview')?.getAttribute('href'),
        '#/request/1001',
      );
      assert.equal(
        document.querySelector('.notification-view-all')?.getAttribute('href'),
        '#/notifications',
      );
      await click(button('ยังไม่ได้อ่าน'));
      assert.equal(document.querySelectorAll('.notification-preview').length, 1);
      assert.equal(button('ยังไม่ได้อ่าน').getAttribute('aria-pressed'), 'true');
      await click(button('ทั้งหมด'));
      assert.equal(document.querySelectorAll('.notification-preview').length, 2);
      await act(() =>
        document.dispatchEvent(
          new dom.window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }),
        ),
      );
      assert.equal(panel(), null);
      assert.equal(document.activeElement, trigger());
    },
  );

  await t.test(
    'Outside click, keyboard focus, route change and another overlay close the dropdown',
    async () => {
      await click(trigger());
      await act(() =>
        document
          .getElementById('outside')!
          .dispatchEvent(new dom.window.MouseEvent('pointerdown', { bubbles: true })),
      );
      assert.equal(panel(), null);
      await click(trigger());
      await act(() => document.getElementById('outside')!.focus());
      assert.equal(panel(), null);
      await click(trigger());
      route = '/work';
      await render();
      assert.equal(panel(), null);
      await click(trigger());
      disabled = true;
      await render();
      assert.equal(panel(), null);
      assert(trigger().disabled);
      disabled = false;
      await render();
    },
  );

  await t.test(
    'Read all prevents duplicate submission, preserves errors and waits for snapshot before showing read state',
    async () => {
      let reject!: (error: Error) => void;
      calls = 0;
      onReadAll = () => {
        calls++;
        return new Promise<void>((_, fail) => {
          reject = fail;
        });
      };
      await render();
      await click(trigger());
      await click(button('ยังไม่ได้อ่าน'));
      await click(button('อ่านทั้งหมด'));
      assert.equal(calls, 1);
      assert(document.querySelector<HTMLButtonElement>('.notification-read-all')!.disabled);
      await click(document.querySelector<HTMLElement>('.notification-read-all')!);
      assert.equal(calls, 1);
      await act(async () => reject(new Error('บันทึกไม่สำเร็จ')));
      assert.equal(document.querySelector('[role="alert"]')?.textContent, 'บันทึกไม่สำเร็จ');
      assert.equal(document.querySelectorAll('.notification-preview.unread').length, 1);
      onReadAll = async () => {
        calls++;
        notifications = original.map((n) => (n.employeeId === 1 ? { ...n, read: true } : n));
        await render();
      };
      await render();
      await click(button('อ่านทั้งหมด'));
      assert.equal(document.querySelector('[role="alert"]'), null);
      assert.equal(document.querySelectorAll('.notification-preview').length, 0);
      assert(panel()!.textContent!.includes('ไม่มีรายการที่ยังไม่ได้อ่าน'));
      assert.equal(trigger().querySelector('span'), null);
      await click(button('ทั้งหมด'));
      assert.equal(document.querySelectorAll('.notification-preview').length, 2);
      assert.equal(document.querySelectorAll('.notification-preview.unread').length, 0);
    },
  );

  await t.test('Empty notification list stays usable with no misleading unread badge', async () => {
    notifications = [];
    await render();
    assert.equal(trigger().querySelector('span'), null);
    assert(panel()!.textContent!.includes('ยังไม่มีการแจ้งเตือน'));
    assert(document.querySelector<HTMLButtonElement>('.notification-read-all')!.disabled);
  });
});
