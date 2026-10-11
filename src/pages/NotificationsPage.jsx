import { Check, ChevronRight, Bell } from 'lucide-react';

import { formatDateTime } from '../domain/date';
import { Card, Empty, Heading } from '../components';
import { useTask } from './useTask';

/** @param {import('./types').PageProps} props */
export function NotificationsPage({ db, run }) {
  const { busy, error, perform } = useTask(run);
  return (
    <>
      <Heading
        title="การแจ้งเตือน"
        description={`${db.notifications.filter((n) => !n.read).length} รายการยังไม่อ่าน`}
        action={
          <button
            className="btn"
            disabled={busy || db.notifications.every((n) => n.read)}
            onClick={() => void perform({ type: 'readNotifications' })}
          >
            <Check size={17} />
            อ่านทั้งหมด
          </button>
        }
      />

      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      <Card className="notification-card">
        {db.notifications.length ? (
          [...db.notifications]
            .sort((a, b) => b.id - a.id)
            .map((n) => (
              <div className={'notification ' + (!n.read ? 'unread' : '')} key={n.id}>
                <Bell size={19} />
                <div>
                  <p>{n.text}</p>
                  <small>{formatDateTime(n.createdAt)}</small>
                </div>
                {n.leaveId && (
                  <a className="text-link" href={'#/request/' + n.leaveId}>
                    ดูคำขอ
                    <ChevronRight size={15} />
                  </a>
                )}
              </div>
            ))
        ) : (
          <Empty>ยังไม่มีการแจ้งเตือน</Empty>
        )}
      </Card>
    </>
  );
}
