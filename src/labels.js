// Display labels only. Repository commands and stored enum values stay in English.
export const roleLabels = {
  Employee: 'พนักงาน',
  Manager: 'ผู้จัดการ',
  HR: 'ฝ่ายบุคคล (HR)',
};
export const statusLabels = {
  Pending: 'รอพิจารณา',
  Approved: 'อนุมัติแล้ว',
  Rejected: 'ไม่อนุมัติ',
  Withdrawn: 'ยกเลิกแล้ว',
};
export const durationLabels = {
  Full: 'เต็มวัน',
  AM: 'ครึ่งวันเช้า',
  PM: 'ครึ่งวันบ่าย',
};

const dayNumber = new Intl.NumberFormat('th-TH', { maximumFractionDigits: 2 });
/** @param {number} value */
export function leaveDayParts(value) {
  if (Number.isFinite(value) && value >= 0 && value % 1 === 0.5) {
    const whole = Math.trunc(value);
    return whole
      ? { number: dayNumber.format(whole), unit: 'วันครึ่ง' }
      : { number: 'ครึ่ง', unit: 'วัน' };
  }
  return { number: dayNumber.format(value), unit: 'วัน' };
}
/** Display saved day units in ordinary Thai without changing the numeric value. */
export function formatLeaveDays(value) {
  const parts = leaveDayParts(value);
  return `${parts.number}${parts.number === 'ครึ่ง' ? '' : ' '}${parts.unit}`;
}
/** @param {number | null} milliseconds */
export function formatApprovalTime(milliseconds) {
  if (milliseconds === null) return 'ยังไม่มีข้อมูล';
  if (milliseconds < 60000) return 'น้อยกว่า 1 นาที';
  const minutes = Math.round(milliseconds / 60000);
  if (minutes < 60) return `${dayNumber.format(minutes)} นาที`;
  if (minutes < 1440) return `${Math.floor(minutes / 60)} ชม. ${minutes % 60} นาที`;
  return `${Math.floor(minutes / 1440)} วัน ${Math.floor((minutes % 1440) / 60)} ชม.`;
}
export const workStatusLabels = {
  'In-office': 'ทำงานที่สำนักงาน',
  WFH: 'ทำงานจากบ้าน (WFH)',
  Outside: 'ปฏิบัติงานนอกสถานที่',
};

// Known demo job/department names only; preserve custom text and stored employee data.
const positionLabels = {
  นักพัฒนาระบบ: 'Software Developer',
  เจ้าหน้าที่ระบบ: 'Systems Administrator',
  นักวิเคราะห์ระบบ: 'Systems Analyst',
  ผู้จัดการฝ่ายไอที: 'IT Manager',
  เจ้าหน้าที่ฝ่ายบุคคล: 'HR Specialist',
  เจ้าหน้าที่ฝ่ายขาย: 'Sales Representative',
  ผู้จัดการฝ่ายขาย: 'Sales Manager',
  เจ้าหน้าที่ประสานงานขาย: 'Sales Coordinator',
  เจ้าหน้าที่ดูแลลูกค้า: 'Customer Service Representative',
  เจ้าหน้าที่ทดสอบระบบ: 'Software Tester',
};
const departmentLabels = {
  ฝ่ายไอที: 'IT Department',
  ฝ่ายบุคคล: 'Human Resources',
  ฝ่ายขาย: 'Sales Department',
};
export function formatPosition(value) {
  return Object.hasOwn(positionLabels, value) ? positionLabels[value] : value;
}
export function formatDepartment(value) {
  return Object.hasOwn(departmentLabels, value) ? departmentLabels[value] : value;
}
export function employeeLabelLanguage(value) {
  // eslint-disable-next-line no-control-regex -- Match the full ASCII range for English labels.
  return /^[\x00-\x7F]+$/.test(value) ? 'en' : undefined;
}

export function formatWorkStatus(status) {
  const label = (value) =>
    Object.hasOwn(workStatusLabels, value) ? workStatusLabels[value] : value;
  if (status === 'Leave') return 'ลา';
  const halfDay = ' / Leave (ครึ่งวัน)';
  if (status.endsWith(halfDay)) return `${label(status.slice(0, -halfDay.length))} / ลาครึ่งวัน`;
  return label(status);
}
