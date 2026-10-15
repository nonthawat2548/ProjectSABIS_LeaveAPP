/** @typedef {import('./types.js').Database} Database */
/** @typedef {import('./types.js').Employee} Employee */
/** @typedef {import('./types.js').LeaveRequest} LeaveRequest */

export const HR_PERSONAL_LEAVE_UNAVAILABLE =
  'ยังไม่เปิดการยื่นลาสำหรับ HR เนื่องจากยังไม่มีผู้อนุมัติระดับสูงกว่า';

/**
 * Resolve a different active staff member using the existing employee/approval fields.
 * @param {Database} db @param {Employee} owner @returns {Employee | null}
 */
export function requestReviewer(db, owner) {
  if (owner.role === 'HR') return null;
  if (owner.role === 'Manager')
    return (
      db.employees
        .filter((person) => person.active && person.role === 'HR' && person.id !== owner.id)
        .sort((a, b) => a.id - b.id)[0] ?? null
    );
  const managerId = owner.managerId;
  return (
    db.employees.find(
      (person) =>
        person.id === managerId &&
        person.id !== owner.id &&
        person.active &&
        person.role === 'Manager',
    ) ?? null
  );
}

/** @param {Database} db @param {Employee} actor @param {LeaveRequest} request */
export function isDecisionReviewer(db, actor, request) {
  if (!actor.active || actor.id === request.employeeId) return false;
  const owner = db.employees.find((person) => person.id === request.employeeId);
  if (!owner || requestReviewer(db, owner)?.id !== actor.id) return false;
  const decisions = db.approvals.filter(
    (step) => step.leaveId === request.id && step.reviewType === 'Decision' && !step.cancelled,
  );
  return (
    decisions.some((step) => step.approverId === actor.id && step.reviewRole === actor.role) ||
    (owner.role === 'Employee' && decisions.length === 0)
  );
}

/** @param {Database} db @param {Employee} actor @param {LeaveRequest} request */
export function canDecideRequest(db, actor, request) {
  return request.status === 'Pending' && isDecisionReviewer(db, actor, request);
}
