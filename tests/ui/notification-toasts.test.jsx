import { jest, beforeEach, afterEach, test, expect } from '@jest/globals';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { HashRouter } from 'react-router-dom';
import { NotificationToasts } from '../../src/NotificationToasts.jsx';

const old = {
  id: 1,
  employeeId: 4,
  leaveId: 1001,
  text: 'คำขอเก่าที่ค้างอยู่',
  createdAt: '2026-10-10T00:00:00Z',
  read: false,
};
const fresh = {
  ...old,
  id: 2,
  leaveId: 1002,
  text: 'พิมพ์ชนก ส่งคำขอ LR-2026-01002',
  createdAt: '2026-10-11T05:00:00Z',
};
const popup = () => screen.queryByRole('region', { name: 'การแจ้งเตือนคำขอใหม่' });

beforeEach(() => {
  jest.useFakeTimers();
  window.history.replaceState({}, '', '/#/dashboard');
});
afterEach(() => {
  cleanup();
  jest.useRealTimers();
});

function mount() {
  const view = render(
    <HashRouter>
      <NotificationToasts notifications={[old]} employeeId={4} />
    </HashRouter>,
  );
  return (notifications, props = {}) =>
    view.rerender(
      <HashRouter>
        <NotificationToasts notifications={notifications} employeeId={4} {...props} />
      </HashRouter>,
    );
}

test('Old items stay quiet; only new unread requests for the account appear for three seconds', () => {
  const update = mount();
  expect(popup()).not.toBeInTheDocument();
  update([
    old,
    fresh,
    { ...fresh, id: 3, employeeId: 5, text: 'ข้อมูลของบัญชีอื่น' },
    { ...fresh, id: 4, read: true, text: 'อ่านแล้ว' },
    { ...fresh, id: 5, leaveId: null, text: 'อัปเดตสิทธิ์' },
  ]);
  expect(popup()).toHaveTextContent(fresh.text);
  expect(screen.queryByText('ข้อมูลของบัญชีอื่น')).not.toBeInTheDocument();
  expect(screen.getByRole('link', { name: 'ดูคำขอ' })).toHaveAttribute('href', '#/request/1002');
  expect(fresh.read).toBe(false);
  act(() => jest.advanceTimersByTime(2999));
  expect(popup()).toBeInTheDocument();
  act(() => jest.advanceTimersByTime(1));
  expect(popup()).not.toBeInTheDocument();
});

test('Refresh and read-state changes never restart a toast or replay a dismissed item', () => {
  const update = mount();
  update([old, fresh]);
  act(() => jest.advanceTimersByTime(2000));
  update(structuredClone([old, fresh]));
  act(() => jest.advanceTimersByTime(1000));
  expect(popup()).not.toBeInTheDocument();
  update([old, { ...fresh, read: true }]);
  update([old, fresh]);
  expect(popup()).not.toBeInTheDocument();
});

test('Simultaneous requests are queued; each gets three seconds without covering another toast', () => {
  const update = mount();
  const next = { ...fresh, id: 3, text: 'ณัฐพงศ์ ส่งคำขอ LR-2026-01003', leaveId: 1003 };
  update([old, next, fresh]);
  expect(popup()).toHaveTextContent(fresh.text);
  act(() => jest.advanceTimersByTime(3000));
  expect(popup()).toHaveTextContent(next.text);
  act(() => jest.advanceTimersByTime(3000));
  expect(popup()).not.toBeInTheDocument();
});

test('Hover, keyboard focus and covering menus pause dismissal until the user can read it', () => {
  const update = mount();
  update([old, fresh]);
  fireEvent.mouseEnter(popup());
  act(() => jest.advanceTimersByTime(6000));
  expect(popup()).toBeInTheDocument();
  fireEvent.mouseLeave(popup());
  const link = screen.getByRole('link', { name: 'ดูคำขอ' });
  act(() => link.focus());
  act(() => jest.advanceTimersByTime(6000));
  expect(link).toHaveFocus();
  act(() => link.blur());
  update([old, fresh], { paused: true });
  act(() => jest.advanceTimersByTime(6000));
  expect(popup()).not.toBeInTheDocument();
  update([old, fresh], { paused: false });
  act(() => jest.advanceTimersByTime(2999));
  expect(popup()).toBeInTheDocument();
  act(() => jest.advanceTimersByTime(1));
  expect(popup()).not.toBeInTheDocument();
});

test('Opening the request or closing a popup keeps the notification unread', () => {
  const update = mount();
  update([old, fresh]);
  fireEvent.click(screen.getByRole('link', { name: 'ดูคำขอ' }));
  expect(window.location.hash).toBe('#/request/1002');
  expect(popup()).not.toBeInTheDocument();
  expect(fresh.read).toBe(false);
  update([old, fresh, { ...fresh, id: 3 }]);
  fireEvent.click(screen.getByRole('button', { name: 'ปิดป๊อปอัปแจ้งเตือน' }));
  expect(popup()).not.toBeInTheDocument();
});

test('Clearing data and reusing an ID still announces a genuinely new notification', () => {
  const update = mount();
  update([]);
  update([{ ...fresh, id: old.id }]);
  expect(popup()).toHaveTextContent(fresh.text);
  update([]);
  expect(popup()).not.toBeInTheDocument();
});

test('Account changes and unmount discard pending popups and timers', () => {
  const update = mount();
  update([old, fresh]);
  expect(popup()).toBeInTheDocument();
  update([{ ...fresh, employeeId: 5 }], { employeeId: 5 });
  expect(popup()).not.toBeInTheDocument();
  update(
    [
      { ...fresh, employeeId: 5 },
      { ...fresh, id: 3, employeeId: 5 },
    ],
    { employeeId: 5 },
  );
  expect(popup()).toBeInTheDocument();
  cleanup();
  expect(jest.getTimerCount()).toBe(0);
});
