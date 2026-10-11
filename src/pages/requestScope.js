export function assigned(db, actor) {
  return db.requests.filter((r) =>
    actor.role === 'Employee'
      ? r.employeeId === actor.id
      : actor.role === 'HR'
        ? db.approvals.some(
            (a) =>
              a.leaveId === r.id &&
              a.approverId === actor.id &&
              a.reviewType === 'Consultation' &&
              !a.cancelled,
          )
        : db.employees.find((e) => e.id === r.employeeId)?.managerId === actor.id,
  );
}
