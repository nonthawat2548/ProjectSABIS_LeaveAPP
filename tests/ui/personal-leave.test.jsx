import { afterEach, expect, jest, test } from '@jest/globals';
import { cleanup, render, screen } from '@testing-library/react';
import { createDemoDatabase } from '../../src/data/demoDatabase.js';
import { applyCommand, visibleSnapshot } from '../../src/domain/service.js';
import { RequestDetail } from '../../src/pages/RequestDetail.jsx';

afterEach(cleanup);
const now = new Date('2026-10-10T05:00:00Z');
function fixture(ownerId) {
  const db = createDemoDatabase();
  db.requests = [];
  db.days = [];
  db.approvals = [];
  db.documents = [];
  db.notifications = [];
  const { id } = applyCommand(
    db,
    ownerId,
    {
      type: 'submit',
      input: {
        leaveTypeId: 1,
        maternityCaseId: null,
        startDate: '2026-12-04',
        endDate: '2026-12-04',
        duration: 'Full',
        reason: 'พักผ่อน',
      },
    },
    now,
  );
  return { db, id };
}
test.each([
  [4, 5],
  [7, 5],
])(
  'owner %i edits/withdraws; only assigned reviewer %i sees decision actions',
  (ownerId, reviewerId) => {
    const { db, id } = fixture(ownerId);
    const own = visibleSnapshot(db, ownerId);
    render(
      <RequestDetail
        db={own}
        actor={db.employees.find((e) => e.id === ownerId)}
        id={id}
        run={jest.fn()}
      />,
    );
    expect(screen.getByRole('link', { name: 'แก้ไขคำขอ' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'ถอนคำขอ' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'อนุมัติ', exact: true })).not.toBeInTheDocument();
    cleanup();
    render(
      <RequestDetail
        db={visibleSnapshot(db, reviewerId)}
        actor={db.employees.find((e) => e.id === reviewerId)}
        id={id}
        run={jest.fn()}
      />,
    );
    expect(screen.getByRole('button', { name: 'อนุมัติ', exact: true })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'ถอนคำขอ' })).not.toBeInTheDocument();
  },
);

test('legacy HR leave can be withdrawn by its owner but has no edit or manager decision', () => {
  const { db, id } = fixture(4);
  db.requests[0].employeeId = 5;
  db.employees.find((person) => person.id === 5).managerId = 4;
  db.approvals[0].approverId = 4;
  db.approvals[0].reviewRole = 'Manager';
  render(
    <RequestDetail
      db={visibleSnapshot(db, 5)}
      actor={db.employees.find((e) => e.id === 5)}
      id={id}
      run={jest.fn()}
    />,
  );
  expect(screen.queryByRole('link', { name: 'แก้ไขคำขอ' })).not.toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'ถอนคำขอ' })).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'อนุมัติ', exact: true })).not.toBeInTheDocument();
  cleanup();
  render(
    <RequestDetail db={db} actor={db.employees.find((e) => e.id === 4)} id={id} run={jest.fn()} />,
  );
  expect(
    screen.getByRole('heading', { name: 'ไม่พบคำขอ หรือไม่มีสิทธิ์เข้าถึง' }),
  ).toBeInTheDocument();
});
