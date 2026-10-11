import { useCallback, useEffect, useRef, useState } from 'react';
import { HashRouter, Link, matchRoutes, useLocation, useNavigate } from 'react-router-dom';
import {
  LayoutDashboard,
  FilePlus2,
  ClipboardList,
  Wallet,
  CalendarDays,
  Laptop,
  Bell,
  Settings,
  Users,
  ChevronLeft,
  Menu,
  RefreshCw,
  Check,
  X,
  Search,
} from 'lucide-react';

import { dataMode, repository } from './data/index.js';
import { DEMO_DATA_CHANNEL } from './data/demoDatabase.js';
import { DomainError } from './domain/service.js';
import { canReadEmployeeProfile } from './domain/employeeProfile.js';
import { formatDate, today } from './domain/date.js';
import { createWorkspaceRoutes, WorkspaceRoutes } from './routes.jsx';
import { BrandMark, CommandMenu } from './ui.jsx';
import { WorkspaceNavigation } from './Navigation.jsx';
import { EntryTransition } from './EntryTransition.jsx';
import { ENTRY_TIMING, motionDelay } from './motion.js';
import { NotificationPopover } from './NotificationPopover.jsx';
import { NotificationToasts } from './NotificationToasts.jsx';
import { Login } from './Login.jsx';
import { ThemeButton } from './ThemeButton.jsx';
import { Dialog } from './components.jsx';
import { EmployeeProfileContext } from './EmployeeProfileLink.jsx';
import { AccountMenu } from './AccountMenu.jsx';
import { EmployeeProfilePage } from './pages/EmployeeProfilePage.jsx';

export { Login } from './Login.jsx';
export { ThemeButton } from './ThemeButton.jsx';

export default function App() {
  return (
    <HashRouter>
      <Workspace />
    </HashRouter>
  );
}

function Workspace() {
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const [actor, setActor] = useState(null),
    [db, setDb] = useState(null),
    [loading, setLoading] = useState(true),
    [error, setError] = useState(''),
    [toast, setToast] = useState(''),
    [mobile, setMobile] = useState(false),
    [commandOpen, setCommandOpen] = useState(false);
  const [profile, setProfile] = useState(null);
  const [theme, setTheme] = useState(() =>
    document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light',
  );
  const route = pathname === '/' ? '/dashboard' : pathname;
  const [entry, setEntry] = useState(null);
  const entryController = useRef(null);
  const entryFocus = useRef(null);
  const sessionVersion = useRef(0);
  const main = useRef(null),
    hadEntry = useRef(false);
  useEffect(
    () => () => {
      const controller = entryController.current;
      entryController.current = null;
      sessionVersion.current++;
      controller?.abort();
    },
    [],
  );
  useEffect(() => {
    if (entry) {
      hadEntry.current = true;
      return;
    }
    if (hadEntry.current) {
      hadEntry.current = false;
      const target = !actor
        ? document.querySelector('#login-email')
        : entryFocus.current?.isConnected
          ? entryFocus.current
          : main.current;
      entryFocus.current = null;
      target?.focus();
    }
  }, [entry, actor]);
  const closeMobile = useCallback(() => setMobile(false), []);
  const closeProfile = useCallback(() => setProfile(null), []);
  function openProfile(employeeId, trigger) {
    if (
      entry ||
      !canReadEmployeeProfile(actor, employeeId) ||
      !Number.isSafeInteger(employeeId) ||
      employeeId < 1
    )
      return;
    setMobile(false);
    setCommandOpen(false);
    setProfile({ employeeId, trigger });
  }
  function restoreProfileFocus() {
    const trigger = profile?.trigger;
    const mobileTrigger =
      trigger?.closest('.sidebar') && window.matchMedia('(max-width: 760px)').matches;
    const target = mobileTrigger
      ? document.querySelector('.mobile-toggle')
      : trigger?.isConnected
        ? trigger
        : main.current;
    target?.focus();
  }
  useEffect(() => {
    setProfile(null);
  }, [route, actor?.id, entry?.action]);
  useEffect(() => {
    if (profile && !canReadEmployeeProfile(actor, profile.employeeId)) setProfile(null);
  }, [actor, profile]);
  useEffect(() => {
    const viewport = window.matchMedia('(max-width: 760px)');
    const closeOnDesktop = () => {
      if (!viewport.matches) setMobile(false);
    };
    viewport.addEventListener('change', closeOnDesktop);
    closeOnDesktop();
    return () => viewport.removeEventListener('change', closeOnDesktop);
  }, []);
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    try {
      localStorage.setItem('leave-ui-theme', theme);
    } catch {
      /* Theme still works when browser storage is unavailable. */
    }
  }, [theme]);
  useEffect(() => {
    const shortcut = (e) => {
      if (actor && !entry && !profile && (e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setCommandOpen((v) => !v);
      }
    };
    window.addEventListener('keydown', shortcut);
    return () => window.removeEventListener('keydown', shortcut);
  }, [actor, entry, profile]);
  const reload = useCallback(async () => {
    const version = sessionVersion.current;
    const snapshot = await repository.snapshot();
    if (version === sessionVersion.current) setDb(snapshot);
  }, []);
  useEffect(() => {
    let live = true;
    repository
      .session()
      .then(async (e) => {
        if (!live) return;
        const d = e ? await repository.snapshot() : null;
        if (live) {
          setDb(d);
          setActor(e);
        }
      })
      .catch((e) => {
        if (live) setError(e.message);
      })
      .finally(() => {
        if (live) setLoading(false);
      });
    return () => {
      live = false;
    };
  }, []);
  useEffect(() => {
    if (!actor || entry?.action === 'logout') return;
    let live = true;
    const refresh = () => {
      void reload().catch((e) => {
        if (!live) return;
        if (e instanceof DomainError && e.code === 'UNAUTHENTICATED') {
          setActor(null);
          setDb(null);
          setCommandOpen(false);
          setToast('');
        } else setError(e.message);
      });
    };
    window.addEventListener('focus', refresh);
    const ch =
      typeof BroadcastChannel !== 'undefined' ? new BroadcastChannel(DEMO_DATA_CHANNEL) : null;
    if (ch) ch.onmessage = refresh;
    const timer = dataMode === 'api' ? setInterval(refresh, 15000) : null;
    return () => {
      live = false;
      window.removeEventListener('focus', refresh);
      ch?.close();
      if (timer) clearInterval(timer);
    };
  }, [actor, reload, entry?.action]);
  useEffect(() => {
    setMobile(false);
    setError('');
    window.scrollTo(0, 0);
  }, [route]);
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(''), 5000);
    return () => clearTimeout(t);
  }, [toast]);
  async function run(c) {
    try {
      const result = await repository.execute(c);
      await reload();
      setToast(result.message);
      return result;
    } catch (e) {
      if (e instanceof DomainError && e.code === 'CONFLICT') await reload();
      throw e;
    }
  }
  async function login(email, password) {
    hadEntry.current = true;
    sessionVersion.current++;
    entryController.current?.abort();
    const controller = new AbortController();
    entryController.current = controller;
    const minimum = motionDelay(ENTRY_TIMING.checking, controller.signal);
    let authenticated = false;
    setCommandOpen(false);
    setToast('');
    setEntry({ phase: 'checking' });
    try {
      const employee = await repository.login(email, password);
      authenticated = true;
      if (controller.signal.aborted) return;
      const snapshot = await repository.snapshot();
      if (!(await minimum) || controller.signal.aborted) return;
      setEntry({ phase: 'ready', name: employee.name });
      if (!(await motionDelay(ENTRY_TIMING.ready, controller.signal))) return;
      setDb(snapshot);
      setActor(employee);
      setError('');
      navigate('/dashboard');
      setEntry({ phase: 'leaving', name: employee.name });
      if (await motionDelay(ENTRY_TIMING.leaving, controller.signal)) setEntry(null);
    } catch (failure) {
      if (controller.signal.aborted) return;
      controller.abort();
      if (authenticated) {
        try {
          await repository.logout();
        } catch {
          /* Preserve the original data-loading error. */
        }
      }
      if (entryController.current === controller) setEntry(null);
      throw failure;
    } finally {
      controller.abort();
      if (entryController.current === controller) entryController.current = null;
    }
  }
  async function logout() {
    if (entryController.current) return;
    const controller = new AbortController();
    entryController.current = controller;
    sessionVersion.current++;
    hadEntry.current = true;
    entryFocus.current = mobile
      ? document.querySelector('.mobile-toggle')
      : document.querySelector('.logout, .boot button:last-child');
    const minimum = motionDelay(ENTRY_TIMING.checking, controller.signal);
    setMobile(false);
    setCommandOpen(false);
    setToast('');
    setError('');
    setEntry({ phase: 'checking', action: 'logout' });
    try {
      await repository.logout();
      if (!(await minimum) || controller.signal.aborted) return;
      setEntry({ phase: 'ready', action: 'logout' });
      if (!(await motionDelay(ENTRY_TIMING.ready, controller.signal))) return;
      setActor(null);
      setDb(null);
      navigate('/dashboard');
      setEntry({ phase: 'leaving', action: 'logout' });
      if (await motionDelay(ENTRY_TIMING.leaving, controller.signal)) setEntry(null);
    } catch (e) {
      if (controller.signal.aborted) return;
      controller.abort();
      if (entryController.current === controller) setEntry(null);
      setError(e.message);
    } finally {
      controller.abort();
      if (entryController.current === controller) entryController.current = null;
    }
  }
  if (loading) return <EntryTransition phase="checking" title="กำลังโหลดข้อมูล" />;
  if (!actor)
    return (
      <>
        <div className="login-frame" inert={!!entry}>
          <Login
            onLogin={login}
            initialError={error}
            theme={theme}
            onToggleTheme={() => setTheme((t) => (t === 'light' ? 'dark' : 'light'))}
          />
        </div>
        {entry && <EntryTransition {...entry} />}
      </>
    );

  if (!db)
    return (
      <>
        <div className="boot" inert={!!entry} aria-busy={!!entry}>
          <p role="alert">{error || 'กำลังโหลดข้อมูล…'}</p>
          <button className="btn" onClick={() => void reload().catch((e) => setError(e.message))}>
            ลองอีกครั้ง
          </button>
          <button className="btn" disabled={!!entry} onClick={() => void logout()}>
            ออกจากระบบ
          </button>
        </div>
        {entry && <EntryTransition {...entry} />}
      </>
    );

  const menus = [{ path: '/dashboard', label: 'หน้าหลัก', icon: <LayoutDashboard /> }];

  if (actor.role === 'Employee')
    menus.push(
      { path: '/new', label: 'ยื่นคำขอลา', icon: <FilePlus2 /> },
      { path: '/requests', label: 'ประวัติคำขอ', icon: <ClipboardList /> },
      { path: '/quota', label: 'สิทธิ์และโควตา', icon: <Wallet /> },
    );
  else
    menus.push(
      {
        path: '/requests',
        label: actor.role === 'HR' ? 'คำขอปรึกษา HR' : 'รายการคำขอของทีม',
        icon: <ClipboardList />,
      },
      { path: '/calendar', label: 'ปฏิทินการลา', icon: <CalendarDays /> },
    );
  menus.push(
    { path: '/work', label: 'สถานะการทำงาน', icon: <Laptop /> },
    { path: '/colleagues', label: 'สถานะเพื่อนร่วมงาน', icon: <Users /> },
    { path: '/notifications', label: 'การแจ้งเตือน', icon: <Bell /> },
  );
  if (actor.role === 'HR')
    menus.push(
      { path: '/admin', label: 'ข้อมูลและสิทธิ์การลา', icon: <Users /> },
      { path: '/settings', label: 'การตั้งค่า', icon: <Settings /> },
    );
  const props = { actor, db, run, reload };
  const routes = createWorkspaceRoutes(props);
  const matchedRoute = matchRoutes(routes, route)?.at(-1);
  const invalidRequestId = matchedRoute?.params.id && !/^\d+$/.test(matchedRoute.params.id);
  const title = invalidRequestId ? 'ไม่พบหน้า' : (matchedRoute?.route.title ?? 'ไม่พบหน้า');
  const appleKeyboard = /Mac|iPhone|iPad|iPod/i.test(globalThis.navigator?.platform ?? '');
  const searchShortcut = appleKeyboard ? '⌘ + K' : 'Ctrl + K';
  return (
    <EmployeeProfileContext.Provider value={openProfile}>
      <div className="app-shell" inert={!!entry || !!profile} aria-busy={!!entry}>
        <WorkspaceNavigation
          actor={actor}
          menus={menus.filter((menu) => menu.path !== '/notifications')}
          open={mobile}
          onClose={closeMobile}
          onLogout={() => void logout()}
          loggingOut={entry?.action === 'logout'}
          route={route}
        />

        <div className="app-body" inert={mobile}>
          <header className="topbar">
            <div className="topbar-title flex items-center gap-[10px]">
              <button
                className="icon-btn mobile-toggle"
                aria-label="เปิดหรือปิดเมนู"
                aria-expanded={mobile}
                aria-controls="workspace-navigation"
                onClick={() => setMobile(!mobile)}
              >
                <Menu size={20} />
              </button>
              <Link to="/dashboard" className="breadcrumb-root">
                พื้นที่ทำงาน
              </Link>
              <ChevronLeft className="flip breadcrumb-chevron" size={13} />
              <span>{title}</span>
            </div>
            <div className="topbar-actions flex items-center gap-[8px]">
              <button
                className="header-search toolbar-hint"
                data-tooltip={`ค้นหาเมนูหรือคำขอ (${searchShortcut})`}
                aria-label="ค้นหาเมนูหรือคำขอ"
                aria-keyshortcuts={appleKeyboard ? 'Meta+K' : 'Control+K'}
                onClick={() => setCommandOpen(true)}
              >
                <Search size={20} aria-hidden="true" />
                <span>ค้นหาเมนูหรือคำขอ</span>
                <kbd lang="en" aria-hidden="true">
                  {searchShortcut}
                </kbd>
              </button>
              <ThemeButton
                theme={theme}
                onToggle={() => setTheme((t) => (t === 'light' ? 'dark' : 'light'))}
              />

              <button
                className="icon-btn toolbar-hint"
                data-tooltip="รีเฟรชข้อมูล"
                aria-label="รีเฟรชข้อมูล"
                onClick={() =>
                  void reload()
                    .then(() => setToast('ข้อมูลเป็นปัจจุบันแล้ว'))
                    .catch((e) => setError(e.message))
                }
              >
                <RefreshCw size={20} aria-hidden="true" />
              </button>
              <NotificationPopover
                notifications={db.notifications}
                employeeId={actor.id}
                route={route}
                disabled={mobile || commandOpen || !!entry || !!profile}
                onReadAll={() => run({ type: 'readNotifications' })}
              />

              <AccountMenu
                actor={actor}
                route={route}
                disabled={mobile || commandOpen || !!entry || !!profile}
              />
            </div>
          </header>
          <div className="mode-bar flex items-center justify-between gap-[16px]">
            <span className="flex items-center gap-[6px]">
              <span className="status-dot" />
              {'พื้นที่ทดลอง · '}
              {dataMode === 'mock' ? 'ข้อมูลบันทึกในเบราว์เซอร์' : 'ข้อมูลจากระบบกลาง'}
            </span>
            <span className="flex items-center gap-[6px]">
              <CalendarDays size={13} /> {formatDate(today())}
              {' · พ.ศ.'}
            </span>
          </div>
          <main key={route} ref={main} tabIndex={-1}>
            <div className="back-row">
              {route !== '/dashboard' && (
                <Link to="/dashboard" className="text-link">
                  <ChevronLeft size={14} />
                  หน้าหลัก
                </Link>
              )}
            </div>
            {error && (
              <div className="error" role="alert">
                {error}
                <button
                  className="icon-btn"
                  aria-label="ปิดข้อผิดพลาด"
                  onClick={() => setError('')}
                >
                  <X size={15} />
                </button>
              </div>
            )}
            <WorkspaceRoutes routes={routes} />
          </main>
          <footer className="flex justify-between gap-[16px]">
            <span lang="en">
              <BrandMark />
              Leave Management
            </span>
            <span>ข้อมูลและนโยบายตัวอย่าง</span>
          </footer>
        </div>
        <div className="toast-region">
          {toast && (
            <div className="toast" role="status">
              <span className="toast-icon">
                <Check size={17} />
              </span>
              {toast}
              <button onClick={() => setToast('')} aria-label="ปิดแจ้งเตือน">
                <X size={15} />
              </button>
            </div>
          )}
          {entry?.action !== 'logout' && (
            <NotificationToasts
              key={actor.id + ':' + sessionVersion.current}
              notifications={db.notifications}
              employeeId={actor.id}
              paused={mobile || commandOpen || !!entry || !!profile}
            />
          )}
        </div>
        {commandOpen && <CommandMenu menus={menus} db={db} onClose={() => setCommandOpen(false)} />}
      </div>
      {profile && !entry && canReadEmployeeProfile(actor, profile.employeeId) && (
        <div className="employee-profile-overlay">
          <Dialog
            title="ประวัติพนักงาน"
            className="employee-profile-dialog"
            onClose={closeProfile}
            restoreFocus={restoreProfileFocus}
          >
            <EmployeeProfilePage {...props} employeeId={profile.employeeId} embedded />
          </Dialog>
        </div>
      )}
      {entry && <EntryTransition {...entry} />}
    </EmployeeProfileContext.Provider>
  );
}
