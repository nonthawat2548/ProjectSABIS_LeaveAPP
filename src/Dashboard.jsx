import {
  ArrowUpRight,
  CalendarDays,
  CheckCircle2,
  Clock3,
  Laptop,
  Users,
  Wallet,
  FileText,
  ShieldCheck,
} from 'lucide-react';

import { balance, effectiveWorkStatus } from './domain/service.js';
import { formatDate, today } from './domain/date.js';
import { Card, RequestTable, Stat } from './components.jsx';
import { QuotaOverview, TeamOverview, UpcomingLeave, WelcomeHero, WeeklyOverview } from './ui.jsx';
import { formatWorkStatus } from './labels.js';
import { canDecideRequest, latestHRReferral } from './domain/approvalRouting.js';

/** @param {import('./pages/types.js').PageProps} props */
export function Dashboard({ db, actor }) {
  const employee = actor.role === 'Employee';
  const requests = db.requests.filter((r) =>
    employee
      ? r.employeeId === actor.id
      : actor.role === 'HR'
        ? latestHRReferral(db, r)?.approverId === actor.id
        : db.employees.find((e) => e.id === r.employeeId)?.managerId === actor.id,
  );
  const year = Number(today().slice(0, 4)),
    vacation = balance(db, actor.id, 1, year),
    pending = requests.filter((r) => r.status === 'Pending');
  const referrals = pending.filter((request) => latestHRReferral(db, request));
  const managerRequests = db.requests.filter(
    (request) =>
      db.employees.find((person) => person.id === request.employeeId)?.role === 'Manager' &&
      canDecideRequest(db, actor, request),
  );
  const team = db.employees.filter(
    (e) => e.active && (actor.role === 'HR' || (e.role !== 'HR' && e.managerId === actor.id)),
  );
  const approvedToday = new Set(
    db.requests
      .filter(
        (r) =>
          team.some((e) => e.id === r.employeeId) &&
          r.status === 'Approved' &&
          db.days.some((d) => d.leaveId === r.id && d.date === today()),
      )
      .map((r) => r.employeeId),
  ).size;
  const latest = [...requests].sort((a, b) => b.id - a.id).slice(0, 4);
  const sick = db.leaveTypes.find((t) => t.id === 2);
  return (
    <div className="dashboard-page">
      <WelcomeHero actor={actor} />
      <div className="dashboard-section-label">
        <span>สรุปข้อมูลการลา</span>
        <span>อัปเดตจากข้อมูลล่าสุด</span>
      </div>
      <div className="stats">
        {employee ? (
          <>
            <Stat
              tone="mint"
              title="วันลาพักร้อนคงเหลือ"
              value={
                <>
                  {vacation.remaining}
                  <small>วัน</small>
                </>
              }
              note={`จากสิทธิ์ ${vacation.total} วัน · ปี ${year + 543}`}
              icon={<Wallet />}
            />

            <Stat
              tone="peach"
              title="คำขอรอพิจารณา"
              value={
                <>
                  {pending.length}
                  <small>คำขอ</small>
                </>
              }
              note="คำขอที่อยู่ระหว่างพิจารณา"
              icon={<Clock3 />}
            />

            <Stat
              tone="purple"
              title="คำขอที่อนุมัติแล้ว"
              value={
                <>
                  {requests.filter((r) => r.status === 'Approved').length}
                  <small>คำขอ</small>
                </>
              }
              note="รวมคำขอที่ได้รับอนุมัติทั้งหมด"
              icon={<CheckCircle2 />}
            />

            <Stat
              tone="sky"
              title="สถานะงานวันนี้"
              value={
                <span className="work-stat">
                  {formatWorkStatus(effectiveWorkStatus(db, actor.id, today()))}
                </span>
              }
              note={formatDate(today())}
              icon={<Laptop />}
            />
          </>
        ) : (
          <>
            <Stat
              tone="peach"
              title={actor.role === 'HR' ? 'คำขอส่งต่อรอพิจารณา' : 'คำขอรอพิจารณา'}
              value={
                <>
                  {actor.role === 'HR'
                    ? referrals.filter((r) => canDecideRequest(db, actor, r)).length
                    : pending.length}
                  <small>คำขอ</small>
                </>
              }
              note={actor.role === 'HR' ? 'รายการที่ได้รับมอบหมาย' : 'คำขอของพนักงานในทีม'}
              icon={<Clock3 />}
            />

            <Stat
              tone="purple"
              title={actor.role === 'HR' ? 'คำขอผู้จัดการรอพิจารณา' : 'ส่งต่อให้ HR แล้ว'}
              value={
                <>
                  {actor.role === 'HR' ? managerRequests.length : referrals.length}
                  <small>คำขอ</small>
                </>
              }
              note={actor.role === 'HR' ? 'คำขอส่วนตัวของผู้จัดการ' : 'HR เป็นผู้ตัดสินคำขอ'}
              icon={<ShieldCheck />}
            />

            <Stat
              tone="mint"
              title="พนักงานลาในวันนี้"
              value={
                <>
                  {approvedToday}
                  <small>คน</small>
                </>
              }
              note="จากคำขอที่อนุมัติแล้ว"
              icon={<CalendarDays />}
            />

            <Stat
              tone="sky"
              title={actor.role === 'HR' ? 'พนักงานทั้งหมด' : 'สมาชิกในทีม'}
              value={
                <>
                  {team.length}
                  <small>คน</small>
                </>
              }
              note="บัญชีที่ใช้งานอยู่"
              icon={<Users />}
            />
          </>
        )}
      </div>
      <div className="dashboard-grid">
        <div className="dashboard-main">
          <Card
            title={employee ? 'คำขอลาล่าสุด' : 'คำขอลาล่าสุด'}
            action={
              <a href="#/requests" className="text-link">
                ดูทั้งหมด
                <ArrowUpRight size={15} />
              </a>
            }
            className="table-card dashboard-requests"
          >
            <RequestTable db={db} requests={latest} showEmployee={!employee} />
          </Card>
          <WeeklyOverview db={db} actor={actor} />
          <div className="dashboard-tips">
            <span className="tip-icon">
              <FileText size={21} />
            </span>
            <div>
              <strong>ข้อควรรู้ก่อนยื่นลา</strong>
              <p>
                {sick?.documentRequiredFromDays != null
                  ? `ลาป่วยตั้งแต่ ${sick?.documentRequiredFromDays} วัน ต้องมีเอกสารประกอบ · `
                  : ''}
                แก้ไขหรือยกเลิกคำขอได้ขณะรอพิจารณา
              </p>
            </div>
            <a
              href={employee ? '#/new' : '#/requests'}
              aria-label={employee ? 'เปิดแบบฟอร์มยื่นลา' : 'เปิดรายการคำขอ'}
              className="icon-btn"
            >
              <ArrowUpRight size={19} />
            </a>
          </div>
        </div>
        <div className="dashboard-side">
          {employee ? (
            <QuotaOverview db={db} actor={actor} />
          ) : (
            <TeamOverview db={db} actor={actor} />
          )}
          <UpcomingLeave db={db} actor={actor} requests={requests} />
        </div>
      </div>
    </div>
  );
}
