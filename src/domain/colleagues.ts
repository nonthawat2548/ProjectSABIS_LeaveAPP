import type { ColleagueStatus, Database } from './types';
import { actorById, DomainError } from './service';
import { isoDate } from './date';

/** A display code for the existing Employee.id, not a new stored employee identifier. */
export const employeeCode = (id: number) => `EMP-${String(id).padStart(5, '0')}`;

/** Signed-in staff may look up work availability; private leave data keeps its original scope. */
export function searchColleagues(db: Database, actorId: number, query: string, date: string): ColleagueStatus[] {
    const actor = actorById(db, actorId);
    if (!['Employee', 'Manager', 'HR'].includes(actor.role)) throw new DomainError('ไม่มีสิทธิ์ค้นหาสถานะเพื่อนร่วมงาน', 'FORBIDDEN');
    if (typeof query !== 'string' || query.length > 100) throw new DomainError('ชื่อหรือรหัสพนักงานต้องไม่เกิน 100 ตัวอักษร');
    if (typeof date !== 'string' || !isoDate(date)) throw new DomainError('วันที่สำหรับตรวจสอบสถานะไม่ถูกต้อง');
    const keyword = query.normalize('NFKC').trim().replace(/\s+/g, ' ').toLocaleLowerCase('th-TH');
    const id = keyword.match(/^(?:emp-?)?(\d+)$/i);
    const people = db.employees.filter(person => person.active && (!keyword || (id ? person.id === Number(id[1]) : person.name.normalize('NFKC').replace(/\s+/g, ' ').toLocaleLowerCase('th-TH').includes(keyword))));
    const approved = new Map(db.requests.filter(request => request.status === 'Approved').map(request => [request.id, request]));
    const days = db.days.filter(day => day.date === date && approved.has(day.leaveId));
    return people.sort((a, b) => a.name.localeCompare(b.name, 'th')).map(person => {
        const leaveDays = days.filter(day => approved.get(day.leaveId)!.employeeId === person.id);
        const units = leaveDays.reduce((total, day) => total + day.units, 0);
        const leaveDuration = units >= 1 ? 'Full' : units > 0 ? approved.get(leaveDays[0].leaveId)!.duration : null;
        const recorded = db.workStatuses.find(status => status.employeeId === person.id && status.date === date);
        return {
            employeeId: person.id, name: person.name, position: person.position, department: person.department, date,
            workStatus: leaveDuration === 'Full' ? null : recorded?.statusType ?? null,
            leaveDuration, updatedAt: leaveDuration === 'Full' ? null : recorded?.updatedAt ?? null,
        };
    });
}
