import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { ArrowUpRight, LogOut, Sparkles, Users, X } from 'lucide-react';
import type { Employee } from './domain/types';
import { employeeLabelLanguage, formatDepartment, formatPosition } from './labels';
import { Avatar, BrandMark } from './ui';
import { ENTRY_TIMING, motionDelay, prefersReducedMotion } from './motion';

export interface WorkspaceMenu { path: string; label: string; icon: ReactNode }

export function WorkspaceNavigation({ actor, menus, unread, route, open, onClose, onLogout }: {
    actor: Employee;
    menus: WorkspaceMenu[];
    unread: number;
    route: string;
    open: boolean;
    onClose: () => void;
    onLogout: () => void;
}) {
    const panel = useRef<HTMLElement>(null);
    const closeButton = useRef<HTMLButtonElement>(null);
    const [closing, setClosing] = useState(false);
    const wasOpen = useRef(open);
    useEffect(() => {
        const viewport = window.matchMedia?.('(max-width: 760px)');
        if (!viewport) return;
        const restoreOnDesktop = () => { if (!viewport.matches) setClosing(false) };
        viewport.addEventListener('change', restoreOnDesktop);
        return () => viewport.removeEventListener('change', restoreOnDesktop);
    }, []);
    useLayoutEffect(() => {
        const shouldAnimate = !open && wasOpen.current && window.matchMedia?.('(max-width: 760px)').matches && !prefersReducedMotion();
        wasOpen.current = open;
        if (!shouldAnimate) { setClosing(false); return }
        const controller = new AbortController();
        setClosing(true);
        void motionDelay(ENTRY_TIMING.menuClose, controller.signal).then(completed => { if (completed) setClosing(false) });
        return () => controller.abort();
    }, [open]);
    useEffect(() => {
        if (!open) return;
        const previousFocus = document.activeElement as HTMLElement | null;
        const previousOverflow = document.body.style.overflow;
        document.body.style.overflow = 'hidden';
        closeButton.current?.focus();
        return () => {
            document.body.style.overflow = previousOverflow;
            if (previousFocus?.isConnected) previousFocus.focus();
        };
    }, [open]);

    return <>
        {(open || closing) && <button type="button" className={'mobile-menu-backdrop' + (closing ? ' is-closing' : '')} tabIndex={-1} aria-hidden={closing || undefined} disabled={closing} aria-label="ปิดเมนูพื้นที่ทำงาน" onClick={onClose} />}
        <aside id="workspace-navigation" className={'sidebar ' + (open ? 'mobile-open' : closing ? 'mobile-closing' : '')} ref={panel} inert={closing} aria-hidden={closing || undefined}
            role={open ? 'dialog' : undefined} aria-modal={open ? true : undefined} aria-label="เมนูพื้นที่ทำงาน"
            onKeyDown={event => {
                if (!open) return;
                if (event.key === 'Escape') { event.preventDefault(); onClose() }
                if (event.key === 'Tab') {
                    const controls = Array.from(panel.current?.querySelectorAll<HTMLElement>('a[href],button:not(:disabled)') ?? []);
                    const first = controls[0], last = controls.at(-1);
                    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus() }
                    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus() }
                }
            }}>
            <button type="button" className="icon-btn mobile-menu-close" ref={closeButton} aria-label="ปิดเมนู" onClick={onClose}><X size={20} /></button>
            <a className="brand" href="#/dashboard" onClick={onClose}><span><BrandMark /></span><div lang="en">leave<span className="brand-dot">.</span><small>Space for your balance</small></div></a>
            <div className="workspace-card"><span className="workspace-icon"><Users size={17} /></span><div><strong lang={employeeLabelLanguage(formatDepartment(actor.department))}>{formatDepartment(actor.department)}</strong><small lang={employeeLabelLanguage(formatPosition(actor.position))}>{formatPosition(actor.position)}</small></div></div>
            <div className="sidebar-label">พื้นที่ทำงาน</div>
            <nav aria-label="เมนูหลัก">{menus.map(menu => <a key={menu.path} className={'nav-link ' + (route === menu.path ? 'active' : '')}
                href={'#' + menu.path} aria-current={route === menu.path ? 'page' : undefined} onClick={onClose}>
                {menu.icon}<span>{menu.label}</span>{menu.path === '/notifications' && unread > 0 && <b>{unread}</b>}
            </a>)}</nav>
            <div className="sidebar-note"><span><Sparkles size={17} />ปฏิทินการลา</span><p>ตรวจสอบวันลา<br />ก่อนวางแผนงาน</p><a href={actor.role === 'Employee' ? '#/new' : '#/calendar'}> {actor.role === 'Employee' ? 'ยื่นคำขอลา' : 'ดูปฏิทินของทีม'}<ArrowUpRight size={15} /></a></div>
            <div className="sidebar-person"><Avatar person={actor} /><div><strong>{actor.name}</strong><small lang={employeeLabelLanguage(formatPosition(actor.position))}>{formatPosition(actor.position)}</small></div></div>
            <button className="logout" onClick={onLogout}><LogOut size={17} />ออกจากระบบ</button>
        </aside>
    </>;
}
