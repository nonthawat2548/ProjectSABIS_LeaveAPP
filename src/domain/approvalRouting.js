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
  return (
    request.status === 'Pending' &&
    (!!pendingHRReferral(db, actor, request) ||
      (!latestHRReferral(db, request) && isDecisionReviewer(db, actor, request)))
  );
}

/** The latest uncancelled referral owns the final decision, including older opinion records.
 * @param {Database} db @param {LeaveRequest} request
 */
export function latestHRReferral(db, request) {
  return (
    db.approvals
      .filter(
        (step) =>
          step.leaveId === request.id && step.reviewType === 'Consultation' && !step.cancelled,
      )
      .sort((a, b) => (b.stepNo ?? 0) - (a.stepNo ?? 0) || b.id - a.id)[0] ?? null
  );
}

/** HR decides a referred request; a manager/team change does not return that assignment.
 * @param {Database} db @param {Employee} actor @param {LeaveRequest} request
 */
export function pendingHRReferral(db, actor, request) {
  if (
    request.status !== 'Pending' ||
    request.employeeId === actor.id ||
    !db.employees.some((person) => person.id === actor.id && person.active && person.role === 'HR')
  )
    return null;
  const owner = db.employees.find(
    (person) => person.id === request.employeeId && person.active && person.role === 'Employee',
  );
  if (!owner) return null;
  const step = latestHRReferral(db, request);
  return step &&
    step.approverId === actor.id &&
    step.reviewRole === 'HR' &&
    (step.status === 'Pending' || step.status === 'Completed')
    ? step
    : null;
}
