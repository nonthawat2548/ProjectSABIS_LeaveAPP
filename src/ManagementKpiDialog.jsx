import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { Badge, Dialog, Empty } from './components.jsx';
import { managementAnalytics } from './domain/managementAnalytics.js';
import { employeeCode } from './domain/colleagues.js';
import { formatDate, formatDateTime, thaiMonths } from './domain/date.js';
import { requestCode } from './domain/service.js';
import { formatApprovalTime, formatLeaveDays } from './labels.js';

const titles = {
  rate: 'รายละเอียดอัตราการลา',
  approval: 'รายละเอียดระยะเวลาอนุมัติ',
  department: 'รายละเอียดการลาแยกตามแผนก',
  type: 'รายละเอียดการลาแยกตามประเภท',
};
/** @typedef {keyof typeof titles} KpiKind */
const number = new Intl.NumberFormat('th-TH', { maximumFractionDigits: 2 });

function RequestLinks({ db, ids, onClose, showStatus = false }) {
  return (
    <span className="management-detail-links">
      {ids.map((id) => {
        const request = db.requests.find((entry) => entry.id === id);
        if (!request) return null;
        const code = requestCode(request);
        return (
          <span className="management-detail-request" key={id}>
            {showStatus && <Badge status={request.status} />}
            <a
              className="text-link"
              href={`#/request/${id}`}
              aria-label={`เปิดคำขอ ${code}`}
              onClick={(event) => {
                if (!event.ctrlKey && !event.metaKey && !event.shiftKey && !event.altKey) onClose();
              }}
            >
              ดูคำขอ {code}
            </a>
          </span>
        );
      })}
    </span>
  );
}

function More({ visible, total, onMore }) {
  if (visible >= total) return null;
  return (
    <div className="management-detail-more">
      <span>
        แสดง {visible} จาก {total} รายการ
      </span>
      <button className="btn" onClick={onMore}>
        แสดงเพิ่มเติม
      </button>
    </div>
  );
}

function Facts({ items }) {
  return (
    <dl className="management-detail-facts">
      {items.map(([label, value]) => (
        <div key={label}>
          <dt>{label}</dt>
          <dd>{value}</dd>
        </div>
      ))}
    </dl>
  );
}

function Method({ children }) {
  return (
    <details className="management-detail-method">
      <summary>วิธีคิดตัวเลขนี้</summary>
      {children}
    </details>
  );
}

function AbsenceDetails({ report, db, onClose }) {
  const [previous, setPrevious] = useState(false);
  const [visible, setVisible] = useState(10);
  const rate = previous ? report.previousRate : report.rate;
  const period = previous ? report.previousPeriod : report;
  const people = new Map(report.rows.map((person) => [person.employeeId, person]));
  // Group the existing counted days by employee ID; keep every source date and request.
  const byPerson = new Map();
  for (const row of rate.details) {
    const person = byPerson.get(row.employeeId) ?? {
      employeeId: row.employeeId,
      units: 0,
      days: [],
    };
    person.units += row.units;
    person.days.push(row);
    byPerson.set(row.employeeId, person);
  }
  const rows = [...byPerson.values()].sort(
    (a, b) => b.units - a.units || a.employeeId - b.employeeId,
  );
  return (
    <>
      <div className="management-detail-tabs" aria-label="เดือนของรายละเอียดอัตราการลา">
        {[
          [false, 'เดือนที่เลือก'],
          [true, 'เดือนก่อน'],
        ].map(([value, label]) => (
          <button
            className="btn"
            key={label}
            aria-pressed={previous === value}
            onClick={() => {
              setPrevious(value);
              setVisible(10);
            }}
          >
            {label}
          </button>
        ))}
      </div>
      <div className="management-detail-summary">
        <span className="management-detail-eyebrow">
          อัตราการลา · {thaiMonths[period.month - 1]} {period.year + 543}
        </span>
        <strong className="management-detail-value">
          {rate.percent === null ? 'ยังคำนวณไม่ได้' : `${number.format(rate.percent)}%`}
        </strong>
        <p>เทียบวันลารวมกับวันทำงานของพนักงานทั้งหมดในกลุ่มนี้</p>
        <Facts
          items={[
            ['วันลาที่นับ', formatLeaveDays(rate.numerator)],
            ['พนักงาน', `${report.headcount} คน`],
            ['วันทำงานต่อคน', `${rate.workingDays} วัน`],
          ]}
        />
      </div>
      <p className="management-detail-note">รวมคำขอที่อนุมัติแล้วและรอพิจารณา รวมวันลาในอนาคต</p>
      <Method>
        <p>
          นำวันลาที่นับ {formatLeaveDays(rate.numerator)} หารด้วยวันทำงานรวมของทุกคน{' '}
          {number.format(rate.denominator)} วัน แล้วคูณ 100
        </p>
        <p>
          วันทำงานรวมมาจาก {rate.workingDays} วัน × พนักงาน {report.headcount} คน
          โดยใช้จำนวนพนักงานและปฏิทินวันหยุดปัจจุบัน
        </p>
        <p>
          ไม่นับเสาร์–อาทิตย์และวันหยุด นับสูงสุดคนละ 1 วันต่อวัน
          ยอดนี้อาจต่างจากวันลาคลอดที่รวมวันหยุด
        </p>
      </Method>
      {rows.length ? (
        <section role="region" aria-label="รายการวันลาที่นำมาคำนวณอัตรา">
          <h3 className="management-detail-heading">
            ใครลาบ้าง <small>{rows.length} คน</small>
          </h3>
          <ul className="management-detail-list">
            {rows.slice(0, visible).map((person) => (
              <li key={`${previous}:${person.employeeId}`}>
                <div className="management-detail-row-heading">
                  <div>
                    <strong>{people.get(person.employeeId)?.name}</strong>
                    <small>{employeeCode(person.employeeId)}</small>
                  </div>
                  <strong className="management-detail-amount">
                    {formatLeaveDays(person.units)}
                  </strong>
                </div>
                <details className="management-detail-dates">
                  <summary>ดูวันที่ลาและคำขอ</summary>
                  <ul>
                    {person.days.map((row) => (
                      <li key={row.date}>
                        <div className="management-detail-date-line">
                          <time dateTime={row.date}>{formatDate(row.date)}</time>
                          <strong>{formatLeaveDays(row.units)}</strong>
                        </div>
                        {row.rawUnits > row.units && (
                          <p className="management-detail-note">
                            คำขอรวม {formatLeaveDays(row.rawUnits)} · นับสูงสุด 1 วัน
                          </p>
                        )}
                        <RequestLinks db={db} ids={row.requestIds} onClose={onClose} showStatus />
                      </li>
                    ))}
                  </ul>
                </details>
              </li>
            ))}
          </ul>
          <More
            visible={visible}
            total={rows.length}
            onMore={() => setVisible((value) => value + 10)}
          />
        </section>
      ) : (
        <Empty>ไม่มีวันลาที่นำมาคำนวณในเดือนนี้</Empty>
      )}
    </>
  );
}

function ApprovalDetails({ report, db, onClose }) {
  const [visible, setVisible] = useState(10);
  const requests = new Map(
    report.summary.requests.map((entry) => [entry.request.id, entry.request]),
  );
  const people = new Map(report.rows.map((person) => [person.employeeId, person]));
  return (
    <>
      <div className="management-detail-summary">
        <span className="management-detail-eyebrow">ตั้งแต่ยื่นคำขอจนอนุมัติ</span>
        <strong className="management-detail-value">
          {report.averageApprovalMs === null
            ? 'ยังไม่มีข้อมูล'
            : `เฉลี่ย ${formatApprovalTime(report.averageApprovalMs)}`}
        </strong>
        <p>คำนวณจาก {report.approvalCount} คำขอที่อนุมัติแล้ว</p>
        {report.missingApprovalTimes > 0 && (
          <p>
            ไม่รวม {report.missingApprovalTimes} คำขอที่เวลาไม่ครบหรือไม่ถูกต้อง
            ดูเหตุผลในรายการด้านล่าง
          </p>
        )}
      </div>
      <Method>
        <p>หาค่าเฉลี่ยของเวลาตั้งแต่ยื่นจนถึงผลอนุมัติสุดท้าย เฉพาะคำขอที่มีวันลาในเดือนที่เลือก</p>
        <p>ไม่นับเวลาส่งความเห็นของ HR ผลพิจารณาที่ถูกยกเลิก หรือรายการที่เวลาไม่ถูกต้อง</p>
      </Method>
      {report.approvalDetails.length ? (
        <section role="region" aria-label="เวลาพิจารณารายคำขอ">
          <h3 className="management-detail-heading">
            แต่ละคำขอใช้เวลานานแค่ไหน <small>{report.approvalDetails.length} คำขอ</small>
          </h3>
          <ul className="management-detail-list">
            {report.approvalDetails.slice(0, visible).map((row) => {
              const person = people.get(requests.get(row.requestId)?.employeeId);
              return (
                <li key={row.requestId}>
                  <div className="management-detail-row-heading">
                    <div>
                      <strong>{person?.name}</strong>
                      <small>{person?.code}</small>
                    </div>
                    <strong className="management-detail-amount">
                      {row.elapsedMs === null ? 'ไม่นำมาคำนวณ' : formatApprovalTime(row.elapsedMs)}
                    </strong>
                  </div>
                  {row.issue && <p className="management-detail-note">{row.issue}</p>}
                  <Facts
                    items={[
                      ['ยื่นคำขอ', formatDateTime(row.submittedAt)],
                      ['อนุมัติ', formatDateTime(row.reviewedAt ?? '')],
                    ]}
                  />
                  <RequestLinks db={db} ids={[row.requestId]} onClose={onClose} />
                </li>
              );
            })}
          </ul>
          <More
            visible={visible}
            total={report.approvalDetails.length}
            onMore={() => setVisible((value) => value + 10)}
          />
        </section>
      ) : (
        <Empty>ยังไม่มีคำขอที่อนุมัติในช่วงนี้</Empty>
      )}
    </>
  );
}

function RequestDetails({ report, db, items, onClose }) {
  const [visible, setVisible] = useState(10);
  const people = new Map(report.rows.map((person) => [person.employeeId, person]));
  return items.length ? (
    <section role="region" aria-label="คำขอที่ประกอบเป็นยอดการลา">
      <h3 className="management-detail-heading">
        คำขอในรายการนี้ <small>{items.length} คำขอ</small>
      </h3>
      <ul className="management-detail-list">
        {items.slice(0, visible).map(({ request, periodDays }) => {
          const person = people.get(request.employeeId);
          return (
            <li key={request.id}>
              <div className="management-detail-row-heading">
                <div>
                  <strong>{person?.name}</strong>
                  <small>{person?.code}</small>
                </div>
                <div className="management-detail-amount">
                  <strong>{formatLeaveDays(periodDays)}</strong>
                  <small>ในเดือนที่เลือก</small>
                </div>
              </div>
              <p className="management-detail-leave-type">
                {db.leaveTypes.find((type) => type.id === request.leaveTypeId)?.name}
              </p>
              <p className="management-detail-note">
                {formatDate(request.startDate)}
                {request.endDate !== request.startDate && ` – ${formatDate(request.endDate)}`}
              </p>
              <RequestLinks db={db} ids={[request.id]} onClose={onClose} showStatus />
            </li>
          );
        })}
      </ul>
      <More
        visible={visible}
        total={items.length}
        onMore={() => setVisible((value) => value + 10)}
      />
    </section>
  ) : (
    <Empty>ไม่มีคำขออนุมัติหรือรอพิจารณาในรายการที่เลือก</Empty>
  );
}

function GroupDetails({ report, db, kind, onClose }) {
  const isDepartment = kind === 'department';
  const groups = isDepartment ? report.byDepartment : report.byType;
  const top = isDepartment ? report.topDepartments : report.topTypes;
  const [group, setGroup] = useState(() =>
    top.length === 1
      ? isDepartment
        ? report.topDepartments[0].name
        : String(report.topTypes[0].leaveTypeId)
      : '',
  );
  const people = new Map(report.rows.map((person) => [person.employeeId, person]));
  const selected = groups.find(
    (item) => (isDepartment ? item.name : String(item.leaveTypeId)) === group,
  );
  const items = report.summary.requests.filter(
    ({ request }) =>
      ['Pending', 'Approved'].includes(request.status) &&
      (!group ||
        (isDepartment
          ? people.get(request.employeeId)?.department === group
          : request.leaveTypeId === Number(group))),
  );
  const approvedDays = items
    .filter((item) => item.request.status === 'Approved')
    .reduce((total, item) => total + item.periodDays, 0);
  const pendingDays = items
    .filter((item) => item.request.status === 'Pending')
    .reduce((total, item) => total + item.periodDays, 0);
  return (
    <>
      <div className="field management-detail-picker">
        <label htmlFor="kpi-detail-group">
          {isDepartment ? 'เลือกแผนกเพื่อดูคำขอ' : 'เลือกประเภทเพื่อดูคำขอ'}
        </label>
        <select
          id="kpi-detail-group"
          value={group}
          onChange={(event) => setGroup(event.target.value)}
        >
          <option value="">{isDepartment ? 'ทุกแผนกตามตัวกรอง' : 'ทุกประเภทตามตัวกรอง'}</option>
          {groups.map((item) => (
            <option
              key={isDepartment ? item.name : item.leaveTypeId}
              value={isDepartment ? item.name : item.leaveTypeId}
            >
              {item.name}
            </option>
          ))}
        </select>
      </div>
      <div className="management-detail-summary">
        <span className="management-detail-eyebrow">
          {group
            ? (selected?.name ?? 'ไม่พบรายการที่เลือก')
            : isDepartment
              ? 'ทุกแผนกตามตัวกรอง'
              : 'ทุกประเภทตามตัวกรอง'}
        </span>
        <strong className="management-detail-value">
          รวม {formatLeaveDays(approvedDays + pendingDays)}
        </strong>
        <Facts
          items={[
            ['อนุมัติแล้ว', formatLeaveDays(approvedDays)],
            ['รอพิจารณา', formatLeaveDays(pendingDays)],
          ]}
        />
      </div>
      <p className="management-detail-note">นับเฉพาะวันลาในเดือนที่เลือก รวมวันลาในอนาคต</p>
      {top.length > 1 && (
        <p className="management-detail-note">
          ยอดสูงสุดเท่ากัน: {top.map((item) => item.name).join(', ')}
        </p>
      )}
      <details className="management-detail-method management-detail-comparison">
        <summary>{isDepartment ? 'เปรียบเทียบทุกแผนก' : 'เปรียบเทียบทุกประเภทการลา'}</summary>
        <ul
          className="management-detail-ranking"
          aria-label={isDepartment ? 'ยอดการลาของแต่ละแผนก' : 'ยอดการลาของแต่ละประเภท'}
        >
          {groups.map((item) => {
            const key = isDepartment ? item.name : String(item.leaveTypeId);
            const highest =
              item.approvedDays + item.pendingDays > 0 &&
              (isDepartment
                ? report.topDepartments.some((entry) => entry.name === item.name)
                : report.topTypes.some((entry) => entry.leaveTypeId === item.leaveTypeId));
            return (
              <li key={key}>
                <button type="button" aria-pressed={group === key} onClick={() => setGroup(key)}>
                  <span>
                    <strong>{item.name}</strong>
                    {highest && <small>ยอดสูงสุด{top.length > 1 ? ' (เท่ากัน)' : ''}</small>}
                    <small>
                      อนุมัติ {formatLeaveDays(item.approvedDays)} · รอพิจารณา{' '}
                      {formatLeaveDays(item.pendingDays)}
                    </small>
                  </span>
                  <strong>{formatLeaveDays(item.approvedDays + item.pendingDays)}</strong>
                </button>
              </li>
            );
          })}
        </ul>
      </details>
      <RequestDetails key={group} report={report} db={db} items={items} onClose={onClose} />
    </>
  );
}

/** @param {Pick<import('./pages/types.js').PageProps, 'db' | 'actor'> & {filters: import('./domain/managementAnalytics.js').AnalyticsFilters, kind: KpiKind, onClose: () => void, onOpenChange?: (open: boolean) => void, trigger: HTMLElement | null}} props */
export function ManagementKpiDialog({ db, actor, filters, kind, onClose, onOpenChange, trigger }) {
  useEffect(() => {
    onOpenChange?.(true);
    return () => onOpenChange?.(false);
  }, [onOpenChange]);
  const result = useMemo(() => {
    try {
      return { report: managementAnalytics(db, actor, filters), error: '' };
    } catch (error) {
      return { report: null, error: error.message };
    }
  }, [db, actor, filters.year, filters.month, filters.department, filters.leaveTypeId]);
  function restoreFocus() {
    requestAnimationFrame(() => {
      if (trigger?.isConnected && !document.querySelector('.dialog[aria-modal="true"]'))
        trigger.focus();
    });
  }
  const report = result.report;
  return createPortal(
    <div
      className="management-detail-overlay"
      onKeyDownCapture={(event) => {
        if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
          event.preventDefault();
          event.stopPropagation();
        }
      }}
    >
      <Dialog
        title={titles[kind]}
        className="management-detail-dialog"
        onClose={onClose}
        restoreFocus={restoreFocus}
      >
        <div className="management-detail-content">
          {report ? (
            <>
              <p className="management-detail-context">
                {report.scope} · {thaiMonths[report.month - 1]} {report.year + 543}
                {(report.department || report.leaveTypeId !== 0) && (
                  <span>
                    {[
                      report.department,
                      db.leaveTypes.find((type) => type.id === report.leaveTypeId)?.name,
                    ]
                      .filter(Boolean)
                      .join(' · ')}
                  </span>
                )}
              </p>
              {kind === 'rate' ? (
                <AbsenceDetails report={report} db={db} onClose={onClose} />
              ) : kind === 'approval' ? (
                <ApprovalDetails report={report} db={db} onClose={onClose} />
              ) : (
                <GroupDetails report={report} db={db} kind={kind} onClose={onClose} />
              )}
            </>
          ) : (
            <p className="error" role="alert">
              {result.error}
            </p>
          )}
        </div>
      </Dialog>
    </div>,
    document.body,
  );
}
