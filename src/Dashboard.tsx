import { ArrowUpRight, CalendarDays, CheckCircle2, Clock3, Laptop, Users, Wallet, FileText, ShieldCheck } from 'lucide-react';
import type { PageProps } from './App';
import { balance, effectiveWorkStatus } from './domain/service';
import { formatDate, today } from './domain/date';
import { Card, RequestTable, Stat } from './components';
import { QuotaOverview, TeamOverview, UpcomingLeave, WelcomeHero, WeeklyOverview } from './ui';

export function Dashboard({ db, actor }: PageProps) {
    const employee = actor.role === 'Employee';
    const requests = db.requests.filter(r => employee ? r.employeeId === actor.id : actor.role === 'HR' ? db.approvals.some(a => a.leaveId === r.id && a.approverId === actor.id && a.reviewType === 'Consultation' && !a.cancelled) : db.employees.find(e => e.id === r.employeeId)?.managerId === actor.id);
    const year = Number(today().slice(0, 4)), vacation = balance(db, actor.id, 1, year), pending = requests.filter(r => r.status === 'Pending');
    const consultations = db.approvals.filter(a => a.reviewType === 'Consultation' && !a.cancelled && a.status === 'Pending' && (actor.role !== 'HR' || a.approverId === actor.id));
    const team = db.employees.filter(e => e.active && (actor.role === 'HR' || e.managerId === actor.id));
    const approvedToday = new Set(db.requests.filter(r => team.some(e => e.id === r.employeeId) && r.status === 'Approved' && db.days.some(d => d.leaveId === r.id && d.date === today())).map(r => r.employeeId)).size;
    const latest = [...requests].sort((a, b) => b.id - a.id).slice(0, 4);
    const sick = db.leaveTypes.find(t => t.id === 2);
    return <div className="dashboard-page"><WelcomeHero db={db} actor={actor} />
        <div className="dashboard-section-label"><span>ภาพรวมของคุณ</span><span>อัปเดตจากข้อมูลล่าสุด</span></div>
        <div className="stats">{employee ? <>
            <Stat tone="mint" title="พักร้อนคงเหลือ" value={<>{vacation.remaining}<small>วัน</small></>} note={`จากสิทธิ์ ${vacation.total} วัน · ปี ${year + 543}`} icon={<Wallet />} />
            <Stat tone="peach" title="กำลังรอพิจารณา" value={<>{pending.length}<small>คำขอ</small></>} note="ติดตามความคืบหน้าได้ทุกขั้นตอน" icon={<Clock3 />} />
            <Stat tone="purple" title="คำขอที่อนุมัติ" value={<>{requests.filter(r => r.status === 'Approved').length}<small>คำขอ</small></>} note="รวมคำขอที่ได้รับอนุมัติทั้งหมด" icon={<CheckCircle2 />} />
            <Stat tone="sky" title="สถานะการทำงานวันนี้" value={<span className="work-stat">{effectiveWorkStatus(db, actor.id, today()).replace('In-office', 'In office')}</span>} note={formatDate(today())} icon={<Laptop />} />
        </> : <>
            <Stat tone="peach" title={actor.role === 'HR' ? 'รอความเห็นของคุณ' : 'คำขอรอพิจารณา'} value={<>{actor.role === 'HR' ? consultations.length : pending.length}<small>คำขอ</small></>} note={actor.role === 'HR' ? 'รายการที่ได้รับมอบหมาย' : 'คำขอของพนักงานในทีม'} icon={<Clock3 />} />
            <Stat tone="purple" title="อยู่ระหว่างปรึกษา HR" value={<>{consultations.length}<small>คำขอ</small></>} note="รอความเห็นก่อนตัดสินผล" icon={<ShieldCheck />} />
            <Stat tone="mint" title="พนักงานลาในวันนี้" value={<>{approvedToday}<small>คน</small></>} note="จากคำขอที่อนุมัติแล้ว" icon={<CalendarDays />} />
            <Stat tone="sky" title={actor.role === 'HR' ? 'พนักงานทั้งหมด' : 'สมาชิกในทีม'} value={<>{team.length}<small>คน</small></>} note="บัญชีที่ใช้งานอยู่" icon={<Users />} />
        </>}</div>
        <div className="dashboard-grid"><div className="dashboard-main"><Card title={employee ? 'คำขอล่าสุดของคุณ' : 'รายการที่ต้องติดตาม'} action={<a href="#/requests" className="text-link">ดูทั้งหมด<ArrowUpRight size={15} /></a>} className="table-card dashboard-requests"><RequestTable db={db} requests={latest} showEmployee={!employee} /></Card><WeeklyOverview db={db} actor={actor} /><div className="dashboard-tips"><span className="tip-icon"><FileText size={21} /></span><div><strong>ยื่นลาได้อย่างมั่นใจ</strong><p>{sick?.documentRequiredFromDays != null ? `ลาป่วยตั้งแต่ ${sick?.documentRequiredFromDays} วัน ต้องมีเอกสารประกอบ · ` : ''}แก้ไขหรือยกเลิกคำขอได้ขณะรอพิจารณา</p></div><a href={employee ? '#/new' : '#/requests'} aria-label={employee ? 'เปิดแบบฟอร์มยื่นลา' : 'เปิดรายการคำขอ'} className="icon-btn"><ArrowUpRight size={19} /></a></div></div><div className="dashboard-side">{employee ? <QuotaOverview db={db} actor={actor} /> : <TeamOverview db={db} actor={actor} />}<UpcomingLeave db={db} actor={actor} requests={requests} /></div></div>
    </div>;
}
