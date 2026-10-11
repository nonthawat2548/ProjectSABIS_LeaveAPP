import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { Bell, X } from 'lucide-react';

const notificationKey = (notification) => `${notification.id}:${notification.createdAt}`;

/** Announce new request notifications after the first, account-scoped snapshot. */
export function NotificationToasts({ notifications, employeeId, paused = false }) {
  const seen = useRef(null);
  const [queue, setQueue] = useState([]);
  const [hovered, setHovered] = useState(false);
  const [focused, setFocused] = useState(false);
  const current = queue[0];
  const currentKey = current ? notificationKey(current) : null;

  useEffect(() => {
    const own = notifications.filter((item) => item.employeeId === employeeId);
    const keys = own.map(notificationKey);
    if (!seen.current || seen.current.employeeId !== employeeId) {
      seen.current = { employeeId, keys: new Set(keys) };
      setQueue([]);
      return;
    }
    const incoming = own
      .filter(
        (item) =>
          !item.read && item.leaveId != null && !seen.current.keys.has(notificationKey(item)),
      )
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.id - b.id);
    for (const key of keys) seen.current.keys.add(key);
    const unreadKeys = new Set(own.filter((item) => !item.read).map(notificationKey));
    setQueue((pending) => [
      ...pending.filter((item) => unreadKeys.has(notificationKey(item))),
      ...incoming,
    ]);
  }, [notifications, employeeId]);

  useEffect(() => {
    setHovered(false);
    setFocused(false);
  }, [currentKey]);

  useEffect(() => {
    if (!currentKey || paused || hovered || focused) return;
    const timer = setTimeout(() => {
      setQueue((pending) => pending.filter((item) => notificationKey(item) !== currentKey));
    }, 3000);
    return () => clearTimeout(timer);
  }, [currentKey, paused, hovered, focused]);

  function dismiss() {
    setQueue((pending) => pending.slice(1));
    setHovered(false);
    setFocused(false);
  }

  if (!current || current.employeeId !== employeeId || paused) return null;
  return (
    <section
      key={currentKey}
      className="notification-toast"
      aria-label="การแจ้งเตือนคำขอใหม่"
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onFocus={() => setFocused(true)}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) setFocused(false);
      }}
    >
      <span className="notification-toast-icon" aria-hidden="true">
        <Bell size={22} />
      </span>
      <div className="notification-toast-copy">
        <div role="status" aria-live="polite" aria-atomic="true">
          <strong>การแจ้งเตือนใหม่</strong>
          <p>{current.text}</p>
        </div>
        <Link to={'/request/' + current.leaveId} onClick={dismiss}>
          ดูคำขอ
        </Link>
      </div>
      <button className="icon-btn" type="button" aria-label="ปิดป๊อปอัปแจ้งเตือน" onClick={dismiss}>
        <X size={18} aria-hidden="true" />
      </button>
    </section>
  );
}
