import { useMemo, useRef, useState } from 'react';
import {
  ArrowLeft,
  ArrowUpRight,
  CalendarDays,
  CheckCircle2,
  Clock3,
  FileText,
  RotateCcw,
  ShieldCheck,
  Send,
} from 'lucide-react';

import { Badge, Card, Empty, Heading, Stat } from '../components.jsx';
import { EmployeeProfileLink } from '../EmployeeProfileLink.jsx';
import { EmployeeLabel } from '../EmployeeLabel.jsx';
import { MonthChart } from '../LeaveMonthChart.jsx';
import { formatDate, formatDateTime, thaiMonths, today } from '../domain/date.js';
import { leaveSummaryPeople, leaveSummaryYears, summarizeLeave } from '../domain/leaveSummary.js';
import { useTask } from './useTask.js';
import { requestCode } from '../domain/service.js';
import { statusLabels } from '../labels.js';

const number = new Intl.NumberFormat('th-TH', { maximumFractionDigits: 2 });
const count = (value) => number.format(value);
const scopeLabels = {
  Employee: 'คำขอลาของคุณ',
  Manager: 'คำขอลาของคุณและพนักงานในทีม',
  HR: 'คำขอลาทั้งหมดที่คุณมีสิทธิ์ดู',
};

/** @param {import('./types.js').PageProps} props */
export function LeaveSummaryPage({ db, actor, run }) {
  const currentYear = Number(today().slice(0, 4));
  const [year, setYear] = useState(currentYear);
  const [month, setMonth] = useState(0);
  const [leaveTypeId, setLeaveTypeId] = useState(0);
  const [visible, setVisible] = useState(8);
  const [employeeId, setEmployeeId] = useState(0);
  const [hrId, setHrId] = useState(0);
  const [sent, setSent] = useState(false);
  const sending = useRef(false);
  const { busy, error, perform } = useTask(run);
  const people = useMemo(() => leaveSummaryPeople(db, actor), [db, actor]);
  const selectedPerson = people.find((person) => person.id === employeeId);
  const hrs = db.employees.filter((person) => person.role === 'HR' && person.active);
  const recipient = hrs.find((hr) => hr.id === hrId)?.id || hrs[0]?.id || 0;
  const effectiveEmployeeId = selectedPerson?.id || 0;
  const selectionUnavailable = !!employeeId && !selectedPerson;
  const years = useMemo(
    () => [...new Set([year, ...leaveSummaryYears(db, actor, currentYear)])].sort((a, b) => b - a),
    [db, actor, year, currentYear],
  );
  const summary = useMemo(
    () => summarizeLeave(db, actor, { year, month, leaveTypeId, employeeId: effectiveEmployeeId }),
    [db, actor, year, month, leaveTypeId, effectiveEmployeeId],
  );
  const period = month ? `${thaiMonths[month - 1]} ${year + 543}` : `ปี ${year + 543}`;
  const employee = actor.role === 'Employee';
  const rows = summary.requests.slice(0, visible);
  const typeMaximum = Math.max(
    1,
    ...summary.byType.map((item) => item.approvedDays + item.pendingDays),
  );

  function resetFilters() {
    setYear(currentYear);
    setMonth(0);
    setLeaveTypeId(0);
    setVisible(8);
    setEmployeeId(0);
  }

  async function sendReport() {
    if (sending.current || selectionUnavailable) return;
    sending.current = true;
    setSent(false);
    const success = await perform({
      type: 'sendLeaveReport',
      employeeId,
      hrId: recipient,
      year,
      month,
      leaveTypeId,
    });
    setSent(success);
    sending.current = false;
  }

  return (
    <div className="leave-summary-page">
      <Heading
        title="สรุปการลา"
        description="เลือกช่วงวันที่ลาเพื่อดูจำนวนคำขอและวันลาตามสิทธิ์ของคุณ"
        action={
          <a className="btn" href="#/dashboard">
            <ArrowLeft size={17} aria-hidden="true" />
            กลับหน้าหลัก
          </a>
        }
      />
      <Card className="leave-summary-filters">
        {!employee && (
          <div className="field leave-summary-person-picker">
            <label htmlFor="summary-person">พนักงานที่สรุป</label>
            <select
              id="summary-person"
              value={effectiveEmployeeId}
              disabled={busy}
              onChange={(event) => {
                setEmployeeId(Number(event.target.value));
                setVisible(8);
              }}
            >
              <option value={0}>ทุกคนที่มีสิทธิ์ดู</option>
              {people.map((person) => (
                <option key={person.id} value={person.id}>
                  {person.name} · EMP-{String(person.id).padStart(5, '0')}
                  {!person.active ? ' · บัญชีไม่ใช้งาน' : ''}
                </option>
              ))}
            </select>
            {actor.role === 'Manager' && (
              <small>เลือกดูรายคนได้เฉพาะทีมที่คุณดูแล ข้อมูลการลาของ HR จะไม่แสดง</small>
            )}
            {selectionUnavailable && (
              <p className="error" role="alert">
                สิทธิ์ของพนักงานที่เลือกเปลี่ยนแล้ว ขณะนี้แสดงสรุปตามสิทธิ์ปัจจุบัน
                กรุณาเลือกใหม่ก่อนส่งรายงาน
              </p>
            )}
          </div>
        )}
        <div className="leave-summary-filter-grid">
          <div className="field">
            <label htmlFor="summary-year">ปีที่สรุป (พ.ศ.)</label>
            <select
              id="summary-year"
              disabled={busy}
              value={year}
              onChange={(event) => {
                setYear(Number(event.target.value));
                setVisible(8);
              }}
            >
              {years.map((value) => (
                <option key={value} value={value}>
                  {value + 543}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label htmlFor="summary-month">เดือนที่สรุป</label>
            <select
              id="summary-month"
              disabled={busy}
              value={month}
              onChange={(event) => {
                setMonth(Number(event.target.value));
                setVisible(8);
              }}
            >
              <option value={0}>ทุกเดือน</option>
              {thaiMonths.map((name, index) => (
                <option key={name} value={index + 1}>
                  {name}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label htmlFor="summary-type">ประเภทการลา</label>
            <select
              id="summary-type"
              disabled={busy}
              value={leaveTypeId}
              onChange={(event) => {
                setLeaveTypeId(Number(event.target.value));
                setVisible(8);
              }}
            >
              <option value={0}>ทุกประเภท</option>
              {db.leaveTypes.map((type) => (
                <option key={type.id} value={type.id}>
                  {type.name}
                </option>
              ))}
            </select>
          </div>
          <button className="btn" type="button" disabled={busy} onClick={resetFilters}>
            <RotateCcw size={16} aria-hidden="true" />
            ล้างตัวกรอง
          </button>
        </div>
        <div className="leave-summary-scope">
          <ShieldCheck size={17} aria-hidden="true" />
          <span>
            {selectedPerson ? `คำขอลาของ ${selectedPerson.name}` : scopeLabels[actor.role]} ·{' '}
            {period}
          </span>
        </div>
      </Card>

      {selectedPerson && (
        <Card className="leave-summary-selected-person">
          <strong>
            {selectedPerson.name} · EMP-{String(selectedPerson.id).padStart(5, '0')}
          </strong>
          <p>
            <EmployeeLabel value={selectedPerson.position} kind="position" /> ·{' '}
            <EmployeeLabel value={selectedPerson.department} kind="department" />
          </p>
          <small>กราฟ สถิติ และรายการด้านล่างเป็นข้อมูลของพนักงานคนนี้ในช่วงที่เลือก</small>
        </Card>
      )}
      {actor.role === 'Manager' && (
        <Card title="ส่งรายงานให้ HR" className="leave-summary-report-send">
          <p>
            ส่งสรุปและรายละเอียดคำขอตามตัวกรองปัจจุบัน HR จะได้รับการแจ้งเตือนและเปิดอ่านรายงานได้
          </p>
          <div className="leave-summary-report-controls">
            <div className="field">
              <label htmlFor="summary-hr">HR ผู้รับรายงาน</label>
              <select
                id="summary-hr"
                value={recipient}
                disabled={busy || !hrs.length}
                onChange={(event) => setHrId(Number(event.target.value))}
              >
                {!hrs.length && <option value={0}>ไม่มี HR ที่ใช้งานได้</option>}
                {hrs.map((hr) => (
                  <option key={hr.id} value={hr.id}>
                    {hr.name}
                  </option>
                ))}
              </select>
            </div>
            <button
              className="btn primary"
              disabled={busy || !recipient || selectionUnavailable}
              onClick={() => void sendReport()}
            >
              <Send size={17} aria-hidden="true" />
              {busy ? 'กำลังส่งรายงาน…' : 'ส่งรายงานให้ HR'}
            </button>
          </div>
          {error && (
            <p className="error" role="alert">
              {error}
            </p>
          )}
          {sent && <p role="status">ส่งรายงานแล้ว ดูสำเนาได้ในรายการแจ้งเตือนของคุณ</p>}
          <small>รายงานเก็บยอด ณ เวลาส่ง และไม่มีการเปลี่ยนสถานะคำขอหรือสิทธิ์วันลา</small>
        </Card>
      )}
      <div className="stats leave-summary-stats" aria-label="ยอดสรุปคำขอและวันลา">
        <Stat
          title="คำขอทั้งหมด"
          value={
            <>
              {count(summary.requestCount)}
              <small>คำขอ</small>
            </>
          }
          note="นับแต่ละคำขอครั้งเดียวในช่วงที่เลือก"
          icon={<FileText />}
          tone="mint"
        />
        <Stat
          title="รอพิจารณา"
          value={
            <>
              {count(summary.statusCounts.Pending)}
              <small>คำขอ</small>
            </>
          }
          note={`รวม ${count(summary.pendingDays)} วันในช่วงที่เลือก`}
          icon={<Clock3 />}
          tone="peach"
        />
        <Stat
          title="อนุมัติแล้ว"
          value={
            <>
              {count(summary.statusCounts.Approved)}
              <small>คำขอ</small>
            </>
          }
          note={`ไม่อนุมัติ ${count(summary.statusCounts.Rejected)} · ยกเลิก ${count(summary.statusCounts.Withdrawn)} คำขอ`}
          icon={<CheckCircle2 />}
          tone="purple"
        />
        <Stat
          title="วันลาที่อนุมัติ"
          value={
            <>
              {count(summary.approvedDays)}
              <small>วัน</small>
            </>
          }
          note="รวมวันที่ในอนาคตที่อนุมัติแล้ว"
          icon={<CalendarDays />}
          tone="sky"
        />
      </div>

      <p className="leave-summary-caption">
        สรุปตามวันที่ลาที่บันทึก ไม่ใช่วันที่ยื่นคำขอ · ครึ่งวันนับ 0.5 วัน
        และคำขอข้ามปีนับเฉพาะวันที่อยู่ในช่วงที่เลือก
      </p>

      <div className="leave-summary-grid">
        <Card title={month ? `วันลาเดือน${thaiMonths[month - 1]}` : 'วันลารายเดือน'}>
          <div className="leave-summary-legend">
            <span>
              <i className="approved" aria-hidden="true" />
              อนุมัติแล้ว
            </span>
            <span>
              <i className="pending" aria-hidden="true" />
              รอพิจารณา
            </span>
            <small>หน่วย: วัน</small>
          </div>
          {summary.requestCount ? (
            <MonthChart months={summary.monthly} month={month} />
          ) : (
            <Empty>ยังไม่มีวันลาในช่วงที่เลือก</Empty>
          )}
          <p className="leave-summary-chart-note">
            ตัวเลขใต้เดือนเป็นผลรวมวันอนุมัติและวันรอพิจารณา ไม่รวมคำขอที่ไม่อนุมัติหรือยกเลิก
          </p>
        </Card>
        <Card title="สถานะคำขอ">
          {summary.requestCount ? (
            <ul className="leave-summary-statuses">
              {Object.entries(statusLabels).map(([status, label]) => (
                <li key={status}>
                  <div>
                    <Badge status={status} />
                    <strong>
                      {count(summary.statusCounts[status])} <small>คำขอ</small>
                    </strong>
                  </div>
                  <div className="leave-summary-status-track" aria-hidden="true">
                    <span
                      className={status.toLowerCase()}
                      style={{
                        width: `${(summary.statusCounts[status] / summary.requestCount) * 100}%`,
                      }}
                    />
                  </div>
                  <span className="leave-summary-status-percent">
                    {count((summary.statusCounts[status] / summary.requestCount) * 100)}% · {label}
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <Empty>ยังไม่มีคำขอในช่วงที่เลือก</Empty>
          )}
        </Card>
      </div>

      <Card title="สรุปตามประเภทการลา" className="leave-summary-breakdown">
        {summary.byType.length ? (
          <div className="leave-summary-type-list">
            {summary.byType.map((type) => (
              <div className="leave-summary-type-row" key={type.leaveTypeId}>
                <div>
                  <strong>{type.name}</strong>
                  <small>{count(type.requestCount)} คำขอ</small>
                  <div
                    className="leave-summary-type-track"
                    role="img"
                    aria-label={`${type.name} อนุมัติ ${count(type.approvedDays)} วัน รอพิจารณา ${count(type.pendingDays)} วัน`}
                  >
                    <span
                      className="approved"
                      style={{
                        width: `${(type.approvedDays / typeMaximum) * 100}%`,
                      }}
                    />
                    <span
                      className="pending"
                      style={{
                        width: `${(type.pendingDays / typeMaximum) * 100}%`,
                      }}
                    />
                  </div>
                </div>
                <span>
                  อนุมัติ <strong>{count(type.approvedDays)}</strong> วัน
                </span>
                <span>
                  รอพิจารณา <strong>{count(type.pendingDays)}</strong> วัน
                </span>
              </div>
            ))}
          </div>
        ) : (
          <Empty>ยังไม่มีข้อมูลประเภทการลาในช่วงที่เลือก</Empty>
        )}
      </Card>

      {!!effectiveEmployeeId && !!month && (
        <Card title="รายละเอียดวันลาในเดือนที่เลือก" className="leave-summary-daily">
          {summary.daily.length ? (
            <ul>
              {summary.daily.map((day) => (
                <li key={day.date}>
                  <strong>{formatDate(day.date)}</strong>
                  <div
                    className="leave-summary-type-track"
                    role="img"
                    aria-label={`วันที่ ${formatDate(day.date)} อนุมัติ ${count(day.approvedDays)} วัน รอพิจารณา ${count(day.pendingDays)} วัน`}
                  >
                    <span
                      className="approved"
                      style={{
                        width: `${(day.approvedDays / Math.max(1, day.approvedDays + day.pendingDays)) * 100}%`,
                      }}
                    />
                    <span
                      className="pending"
                      style={{
                        width: `${(day.pendingDays / Math.max(1, day.approvedDays + day.pendingDays)) * 100}%`,
                      }}
                    />
                  </div>
                  <span>
                    อนุมัติ {count(day.approvedDays)} วัน · รอพิจารณา {count(day.pendingDays)} วัน
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <Empty>ยังไม่มีวันลาในเดือนที่เลือก</Empty>
          )}
          <small>แสดงวันที่บันทึกในคำขอ ครึ่งวัน = 0.5 วัน</small>
        </Card>
      )}
      {!employee && (
        <Card title="สรุปรายพนักงาน" className="leave-summary-people">
          <p className="leave-summary-chart-note">
            พนักงานที่มีคำขอ {count(summary.employeeCount)} คน · รวมคำขอทุกสถานะตามตัวกรอง
          </p>
          {summary.byEmployee.length ? (
            <div className="leave-summary-type-list">
              {summary.byEmployee.map((person) => (
                <div className="leave-summary-type-row" key={person.employeeId}>
                  <div>
                    <strong>
                      <EmployeeProfileLink
                        actor={actor}
                        employee={db.employees.find((item) => item.id === person.employeeId)}
                      >
                        {person.name}
                      </EmployeeProfileLink>
                    </strong>
                    <small>{count(person.requestCount)} คำขอ</small>
                    <button
                      className="text-link"
                      disabled={busy}
                      onClick={() => {
                        setEmployeeId(person.employeeId);
                        setVisible(8);
                        document.getElementById('summary-person')?.focus();
                      }}
                    >
                      ดูกราฟรายคน
                    </button>
                  </div>
                  <span>
                    อนุมัติ <strong>{count(person.approvedDays)}</strong> วัน
                  </span>
                  <span>
                    รอพิจารณา <strong>{count(person.pendingDays)}</strong> วัน
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <Empty>ยังไม่มีพนักงานที่มีคำขอในช่วงที่เลือก</Empty>
          )}
        </Card>
      )}

      <Card title="คำขอในช่วงที่เลือก" className="table-card leave-summary-requests">
        {rows.length ? (
          <>
            <div className="leave-summary-table-scroll">
              <table className="leave-summary-request-table" role="table">
                <thead>
                  <tr role="row">
                    <th scope="col">เลขคำขอ</th>
                    {!employee && <th scope="col">พนักงาน</th>}
                    <th scope="col">ประเภทการลา</th>
                    <th scope="col">ช่วงวันที่ลา (พ.ศ.)</th>
                    <th scope="col">วันลาในช่วงนี้</th>
                    <th scope="col">สถานะ</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map(({ request, periodDays }) => {
                    const owner = db.employees.find((item) => item.id === request.employeeId);
                    const type = db.leaveTypes.find((item) => item.id === request.leaveTypeId);
                    return (
                      <tr key={request.id} role="row">
                        <td data-label="เลขคำขอ">
                          <a className="text-link" href={`#/request/${request.id}`}>
                            {requestCode(request)}
                            <ArrowUpRight size={15} aria-hidden="true" />
                          </a>
                          <small className="leave-summary-request-date">
                            {formatDateTime(request.requestDate)}
                          </small>
                        </td>
                        {!employee && (
                          <td data-label="พนักงาน">
                            <EmployeeProfileLink actor={actor} employee={owner}>
                              {owner?.name ?? `รหัสพนักงาน ${request.employeeId}`}
                            </EmployeeProfileLink>
                          </td>
                        )}
                        <td data-label="ประเภทการลา">
                          {type?.name ?? `ประเภทการลา ${request.leaveTypeId}`}
                        </td>
                        <td data-label="ช่วงวันที่ลา">
                          {formatDate(request.startDate)} – {formatDate(request.endDate)}
                        </td>
                        <td data-label="วันลาในช่วงนี้">{count(periodDays)}</td>
                        <td data-label="สถานะ">
                          <Badge status={request.status} />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <div className="leave-summary-list-footer">
              <span>
                แสดง {count(rows.length)} จาก {count(summary.requestCount)} คำขอ
              </span>
              {visible < summary.requestCount && (
                <button
                  className="btn"
                  type="button"
                  onClick={() => setVisible((value) => value + 8)}
                >
                  แสดงเพิ่มเติม
                </button>
              )}
            </div>
          </>
        ) : (
          <Empty>ไม่พบคำขอในช่วงที่เลือก ลองเปลี่ยนปี เดือน หรือประเภทการลา</Empty>
        )}
      </Card>
    </div>
  );
}
