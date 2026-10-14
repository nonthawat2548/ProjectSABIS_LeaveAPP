import { useMemo, useState } from 'react';
import { ArrowLeft, CalendarDays, CheckCircle2, Clock3, FileText, LockKeyhole } from 'lucide-react';
import { Badge, Card, Empty, Heading, Stat } from '../components.jsx';
import { MonthChart } from '../LeaveMonthChart.jsx';
import { formatDateTime } from '../domain/date.js';
import { actorById } from '../domain/service.js';
import { canReadReportNotification, isLeaveReport } from '../domain/leaveReport.js';
import {
  readReportDashboard,
  readReportRequestLine,
  reportEmployeeFrequency,
} from '../domain/reportDashboard.js';
import { statusLabels } from '../labels.js';

const number = new Intl.NumberFormat('th-TH', { maximumFractionDigits: 2 });
const count = (value) => number.format(value);
const back = (
  <a className="btn" href="#/notifications">
    <ArrowLeft size={17} aria-hidden="true" />
    กลับการแจ้งเตือน
  </a>
);

/** Recheck actual identity, ownership and current role, including direct URLs. */
function ownReport(db, actorId, notificationId) {
  try {
    const actor = actorById(db, actorId);
    if (actor.role !== 'Manager' && actor.role !== 'HR') return null;
    return (
      db.notifications.find(
        (item) =>
          item.id === notificationId &&
          item.employeeId === actor.id &&
          typeof item.text === 'string' &&
          isLeaveReport(item.text) &&
          canReadReportNotification(actor, item),
      ) ?? null
    );
  } catch {
    return null;
  }
}

/** @param {import('./types.js').PageProps & {notificationId: number}} props */
export function LeaveReportDashboardPage({ db, actor, notificationId }) {
  const notification = ownReport(db, actor.id, notificationId);
  const report = useMemo(
    () => (notification ? readReportDashboard(notification.text) : null),
    [notification?.text],
  );
  if (!notification)
    return (
      <>
        <Heading title="ไม่พบรายงานหรือไม่มีสิทธิ์เข้าถึง" action={back} />
        <Card>
          <p role="alert">คุณเปิดรายงานนี้ไม่ได้ กรุณากลับไปเลือกรายงานจากการแจ้งเตือนของคุณ</p>
        </Card>
      </>
    );
  if (!report)
    return (
      <>
        <Heading
          title="รายงานสรุปการลา"
          description={`ส่งเมื่อ ${formatDateTime(notification.createdAt)}`}
          action={back}
        />
        <Card title="รายละเอียดรายงาน">
          <p role="status">รายงานนี้ยังแสดงกราฟไม่ได้ สามารถอ่านรายละเอียดที่บันทึกไว้ด้านล่าง</p>
          <pre className="leave-report-original">{notification.text}</pre>
        </Card>
      </>
    );
  return (
    <ReportView
      key={`${notification.id}:${notification.createdAt}`}
      report={report}
      notification={notification}
    />
  );
}

/** @param {{report: import('../domain/reportDashboard.js').ReportDashboard, notification: import('../domain/types.js').Notification}} props */
function ReportView({ report, notification }) {
  const [visible, setVisible] = useState(8);
  const [visiblePeople, setVisiblePeople] = useState(8);
  const [statusFilter, setStatusFilter] = useState('');
  const people = useMemo(() => reportEmployeeFrequency(report), [report]);
  const highestFrequency = people?.[0]?.approvedRequests ?? 0;
  const leaders = people?.filter((person) => person.approvedRequests === highestFrequency) ?? [];
  const shownPeople = Math.max(visiblePeople, leaders.length);
  const types = [...report.byType].sort(
    (a, b) =>
      b.approvedDays + b.pendingDays - a.approvedDays - a.pendingDays ||
      b.requestCount - a.requestCount,
  );
  const maximum = Math.max(1, ...types.map((item) => item.approvedDays + item.pendingDays));
  const requests = report.requestLines.map((line) => ({
    line,
    fields: readReportRequestLine(line),
  }));
  const structured = requests.every((item) => item.fields);
  if (structured)
    requests.sort(
      (a, b) =>
        Number(b.fields.status === 'Pending') - Number(a.fields.status === 'Pending') ||
        b.fields.code.localeCompare(a.fields.code, 'en', { numeric: true }),
    );
  const filtered = requests.filter(
    (item) => !structured || !statusFilter || item.fields.status === statusFilter,
  );
  return (
    <div className="leave-summary-page leave-report-dashboard">
      <Heading
        title="รายงานสรุปการลา"
        description="สรุปคำขอและวันลาจากรายงานที่ผู้จัดการส่งไว้"
        action={back}
      />
      <Card className="leave-report-overview">
        <dl className="leave-report-scope">
          <div>
            <dt>พนักงานในรายงาน</dt>
            <dd>{report.employee}</dd>
          </div>
          <div>
            <dt>ช่วงวันที่ลา</dt>
            <dd>{report.period}</dd>
          </div>
          <div>
            <dt>ประเภทการลา</dt>
            <dd>{report.leaveType}</dd>
          </div>
        </dl>
        <div className="leave-report-stamp">
          <LockKeyhole size={17} aria-hidden="true" />
          <span>ข้อมูล ณ เวลาส่งรายงาน</span>
          <time dateTime={notification.createdAt}>{formatDateTime(notification.createdAt)}</time>
        </div>
      </Card>
      <div className="stats leave-summary-stats" aria-label="ยอดสรุปในรายงาน">
        <Stat
          title="รอพิจารณา"
          value={
            <>
              {count(report.statusCounts.Pending)}
              <small>คำขอ</small>
            </>
          }
          note={`รวม ${count(report.pendingDays)} วัน ณ เวลาส่ง`}
          icon={<Clock3 size={18} />}
          tone="peach"
        />
        <Stat
          title="วันลาที่อนุมัติ"
          value={
            <>
              {count(report.approvedDays)}
              <small>วัน</small>
            </>
          }
          note="รวมวันที่ในอนาคตที่อนุมัติแล้ว"
          icon={<CalendarDays size={18} />}
          tone="mint"
        />
        <Stat
          title="คำขอทั้งหมด"
          value={
            <>
              {count(report.requestCount)}
              <small>คำขอ</small>
            </>
          }
          note="ทุกสถานะในช่วงรายงาน"
          icon={<FileText size={18} />}
          tone="sky"
        />
        <Stat
          title="อนุมัติแล้ว"
          value={
            <>
              {count(report.statusCounts.Approved)}
              <small>คำขอ</small>
            </>
          }
          note="จำนวนคำขอที่อนุมัติ ณ เวลาส่ง"
          icon={<CheckCircle2 size={18} />}
          tone="mint"
        />
      </div>
      <p className="leave-summary-caption">
        ครึ่งวัน = 0.5 วัน · คำขอข้ามปีนับเฉพาะวันในช่วงรายงาน · ยอดไม่เปลี่ยนตามคำขอภายหลัง
      </p>
      <div className="leave-report-charts">
        <Card title="จำนวนคำขออนุมัติรายพนักงาน" className="leave-report-frequency">
          <p className="leave-report-order-note">
            นับจำนวนคำขอที่อนุมัติในช่วงรายงาน แต่ละคำขอนับหนึ่งครั้ง จำนวนวันแสดงประกอบ
          </p>
          {people === null ? (
            <p role="status">รายงานนี้แยกคำขอรายพนักงานไม่ได้ กรุณาดูรายการคำขอด้านล่าง</p>
          ) : highestFrequency === 0 ? (
            <Empty>ไม่มีคำขออนุมัติในรายงานนี้</Empty>
          ) : (
            <>
              <p className="leave-report-frequency-leader">
                {leaders.length === 1 ? (
                  <>
                    อนุมัติมากที่สุด:{' '}
                    <strong>
                      {leaders[0].name} ({leaders[0].employeeCode})
                    </strong>{' '}
                    · {count(highestFrequency)} คำขอ
                  </>
                ) : (
                  <>
                    สูงสุดเท่ากัน <strong>{count(leaders.length)} คน</strong> · คนละ{' '}
                    {count(highestFrequency)} คำขอ
                  </>
                )}
              </p>
              <ul className="leave-report-frequency-list">
                {people.slice(0, shownPeople).map((person) => (
                  <li key={person.employeeCode}>
                    <div className="leave-report-frequency-name">
                      <strong>{person.name}</strong>
                      <span>{person.employeeCode}</span>
                    </div>
                    <div
                      className="leave-report-frequency-track"
                      role="img"
                      aria-label={`${person.name} ${person.employeeCode} อนุมัติ ${count(person.approvedRequests)} คำขอ ${count(person.approvedDays)} วัน`}
                    >
                      <span
                        style={{ width: `${(person.approvedRequests / highestFrequency) * 100}%` }}
                      />
                    </div>
                    <div className="leave-report-frequency-value">
                      <strong>{count(person.approvedRequests)} คำขอ</strong>
                      <span>{count(person.approvedDays)} วัน</span>
                    </div>
                  </li>
                ))}
              </ul>
              {shownPeople < people.length && (
                <button
                  className="btn leave-report-frequency-more"
                  onClick={() => setVisiblePeople((value) => value + 8)}
                >
                  แสดงพนักงานเพิ่มเติม ({count(people.length - shownPeople)})
                </button>
              )}
              <p className="leave-summary-chart-note">
                แสดงเฉพาะคนที่มีคำขอในรายงานนี้ คนที่ไม่มีคำขอจะไม่อยู่ในกราฟ
              </p>
            </>
          )}
        </Card>
        <Card title="วันลารายเดือนในรายงาน" className="leave-report-month-card">
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
          {report.requestCount ? (
            <MonthChart months={report.monthly} month={report.month} showValues />
          ) : (
            <Empty>ยังไม่มีวันลาในรายงานนี้</Empty>
          )}
          <p className="leave-summary-chart-note">
            ตัวเลขเหนือแท่งคือจำนวนวันของแต่ละสถานะ ไม่รวมคำขอที่ไม่อนุมัติหรือยกเลิก
          </p>
        </Card>
        <Card title="สรุปตามประเภทการลา" className="leave-summary-breakdown">
          {report.byType.length ? (
            <div className="leave-summary-type-list">
              <p className="leave-report-order-note">
                เรียงตามวันอนุมัติและวันรอพิจารณารวม จากมากไปน้อย
              </p>
              {types.map((type, index) => (
                <div className="leave-summary-type-row" key={index}>
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
                        style={{ width: `${(type.approvedDays / maximum) * 100}%` }}
                      />
                      <span
                        className="pending"
                        style={{ width: `${(type.pendingDays / maximum) * 100}%` }}
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
            <Empty>ยังไม่มีข้อมูลประเภทการลาในรายงานนี้</Empty>
          )}
        </Card>
        <Card title="สถานะคำขอในรายงาน" className="leave-report-status-card">
          {report.requestCount ? (
            <ul className="leave-summary-statuses">
              {['Pending', 'Approved', 'Rejected', 'Withdrawn'].map((status) => (
                <li key={status}>
                  <div>
                    <Badge status={status} />
                    <strong>
                      {count(report.statusCounts[status])} <small>คำขอ</small>
                    </strong>
                  </div>
                  <div className="leave-summary-status-track" aria-hidden="true">
                    <span
                      className={status.toLowerCase()}
                      style={{
                        width: `${(report.statusCounts[status] / report.requestCount) * 100}%`,
                      }}
                    />
                  </div>
                  <span className="leave-summary-status-percent">
                    {count((report.statusCounts[status] / report.requestCount) * 100)}%
                    ของคำขอทั้งหมด
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <Empty>ยังไม่มีคำขอในรายงานนี้</Empty>
          )}
        </Card>
      </div>
      <Card title="รายละเอียดคำขอในรายงาน">
        {report.requestLines.length ? (
          <>
            <div className="leave-report-list-tools">
              <p className="leave-report-order-note">
                {structured
                  ? 'คำขอรอพิจารณาแสดงก่อน แล้วเรียงเลขคำขอจากมากไปน้อย'
                  : 'แสดงรายการตามลำดับที่บันทึกไว้ในรายงาน'}
              </p>
              {structured && (
                <label className="field">
                  สถานะในรายงาน
                  <select
                    value={statusFilter}
                    onChange={(event) => {
                      setStatusFilter(event.target.value);
                      setVisible(8);
                    }}
                  >
                    <option value="">ทุกสถานะ ({count(report.requestCount)})</option>
                    {['Pending', 'Approved', 'Rejected', 'Withdrawn'].map((status) => (
                      <option key={status} value={status}>
                        {statusLabels[status]} ({count(report.statusCounts[status])})
                      </option>
                    ))}
                  </select>
                </label>
              )}
            </div>
            <ul className="leave-report-request-list">
              {filtered.slice(0, visible).map(({ line, fields }, index) => (
                <li key={index}>
                  {fields ? (
                    <dl className="leave-report-request-fields">
                      <div>
                        <dt>เลขคำขอ / พนักงาน</dt>
                        <dd>
                          <strong>{fields.code}</strong>
                          <span>{fields.employee}</span>
                        </dd>
                      </div>
                      <div>
                        <dt>ประเภทการลา</dt>
                        <dd>{fields.leaveType}</dd>
                      </div>
                      <div>
                        <dt>ช่วงวันที่ (พ.ศ.)</dt>
                        <dd>{fields.dates}</dd>
                      </div>
                      <div>
                        <dt>วันในช่วงรายงาน</dt>
                        <dd>{count(fields.days)} วัน</dd>
                      </div>
                      <div>
                        <dt>สถานะ ณ เวลาส่ง</dt>
                        <dd>
                          <Badge status={fields.status} />
                        </dd>
                      </div>
                    </dl>
                  ) : (
                    <>
                      <strong>{line.slice(0, line.indexOf(' | '))}</strong>
                      <p>{line.slice(line.indexOf(' | ') + 3)}</p>
                    </>
                  )}
                </li>
              ))}
            </ul>
            <div className="leave-report-list-footer">
              <span>
                แสดง {count(Math.min(visible, filtered.length))} จาก {count(filtered.length)} คำขอ
              </span>
              {visible < filtered.length && (
                <button className="btn" onClick={() => setVisible((value) => value + 8)}>
                  แสดงเพิ่มเติม
                </button>
              )}
            </div>
            {!filtered.length && <Empty>ไม่มีคำขอสถานะนี้ในรายงาน</Empty>}
          </>
        ) : (
          <Empty>ยังไม่มีคำขอในรายงานนี้</Empty>
        )}
      </Card>
      <Card title="ข้อมูลการส่งรายงาน" className="leave-report-delivery">
        <dl>
          <div>
            <dt>ผู้ส่งรายงาน</dt>
            <dd>{report.sender}</dd>
          </div>
          <div>
            <dt>HR ผู้รับรายงาน</dt>
            <dd>{report.recipient}</dd>
          </div>
        </dl>
      </Card>
    </div>
  );
}
