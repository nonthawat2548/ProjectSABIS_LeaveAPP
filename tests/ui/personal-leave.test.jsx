import { afterEach, expect, jest, test } from '@jest/globals';
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
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

test('assigned HR makes the final decision and has no send-opinion action', async () => {
  const user = userEvent.setup();
  const { db, id } = fixture(1);
  applyCommand(db, 4, { type: 'refer', id, version: 1, hrId: 5, comment: 'ตรวจสอบสิทธิ์' }, now);
  const actor = db.employees.find((person) => person.id === 5);
  const run = jest.fn(async (command) => applyCommand(db, 5, command, now));
  const view = render(
    <RequestDetail db={visibleSnapshot(db, 5)} actor={actor} id={id} run={run} />,
  );
  expect(
    screen.queryByRole('button', { name: 'ส่งความเห็น', exact: true }),
  ).not.toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'ไม่อนุมัติ', exact: true })).toBeEnabled();
  await user.click(screen.getByRole('button', { name: 'อนุมัติ', exact: true }));
  expect(run).not.toHaveBeenCalled();
  const dialog = screen.getByRole('dialog', { name: 'ยืนยันอนุมัติคำขอ' });
  await user.type(within(dialog).getByLabelText('ความเห็น (ไม่บังคับ)'), 'ตรวจสอบแล้ว');
  await user.click(within(dialog).getByRole('button', { name: 'ยืนยัน', exact: true }));
  await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  expect(run).toHaveBeenCalledTimes(1);
  expect(run).toHaveBeenCalledWith({ type: 'approve', id, version: 2, comment: 'ตรวจสอบแล้ว' });
  expect(db.requests.find((request) => request.id === id).status).toBe('Approved');
  view.rerender(<RequestDetail db={visibleSnapshot(db, 5)} actor={actor} id={id} run={run} />);
  expect(screen.getByText('คำขอสิ้นสุดการพิจารณาแล้ว')).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'อนุมัติ', exact: true })).not.toBeInTheDocument();
});

test.each(['unassigned', 'cancelled'])('HR cannot approve a referral when %s', (state) => {
  const { db, id } = fixture(1);
  applyCommand(db, 4, { type: 'refer', id, version: 1, hrId: 5, comment: 'ตรวจสิทธิ์' }, now);
  const step = db.approvals.find((step) => step.reviewType === 'Consultation');
  if (state === 'unassigned') step.approverId = 11;
  if (state === 'cancelled') step.cancelled = true;
  render(
    <RequestDetail
      db={visibleSnapshot(db, 5)}
      actor={db.employees.find((person) => person.id === 5)}
      id={id}
      run={jest.fn()}
    />,
  );
  expect(screen.queryByRole('button', { name: 'อนุมัติ', exact: true })).not.toBeInTheDocument();
});

test('manager sees the transfer state without decision or return actions', () => {
  const { db, id } = fixture(1);
  applyCommand(db, 4, { type: 'refer', id, version: 1, hrId: 5, comment: 'ให้ HR ตัดสิน' }, now);
  render(
    <RequestDetail
      db={visibleSnapshot(db, 4)}
      actor={db.employees.find((person) => person.id === 4)}
      id={id}
      run={jest.fn()}
    />,
  );
  expect(screen.getByText('ส่งต่อให้ HR เป็นผู้ตัดสินแล้ว')).toBeInTheDocument();
  for (const name of ['อนุมัติ', 'ไม่อนุมัติ', 'ส่งต่อให้ HR', 'ส่งความเห็น'])
    expect(screen.queryByRole('button', { name, exact: true })).not.toBeInTheDocument();
});

test('HR rejects a transferred request with a required reason', async () => {
  const user = userEvent.setup();
  const { db, id } = fixture(1);
  applyCommand(db, 4, { type: 'refer', id, version: 1, hrId: 5, comment: 'ตรวจสิทธิ์' }, now);
  const run = jest.fn(async (command) => applyCommand(db, 5, command, now));
  render(
    <RequestDetail
      db={visibleSnapshot(db, 5)}
      actor={db.employees.find((person) => person.id === 5)}
      id={id}
      run={run}
    />,
  );
  await user.click(screen.getByRole('button', { name: 'ไม่อนุมัติ', exact: true }));
  const dialog = screen.getByRole('dialog', { name: 'ไม่อนุมัติคำขอ' });
  const reason = within(dialog).getByLabelText('เหตุผลการไม่อนุมัติ *');
  expect(reason).toBeRequired();
  await user.type(reason, 'ข้อมูลไม่ครบถ้วน');
  await user.click(within(dialog).getByRole('button', { name: 'ยืนยัน', exact: true }));
  await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  expect(run).toHaveBeenCalledWith({ type: 'reject', id, version: 2, comment: 'ข้อมูลไม่ครบถ้วน' });
  expect(db.requests.find((request) => request.id === id).status).toBe('Rejected');
});
