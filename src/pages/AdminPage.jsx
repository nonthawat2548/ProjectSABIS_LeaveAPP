import { EmployeeLabel } from '../EmployeeLabel.jsx';
import { EmployeeProfileLink } from '../EmployeeProfileLink.jsx';
import { useEffect, useState } from 'react';

import { today } from '../domain/date.js';
import { balance, maternityGenderIssue } from '../domain/service.js';
import { Card, Heading, KeyRow, roleLabels } from '../components.jsx';
import { useTask } from './useTask.js';

/** @param {import('./types.js').PageProps} props */
export function AdminPage({ actor, db, run }) {
  const [employeeId, setEmployeeId] = useState(1),
    [typeId, setTypeId] = useState(1),
    [year, setYear] = useState(String(Number(today().slice(0, 4)) + 543)),
    [granted, setGranted] = useState('10'),
    [maximum, setMaximum] = useState(
      String(db.leaveTypes.find((t) => t.quotaScope === 'Pregnancy')?.defaultQuotaDays ?? 0),
    );
  const { busy, error, perform } = useTask(run);
  const caseTask = useTask(run);
  const selected = db.employees.find((e) => e.id === employeeId);
  const grantYear = Number(year) - 543;
  useEffect(() => {
    const e = db.entitlements.find(
      (e) => e.employeeId === employeeId && e.leaveTypeId === typeId && e.year === grantYear,
    );
    setGranted(
      String(e?.grantedDays ?? db.leaveTypes.find((t) => t.id === typeId)?.defaultQuotaDays ?? 0),
    );
  }, [db, employeeId, typeId, grantYear]);
  const b = balance(db, employeeId, typeId, grantYear);
  return (
    <>
      <Heading
        title="ข้อมูลพนักงานและสิทธิ์การลา"
        description="จัดสรรสิทธิ์รายปี และเปิดกรณีลาคลอดให้พนักงาน"
      />

      <div className="columns">
        <div className="stack">
          <Card title="พนักงาน">
            <div className="field">
              <label htmlFor="admin-employee">เลือกพนักงาน</label>
              <select
                id="admin-employee"
                value={employeeId}
                onChange={(e) => {
                  setEmployeeId(Number(e.target.value));
                  caseTask.setError('');
                }}
              >
                {db.employees
                  .filter((e) => e.active)
                  .map((e) => (
                    <option value={e.id} key={e.id}>
                      {e.name}
                      {' · '}
                      {roleLabels[e.role]}
                    </option>
                  ))}
              </select>
            </div>
            <dl className="detail-grid">
              <div>
                <dt>อีเมล</dt>
                <dd>{selected.email}</dd>
              </div>
              <div>
                <dt>ตำแหน่ง</dt>
                <dd>
                  <EmployeeLabel kind="position" value={selected.position} />
                </dd>
              </div>
              <div>
                <dt>ฝ่าย</dt>
                <dd>
                  <EmployeeLabel kind="department" value={selected.department} />
                </dd>
              </div>
              <div>
                <dt>ผู้จัดการ</dt>
                <dd>{db.employees.find((e) => e.id === selected.managerId)?.name ?? 'ไม่กำหนด'}</dd>
              </div>
            </dl>
            <EmployeeProfileLink actor={actor} employee={selected} className="text-link">
              ดูประวัติพนักงาน
            </EmployeeProfileLink>
            <p className="tiny">เลือกบัญชีเพื่อดูข้อมูลพนักงานและจัดสรรสิทธิ์การลา</p>
          </Card>
          <Card title="กรณีลาคลอด">
            {db.maternityCases
              .filter((c) => c.employeeId === employeeId)
              .map((c) => {
                const t = db.leaveTypes.find((t) => t.quotaScope === 'Pregnancy');
                const q = balance(db, employeeId, t.id, 0, c.id);
                return (
                  <div className="case-row" key={c.id}>
                    <strong>
                      {'กรณีที่ '}
                      {c.caseNo}
                    </strong>
                    <span>
                      {'ทั้งหมด '}
                      {q.total}
                      {' · ใช้แล้ว '}
                      {q.used}
                      {' · รอพิจารณา '}
                      {q.pending}
                      {' · คงเหลือ '}
                      {q.remaining}
                      {' วัน'}
                    </span>
                  </div>
                );
              })}
            {caseTask.error && (
              <p className="error" role="alert">
                {caseTask.error}
              </p>
            )}
            {!maternityGenderIssue(selected) ? (
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  void caseTask.perform({
                    type: 'maternity',
                    employeeId,
                    maximumDays: Number(maximum),
                  });
                }}
              >
                <div className="inline-form">
                  <div className="field">
                    <label htmlFor="case-maximum">สิทธิ์กรณีใหม่ (วัน)</label>
                    <input
                      id="case-maximum"
                      type="number"
                      min={1}
                      max={999}
                      step={1}
                      value={maximum}
                      onChange={(e) => setMaximum(e.target.value)}
                      required
                    />
                  </div>
                  <button className="btn" disabled={busy || caseTask.busy}>
                    เปิดกรณีใหม่
                  </button>
                </div>
                <small>
                  {'กรณีละ '}
                  {db.leaveTypes.find((t) => t.quotaScope === 'Pregnancy')?.defaultQuotaDays}
                  {' วันตามนโยบายตัวอย่างของระบบ'}
                </small>
              </form>
            ) : (
              <p className="muted">{maternityGenderIssue(selected)}</p>
            )}
          </Card>
        </div>
        <Card title="จัดสรรสิทธิ์รายปี">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void perform({
                type: 'entitlement',
                employeeId,
                leaveTypeId: typeId,
                year: grantYear,
                grantedDays: Number(granted),
              });
            }}
          >
            <div className="field">
              <label htmlFor="entitlement-type">ประเภทการลา</label>
              <select
                id="entitlement-type"
                value={typeId}
                onChange={(e) => setTypeId(Number(e.target.value))}
              >
                {db.leaveTypes
                  .filter((t) => t.quotaScope === 'Annual')
                  .map((t) => (
                    <option value={t.id} key={t.id}>
                      {t.name}
                    </option>
                  ))}
              </select>
            </div>
            <div className="field">
              <label htmlFor="entitlement-year">ปี พ.ศ.</label>
              <input
                id="entitlement-year"
                type="number"
                min={2443}
                max={2743}
                value={year}
                onChange={(e) => setYear(e.target.value)}
                required
              />
            </div>
            <div className="field">
              <label htmlFor="entitlement-days">สิทธิ์ทั้งหมด (วัน)</label>
              <input
                id="entitlement-days"
                type="number"
                min={0}
                max={999}
                step="0.5"
                value={granted}
                onChange={(e) => setGranted(e.target.value)}
                required
              />
            </div>
            <KeyRow label="ใช้แล้ว">
              {b.used}
              {' วัน'}
            </KeyRow>
            <KeyRow label="รอพิจารณา">
              {b.pending}
              {' วัน'}
            </KeyRow>
            {error && (
              <p className="error" role="alert">
                {error}
              </p>
            )}
            <button className="btn primary" disabled={busy}>
              {busy ? 'กำลังบันทึก…' : 'บันทึกสิทธิ์'}
            </button>
            <p className="tiny">สิทธิ์ใหม่ต้องไม่น้อยกว่าวันที่ใช้แล้วรวมคำขอรอพิจารณา</p>
          </form>
        </Card>
      </div>
      <Card title="ข้อมูลสิทธิ์ที่จัดสรรทั้งหมด">
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>ประเภท</th>
                <th>ปี พ.ศ.</th>
                <th>ทั้งหมด</th>
                <th>ใช้แล้ว</th>
                <th>คงเหลือ</th>
                <th>รอพิจารณา</th>
              </tr>
            </thead>
            <tbody>
              {db.entitlements
                .filter((e) => e.employeeId === employeeId)
                .sort((a, b) => b.year - a.year || a.leaveTypeId - b.leaveTypeId)
                .map((e) => {
                  const q = balance(db, employeeId, e.leaveTypeId, e.year);
                  return (
                    <tr key={e.id}>
                      <td>{db.leaveTypes.find((t) => t.id === e.leaveTypeId)?.name}</td>
                      <td>{e.year + 543}</td>
                      <td>{q.total}</td>
                      <td>{q.used}</td>
                      <td>{q.remaining}</td>
                      <td>{q.pending}</td>
                    </tr>
                  );
                })}
            </tbody>
          </table>
        </div>
      </Card>
    </>
  );
}
