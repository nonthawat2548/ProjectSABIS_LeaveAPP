import { employeeLabelLanguage, formatDepartment, formatPosition } from './labels.js';

export function EmployeeLabel({ value, kind }) {
  const label = kind === 'position' ? formatPosition(value) : formatDepartment(value);
  return <span lang={employeeLabelLanguage(label)}>{label}</span>;
}
