import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { LayoutDashboard, FilePlus2, ClipboardList, Wallet, CalendarDays, Laptop, Bell, Settings, Users, ChevronLeft, Menu, RefreshCw, Database as DatabaseIcon, Check, X, Sun, Moon, Search, ArrowRight, UserRound, ShieldCheck, Eye, EyeOff, LoaderCircle } from 'lucide-react';
import type { Command, CommandResult, Database, Employee, Role } from './domain/types';
import { dataMode, repository } from './data';
import { DEMO_DATA_CHANNEL, getDemoAccounts } from './data/demoDatabase';
import { DEMO_PASSWORD } from './domain/seed';
import { DomainError } from './domain/service';
import { formatDate, today } from './domain/date';
import { roleLabels, Heading } from './components';
import { Dashboard, Requests, RequestDetail, LeaveForm, Quotas, WorkPage, CalendarPage, NotificationsPage, AdminPage, SettingsPage } from './pages';
import { Avatar, BrandMark, CommandMenu } from './ui';
import { WorkspaceNavigation } from './Navigation';
import { EntryTransition, type EntryState } from './EntryTransition';
import { ENTRY_TIMING, motionDelay } from './motion';
import { ColleaguesPage } from './ColleaguesPage';
export interface PageProps { db: Database; actor: Employee; run: (c: Command) => Promise<CommandResult>; reload: () => Promise<void> }
function useRoute() { const [route, setRoute] = useState(location.hash.slice(1) || '/dashboard'); useEffect(() => { const change = () => setRoute(location.hash.slice(1) || '/dashboard'); window.addEventListener('hashchange', change); return () => window.removeEventListener('hashchange', change) }, []); return route }
export default function App() {
    const [actor, setActor] = useState<Employee | null>(null), [db, setDb] = useState<Database | null>(null), [loading, setLoading] = useState(true), [error, setError] = useState(''), [toast, setToast] = useState(''), [mobile, setMobile] = useState(false), [commandOpen, setCommandOpen] = useState(false);
    const [theme, setTheme] = useState<'light' | 'dark'>(() => document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light'); const route = useRoute();
    const [entry, setEntry] = useState<EntryState | null>(null);
    const entryController = useRef<AbortController | null>(null);
    const main = useRef<HTMLElement>(null), hadEntry = useRef(false);
    useEffect(() => () => { const controller = entryController.current; entryController.current = null; controller?.abort() }, []);
    useEffect(() => {
        if (entry) { hadEntry.current = true; return }
        if (hadEntry.current) { hadEntry.current = false; main.current?.focus() }
    }, [entry]);
    const closeMobile = useCallback(() => setMobile(false), []);
    useEffect(() => {
        const viewport = window.matchMedia('(max-width: 760px)');
        const closeOnDesktop = () => { if (!viewport.matches) setMobile(false) };
        viewport.addEventListener('change', closeOnDesktop);
        closeOnDesktop();
        return () => viewport.removeEventListener('change', closeOnDesktop);
    }, []);
    useEffect(() => { document.documentElement.dataset.theme = theme; try { localStorage.setItem('leave-ui-theme', theme) } catch {/* Theme still works when browser storage is unavailable. */ } }, [theme]);
    useEffect(() => { const shortcut = (e: KeyboardEvent) => { if (actor && !entry && (e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); setCommandOpen(v => !v) } }; window.addEventListener('keydown', shortcut); return () => window.removeEventListener('keydown', shortcut) }, [actor, entry]);
    const reload = useCallback(async () => { setDb(await repository.snapshot()) }, []);
    useEffect(() => { let live = true; repository.session().then(async e => { if (!live) return; const d = e ? await repository.snapshot() : null; if (live) { setDb(d); setActor(e) } }).catch(e => { if (live) setError(e.message) }).finally(() => { if (live) setLoading(false) }); return () => { live = false } }, []);
    useEffect(() => { if (!actor) return; const refresh = () => { void reload().catch(e => { if (e instanceof DomainError && e.code === 'UNAUTHENTICATED') { setActor(null); setDb(null); setCommandOpen(false); setToast('') } else setError(e.message) }) }; window.addEventListener('focus', refresh); const ch = typeof BroadcastChannel !== 'undefined' ? new BroadcastChannel(DEMO_DATA_CHANNEL) : null; if (ch) ch.onmessage = refresh; const timer = dataMode === 'api' ? setInterval(refresh, 15000) : null; return () => { window.removeEventListener('focus', refresh); ch?.close(); if (timer) clearInterval(timer) } }, [actor, reload]);
    useEffect(() => { setMobile(false); setError(''); window.scrollTo(0, 0) }, [route]);
    useEffect(() => { if (!toast) return; const t = setTimeout(() => setToast(''), 5000); return () => clearTimeout(t) }, [toast]);
    async function run(c: Command) { try { const result = await repository.execute(c); await reload(); setToast(result.message); return result } catch (e) { if (e instanceof DomainError && e.code === 'CONFLICT') await reload(); throw e } }
    async function login(email: string, password: string) {
        entryController.current?.abort();
        const controller = new AbortController();
        entryController.current = controller;
        const minimum = motionDelay(ENTRY_TIMING.checking, controller.signal);
        let authenticated = false;
        setCommandOpen(false); setToast(''); setEntry({ phase: 'checking' });
        try {
            const employee = await repository.login(email, password);
            authenticated = true;
            if (controller.signal.aborted) return;
            const snapshot = await repository.snapshot();
            if (!await minimum || controller.signal.aborted) return;
            setEntry({ phase: 'ready', name: employee.name });
            if (!await motionDelay(ENTRY_TIMING.ready, controller.signal)) return;
            setDb(snapshot); setActor(employee); setError(''); location.hash = '/dashboard';
            setEntry({ phase: 'leaving', name: employee.name });
            if (await motionDelay(ENTRY_TIMING.leaving, controller.signal)) setEntry(null);
        } catch (failure) {
            if (controller.signal.aborted) return;
            controller.abort();
            if (authenticated) { try { await repository.logout() } catch { /* Preserve the original data-loading error. */ } }
            if (entryController.current === controller) setEntry(null);
            throw failure;
        } finally {
            controller.abort();
            if (entryController.current === controller) entryController.current = null;
        }
    }
    async function logout() { try { await repository.logout(); setActor(null); setDb(null); setCommandOpen(false); setToast(''); location.hash = '/dashboard' } catch (e) { setError((e as Error).message) } }
    if (loading) return <EntryTransition phase="checking" title="กำลังเปิดพื้นที่ทำงาน" />;
    if (!actor) return <><div className="login-frame" inert={!!entry}><Login onLogin={login} initialError={error} theme={theme} onToggleTheme={() => setTheme(t => t === 'light' ? 'dark' : 'light')} /></div>{entry && <EntryTransition {...entry} />}</>;
    if (!db) return <div className="boot"><p role="alert">{error || 'กำลังโหลดข้อมูล…'}</p><button className="btn" onClick={() => void reload().catch(e => setError(e.message))}>ลองอีกครั้ง</button><button className="btn" onClick={() => void logout()}>ออกจากระบบ</button></div>;
    const menus: { path: string; label: string; icon: ReactNode }[] = [{ path: '/dashboard', label: 'หน้าหลัก', icon: <LayoutDashboard /> }];
    if (actor.role === 'Employee') menus.push({ path: '/new', label: 'ยื่นคำขอลา', icon: <FilePlus2 /> }, { path: '/requests', label: 'ประวัติคำขอ', icon: <ClipboardList /> }, { path: '/quota', label: 'สิทธิ์และโควตา', icon: <Wallet /> });
    else menus.push({ path: '/requests', label: actor.role === 'HR' ? 'คำขอปรึกษา HR' : 'รายการคำขอของทีม', icon: <ClipboardList /> }, { path: '/calendar', label: 'ปฏิทินการลา', icon: <CalendarDays /> });
    menus.push({ path: '/work', label: 'สถานะการทำงาน', icon: <Laptop /> }, { path: '/colleagues', label: 'สถานะเพื่อนร่วมงาน', icon: <Users /> }, { path: '/notifications', label: 'การแจ้งเตือน', icon: <Bell /> });
    if (actor.role === 'HR') menus.push({ path: '/admin', label: 'ข้อมูลและสิทธิ์การลา', icon: <Users /> }, { path: '/settings', label: 'การตั้งค่า', icon: <Settings /> });
    const match = route.match(/^\/request\/(\d+)(\/edit)?$/); const props: PageProps = { actor, db, run, reload }; let page: ReactNode; let title = menus.find(m => route === m.path)?.label ?? 'รายละเอียดคำขอ';
    if (route === '/dashboard') page = <Dashboard {...props} />;
    else if (route === '/requests') page = <Requests {...props} />;
    else if (route === '/new' && actor.role === 'Employee') page = <LeaveForm key="new" {...props} />;
    else if (match && match[2] && actor.role === 'Employee') page = <LeaveForm key={route} {...props} editId={Number(match[1])} />;
    else if (match && !match[2]) page = <RequestDetail key={route} {...props} id={Number(match[1])} />;
    else if (route === '/quota' && actor.role === 'Employee') page = <Quotas {...props} />;
    else if (route === '/work') page = <WorkPage {...props} />;
    else if (route === '/colleagues') page = <ColleaguesPage {...props} />;
    else if (route === '/calendar' && actor.role !== 'Employee') page = <CalendarPage {...props} />;
    else if (route === '/notifications') page = <NotificationsPage {...props} />;
    else if (route === '/admin' && actor.role === 'HR') page = <AdminPage {...props} />;
    else if (route === '/settings' && actor.role === 'HR') page = <SettingsPage {...props} />;
    else { title = 'ไม่พบหน้า'; page = <><Heading title="ไม่พบหน้าหรือไม่มีสิทธิ์เข้าถึง" /><a className="btn primary" href="#/dashboard">กลับหน้าหลัก</a></> }
    const unread = db.notifications.filter(n => !n.read).length;
    return <><div className="app-shell" inert={!!entry} aria-busy={!!entry}><WorkspaceNavigation actor={actor} menus={menus} unread={unread} open={mobile} onClose={closeMobile} onLogout={() => void logout()} route={route} /><div className="app-body" inert={mobile}><header className="topbar"><div className="topbar-title"><button className="icon-btn mobile-toggle" aria-label="เปิดหรือปิดเมนู" aria-expanded={mobile} aria-controls="workspace-navigation" onClick={() => setMobile(!mobile)}><Menu size={20} /></button><a href="#/dashboard" className="breadcrumb-root">พื้นที่ทำงาน</a><ChevronLeft className="flip breadcrumb-chevron" size={13} /><span>{title}</span></div><div className="topbar-actions"><button className="header-search" aria-label="ค้นหาเมนูและคำขอ" onClick={() => setCommandOpen(true)}><Search size={17} /><span>ค้นหาในระบบ</span><kbd>Ctrl / ⌘ + K</kbd></button><ThemeButton theme={theme} onToggle={() => setTheme(t => t === 'light' ? 'dark' : 'light')} /><button className="icon-btn" aria-label="รีเฟรชข้อมูล" onClick={() => void reload().then(() => setToast('ข้อมูลเป็นปัจจุบันแล้ว')).catch(e => setError(e.message))}><RefreshCw size={17} /></button><a className="icon-btn bell" href="#/notifications" aria-label={`การแจ้งเตือน ${unread} รายการใหม่`}><Bell size={19} />{unread > 0 && <span>{unread}</span>}</a><div className="header-avatar"><Avatar person={actor} size="small" /></div></div></header><div className="mode-bar"><span><span className="status-dot" />พื้นที่ทดลอง · {dataMode === 'mock' ? 'ข้อมูลบันทึกในเบราว์เซอร์' : 'ข้อมูลบันทึกบนเซิร์ฟเวอร์ทดลอง'}</span><span><CalendarDays size={13} /> {formatDate(today())} · พ.ศ.</span></div><main key={route} ref={main} tabIndex={-1}><div className="back-row">{route !== '/dashboard' && <a href="#/dashboard" className="text-link"><ChevronLeft size={14} />หน้าหลัก</a>}</div>{error && <div className="error" role="alert">{error}<button className="icon-btn" aria-label="ปิดข้อผิดพลาด" onClick={() => setError('')}><X size={15} /></button></div>}{page}</main><footer><span lang="en"><BrandMark />Leave Management</span><span>ข้อมูลและนโยบายตัวอย่าง · วันที่ วัน/เดือน/ปี พ.ศ.</span></footer></div>{toast && <div className="toast" role="status"><span className="toast-icon"><Check size={17} /></span>{toast}<button onClick={() => setToast('')} aria-label="ปิดแจ้งเตือน"><X size={15} /></button></div>}{commandOpen && <CommandMenu menus={menus} db={db} onClose={() => setCommandOpen(false)} />}</div>{entry && <EntryTransition {...entry} />}</>;
}
export function ThemeButton({ theme, onToggle }: { theme: 'light' | 'dark'; onToggle: () => void }) { return <button className="icon-btn theme-toggle" aria-label={theme === 'light' ? 'เปลี่ยนเป็นธีมมืด' : 'เปลี่ยนเป็นธีมสว่าง'} title={theme === 'light' ? 'ธีมมืด' : 'ธีมสว่าง'} onClick={onToggle}>{theme === 'light' ? <Moon size={18} /> : <Sun size={18} />}</button> }
export function Login({ onLogin, initialError, theme, onToggleTheme }: { onLogin: (e: string, p: string) => Promise<void>; initialError: string; theme: 'light' | 'dark'; onToggleTheme: () => void }) {
    const accounts = getDemoAccounts();
    const roles = ['Employee', 'Manager', 'HR'] as const;
    const [selectedRole, setSelectedRole] = useState<Role | null>(null);
    const [email, setEmail] = useState(''), [password, setPassword] = useState(DEMO_PASSWORD), [error, setError] = useState(initialError), [busy, setBusy] = useState(false), [showPassword, setShowPassword] = useState(false);
    const submitting = useRef(false), mounted = useRef(true), emailInput = useRef<HTMLInputElement>(null);
    useEffect(() => { mounted.current = true; return () => { mounted.current = false } }, []);
    useEffect(() => { if (error && !busy) emailInput.current?.focus() }, [error, busy]);
    const selectedAccount = accounts.find(account => account.email.toLowerCase() === email.trim().toLowerCase());
    const roleAccounts = accounts.filter(account => account.role === selectedRole);
    function chooseAccount(accountEmail: string) { setEmail(accountEmail); setPassword(DEMO_PASSWORD); setError('') }
    function chooseRole(role: Role) { setSelectedRole(role); chooseAccount(accounts.find(account => account.role === role)?.email ?? '') }
    function changeEmail(value: string) {
        setEmail(value);
        const account = accounts.find(account => account.email.toLowerCase() === value.trim().toLowerCase());
        if (account) setSelectedRole(account.role);
    }
    async function submit(e: React.FormEvent) {
        e.preventDefault();
        if (submitting.current) return;
        submitting.current = true; setBusy(true); setError('');
        try { await onLogin(email, password) }
        catch (failure) { if (mounted.current) setError((failure as Error).message) }
        finally { submitting.current = false; if (mounted.current) setBusy(false) }
    }
    return <div className="login-page">
        <div className="login-intro">
            <div className="intro-brand" lang="en"><span><BrandMark /></span>leave<span className="brand-dot">.</span></div>
            <div className="login-story">
                <span className="eyebrow" lang="en"><span className="pulse-dot" />Space for your balance</span>
                <h1>งานลงตัว<br />มีเวลาให้<span>ชีวิต</span><span className="story-star">✦</span></h1>
                <p>ให้การจัดการวันลาเป็นเรื่องง่าย<br />เพื่อทุกวันที่ทำงาน และทุกวันที่พักผ่อน</p>
                <div className="login-illustration">
                    <img src="/art/leave-garden.svg" alt="ภาพประกอบปฏิทินและต้นไม้" />
                    <div className="floating-feature feature-approved"><span><Check size={18} /></span><div><strong>ทุกคำขอชัดเจน</strong><small>ติดตามได้ทุกขั้นตอน</small></div></div>
                    <div className="floating-feature feature-balance"><span><Wallet size={18} /></span><div><strong>วางแผนเวลาได้ดีขึ้น</strong><small>เห็นสิทธิ์คงเหลือในที่เดียว</small></div></div>
                </div>
            </div>
            <div className="login-benefits"><span><ShieldCheck size={15} />สิทธิ์ตามบทบาท</span><span><CalendarDays size={15} />ปฏิทินวันลา</span><span><Bell size={15} />ติดตามผล</span></div>
        </div>
        <div className="login-panel">
            <div className="login-topline"><span lang="en">Leave Management</span><ThemeButton theme={theme} onToggle={onToggleTheme} /></div>
            <div className="login-card">
                <span className="login-kicker"><span className="status-dot" />พร้อมเริ่มวันใหม่</span>
                <h2>ยินดีต้อนรับกลับมา<span> ✦</span></h2>
                <p>เข้าสู่พื้นที่ทำงานของคุณ</p>
                <div className="demo-label">เลือกบทบาทก่อนเลือกบัญชีทดลอง</div>
                <div className="demo-accounts" role="group" aria-label="เลือกบทบาท">{roles.map(role => {
                    const members = accounts.filter(account => account.role === role);
                    const selected = selectedRole === role;
                    return <button type="button" key={role} aria-pressed={selected} disabled={busy || !members.length} className={selected ? 'selected' : ''} onClick={() => chooseRole(role)}>
                        <span className="account-icon">{role === 'Employee' ? <UserRound size={18} /> : role === 'Manager' ? <Users size={18} /> : <ShieldCheck size={18} />}</span>
                        <strong>{roleLabels[role]}</strong><small>{members.length} บัญชี</small>
                        {selected && <span className="account-check"><Check size={11} /></span>}
                    </button>;
                })}</div>
                <form onSubmit={submit} aria-busy={busy}>
                    <div className="field">
                        <label htmlFor="login-account">{selectedRole ? `เลือกบัญชี${roleLabels[selectedRole]} (${roleAccounts.length} คน)` : 'เลือกบัญชีทดลอง'}</label>
                        <select id="login-account" value={selectedAccount?.email ?? ''} onChange={e => chooseAccount(e.target.value)} disabled={busy || !selectedRole}>
                            <option value="">{selectedRole ? 'กรอกอีเมลเอง' : 'เลือกบทบาทด้านบนก่อน'}</option>
                            {roleAccounts.map(account => <option key={account.id} value={account.email}>{account.name} · {account.email}</option>)}
                        </select>
                    </div>
                    <div className="field"><label htmlFor="login-email">อีเมล</label><input ref={emailInput} id="login-email" type="email" value={email} onChange={e => changeEmail(e.target.value)} autoComplete="username" disabled={busy} required /></div>
                    <div className="field"><label htmlFor="login-password">รหัสผ่าน</label><div className="password-input"><input id="login-password" type={showPassword ? 'text' : 'password'} value={password} onChange={e => setPassword(e.target.value)} autoComplete="current-password" disabled={busy} required /><button type="button" className="icon-btn" aria-label={showPassword ? 'ซ่อนรหัสผ่าน' : 'แสดงรหัสผ่าน'} onClick={() => setShowPassword(v => !v)}>{showPassword ? <EyeOff size={18} /> : <Eye size={18} />}</button></div></div>
                    {error && <div className="error" role="alert">{error}</div>}
                    <button className={'btn primary login-submit' + (busy ? ' is-busy' : '')} disabled={busy}><span>{busy ? 'กำลังเข้าสู่ระบบ…' : 'เข้าสู่พื้นที่ทำงาน'}</span>{busy ? <LoaderCircle size={18} className="button-spinner" aria-hidden="true" /> : <ArrowRight size={18} />}</button>
                </form>
                <div className="login-note"><DatabaseIcon size={18} /><div><strong>พื้นที่ทดลองใช้งาน</strong><p>ทุกบัญชีใช้รหัสผ่าน <code>{DEMO_PASSWORD}</code><br />{dataMode === 'mock' ? 'ข้อมูลของคุณบันทึกในเบราว์เซอร์นี้' : 'ข้อมูลบันทึกบนเซิร์ฟเวอร์ทดลอง'}</p></div></div>
            </div>
            <div className="login-bottom">ออกแบบให้การทำงานและชีวิตสมดุลขึ้น<span lang="en">© {new Date().getFullYear()} Leave Management</span></div>
        </div>
    </div>;
}
