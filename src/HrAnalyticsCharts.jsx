import { useEffect, useRef, useState } from 'react';
import { ArrowRight, CalendarDays, CheckCircle2, MessageSquare, Users, X } from 'lucide-react';
import { Badge, Card, Empty } from './components.jsx';
import { MonthChart } from './LeaveMonthChart.jsx';
import { canDecideRequest } from './domain/approvalRouting.js';
import { formatDate } from './domain/date.js';
import { requestCode } from './domain/service.js';
import { formatLeaveDays, statusLabels } from './labels.js';

const chartColors = [
  'var(--primary)',
  'var(--sky-ink)',
  'var(--purple-ink)',
  'var(--peach-ink)',
  'var(--red)',
];
const number = new Intl.NumberFormat('th-TH', { maximumFractionDigits: 1 });

/** Current assignments stay independent of the monthly analytics filters. */
export function HrWorkLinks({ db, actor, date }) {
  const verified = db.employees.find(
    (person) => person.id === actor.id && person.active && person.role === 'HR',
  );
  if (!verified) return null;
  const pending = db.requests.filter((request) => request.status === 'Pending');
  const decisions = pending.filter((request) => canDecideRequest(db, verified, request)).length;
  const consultations = pending.filter(
    (request) =>
      request.employeeId !== verified.id &&
      db.approvals.some(
        (step) =>
          step.leaveId === request.id &&
          step.approverId === verified.id &&
          step.reviewType === 'Consultation' &&
          !step.cancelled &&
          step.status === 'Pending',
      ),
  ).length;
  const activePeople = new Set(
    db.employees.filter((person) => person.active).map((person) => person.id),
  );
  const todayRequests = new Set(
    db.days.filter((day) => day.date === date && day.units > 0).map((day) => day.leaveId),
  );
  const onLeave = new Set(
    db.requests
      .filter(
        (request) =>
          request.status === 'Approved' &&
          activePeople.has(request.employeeId) &&
          todayRequests.has(request.id),
      )
      .map((request) => request.employeeId),
  ).size;
  return (
    <div className="hr-work-links" aria-label="งานของ HR และสถานะวันนี้">
      <span className="hr-work-date">
        <CalendarDays size={16} />
        วันนี้ {formatDate(date)}
      </span>
      <a href="#/approvals">
        <CheckCircle2 size={17} />
        <span>
          รอคุณอนุมัติ <strong>{decisions}</strong> คำขอ
        </span>
        <ArrowRight size={14} />
      </a>
      <a href="#/requests">
        <MessageSquare size={17} />
        <span>
          รอความเห็น <strong>{consultations}</strong> คำขอ
        </span>
        <ArrowRight size={14} />
      </a>
      <span>
        <Users size={17} />
        ลาวันนี้ <strong>{onLeave}</strong> คน
      </span>
    </div>
  );
}

function ChartLegend() {
  return (
    <div className="hr-chart-legend">
      <span>
        <i className="approved" />
        อนุมัติแล้ว
      </span>
      <span>
        <i className="pending" />
        รอพิจารณา
      </span>
    </div>
  );
}

function TypeChart({ report, onOpen }) {
  const items = report.byType.filter((item) => item.approvedDays + item.pendingDays > 0);
  const total = report.summary.approvedDays + report.summary.pendingDays;
  let offset = 0;
  return (
    <Card
      title="ประเภทการลา"
      className="hr-type-panel"
      action={
        <button
          type="button"
          className="text-link"
          onClick={(event) => onOpen('type', event.currentTarget)}
        >
          ดูรายละเอียด <ArrowRight size={15} />
        </button>
      }
    >
      <p className="hr-chart-caption">วันลาที่อนุมัติแล้วและรอพิจารณา · เดือนที่เลือก</p>
      {total > 0 ? (
        <>
          <div className="hr-donut-wrap">
            <svg className="hr-donut" viewBox="0 0 160 160" aria-hidden="true">
              <circle cx="80" cy="80" r="60" className="hr-donut-track" />
              {items.map((item, index) => {
                const share = ((item.approvedDays + item.pendingDays) / total) * 100;
                const start = offset;
                offset += share;
                return (
                  <circle
                    key={item.leaveTypeId}
                    cx="80"
                    cy="80"
                    r="60"
                    pathLength="100"
                    fill="none"
                    stroke={chartColors[index % chartColors.length]}
                    strokeWidth="18"
                    strokeDasharray={`${share} ${100 - share}`}
                    strokeDashoffset={-start}
                    transform="rotate(-90 80 80)"
                  />
                );
              })}
            </svg>
            <div className="hr-donut-label">
              <span>วันลารวม</span>
              <strong>{formatLeaveDays(total)}</strong>
            </div>
          </div>
          <ul className="hr-type-legend" aria-label="วันลาแยกตามประเภทในเดือนที่เลือก">
            {items.map((item, index) => (
              <li key={item.leaveTypeId}>
                <span
                  className="hr-chart-dot"
                  style={{ background: chartColors[index % chartColors.length] }}
                  aria-hidden="true"
                />
                <span>
                  {item.name}
                  <small>{number.format(item.share)}% ของวันลารวม</small>
                </span>
                <strong>{formatLeaveDays(item.approvedDays + item.pendingDays)}</strong>
              </li>
            ))}
          </ul>
        </>
      ) : (
        <Empty>เดือนนี้ยังไม่มีวันลา</Empty>
      )}
    </Card>
  );
}

function EmployeeRanking({ report, selected, onSelect }) {
  const [expanded, setExpanded] = useState(false);
  const people = report.approvedEmployees;
  const maximum = people[0]?.requestCount ?? 1;
  const leaders = people.filter((person) => person.requestCount === maximum);
  const shown = expanded ? people : people.slice(0, 5);
  return (
    <Card title="พนักงานที่มีคำขออนุมัติมากที่สุด" className="hr-ranking-panel">
      <p className="hr-chart-caption">นับจำนวนคำขอที่มีวันลาในเดือนที่เลือก · กดชื่อเพื่อดูคำขอ</p>
      {people.length ? (
        <>
          {leaders.length > 1 && (
            <p className="hr-tie-note">
              อันดับสูงสุดเท่ากัน:{' '}
              {leaders.map((person) => `${person.name} (${person.code})`).join(', ')}
            </p>
          )}
          <ol className="hr-ranking" aria-label="อันดับตามจำนวนคำขออนุมัติ">
            {shown.map((person) => (
              <li key={person.employeeId}>
                <button
                  type="button"
                  aria-pressed={selected === person.employeeId}
                  onClick={() => onSelect(person.employeeId)}
                  aria-label={`ดูคำขอของ ${person.name} ${person.code}`}
                >
                  <div className="hr-ranking-heading">
                    <span>
                      <strong>{person.name}</strong>
                      <small>{person.code}</small>
                    </span>
                    <span className="hr-ranking-count">
                      <strong>{person.requestCount} คำขอ</strong>
                      <small>{formatLeaveDays(person.days)} ในเดือนนี้</small>
                    </span>
                  </div>
                  <span className="hr-bar-track" aria-hidden="true">
                    <span style={{ width: `${(person.requestCount / maximum) * 100}%` }} />
                  </span>
                </button>
              </li>
            ))}
          </ol>
          {people.length > 5 && (
            <button className="text-link hr-show-more" onClick={() => setExpanded(!expanded)}>
              {expanded ? 'แสดง 5 คนแรก' : `ดูครบ ${people.length} คน`}
            </button>
          )}
        </>
      ) : (
        <Empty>ยังไม่มีคำขอที่อนุมัติในเดือนนี้</Empty>
      )}
    </Card>
  );
}

function DepartmentChart({ report, onOpen }) {
  const maximum = Math.max(
    1,
    ...report.byDepartment.map((item) => item.approvedDays + item.pendingDays),
  );
  return (
    <Card
      title="วันลาแยกตามแผนก"
      className="hr-department-panel"
      action={
        <button
          type="button"
          className="text-link"
          onClick={(event) => onOpen('department', event.currentTarget)}
        >
          ดูรายละเอียด <ArrowRight size={15} />
        </button>
      }
    >
      <p className="hr-chart-caption">ยอดวันลาในเดือนที่เลือก</p>
      <ChartLegend />
      {report.byDepartment.length ? (
        <ul className="hr-department-bars">
          {report.byDepartment.map((item) => (
            <li key={item.name}>
              <div>
                <strong>{item.name}</strong>
                <span>{formatLeaveDays(item.approvedDays + item.pendingDays)}</span>
              </div>
              <div
                className="hr-bar-track"
                role="img"
                aria-label={`${item.name} อนุมัติ ${formatLeaveDays(item.approvedDays)} รอพิจารณา ${formatLeaveDays(item.pendingDays)}`}
              >
                <span
                  className="approved"
                  style={{ width: `${(item.approvedDays / maximum) * 100}%` }}
                />
                <span
                  className="pending"
                  style={{ width: `${(item.pendingDays / maximum) * 100}%` }}
                />
              </div>
              <p>
                อนุมัติ {formatLeaveDays(item.approvedDays)} · รอพิจารณา{' '}
                {formatLeaveDays(item.pendingDays)}
              </p>
            </li>
          ))}
        </ul>
      ) : (
        <Empty>ไม่มีพนักงานในแผนกที่เลือก</Empty>
      )}
    </Card>
  );
}

function PeriodRequests({ report, db, employeeId, status, setStatus, onClear, headingRef }) {
  const [visible, setVisible] = useState(5);
  const rows = report.summary.requests
    .filter(
      ({ request }) =>
        (!employeeId || request.employeeId === employeeId) &&
        (status === 'all' || request.status === status),
    )
    .sort(
      (a, b) =>
        Number(b.request.status === 'Pending') - Number(a.request.status === 'Pending') ||
        b.request.id - a.request.id,
    );
  const people = new Map(report.rows.map((person) => [person.employeeId, person]));
  return (
    <Card className="hr-period-requests">
      <div className="hr-request-heading">
        <div>
          <h2 ref={headingRef} tabIndex={-1}>
            คำขอในเดือนที่เลือก
          </h2>
          <p>{rows.length} คำขอ · เรียงรายการรอพิจารณาก่อน</p>
        </div>
        <div className="field">
          <label htmlFor="hr-dashboard-status">สถานะคำขอ</label>
          <select
            id="hr-dashboard-status"
            value={status}
            onChange={(event) => {
              setStatus(event.target.value);
              setVisible(5);
            }}
          >
            <option value="all">ทุกสถานะ</option>
            {Object.entries(statusLabels).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </div>
      </div>
      {employeeId > 0 && (
        <div className="hr-selected-person">
          <span>
            {people.get(employeeId)?.name} · {people.get(employeeId)?.code}
          </span>
          <button type="button" className="text-link" onClick={onClear}>
            <X size={14} />
            ดูทุกคน
          </button>
        </div>
      )}
      {rows.length ? (
        <ul className="hr-request-list" aria-label="คำขอในรายงาน HR">
          {rows.slice(0, visible).map(({ request, periodDays }) => (
            <li key={request.id}>
              <div className="hr-request-person">
                <span
                  className={`avatar avatar-small avatar-color-${request.employeeId % 5}`}
                  aria-hidden="true"
                >
                  {people.get(request.employeeId)?.name[0]}
                </span>
                <span>
                  <strong>{people.get(request.employeeId)?.name}</strong>
                  <small>
                    {people.get(request.employeeId)?.code} · {requestCode(request)}
                  </small>
                </span>
              </div>
              <div className="hr-request-dates">
                <strong>
                  {db.leaveTypes.find((type) => type.id === request.leaveTypeId)?.name}
                </strong>
                <small>
                  {formatDate(request.startDate)}
                  {request.startDate !== request.endDate && ` – ${formatDate(request.endDate)}`}
                </small>
              </div>
              <div className="hr-request-days">
                <strong>{formatLeaveDays(periodDays)}</strong>
                <small>ในเดือนที่เลือก</small>
              </div>
              <Badge status={request.status} />
              <a
                className="hr-request-link"
                href={`#/request/${request.id}`}
                aria-label={`เปิดคำขอ ${requestCode(request)}`}
              >
                ดูคำขอ <ArrowRight size={16} />
              </a>
            </li>
          ))}
        </ul>
      ) : (
        <Empty>ไม่พบคำขอที่ตรงกับตัวกรอง</Empty>
      )}
      {rows.length > visible && (
        <button className="btn hr-show-more" onClick={() => setVisible((value) => value + 10)}>
          แสดงเพิ่มเติม ({rows.length - visible} คำขอ)
        </button>
      )}
    </Card>
  );
}

/** Receives only the verified, filtered projection from managementAnalytics. */
export function HrAnalyticsCharts({ report, db, onOpen }) {
  const [employeeId, setEmployeeId] = useState(0);
  const [status, setStatus] = useState('all');
  const headingRef = useRef(null);
  const yearApproved = report.monthly.reduce((total, month) => total + month.approvedDays, 0);
  const yearPending = report.monthly.reduce((total, month) => total + month.pendingDays, 0);
  useEffect(() => {
    if (employeeId) {
      headingRef.current?.focus({ preventScroll: true });
      headingRef.current?.scrollIntoView({ behavior: 'auto', block: 'center' });
    }
  }, [employeeId]);
  function selectEmployee(id) {
    setEmployeeId(id);
    setStatus('Approved');
    if (id === employeeId) headingRef.current?.focus();
  }
  return (
    <>
      <div className="hr-analytics-grid">
        <Card title={`แนวโน้มวันลา · ปี ${report.year + 543}`} className="hr-trend-panel">
          <div className="hr-trend-totals">
            <div>
              <span>อนุมัติแล้วทั้งปี</span>
              <strong>{formatLeaveDays(yearApproved)}</strong>
            </div>
            <div>
              <span>รอพิจารณาทั้งปี</span>
              <strong>{formatLeaveDays(yearPending)}</strong>
            </div>
          </div>
          <ChartLegend />
          <MonthChart months={report.monthly} month={0} showValues />
          <p className="hr-chart-caption">
            แสดงครบ 12 เดือน · รวมวันลาในอนาคต · .5 หมายถึงครึ่งวัน
          </p>
        </Card>
        <TypeChart report={report} onOpen={onOpen} />
        <EmployeeRanking report={report} selected={employeeId} onSelect={selectEmployee} />
        <DepartmentChart report={report} onOpen={onOpen} />
      </div>
      <PeriodRequests
        key={employeeId}
        report={report}
        db={db}
        employeeId={employeeId}
        status={status}
        setStatus={setStatus}
        headingRef={headingRef}
        onClear={() => {
          setEmployeeId(0);
          setStatus('all');
        }}
      />
    </>
  );
}
