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

// Known demo job/department names only; preserve custom text and stored employee data.
const positionLabels: Record<string, string> = {
    'นักพัฒนาระบบ': 'Software Developer',
    'เจ้าหน้าที่ระบบ': 'Systems Administrator',
    'นักวิเคราะห์ระบบ': 'Systems Analyst',
    'ผู้จัดการฝ่ายไอที': 'IT Manager',
    'เจ้าหน้าที่ฝ่ายบุคคล': 'HR Specialist',
    'เจ้าหน้าที่ฝ่ายขาย': 'Sales Representative',
    'ผู้จัดการฝ่ายขาย': 'Sales Manager',
    'เจ้าหน้าที่ประสานงานขาย': 'Sales Coordinator',
    'เจ้าหน้าที่ดูแลลูกค้า': 'Customer Service Representative',
    'เจ้าหน้าที่ทดสอบระบบ': 'Software Tester',
};
const departmentLabels: Record<string, string> = {
    'ฝ่ายไอที': 'IT Department',
    'ฝ่ายบุคคล': 'Human Resources',
    'ฝ่ายขาย': 'Sales Department',
};
export function formatPosition(value: string): string { return Object.hasOwn(positionLabels, value) ? positionLabels[value] : value }
export function formatDepartment(value: string): string { return Object.hasOwn(departmentLabels, value) ? departmentLabels[value] : value }
export function employeeLabelLanguage(value: string): 'en' | undefined { return /^[\x00-\x7F]+$/.test(value) ? 'en' : undefined }

export function formatWorkStatus(status: string): string {
    const label = (value: string) => Object.hasOwn(workStatusLabels, value) ? workStatusLabels[value as WorkStatus['statusType']] : value;
    if (status === 'Leave') return 'ลา';
    const halfDay = ' / Leave (ครึ่งวัน)';
    if (status.endsWith(halfDay)) return `${label(status.slice(0, -halfDay.length))} / ลาครึ่งวัน`;
    return label(status);
}
