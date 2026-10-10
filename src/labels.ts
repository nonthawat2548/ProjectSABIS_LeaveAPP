import type { Duration, RequestStatus, Role, WorkStatus } from './domain/types';

// Display labels only. Repository commands and stored enum values stay in English.
export const roleLabels: Record<Role, string> = { Employee: 'พนักงาน', Manager: 'ผู้จัดการ', HR: 'ฝ่ายบุคคล (HR)' };
export const statusLabels: Record<RequestStatus, string> = { Pending: 'รอพิจารณา', Approved: 'อนุมัติแล้ว', Rejected: 'ไม่อนุมัติ', Withdrawn: 'ยกเลิกแล้ว' };
export const durationLabels: Record<Duration, string> = { Full: 'เต็มวัน', AM: 'ครึ่งวันเช้า', PM: 'ครึ่งวันบ่าย' };
export const workStatusLabels: Record<WorkStatus['statusType'], string> = {
    'In-office': 'ทำงานที่สำนักงาน',
    WFH: 'ทำงานจากบ้าน (WFH)',
    Outside: 'ปฏิบัติงานนอกสถานที่',
};

export function formatWorkStatus(status: string): string {
    const label = (value: string) => Object.hasOwn(workStatusLabels, value) ? workStatusLabels[value as WorkStatus['statusType']] : value;
    if (status === 'Leave') return 'ลา';
    const halfDay = ' / Leave (ครึ่งวัน)';
    if (status.endsWith(halfDay)) return `${label(status.slice(0, -halfDay.length))} / ลาครึ่งวัน`;
    return label(status);
}
