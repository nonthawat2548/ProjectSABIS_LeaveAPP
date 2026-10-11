import { useEffect, useRef } from 'react';
import { Check, LoaderCircle } from 'lucide-react';
import { BrandMark } from './ui';

export function EntryTransition({ phase, name, title, action = 'login' }) {
  const status = useRef(null);
  useEffect(() => {
    if (phase === 'checking') status.current?.focus();
  }, [phase]);
  const ready = phase !== 'checking';
  const messages =
    action === 'logout'
      ? {
          checking: 'กำลังออกจากระบบ',
          ready: 'ออกจากระบบสำเร็จ',
          pending: 'กำลังสิ้นสุดการใช้งาน',
          complete: 'กำลังกลับไปหน้าเข้าสู่ระบบ',
        }
      : {
          checking: 'กำลังเข้าสู่ระบบ',
          ready: `ยินดีต้อนรับ${name ? ', ' + name.split(' ')[0] : ''}`,
          pending: 'กำลังตรวจสอบบัญชีและโหลดข้อมูล',
          complete: 'เข้าสู่ระบบสำเร็จ',
        };
  return (
    <div
      className={'entry-transition phase-' + phase}
      ref={status}
      tabIndex={-1}
      role="status"
      aria-live="polite"
      aria-atomic="true"
      aria-busy={!ready}
    >
      <div className="entry-orbit" aria-hidden="true">
        <span className="entry-brand">
          <BrandMark />
        </span>
        <span className="entry-state-icon">
          {ready ? <Check size={20} /> : <LoaderCircle size={20} className="button-spinner" />}
        </span>
      </div>
      <strong>{title ?? (ready ? messages.ready : messages.checking)}</strong>
      <p>{ready ? messages.complete : messages.pending}</p>
      <div className="entry-dots" aria-hidden="true">
        <i />
        <i />
        <i />
      </div>
    </div>
  );
}
