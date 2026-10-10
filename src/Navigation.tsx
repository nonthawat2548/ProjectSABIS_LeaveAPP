import { useEffect, useRef, type ReactNode } from 'react';
import { ArrowUpRight, LogOut, Sparkles, Users, X } from 'lucide-react';
import type { Employee } from './domain/types';
import { roleLabels } from './components';
import { Avatar, BrandMark } from './ui';

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
        {open && <button type="button" className="mobile-menu-backdrop" tabIndex={-1} aria-label="ปิดเมนูพื้นที่ทำงาน" onClick={onClose} />}
        <aside id="workspace-navigation" className={'sidebar ' + (open ? 'mobile-open' : '')} ref={panel}
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
            <a className="brand" href="#/dashboard" onClick={onClose}><span><BrandMark /></span><div>leave<span className="brand-dot">.</span><small>Space for your balance</small></div></a>
            <div className="workspace-card"><span className="workspace-icon"><Users size={17} /></span><div><strong>{actor.department}</strong><small>พื้นที่ทำงาน · {roleLabels[actor.role]}</small></div></div>
            <div className="sidebar-label">WORKSPACE</div>
            <nav aria-label="เมนูหลัก">{menus.map(menu => <a key={menu.path} className={'nav-link ' + (route === menu.path ? 'active' : '')}
                href={'#' + menu.path} aria-current={route === menu.path ? 'page' : undefined} onClick={onClose}>
                {menu.icon}<span>{menu.label}</span>{menu.path === '/notifications' && unread > 0 && <b>{unread}</b>}
            </a>)}</nav>
            <div className="sidebar-note"><span><Sparkles size={17} />A little time for you.</span><p>วางแผนงานให้ลงตัว<br />มีเวลาให้สิ่งที่สำคัญ</p><a href={actor.role === 'Employee' ? '#/new' : '#/calendar'}> {actor.role === 'Employee' ? 'วางแผนวันลา' : 'ดูปฏิทินของทีม'}<ArrowUpRight size={15} /></a></div>
            <div className="sidebar-person"><Avatar person={actor} /><div><strong>{actor.name}</strong><small>{roleLabels[actor.role]}</small></div></div>
            <button className="logout" onClick={onLogout}><LogOut size={17} />ออกจากระบบ</button>
        </aside>
    </>;
}
