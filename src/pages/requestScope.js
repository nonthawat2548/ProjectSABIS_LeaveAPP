import { latestHRReferral } from '../domain/approvalRouting.js';

export function assigned(db, actor) {
  return db.requests.filter((r) =>
    actor.role === 'Employee'
      ? r.employeeId === actor.id
      : actor.role === 'HR'
        ? latestHRReferral(db, r)?.approverId === actor.id
        : r.employeeId !== actor.id &&
          db.employees.find((e) => e.id === r.employeeId)?.role === 'Employee' &&
          db.employees.find((e) => e.id === r.employeeId)?.managerId === actor.id,
  );
}
