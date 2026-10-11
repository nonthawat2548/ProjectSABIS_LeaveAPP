import { useEffect, useRef, useState } from 'react';
import {
  Wallet,
  CalendarDays,
  Bell,
  Users,
  Check,
  ArrowRight,
  UserRound,
  ShieldCheck,
  Eye,
  EyeOff,
  LoaderCircle,
} from 'lucide-react';

import { getDemoAccounts } from './data/demoDatabase.js';
import { DEMO_PASSWORD } from './domain/seed.js';
import { findLoginAccount, loginUsername } from './domain/auth.js';
import { roleLabels } from './components.jsx';
import { BrandMark } from './ui.jsx';
import { ThemeButton } from './ThemeButton.jsx';

export function Login({ onLogin, initialError, theme, onToggleTheme }) {
  const accounts = getDemoAccounts();
  const roles = ['Employee', 'Manager', 'HR'];
  const [selectedRole, setSelectedRole] = useState(null);
  const [email, setEmail] = useState(''),
    [password, setPassword] = useState(''),
    [error, setError] = useState(initialError),
    [busy, setBusy] = useState(false),
    [showPassword, setShowPassword] = useState(false);
  const submitting = useRef(false),
    mounted = useRef(true),
    emailInput = useRef(null);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  useEffect(() => {
    if (error && !busy) emailInput.current?.focus();
  }, [error, busy]);
  const selectedAccount = findLoginAccount(accounts, email);
  const roleAccounts = accounts.filter((account) => account.role === selectedRole);
  function chooseAccount(accountEmail) {
    setEmail(accountEmail ? loginUsername(accountEmail) : '');
    setPassword(accountEmail ? DEMO_PASSWORD : '');
    setError('');
    setShowPassword(false);
  }
  function chooseRole(role) {
    setSelectedRole(role);
    chooseAccount('');
  }
  function changeEmail(value) {
    setEmail(value);
    const account = findLoginAccount(accounts, value);
    setError('');
    if (account) setSelectedRole(account.role);
  }
  async function submit(e) {
    e.preventDefault();
    if (submitting.current) return;
    submitting.current = true;
    setBusy(true);
    setError('');
    try {
      await onLogin(email, password);
    } catch (failure) {
      if (mounted.current) setError(failure.message);
    } finally {
      submitting.current = false;
      if (mounted.current) setBusy(false);
    }
  }
  return (
    <div className="login-page">
      <div className="login-intro">
        <div className="intro-brand" lang="en">
          <span>
            <BrandMark />
          </span>
          leave<span className="brand-dot">.</span>
        </div>
        <div className="login-story">
          <span className="eyebrow" lang="en">
            <span className="pulse-dot" />
            Space for your balance
          </span>
          <h1>
            ระบบจัดการ
            <br />
            <span>การลา</span>
            <span className="story-star">✦</span>
          </h1>
          <p>
            ยื่นคำขอลา ตรวจสอบสิทธิ์
            <br />
            และติดตามผลการพิจารณา
          </p>
          <div className="login-illustration">
            <img src="/art/leave-garden.svg" alt="ภาพประกอบปฏิทินและต้นไม้" />
            <div className="floating-feature feature-approved">
              <span>
                <Check size={18} />
              </span>
              <div>
                <strong>ติดตามคำขอลา</strong>
                <small>ตรวจสอบสถานะคำขอ</small>
              </div>
            </div>
            <div className="floating-feature feature-balance">
              <span>
                <Wallet size={18} />
              </span>
              <div>
                <strong>ตรวจสอบสิทธิ์วันลา</strong>
                <small>ดูวันลาที่ใช้และคงเหลือ</small>
              </div>
            </div>
          </div>
        </div>
        <div className="login-benefits">
          <span>
            <ShieldCheck size={15} />
            สิทธิ์ตามบทบาท
          </span>
          <span>
            <CalendarDays size={15} />
            ปฏิทินวันลา
          </span>
          <span>
            <Bell size={15} />
            ติดตามผล
          </span>
        </div>
      </div>
      <div className="login-panel">
        <div className="login-topline">
          <span lang="en">Leave Management</span>
          <ThemeButton theme={theme} onToggle={onToggleTheme} />
        </div>
        <div className="login-card">
          <span className="login-kicker">
            <span className="status-dot" />
            ระบบจัดการการลา
          </span>
          <h2>
            เข้าสู่ระบบ<span>{' ✦'}</span>
          </h2>
          <p>กรอกชื่อผู้ใช้หรืออีเมลและรหัสผ่านเพื่อเข้าสู่ระบบ</p>
          <div className="demo-label">เลือกบทบาทก่อนเลือกบัญชีทดลอง</div>
          <div
            className="demo-accounts grid grid-cols-3 gap-[9px]"
            role="group"
            aria-label="เลือกบทบาท"
          >
            {roles.map((role) => {
              const members = accounts.filter((account) => account.role === role);
              const selected = selectedRole === role;
              return (
                <button
                  type="button"
                  key={role}
                  aria-pressed={selected}
                  disabled={busy || !members.length}
                  className={selected ? 'selected' : ''}
                  onClick={() => chooseRole(role)}
                >
                  <span className="account-icon">
                    {role === 'Employee' ? (
                      <UserRound size={18} />
                    ) : role === 'Manager' ? (
                      <Users size={18} />
                    ) : (
                      <ShieldCheck size={18} />
                    )}
                  </span>
                  <strong>{roleLabels[role]}</strong>
                  {selected && (
                    <span className="account-check">
                      <Check size={11} />
                    </span>
                  )}
                </button>
              );
            })}
          </div>
          <form onSubmit={submit} aria-busy={busy}>
            <div className="field">
              <label htmlFor="login-account">
                {selectedRole
                  ? `เลือกบัญชี${roleLabels[selectedRole]} (${roleAccounts.length} คน)`
                  : 'เลือกบัญชีทดลอง'}
              </label>
              <select
                id="login-account"
                value={selectedAccount?.email ?? ''}
                onChange={(e) => chooseAccount(e.target.value)}
                disabled={busy || !selectedRole}
              >
                <option value="">
                  {selectedRole ? 'เลือกบัญชีทดลอง หรือกรอกชื่อผู้ใช้เอง' : 'เลือกบทบาทด้านบนก่อน'}
                </option>
                {roleAccounts.map((account) => (
                  <option key={account.id} value={account.email}>
                    {account.name}
                    {' · '}
                    {loginUsername(account.email)}
                  </option>
                ))}
              </select>
            </div>
            <div className="field">
              <label htmlFor="login-email">ชื่อผู้ใช้หรืออีเมล</label>
              <input
                ref={emailInput}
                id="login-email"
                type="text"
                value={email}
                onChange={(e) => changeEmail(e.target.value)}
                autoComplete="username"
                autoCapitalize="none"
                spellCheck={false}
                disabled={busy}
                required
              />
            </div>
            <div className="field">
              <label htmlFor="login-password">รหัสผ่าน</label>
              <div className="password-input">
                <input
                  id="login-password"
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoComplete="current-password"
                  disabled={busy}
                  required
                />

                <button
                  type="button"
                  className="icon-btn"
                  aria-label={showPassword ? 'ซ่อนรหัสผ่าน' : 'แสดงรหัสผ่าน'}
                  onClick={() => setShowPassword((v) => !v)}
                >
                  {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
            </div>
            {error && (
              <div className="error" role="alert">
                {error}
              </div>
            )}
            <button
              className={'btn primary login-submit' + (busy ? ' is-busy' : '')}
              disabled={busy}
            >
              <span>{busy ? 'กำลังเข้าสู่ระบบ…' : 'เข้าสู่ระบบ'}</span>
              {busy ? (
                <LoaderCircle size={18} className="button-spinner" aria-hidden="true" />
              ) : (
                <ArrowRight size={18} />
              )}
            </button>
          </form>
        </div>
        <div className="login-bottom">
          ระบบจัดการการลาสำหรับพนักงาน
          <span lang="en">
            {'© '}
            {new Date().getFullYear()}
            {' Leave Management'}
          </span>
        </div>
      </div>
    </div>
  );
}
