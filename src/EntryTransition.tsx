import { useEffect, useRef } from 'react';
import { Check, LoaderCircle } from 'lucide-react';
import { BrandMark } from './ui';

export interface EntryState { phase: 'checking' | 'ready' | 'leaving'; name?: string }

export function EntryTransition({ phase, name, title }: EntryState & { title?: string }) {
    const status = useRef<HTMLDivElement>(null);
    useEffect(() => { if (phase === 'checking') status.current?.focus() }, [phase]);
    const ready = phase !== 'checking';
    return <div className={'entry-transition phase-' + phase} ref={status} tabIndex={-1}
        role="status" aria-live="polite" aria-atomic="true" aria-busy={!ready}>
        <div className="entry-orbit" aria-hidden="true">
            <span className="entry-brand"><BrandMark /></span>
            <span className="entry-state-icon">{ready ? <Check size={20} /> : <LoaderCircle size={20} className="button-spinner" />}</span>
        </div>
        <strong>{title ?? (ready ? `ยินดีต้อนรับ${name ? ', ' + name.split(' ')[0] : ''}` : 'กำลังเข้าสู่ระบบ')}</strong>
        <p>{ready ? 'เข้าสู่ระบบสำเร็จ' : 'กำลังตรวจสอบบัญชีและโหลดข้อมูล'}</p>
        <div className="entry-dots" aria-hidden="true"><i /><i /><i /></div>
    </div>;
}
