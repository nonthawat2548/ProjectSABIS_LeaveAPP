import { useMemo, useRef, useState } from 'react';
import { ArrowUpRight, ChartNoAxesCombined, Clock3, Download, Layers, Users } from 'lucide-react';
import { Card, Empty, Stat } from './components.jsx';
import { MonthChart } from './LeaveMonthChart.jsx';
import { formatDate, thaiMonths, today } from './domain/date.js';
import { managementAnalytics } from './domain/managementAnalytics.js';
import { managementCsv } from './domain/managementExport.js';
import { formatApprovalTime, formatLeaveDays } from './labels.js';
import { ManagementKpiDialog } from './ManagementKpiDialog.jsx';
import { HrAnalyticsCharts, HrWorkLinks } from './HrAnalyticsCharts.jsx';

const number = new Intl.NumberFormat('th-TH', { maximumFractionDigits: 2 });
const count = (value) => number.format(value);
function AnnualDetails({ collapsible, children }) {
  if (!collapsible) return children;
  return (
    <details className="hr-secondary">
      <summary>
        สิทธิ์วันลารายปี <span>เปิดดูสิทธิ์และวันลาคงเหลือของพนักงาน</span>
      </summary>
      {children}
    </details>
  );
}
function KpiCard({ kind, onOpen, ...props }) {
  return (
    <button
      type="button"
      className="management-kpi-button"
      aria-haspopup="dialog"
      aria-label={`ดูรายละเอียด${props.title}`}
      onClick={(event) => onOpen(kind, event.currentTarget)}
    >
      <Stat {...props} />
      <span className="management-kpi-open">
        ดูรายละเอียด
        <ArrowUpRight size={15} aria-hidden="true" />
      </span>
    </button>
  );
}

function Legend() {
  return (
    <div className="leave-summary-legend">
      <span>
        <i className="approved" />
        อนุมัติแล้ว
      </span>
      <span>
        <i className="pending" />
        รอพิจารณา
      </span>
      <small>รวมวันที่ลาในอนาคต · .5 ในกราฟหมายถึงครึ่งวัน</small>
    </div>
  );
}

function Breakdown({ items, maximum, departments = false }) {
  return (
    <ul className="management-breakdown">
      {items.map((item) => (
        <li key={item.name}>
          <div className="management-breakdown-heading">
            <strong>{item.name}</strong>
            <span>{formatLeaveDays(item.approvedDays + item.pendingDays)}</span>
          </div>
          <div
            className="leave-summary-type-track"
            role="img"
            aria-label={`${item.name} อนุมัติ ${formatLeaveDays(item.approvedDays)} รอพิจารณา ${formatLeaveDays(item.pendingDays)}`}
          >
            <span
              className="approved"
              style={{ width: `${(item.approvedDays / maximum) * 100}%` }}
            />
            <span className="pending" style={{ width: `${(item.pendingDays / maximum) * 100}%` }} />
          </div>
          <p>
            อนุมัติ {formatLeaveDays(item.approvedDays)} · รอพิจารณา{' '}
            {formatLeaveDays(item.pendingDays)}
            {departments
              ? ` · ${item.requestCount} คำขอ`
              : ` · ${count(item.share)}% ของวันลาในเดือน`}
          </p>
          {departments && (
            <small>
              พนักงานที่ใช้งาน {item.headcount} คน · มีลาอนุมัติวันนี้ {item.onLeaveToday} คน
            </small>
          )}
        </li>
      ))}
    </ul>
  );
}

/** @param {import('./pages/types.js').PageProps} props */
export function ManagementAnalytics({ db, actor, onAnalyticsDialogChange }) {
  const date = today();
  const [year, setYear] = useState(Number(date.slice(0, 4)));
  const [month, setMonth] = useState(Number(date.slice(5, 7)));
  const [department, setDepartment] = useState('');
  const [leaveTypeId, setLeaveTypeId] = useState(0);
  const [exportError, setExportError] = useState('');
  const [detail, setDetail] = useState(null);
  const detailTrigger = useRef(null);
  const result = useMemo(() => {
    try {
      return {
        report: managementAnalytics(db, actor, { year, month, department, leaveTypeId }),
        error: '',
      };
    } catch (error) {
      return { report: null, error: error.message };
    }
  }, [db, actor, year, month, department, leaveTypeId]);
  const report = result.report;
  if (!report)
    return (
      <Card title="รายงานสรุปและตัวชี้วัดการลา">
        <p role="alert">{result.error}</p>
        {department && (
          <button className="btn" onClick={() => setDepartment('')}>
            กลับไปดูฝ่ายที่มีสิทธิ์
          </button>
        )}
      </Card>
    );
  const filters = { year, month, department, leaveTypeId };
  const isHR = db.employees.find((person) => person.id === actor.id)?.role === 'HR';
  const period = `${thaiMonths[month - 1]} ${year + 543}`;
  const topDepartment = report.topDepartments.map((item) => item.name).join(', ');
  const topType = report.topTypes.map((item) => item.name).join(', ');
  const maximumDepartment = Math.max(
    1,
    ...report.byDepartment.map((item) => item.approvedDays + item.pendingDays),
  );
  const maximumType = Math.max(
    1,
    ...report.byType.map((item) => item.approvedDays + item.pendingDays),
  );
  const annualTypes = report.annualTypes;
  const maternity =
    db.leaveTypes.find((type) => type.id === leaveTypeId)?.quotaScope === 'Pregnancy';
  const comparison =
    report.previousRate.percent === null
      ? 'ยังเปรียบเทียบกับเดือนก่อนไม่ได้'
      : `เดือนก่อน ${count(report.previousRate.percent)}%`;
  function openDetail(kind, trigger) {
    detailTrigger.current = trigger;
    setDetail(kind);
  }
  function closeDetail() {
    onAnalyticsDialogChange?.(false);
    setDetail(null);
  }
  function exportCsv() {
    setExportError('');
    try {
      const csv = managementCsv(db, actor, filters);
      const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
      const link = document.createElement('a');
      link.href = url;
      link.download = `leave-management-${year}-${String(month).padStart(2, '0')}.csv`;
      document.body.append(link);
      link.click();
      link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 0);
    } catch {
      setExportError('ออกรายงานไม่สำเร็จ กรุณาลองอีกครั้ง');
    }
  }
  return (
    <section
      className={`management-analytics${isHR ? ' hr-analytics' : ''}`}
      aria-labelledby="management-title"
      inert={!!detail}
    >
      <div className="management-heading">
        <div>
          {isHR ? (
            <>
              <span className="hr-heading-label">ฝ่ายบุคคล</span>
              <h1 id="management-title">ภาพรวมการลา</h1>
            </>
          ) : (
            <h2 id="management-title">รายงานสรุปและตัวชี้วัดการลา</h2>
          )}
          <p>
            {report.scope} · {period}
          </p>
        </div>
        <button className="btn" onClick={exportCsv} disabled={!report.rows.length}>
          <Download size={17} />
          ออกรายงาน CSV
        </button>
      </div>
      {isHR && <HrWorkLinks db={db} actor={actor} date={report.currentDate} />}
      <Card className={isHR ? 'hr-filter-card' : ''}>
        <div className="management-filters">
          <div className="field">
            <label htmlFor="analytics-year">ปี พ.ศ.</label>
            <select
              id="analytics-year"
              value={year}
              onChange={(event) => setYear(Number(event.target.value))}
            >
              {[...new Set([year, ...report.years])]
                .sort((a, b) => b - a)
                .map((value) => (
                  <option key={value} value={value}>
                    {value + 543}
                  </option>
                ))}
            </select>
          </div>
          <div className="field">
            <label htmlFor="analytics-month">เดือนของตัวชี้วัด</label>
            <select
              id="analytics-month"
              value={month}
              onChange={(event) => setMonth(Number(event.target.value))}
            >
              {thaiMonths.map((name, index) => (
                <option key={name} value={index + 1}>
                  {name}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label htmlFor="analytics-department">แผนก</label>
            <select
              id="analytics-department"
              value={department}
              onChange={(event) => setDepartment(event.target.value)}
            >
              <option value="">ทุกฝ่ายที่มีสิทธิ์ดู</option>
              {report.departments.map((name) => (
                <option key={name} value={name}>
                  {name}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label htmlFor="analytics-type">ประเภทการลาในรายงาน</label>
            <select
              id="analytics-type"
              value={leaveTypeId}
              onChange={(event) => setLeaveTypeId(Number(event.target.value))}
            >
              <option value={0}>ทุกประเภท</option>
              {db.leaveTypes.map((type) => (
                <option key={type.id} value={type.id}>
                  {type.name}
                </option>
              ))}
            </select>
          </div>
        </div>
        <p className="management-method">
          ดูข้อมูลพนักงาน {report.headcount} คน · กดการ์ดด้านล่างเพื่อดูรายละเอียด
        </p>
        {exportError && (
          <p role="alert" className="error">
            {exportError}
          </p>
        )}
      </Card>
      <div className="stats management-kpis" aria-label="ตัวชี้วัดการลา 4 ด้าน">
        <KpiCard
          kind="rate"
          onOpen={openDetail}
          title="อัตราการลาในเดือนที่เลือก"
          value={report.rate.percent === null ? 'ไม่มีฐานคำนวณ' : `${count(report.rate.percent)}%`}
          note={comparison}
          icon={<ChartNoAxesCombined />}
          tone="mint"
        />
        <KpiCard
          kind="approval"
          onOpen={openDetail}
          title="ระยะเวลาอนุมัติเฉลี่ย"
          value={formatApprovalTime(report.averageApprovalMs)}
          note={`จาก ${report.approvalCount} คำขอที่มีเวลาอนุมัติครบ`}
          icon={<Clock3 />}
          tone="peach"
        />
        <KpiCard
          kind="department"
          onOpen={openDetail}
          title="แผนกที่มียอดการลาสูงสุด"
          value={<span className="management-kpi-name">{topDepartment || 'ยังไม่มีวันลา'}</span>}
          note={
            report.topDepartments.length
              ? `อนุมัติ + รอพิจารณา ${formatLeaveDays(report.topDepartments[0].approvedDays + report.topDepartments[0].pendingDays)}${report.topDepartments.length > 1 ? ' · ยอดเท่ากัน' : ''}`
              : 'ไม่มีวันลาอนุมัติหรือรอพิจารณาในเดือนนี้'
          }
          icon={<Users />}
          tone="sky"
        />
        <KpiCard
          kind="type"
          onOpen={openDetail}
          title="ประเภทการลาที่ใช้มากที่สุด"
          value={<span className="management-kpi-name">{topType || 'ยังไม่มีวันลา'}</span>}
          note={
            report.topTypes.length
              ? `อนุมัติ + รอพิจารณา ${formatLeaveDays(report.topTypes[0].approvedDays + report.topTypes[0].pendingDays)}${report.topTypes.length > 1 ? ' · ยอดเท่ากัน' : ''}`
              : 'ไม่มีวันลาอนุมัติหรือรอพิจารณาในเดือนนี้'
          }
          icon={<Layers />}
          tone="purple"
        />
      </div>
      <p className="management-method">ยอดวันลารวมทั้งที่อนุมัติแล้วและรอพิจารณา รวมวันลาในอนาคต</p>
      <details className="management-definitions">
        <summary>วิธีคำนวณตัวชี้วัด</summary>
        <p>
          อัตราการลา = วันลาอนุมัติและรอพิจารณาบนวันทำงาน {formatLeaveDays(report.rate.numerator)} ÷
          วันทำงานรวม {count(report.rate.denominator)} คน-วัน × 100 โดยวันทำงานรวม ={' '}
          {report.rate.workingDays} วัน × {report.headcount} คน
        </p>
        <p>
          ใช้จำนวนพนักงานที่ใช้งานอยู่และปฏิทินวันหยุดปัจจุบัน ไม่ใช่ประวัติจำนวนพนักงานย้อนหลัง
          ไม่นับเสาร์–อาทิตย์/วันหยุดในอัตรา และนับไม่เกิน 1 วันต่อคนต่อวัน
          วันลาคลอดตามปฏิทินยังแสดงครบในกราฟและยอดวันลา
        </p>
        <p>
          เวลาอนุมัติวัดจากเวลายื่นถึงผลอนุมัติสุดท้ายของคำขอที่มีวันลาในเดือนที่เลือก
          ไม่ใช้เวลาส่งความเห็น HR หรือการพิจารณาที่ถูกยกเลิก ยอดฝ่ายและประเภทนับอนุมัติรวมรอพิจารณา
          ไม่รวมไม่อนุมัติ/ยกเลิก
        </p>
      </details>
      {isHR ? (
        <HrAnalyticsCharts
          key={`${year}:${month}:${department}:${leaveTypeId}`}
          report={report}
          db={db}
          onOpen={openDetail}
        />
      ) : (
        <>
          <div className="management-charts">
            <Card title={`วันลาแยกตามแผนก · ${period}`}>
              <Legend />
              {report.byDepartment.length ? (
                <Breakdown items={report.byDepartment} maximum={maximumDepartment} departments />
              ) : (
                <Empty>ไม่มีพนักงานในขอบเขตที่เลือก</Empty>
              )}
            </Card>
            <Card title={`สัดส่วนประเภทการลา · ${period}`}>
              <Legend />
              <Breakdown items={report.byType} maximum={maximumType} />
            </Card>
          </div>
          <Card title={`แนวโน้มวันลารายเดือน · ปี ${year + 543}`}>
            <Legend />
            <MonthChart months={report.monthly} month={0} showValues />
          </Card>
        </>
      )}
      <AnnualDetails collapsible={isHR}>
        <Card
          title={`สิทธิ์และการใช้วันลารายบุคคล · ทั้งปี ${year + 543}`}
          className="management-balances"
        >
          <p className="management-method">
            ใช้แล้ว = วันลาที่อนุมัติในปีนี้ รวมวันลาอนาคต · คงเหลือยังไม่หักยอดรอพิจารณา · สถานะงาน
            ณ {formatDate(report.currentDate)} ไม่เปลี่ยนตามตัวกรองเดือน
          </p>
          {maternity && (
            <p className="management-method">
              สิทธิ์ลาคลอดแสดงยอดตลอดแต่ละกรณี ส่วนยอดรอพิจารณานับเฉพาะปีที่เลือก
            </p>
          )}
          {report.rows.length ? (
            <div
              className="management-table-scroll"
              tabIndex={0}
              role="region"
              aria-label="ตารางสิทธิ์และการใช้วันลารายบุคคล"
            >
              <table className="management-balance-table">
                <thead>
                  <tr>
                    <th>รหัสพนักงาน</th>
                    <th>ชื่อ-นามสกุล</th>
                    <th>แผนก</th>
                    {annualTypes.map((type) => (
                      <th key={type.id}>
                        {type.name}
                        <small>ใช้แล้ว / คงเหลือ</small>
                      </th>
                    ))}
                    {maternity && (
                      <th>
                        ลาคลอด<small>ใช้แล้ว / คงเหลือรายกรณี</small>
                      </th>
                    )}
                    <th>
                      รอพิจารณา<small>วันในปีที่เลือก</small>
                    </th>
                    <th>สถานะวันนี้</th>
                  </tr>
                </thead>
                <tbody>
                  {report.rows.map((row) => (
                    <tr key={row.employeeId}>
                      <td data-label="รหัสพนักงาน">{row.code}</td>
                      <td data-label="ชื่อ-นามสกุล">{row.name}</td>
                      <td data-label="แผนก">{row.department}</td>
                      {row.balances.map((item) => (
                        <td data-label={`${item.name} ใช้แล้ว / คงเหลือ`} key={item.leaveTypeId}>
                          {item.allocated ? (
                            <>
                              {formatLeaveDays(item.used)} / {formatLeaveDays(item.remaining)}
                            </>
                          ) : (
                            'ยังไม่ได้จัดสรรสิทธิ์'
                          )}
                        </td>
                      ))}
                      {maternity && (
                        <td data-label="ลาคลอด ใช้แล้ว / คงเหลือ">
                          {row.maternity.length
                            ? row.maternity.map((item) => (
                                <div key={item.caseNo}>
                                  กรณี {item.caseNo}: {formatLeaveDays(item.used)} /{' '}
                                  {formatLeaveDays(item.remaining)}
                                </div>
                              ))
                            : 'ไม่มีกรณีลาคลอด'}
                        </td>
                      )}
                      <td data-label="รอพิจารณาในปี">{formatLeaveDays(row.pendingDays)}</td>
                      <td data-label="สถานะวันนี้">{row.status}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <Empty>ไม่มีพนักงานในขอบเขตที่เลือก</Empty>
          )}
        </Card>
      </AnnualDetails>
      {!isHR && (
        <Card title="ใช้รายงานนี้อย่างไร" className="management-purpose">
          <ul>
            <li>
              <strong>วางแผนกำลังคน:</strong>{' '}
              เปรียบเทียบยอดลาแต่ละฝ่ายและแนวโน้มรายเดือนก่อนจัดเวรหรือมอบหมายงาน
            </li>
            <li>
              <strong>ติดตามการพิจารณา:</strong> ดูเวลาอนุมัติประกอบกับคำขอที่ยังรอผล
              เพื่อหาจุดที่ควรปรับขั้นตอน
            </li>
            <li>
              <strong>ตรวจสอบสิทธิ์:</strong> ใช้ยอดทั้งปีตรวจวันลาคงเหลือ
              และแยกยอดรอพิจารณาก่อนยื่นเพิ่ม
            </li>
          </ul>
        </Card>
      )}
      {detail && (
        <ManagementKpiDialog
          db={db}
          actor={actor}
          filters={filters}
          kind={detail}
          onClose={closeDetail}
          onOpenChange={onAnalyticsDialogChange}
          trigger={detailTrigger.current}
        />
      )}
    </section>
  );
}
