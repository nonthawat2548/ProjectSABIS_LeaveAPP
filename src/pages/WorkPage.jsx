import { EmployeeLabel } from '../EmployeeLabel.jsx';
import { EmployeeProfileLink } from '../EmployeeProfileLink.jsx';
import { useEffect, useState } from 'react';
import { Info } from 'lucide-react';

import { formatDate, parseThaiDate, today } from '../domain/date.js';
import { effectiveWorkStatus } from '../domain/service.js';
import { Card, DateField, Heading } from '../components.jsx';
import { formatWorkStatus, workStatusLabels } from '../labels.js';
import { useTask } from './useTask.js';

function WorkStatusCards({ db, people, actor, date }) {
  return (
    <ul className="work-cards" aria-label="สถานะการทำงานของพนักงาน">
      {people.map((person) => {
        const status = effectiveWorkStatus(db, person.id, date);
        return (
          <li key={person.id}>
            <div>
              <strong>
                <EmployeeProfileLink actor={actor} employee={person}>
                  {person.name}
                </EmployeeProfileLink>
              </strong>
              <small>
                <EmployeeLabel kind="department" value={person.department} />
                {person.id === actor.id && ' · คุณ'}
              </small>
            </div>
            <span className={'work-badge ' + (status.includes('Leave') ? 'leave' : '')}>
              {formatWorkStatus(status)}
            </span>
          </li>
        );
      })}
    </ul>
  );
}

/** @param {import('./types.js').PageProps} props */
export function WorkPage({ db, actor, run }) {
  const [date, setDate] = useState(formatDate(today())),
    [status, setStatus] = useState('In-office');
  const { busy, error, perform } = useTask(run);
  const iso = parseThaiDate(date);
  const people = db.employees.filter(
    (e) =>
      e.active &&
      (actor.role === 'HR' ||
        e.id === actor.id ||
        (actor.role === 'Manager' && e.role !== 'HR' && e.managerId === actor.id)),
  );
  useEffect(() => {
    setStatus(
      db.workStatuses.find((w) => w.employeeId === actor.id && w.date === iso)?.statusType ??
        'In-office',
    );
  }, [db, iso, actor.id]);
  const mine = iso ? effectiveWorkStatus(db, actor.id, iso) : '—';
  return (
    <>
      <Heading
        title="สถานะการทำงานรายวัน"
        description={
          actor.role === 'Employee'
            ? 'อัปเดตสถานะการทำงานของคุณ'
            : 'ดูภาพรวมการทำงานของพนักงาน และอัปเดตสถานะของคุณ'
        }
      />

      <div className="columns">
        <Card title="สถานะการทำงาน">
          <div className="work-date">
            <DateField label="วันที่" value={date} onChange={setDate} />
          </div>
          {!iso ? (
            <div className="error">กรุณากรอกวัน/เดือน/ปี พ.ศ. ให้ถูกต้อง</div>
          ) : (
            <div className="work-status-overview">
              <div className="table-scroll work-table">
                <table>
                  <thead>
                    <tr>
                      <th>พนักงาน</th>
                      <th>ฝ่าย</th>
                      <th>สถานะ</th>
                    </tr>
                  </thead>
                  <tbody>
                    {people.map((e) => (
                      <tr key={e.id}>
                        <td>
                          <EmployeeProfileLink actor={actor} employee={e}>
                            {e.name}
                          </EmployeeProfileLink>
                          {e.id === actor.id && <small>คุณ</small>}
                        </td>
                        <td>
                          <EmployeeLabel kind="department" value={e.department} />
                        </td>
                        <td>
                          <span
                            className={
                              'work-badge ' +
                              (effectiveWorkStatus(db, e.id, iso).includes('Leave') ? 'leave' : '')
                            }
                          >
                            {formatWorkStatus(effectiveWorkStatus(db, e.id, iso))}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <WorkStatusCards db={db} people={people} actor={actor} date={iso} />
            </div>
          )}
        </Card>
        <Card title="อัปเดตสถานะของคุณ">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (iso) void perform({ type: 'work', date: iso, statusType: status });
            }}
          >
            <div className="field">
              <label htmlFor="work-status">{actor.name}</label>
              <select
                id="work-status"
                value={status}
                onChange={(e) => setStatus(e.target.value)}
                disabled={mine.includes('Leave')}
              >
                {Object.entries(workStatusLabels).map(([value, label]) => (
                  <option value={value} key={value}>
                    {label}
                  </option>
                ))}
              </select>
            </div>
            {mine.includes('Leave') && (
              <div className="info">
                <Info size={17} />
                <span>
                  {mine === 'Leave'
                    ? 'วันที่เลือกเป็นวันลาเต็มวันที่อนุมัติแล้ว'
                    : 'วันที่เลือกมีการลาครึ่งวันที่อนุมัติแล้ว'}
                </span>
              </div>
            )}
            {error && (
              <p className="error" role="alert">
                {error}
              </p>
            )}
            <button className="btn primary" disabled={busy || !iso || mine.includes('Leave')}>
              {busy ? 'กำลังบันทึก…' : 'บันทึกสถานะ'}
            </button>
            <p className="tiny">สถานะลามาจากคำขอที่อนุมัติแล้ว ระบบแสดงให้อัตโนมัติ</p>
          </form>
        </Card>
      </div>
    </>
  );
}
