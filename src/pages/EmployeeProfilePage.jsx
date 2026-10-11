import { useEffect, useState } from 'react';
import { Card, Heading } from '../components.jsx';
import { repository } from '../data/index.js';
import { EmployeeLabel } from '../EmployeeLabel.jsx';
import { canViewEmployeeProfile } from '../EmployeeProfileLink.jsx';
import { employeeCode } from '../domain/colleagues.js';
import { loginUsername } from '../domain/auth.js';
import { roleLabels } from '../labels.js';
import { Avatar } from '../ui.jsx';

const genderLabels = { Male: 'ชาย', Female: 'หญิง', Other: 'อื่น ๆ' };

/** @param {import('./types.js').PageProps & { employeeId: number, embedded?: boolean }} props */
export function EmployeeProfilePage({ actor, employeeId, embedded = false }) {
  const [attempt, setAttempt] = useState(0);
  const [result, setResult] = useState(null);
  useEffect(() => {
    let current = true;
    setResult(null);
    repository.getEmployeeProfile(employeeId).then(
      (profile) => {
        if (current) setResult({ actorId: actor.id, employeeId, profile });
      },
      () => {
        if (current) setResult({ actorId: actor.id, employeeId, error: true });
      },
    );
    return () => {
      current = false;
    };
  }, [actor.id, employeeId, attempt]);
  const ready = result?.actorId === actor.id && result?.employeeId === employeeId;
  if (!ready || !result.profile)
    return (
      <div>
        {!embedded && <Heading title="ประวัติพนักงาน" />}
        <Card>
          {ready ? (
            <div role="alert">
              <p>ไม่สามารถโหลดประวัติพนักงานได้ หรือไม่พบข้อมูลพนักงาน</p>
              <button
                type="button"
                className="btn"
                onClick={(event) => {
                  event.currentTarget
                    .closest('[role="dialog"]')
                    ?.querySelector('.dialog-head button')
                    ?.focus();
                  setAttempt((value) => value + 1);
                }}
              >
                ลองอีกครั้ง
              </button>
            </div>
          ) : (
            <p role="status">กำลังโหลดประวัติพนักงาน…</p>
          )}
        </Card>
      </div>
    );
  return <EmployeeProfileDetails actor={actor} profile={result.profile} embedded={embedded} />;
}

/** @param {{actor: import('../domain/types.js').Employee, profile: import('../domain/types.js').EmployeeProfile, embedded?: boolean}} props */
export function EmployeeProfileDetails({ actor, profile, embedded = false }) {
  const { employee, manager } = profile;
  if (!canViewEmployeeProfile(actor, employee))
    return <Heading title="ไม่พบข้อมูลพนักงานหรือไม่มีสิทธิ์เข้าถึง" />;
  const fields = (items) => (
    <dl className="detail-grid employee-profile-details">
      {items.map(([label, value]) => (
        <div key={label}>
          <dt>{label}</dt>
          <dd>{value || 'ไม่ได้ระบุ'}</dd>
        </div>
      ))}
    </dl>
  );
  return (
    <div className="employee-profile-page">
      {!embedded && (
        <Heading
          title="ประวัติพนักงาน"
          action={
            <a className="btn" href="#/colleagues">
              สถานะเพื่อนร่วมงาน
            </a>
          }
        />
      )}
      <Card className="employee-profile-summary">
        <div className="person">
          <Avatar person={employee} />
          <div>
            <h2>{employee.name}</h2>
            <small>{employeeCode(employee.id)}</small>
          </div>
        </div>
      </Card>
      <div className="employee-profile-layout">
        <Card title="ข้อมูลส่วนตัว">
          {fields([
            ['ชื่อ–นามสกุล', employee.name],
            ['รหัสพนักงาน', employeeCode(employee.id)],
            ['เพศ', genderLabels[employee.gender]],
            ['ชื่อผู้ใช้', employee.email ? loginUsername(employee.email) : ''],
            ['อีเมล', employee.email],
            ['เบอร์โทรศัพท์', employee.phone],
          ])}
        </Card>
        <Card title="ข้อมูลการทำงาน">
          {fields([
            [
              'ตำแหน่ง',
              employee.position ? (
                <EmployeeLabel kind="position" value={employee.position} />
              ) : null,
            ],
            [
              'ฝ่าย',
              employee.department ? (
                <EmployeeLabel kind="department" value={employee.department} />
              ) : null,
            ],
            [
              'ผู้จัดการ',
              manager?.name ?? (employee.managerId == null ? 'ไม่ได้กำหนด' : 'ไม่ได้ระบุ'),
            ],
            ['สิทธิ์ในระบบ', roleLabels[employee.role]],
            ['สถานะบัญชี', employee.active ? 'ใช้งานอยู่' : 'ปิดใช้งาน'],
          ])}
        </Card>
      </div>
    </div>
  );
}
