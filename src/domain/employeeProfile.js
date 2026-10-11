import { actorById, DomainError } from './service.js';

/** @param {Pick<import('./types').Employee, 'id' | 'role' | 'active'> | null} actor
 * @param {number} employeeId */
export function canReadEmployeeProfile(actor, employeeId) {
  return Boolean(
    actor?.active &&
    (actor.role === 'Manager' ||
      actor.role === 'HR' ||
      (actor.role === 'Employee' && actor.id === employeeId)),
  );
}

/** @param {string | null} value */
export function parseEmployeeProfileId(value) {
  return value && /^\d+$/.test(value) ? Number(value) : NaN;
}

/**
 * Read one staff profile without widening the private leave snapshot.
 * @param {import('./types').Database} db
 * @param {number} actorId
 * @param {number} employeeId
 * @returns {import('./types').EmployeeProfile}
 */
export function employeeProfile(db, actorId, employeeId) {
  const actor = actorById(db, actorId);
  if (!Number.isSafeInteger(employeeId) || employeeId < 1)
    throw new DomainError('รหัสพนักงานไม่ถูกต้อง');
  if (!canReadEmployeeProfile(actor, employeeId))
    throw new DomainError('ไม่มีสิทธิ์ดูประวัติพนักงานคนอื่น', 'FORBIDDEN');
  const employee = db.employees.find((person) => person.id === employeeId);
  if (!employee || (!employee.active && actor.role !== 'HR'))
    throw new DomainError('ไม่พบข้อมูลพนักงาน', 'NOT_FOUND');
  const manager = db.employees.find((person) => person.id === employee.managerId);
  return structuredClone({
    employee,
    manager: manager ? { id: manager.id, name: manager.name } : null,
  });
}
