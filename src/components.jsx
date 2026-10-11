import { useEffect, useId, useRef, useState } from 'react';
import {
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  X,
  FileText,
  Download,
  ArrowUpRight,
} from 'lucide-react';

import { formatDate, formatDateTime, parseThaiDate, thaiMonths, today } from './domain/date.js';
import { requestCode, totalDays } from './domain/service.js';
import { documentBlob } from './domain/documentCodec.js';
import { repository } from './data/index.js';
import { statusLabels } from './labels.js';
export { statusLabels, roleLabels } from './labels.js';
export function Badge({ status }) {
  return <span className={'badge ' + status.toLowerCase()}>{statusLabels[status]}</span>;
}
export function Card({ title, children, action, className = '' }) {
  return (
    <section className={'card ' + className}>
      {title && (
        <div className="card-head">
          <h2>{title}</h2>
          {action}
        </div>
      )}
      <div className="card-body">{children}</div>
    </section>
  );
}
export function Heading({ title, description, action }) {
  return (
    <div className="page-heading flex flex-wrap items-start justify-between gap-[18px]">
      <div>
        <h1>{title}</h1>
        {description && <p>{description}</p>}
      </div>
      {action}
    </div>
  );
}
export function Empty({ children }) {
  return (
    <div className="empty">
      <CalendarDays size={27} />
      <p>{children}</p>
    </div>
  );
}
export function KeyRow({ label, children }) {
  return (
    <div className="key-row">
      <span>{label}</span>
      <strong>{children}</strong>
    </div>
  );
}
export function Stat({ title, value, note, icon, tone = 'mint' }) {
  return (
    <div className={'stat tone-' + tone}>
      <div className="stat-head">
        <span>{title}</span>
        <span className="stat-icon">{icon}</span>
      </div>
      <div className="stat-value">{value}</div>
      <p>{note}</p>
      <span className="stat-corner" aria-hidden="true" />
    </div>
  );
}
export function DateField({ label, value, onChange, required = false, disabled = false }) {
  const id = useId();
  const [open, setOpen] = useState(false);
  const [month, setMonth] = useState(() => {
    const d = parseThaiDate(value) ?? today();
    return d.slice(0, 7) + '-01';
  });
  const box = useRef(null);
  const input = useRef(null);
  const selected = parseThaiDate(value);
  const y = Number(month.slice(0, 4)),
    m = Number(month.slice(5, 7));
  useEffect(() => {
    if (!open) return;
    const close = (e) => {
      if (!box.current?.contains(e.target)) setOpen(false);
    };
    document.addEventListener('pointerdown', close);
    return () => document.removeEventListener('pointerdown', close);
  }, [open]);
  function shift(n) {
    const d = new Date(month + 'T00:00:00Z');
    d.setUTCMonth(d.getUTCMonth() + n);
    setMonth(d.toISOString().slice(0, 10));
  }
  const first = new Date(month + 'T00:00:00Z').getUTCDay();
  const count = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return (
    <div
      className="field date-field"
      ref={box}
      onKeyDown={(e) => {
        if (e.key === 'Escape') {
          setOpen(false);
          input.current?.focus();
        }
      }}
    >
      <label htmlFor={id}>
        {label}
        {required && <span className="required">{' *'}</span>}
      </label>
      <div className="date-input">
        <input
          ref={input}
          id={id}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onBlur={() => {
            const d = parseThaiDate(value);
            if (d) onChange(formatDate(d));
          }}
          placeholder="5/12/2569"
          inputMode="numeric"
          maxLength={10}
          required={required}
          disabled={disabled}
          aria-describedby={id + '-hint'}
          aria-invalid={value !== '' && !selected}
        />

        <button
          type="button"
          aria-label={'เลือก' + label}
          disabled={disabled}
          aria-expanded={open}
          onClick={() => {
            if (selected) setMonth(selected.slice(0, 7) + '-01');
            setOpen(!open);
          }}
        >
          <CalendarDays size={18} />
        </button>
      </div>
      <small id={id + '-hint'}>วัน/เดือน/ปี พ.ศ. เช่น 5/12/2569</small>
      {open && (
        <div className="date-picker" role="dialog" aria-label={'ปฏิทินเลือก' + label}>
          <div className="picker-head">
            <button type="button" aria-label="เดือนก่อนหน้า" onClick={() => shift(-1)}>
              <ChevronLeft size={17} />
            </button>
            <select
              aria-label="เดือน"
              value={m}
              onChange={(e) => setMonth(`${y}-${e.target.value.padStart(2, '0')}-01`)}
            >
              {thaiMonths.map((s, i) => (
                <option key={s} value={i + 1}>
                  {s}
                </option>
              ))}
            </select>
            <select
              aria-label="ปี พ.ศ."
              value={y}
              onChange={(e) => setMonth(`${e.target.value}-${String(m).padStart(2, '0')}-01`)}
            >
              {Array.from({ length: 21 }, (_, i) => y - 10 + i).map((n) => (
                <option key={n} value={n}>
                  {n + 543}
                </option>
              ))}
            </select>
            <button type="button" aria-label="เดือนถัดไป" onClick={() => shift(1)}>
              <ChevronRight size={17} />
            </button>
          </div>
          <div className="picker-grid">
            {['อา', 'จ', 'อ', 'พ', 'พฤ', 'ศ', 'ส'].map((s, i) => (
              <span key={i}>{s}</span>
            ))}
            {Array.from({ length: first }, (_, i) => (
              <span key={'e' + i} />
            ))}
            {Array.from({ length: count }, (_, i) => {
              const iso = `${y}-${String(m).padStart(2, '0')}-${String(i + 1).padStart(2, '0')}`;
              return (
                <button
                  type="button"
                  key={iso}
                  aria-label={formatDate(iso)}
                  aria-pressed={iso === selected}
                  className={
                    (iso === selected ? 'selected ' : '') + (iso === today() ? 'today' : '')
                  }
                  onClick={() => {
                    onChange(formatDate(iso));
                    setOpen(false);
                    input.current?.focus();
                  }}
                >
                  {i + 1}
                </button>
              );
            })}
          </div>
          <div className="picker-foot">
            <button
              type="button"
              onClick={() => {
                onChange(formatDate(today()));
                setOpen(false);
              }}
            >
              วันนี้
            </button>
            <button type="button" onClick={() => setOpen(false)}>
              ปิด
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
export function RequestTable({ db, requests, showEmployee = false }) {
  if (!requests.length) return <Empty>ไม่พบคำขอที่ตรงกับตัวกรอง</Empty>;
  return (
    <div className="request-list">
      <div className="table-scroll request-table">
        <table>
          <thead>
            <tr>
              <th>เลขคำขอ</th>
              {showEmployee && <th>พนักงาน</th>}
              <th>ประเภทการลา</th>
              <th>ช่วงวันที่ (พ.ศ.)</th>
              <th>วันลา</th>
              <th>สถานะ</th>
              <th>
                <span className="sr-only">รายละเอียด</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {requests.map((r) => (
              <tr key={r.id}>
                <td>
                  <a className="code-link" href={'#/request/' + r.id}>
                    {requestCode(r)}
                  </a>
                  <small>{formatDateTime(r.requestDate)}</small>
                </td>
                {showEmployee && (
                  <td>
                    <div className="person-cell">
                      <span className={'avatar avatar-small avatar-color-' + (r.employeeId % 5)}>
                        {db.employees.find((e) => e.id === r.employeeId)?.name[0] ?? 'พ'}
                      </span>
                      <span>
                        {db.employees.find((e) => e.id === r.employeeId)?.name ?? 'พนักงาน'}
                      </span>
                    </div>
                  </td>
                )}
                <td>
                  <span className={'leave-type-tag type-' + r.leaveTypeId}>
                    {db.leaveTypes.find((t) => t.id === r.leaveTypeId)?.name}
                  </span>
                </td>
                <td className="nowrap">
                  {formatDate(r.startDate)}
                  {r.startDate !== r.endDate && (
                    <>
                      {' – '}
                      {formatDate(r.endDate)}
                    </>
                  )}
                </td>
                <td>
                  <strong className="days-number">{totalDays(db, r.id)}</strong>
                </td>
                <td>
                  <Badge status={r.status} />
                </td>
                <td>
                  <a
                    href={'#/request/' + r.id}
                    className="row-action"
                    aria-label={'ดูรายละเอียด ' + requestCode(r)}
                  >
                    <ArrowUpRight size={17} />
                  </a>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <ul className="request-cards" aria-label="รายการคำขอ">
        {requests.map((request) => (
          <li key={request.id}>
            <div className="request-card-header">
              <a
                className="code-link"
                href={'#/request/' + request.id}
                aria-label={'ดูรายละเอียด ' + requestCode(request)}
              >
                {requestCode(request)}
                <ArrowUpRight size={16} />
              </a>
              <Badge status={request.status} />
            </div>
            <time dateTime={request.requestDate}>{formatDateTime(request.requestDate)}</time>
            {showEmployee && (
              <p className="request-card-person">
                {db.employees.find((employee) => employee.id === request.employeeId)?.name ??
                  'พนักงาน'}
              </p>
            )}
            <dl className="request-card-details">
              <div>
                <dt>ประเภทการลา</dt>
                <dd>{db.leaveTypes.find((type) => type.id === request.leaveTypeId)?.name}</dd>
              </div>
              <div>
                <dt>วันลา</dt>
                <dd>
                  {totalDays(db, request.id)}
                  {' วัน'}
                  {request.duration !== 'Full' && (
                    <small>{request.duration === 'AM' ? 'ครึ่งวันเช้า' : 'ครึ่งวันบ่าย'}</small>
                  )}
                </dd>
              </div>
              <div className="request-card-dates">
                <dt>ช่วงวันที่ (พ.ศ.)</dt>
                <dd>
                  {formatDate(request.startDate)}
                  {request.startDate !== request.endDate && (
                    <>
                      {' – '}
                      {formatDate(request.endDate)}
                    </>
                  )}
                </dd>
              </div>
            </dl>
          </li>
        ))}
      </ul>
    </div>
  );
}
function documentSize(bytes) {
  return bytes >= 1024 * 1024
    ? (bytes / (1024 * 1024)).toLocaleString('th-TH', { maximumFractionDigits: 1 }) + ' MB'
    : Math.max(1, Math.round(bytes / 1024)) + ' KB';
}
export function DocumentRow({ document: doc }) {
  const [error, setError] = useState(''),
    [downloading, setDownloading] = useState(false);
  const downloadingRef = useRef(false);
  async function download() {
    if (downloadingRef.current) return;
    downloadingRef.current = true;
    setDownloading(true);
    setError('');
    try {
      const blob = doc.remote ? await repository.downloadDocument?.(doc) : documentBlob(doc);
      if (!blob) throw new Error('ไม่สามารถดาวน์โหลดเอกสารได้ กรุณาติดต่อผู้ดูแลระบบ');
      const url = URL.createObjectURL(blob);
      const a = window.document.createElement('a');
      a.href = url;
      a.download = doc.fileName;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (e) {
      setError(e.message);
    } finally {
      downloadingRef.current = false;
      setDownloading(false);
    }
  }
  return (
    <div>
      <div className="file-row">
        <FileText size={21} />
        <div className="file-info">
          <strong title={doc.fileName}>{doc.fileName}</strong>
          <small>
            {documentSize(doc.fileSize)}
            {' · '}
            {formatDateTime(doc.uploadedAt)}
          </small>
        </div>
        <button
          className="btn small"
          type="button"
          disabled={downloading}
          aria-busy={downloading}
          onClick={() => void download()}
        >
          <Download size={15} />
          {downloading ? 'กำลังดาวน์โหลด…' : 'เปิด / ดาวน์โหลด'}
        </button>
      </div>
      {doc.storageKey.startsWith('demo/') && <p className="tiny">เอกสารตัวอย่างสำหรับทดสอบระบบ</p>}
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
export function Dialog({ title, children, onClose, className = '', restoreFocus = null }) {
  const ref = useRef(null);
  const previous = useRef(null);
  useEffect(() => {
    previous.current = document.activeElement;
    const old = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    (
      ref.current?.querySelector('input:not(:disabled),textarea:not(:disabled)') ??
      ref.current?.querySelector('button:not(:disabled)')
    )?.focus();
    return () => {
      document.body.style.overflow = old;
      if (restoreFocus) restoreFocus();
      else previous.current?.focus();
    };
  }, []);
  return (
    <div
      className="dialog-shade"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className={'dialog' + (className ? ' ' + className : '')}
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onKeyDown={(e) => {
          if (e.key === 'Escape') onClose();
          if (e.key === 'Tab') {
            const f = Array.from(
              ref.current?.querySelectorAll(
                'button:not(:disabled),input:not(:disabled),textarea:not(:disabled),select:not(:disabled),a[href]',
              ) ?? [],
            );
            const first = f[0],
              last = f.at(-1);
            if (e.shiftKey && document.activeElement === first) {
              e.preventDefault();
              last?.focus();
            } else if (!e.shiftKey && document.activeElement === last) {
              e.preventDefault();
              first?.focus();
            }
          }
        }}
      >
        <div className="dialog-head">
          <h2>{title}</h2>
          <button type="button" className="icon-btn" aria-label="ปิด" onClick={onClose}>
            <X size={20} />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
export function monthShift(iso, n) {
  const d = new Date(iso.slice(0, 7) + '-01T00:00:00Z');
  d.setUTCMonth(d.getUTCMonth() + n);
  return d.toISOString().slice(0, 10);
}
