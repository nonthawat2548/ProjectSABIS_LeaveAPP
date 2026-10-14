import { useEffect, useId, useRef, useState } from 'react';
import { Bell, CheckCheck, ChevronRight, X } from 'lucide-react';

import { formatDateTime, today } from './domain/date.js';
import { isLeaveReport, notificationTitle } from './domain/leaveReport.js';

export function NotificationPopover({ notifications, employeeId, route, disabled, onReadAll }) {
  const [open, setOpen] = useState(false),
    [unreadOnly, setUnreadOnly] = useState(false);
  const [busy, setBusy] = useState(false),
    [error, setError] = useState('');
  const wrapper = useRef(null),
    trigger = useRef(null),
    close = useRef(null);
  const submitting = useRef(false),
    mounted = useRef(true);
  const id = useId();
  const own = notifications.filter((n) => n.employeeId === employeeId);
  const unread = own.filter((n) => !n.read).length;
  const items = own
    .filter((n) => !unreadOnly || !n.read)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt) || b.id - a.id);
  const currentDate = today();
  const groups = [
    { title: 'วันนี้', items: items.filter((n) => today(new Date(n.createdAt)) === currentDate) },
    {
      title: 'ก่อนหน้านี้',
      items: items.filter((n) => today(new Date(n.createdAt)) !== currentDate),
    },
  ];

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  useEffect(() => {
    setOpen(false);
    setError('');
    setUnreadOnly(false);
  }, [route, employeeId]);
  useEffect(() => {
    if (disabled) setOpen(false);
  }, [disabled]);
  useEffect(() => {
    if (!open) return;
    close.current?.focus();
    const outside = (event) => {
      if (!wrapper.current?.contains(event.target)) setOpen(false);
    };
    const keyboard = (event) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        setOpen(false);
        trigger.current?.focus();
      }
    };
    document.addEventListener('pointerdown', outside);
    document.addEventListener('keydown', keyboard);
    return () => {
      document.removeEventListener('pointerdown', outside);
      document.removeEventListener('keydown', keyboard);
    };
  }, [open]);

  async function readAll() {
    if (submitting.current) return;
    submitting.current = true;
    setBusy(true);
    setError('');
    try {
      await onReadAll();
    } catch (failure) {
      if (mounted.current)
        setError(
          failure instanceof Error ? failure.message : 'ไม่สามารถบันทึกการอ่านได้ กรุณาลองอีกครั้ง',
        );
    } finally {
      submitting.current = false;
      if (mounted.current) setBusy(false);
    }
  }

  return (
    <div
      className="notification-menu"
      ref={wrapper}
      onBlur={(event) => {
        if (event.relatedTarget && !event.currentTarget.contains(event.relatedTarget))
          setOpen(false);
      }}
    >
      <button
        ref={trigger}
        className={'icon-btn bell toolbar-hint' + (open ? ' is-open' : '')}
        type="button"
        data-tooltip={open ? undefined : 'การแจ้งเตือน'}
        aria-label={`การแจ้งเตือน ${unread} รายการใหม่`}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-controls={open ? id : undefined}
        disabled={disabled}
        onClick={() => {
          setError('');
          setOpen((value) => !value);
        }}
      >
        <Bell size={20} aria-hidden="true" />
        {unread > 0 && <span>{unread > 99 ? '99+' : unread}</span>}
      </button>
      {open && (
        <section className="notification-popover" id={id} role="dialog" aria-label="การแจ้งเตือน">
          <div className="notification-popover-head">
            <div>
              <h2>การแจ้งเตือน</h2>
              <p>{unread ? `ยังไม่ได้อ่าน ${unread} รายการ` : 'อ่านครบแล้ว'}</p>
            </div>
            <button
              ref={close}
              className="icon-btn"
              type="button"
              aria-label="ปิดการแจ้งเตือน"
              onClick={() => {
                setOpen(false);
                trigger.current?.focus();
              }}
            >
              <X size={20} aria-hidden="true" />
            </button>
          </div>
          <div className="notification-popover-tools">
            <div className="notification-filters" role="group" aria-label="กรองการแจ้งเตือน">
              <button type="button" aria-pressed={!unreadOnly} onClick={() => setUnreadOnly(false)}>
                ทั้งหมด
              </button>
              <button type="button" aria-pressed={unreadOnly} onClick={() => setUnreadOnly(true)}>
                ยังไม่ได้อ่าน
              </button>
            </div>
            <button
              className="notification-read-all"
              type="button"
              disabled={busy || !unread}
              aria-busy={busy}
              onClick={() => void readAll()}
            >
              <CheckCheck size={16} aria-hidden="true" />
              {busy ? 'กำลังบันทึก…' : 'อ่านทั้งหมด'}
            </button>
          </div>
          {error && (
            <p className="notification-popover-error" role="alert">
              {error}
            </p>
          )}
          <div className="notification-popover-list">
            {items.length ? (
              groups
                .filter((group) => group.items.length)
                .map((group) => (
                  <div key={group.title} className="notification-group">
                    <h3>{group.title}</h3>
                    <ul>
                      {group.items.map((n) => (
                        <li key={n.id}>
                          <a
                            className={'notification-preview' + (!n.read ? ' unread' : '')}
                            href={
                              isLeaveReport(n.text)
                                ? '#/leave-report/' + n.id
                                : n.leaveId
                                  ? '#/request/' + n.leaveId
                                  : '#/notifications'
                            }
                            onClick={() => setOpen(false)}
                          >
                            <span className="notification-preview-icon">
                              <Bell size={20} aria-hidden="true" />
                            </span>
                            <span className="notification-preview-copy">
                              <span>{notificationTitle(n.text)}</span>
                              <time dateTime={n.createdAt}>{formatDateTime(n.createdAt)}</time>
                              {!n.read && <small>ยังไม่ได้อ่าน</small>}
                            </span>
                            {!n.read && (
                              <span className="notification-unread-dot" aria-hidden="true" />
                            )}
                          </a>
                        </li>
                      ))}
                    </ul>
                  </div>
                ))
            ) : (
              <div className="notification-popover-empty">
                <Bell size={28} aria-hidden="true" />
                <p>{unreadOnly ? 'ไม่มีรายการที่ยังไม่ได้อ่าน' : 'ยังไม่มีการแจ้งเตือน'}</p>
              </div>
            )}
          </div>
          <a
            href="#/notifications"
            className="notification-view-all"
            onClick={() => setOpen(false)}
          >
            ดูการแจ้งเตือนทั้งหมด
            <ChevronRight size={16} aria-hidden="true" />
          </a>
        </section>
      )}
    </div>
  );
}
