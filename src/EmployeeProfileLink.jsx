import { createContext, useContext } from 'react';
import { canReadEmployeeProfile } from './domain/employeeProfile.js';

export const EmployeeProfileContext = createContext(null);

/** Employees read their own profile; managers and HR read across departments. */
export function canViewEmployeeProfile(actor, employee) {
  return Boolean(
    employee &&
    canReadEmployeeProfile(actor, employee.id) &&
    (employee.active || actor.role === 'HR'),
  );
}

export function EmployeeProfileLink({
  actor,
  employee,
  children,
  className = 'employee-profile-link',
  onClick = null,
  ...linkProps
}) {
  const openProfile = useContext(EmployeeProfileContext);
  if (!canViewEmployeeProfile(actor, employee)) return children ?? employee?.name ?? null;
  return (
    <a
      {...linkProps}
      href={'#/employee/' + employee.id}
      className={className}
      title="ดูประวัติพนักงาน"
      onClick={(event) => {
        onClick?.(event);
        if (
          !openProfile ||
          event.defaultPrevented ||
          event.button !== 0 ||
          event.ctrlKey ||
          event.metaKey ||
          event.shiftKey ||
          event.altKey
        )
          return;
        event.preventDefault();
        openProfile(employee.id, event.currentTarget);
      }}
    >
      {children ?? employee.name}
    </a>
  );
}
