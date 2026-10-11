import { employeeLabelLanguage, formatDepartment, formatPosition } from './labels';

export function EmployeeLabel({ value, kind }: { value: string; kind: 'position' | 'department' }) {
    const label = kind === 'position' ? formatPosition(value) : formatDepartment(value);
    return <span lang={employeeLabelLanguage(label)}>{label}</span>;
}
