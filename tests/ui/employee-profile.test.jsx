import { afterEach, test, expect } from '@jest/globals';
import { cleanup, render, screen } from '@testing-library/react';
import { EmployeeProfileDetails } from '../../src/pages/EmployeeProfilePage.jsx';
import { EmployeeProfileLink } from '../../src/EmployeeProfileLink.jsx';
import { createDemoDatabase } from '../../src/data/demoDatabase.js';
import { employeeProfile } from '../../src/domain/employeeProfile.js';

afterEach(cleanup);

test.each([
  [1, 1],
  [4, 1],
  [4, 4],
  [7, 6],
  [5, 1],
  [5, 7],
  [4, 6],
  [7, 1],
])('Account %i can view profile %i across departments', (actorId, employeeId) => {
  const full = createDemoDatabase();
  const actor = full.employees.find((person) => person.id === actorId);
  const employee = full.employees.find((person) => person.id === employeeId);
  render(
    <EmployeeProfileDetails actor={actor} profile={employeeProfile(full, actor.id, employeeId)} />,
  );
  expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('ประวัติพนักงาน');
  expect(screen.getByRole('heading', { level: 2, name: employee.name })).toBeInTheDocument();
  expect(screen.getByText(employee.email)).toBeInTheDocument();
  expect(screen.getByText(employee.phone)).toBeInTheDocument();
  expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
});

test.each([1, 4, 7])('Inactive account %i cannot expose a profile', (actorId) => {
  const full = createDemoDatabase();
  const actor = full.employees.find((person) => person.id === actorId);
  const employee = full.employees[0];
  render(
    <EmployeeProfileDetails
      actor={{ ...actor, active: false }}
      profile={{ employee, manager: null }}
    />,
  );
  expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('ไม่มีสิทธิ์เข้าถึง');
  expect(screen.queryByRole('heading', { name: 'ข้อมูลส่วนตัว' })).not.toBeInTheDocument();
  if (employee) {
    expect(screen.queryByText(employee.email)).not.toBeInTheDocument();
    expect(screen.queryByText(employee.phone)).not.toBeInTheDocument();
  }
});

test('Unknown or missing profile values are not invented and inactive accounts stay identifiable to HR', () => {
  const db = createDemoDatabase();
  const employee = db.employees[0];
  Object.assign(employee, {
    gender: '',
    phone: '',
    email: '',
    position: 'Custom Position',
    department: 'Custom Department',
    active: false,
  });
  render(
    <EmployeeProfileDetails
      actor={db.employees.find((person) => person.role === 'HR')}
      profile={{
        employee,
        manager: db.employees.find((person) => person.id === employee.managerId) ?? null,
      }}
    />,
  );
  expect(screen.getAllByText('ไม่ได้ระบุ')).toHaveLength(4);
  expect(screen.getByText('Custom Position')).toBeInTheDocument();
  expect(screen.getByText('Custom Department')).toBeInTheDocument();
  expect(screen.getByText('ปิดใช้งาน')).toBeInTheDocument();
  expect(screen.queryByText('วันเกิด')).not.toBeInTheDocument();
});

test('Employees cannot link other profiles; managers can link across departments', () => {
  const db = createDemoDatabase();
  const actor = db.employees[0];
  const own = render(
    <EmployeeProfileLink actor={actor} employee={actor}>
      ชื่อของฉัน
    </EmployeeProfileLink>,
  );
  expect(screen.getByRole('link', { name: 'ชื่อของฉัน' })).toHaveAttribute('href', '#/employee/1');
  own.rerender(
    <EmployeeProfileLink actor={actor} employee={db.employees[1]}>
      เพื่อนร่วมงาน
    </EmployeeProfileLink>,
  );
  expect(screen.queryByRole('link')).not.toBeInTheDocument();
  expect(screen.getByText('เพื่อนร่วมงาน')).toBeInTheDocument();
  own.rerender(
    <EmployeeProfileLink actor={db.employees[3]} employee={db.employees[5]}>
      เพื่อนร่วมงาน
    </EmployeeProfileLink>,
  );
  expect(screen.getByRole('link', { name: 'เพื่อนร่วมงาน' })).toHaveAttribute(
    'href',
    '#/employee/6',
  );
  expect(screen.getByText('เพื่อนร่วมงาน')).toBeInTheDocument();
  own.rerender(
    <EmployeeProfileLink actor={{ ...actor, active: false }} employee={actor}>
      ชื่อของฉัน
    </EmployeeProfileLink>,
  );
  expect(screen.queryByRole('link')).not.toBeInTheDocument();
});

test('An employee cannot render another profile even with unfiltered fixture data', () => {
  const db = createDemoDatabase();
  render(
    <EmployeeProfileDetails
      actor={db.employees[0]}
      profile={{ employee: db.employees[5], manager: null }}
    />,
  );
  expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('ไม่มีสิทธิ์เข้าถึง');
  expect(screen.queryByText(db.employees[5].email)).not.toBeInTheDocument();
});
