import { useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';

import { formatDate, thaiMonths, today } from '../domain/date.js';
import { Card, Heading, monthShift, statusLabels } from '../components.jsx';
import { durationLabels as durations } from '../labels.js';

/** @param {import('./types.js').PageProps} props */
export function CalendarPage({ db, actor }) {
  const [month, setMonth] = useState(today().slice(0, 7) + '-01'),
    [pending, setPending] = useState(true),
    [person, setPerson] = useState('all');
  const y = Number(month.slice(0, 4)),
    m = Number(month.slice(5, 7));
  const first = new Date(month + 'T00:00:00Z').getUTCDay(),
    count = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const members = db.employees.filter(
    (e) => e.active && (actor.role === 'HR' || e.managerId === actor.id),
  );
  const rows = db.requests.filter(
    (r) =>
      (actor.role === 'HR' || members.some((e) => e.id === r.employeeId)) &&
      (r.status === 'Approved' || (pending && r.status === 'Pending')) &&
      (person === 'all' || r.employeeId === Number(person)),
  );
  return (
    <>
      <Heading title="ปฏิทินการลา" description="แสดงเฉพาะวันที่นับเป็นวันลาในแต่ละคำขอ" />
      <Card>
        <div className="calendar-controls">
          <div className="actions">
            <button
              className="icon-btn"
              aria-label="เดือนก่อนหน้า"
              onClick={() => setMonth(monthShift(month, -1))}
            >
              <ChevronLeft />
            </button>
            <h2>
              {thaiMonths[m - 1]} {y + 543}
            </h2>
            <button
              className="icon-btn"
              aria-label="เดือนถัดไป"
              onClick={() => setMonth(monthShift(month, 1))}
            >
              <ChevronRight />
            </button>
            <button className="btn small" onClick={() => setMonth(today().slice(0, 7) + '-01')}>
              เดือนนี้
            </button>
          </div>
          <div className="actions">
            <select
              aria-label="พนักงานในปฏิทิน"
              value={person}
              onChange={(e) => setPerson(e.target.value)}
            >
              <option value="all">พนักงานทั้งหมด</option>
              {members.map((e) => (
                <option value={e.id} key={e.id}>
                  {e.name}
                </option>
              ))}
            </select>
            <label className="checkbox">
              <input
                type="checkbox"
                checked={pending}
                onChange={(e) => setPending(e.target.checked)}
              />
              แสดงรอพิจารณา
            </label>
          </div>
        </div>
        <div className="calendar-scroll">
          <div className="calendar-grid">
            {['อาทิตย์', 'จันทร์', 'อังคาร', 'พุธ', 'พฤหัสบดี', 'ศุกร์', 'เสาร์'].map((d) => (
              <div className="calendar-day heading" key={d}>
                {d}
              </div>
            ))}
            {Array.from({ length: first }, (_, i) => (
              <div className="calendar-day empty" key={'e' + i} />
            ))}
            {Array.from({ length: count }, (_, i) => {
              const iso = `${y}-${String(m).padStart(2, '0')}-${String(i + 1).padStart(2, '0')}`,
                holiday = db.holidays.find((h) => h.date === iso),
                events = rows.filter((r) =>
                  db.days.some((d) => d.leaveId === r.id && d.date === iso),
                );
              return (
                <div className={'calendar-day ' + (iso === today() ? 'today' : '')} key={iso}>
                  <span className="day-number" title={formatDate(iso)}>
                    {i + 1}
                  </span>
                  {holiday && <small className="holiday-label">{holiday.name}</small>}
                  {events.map((r) => (
                    <a
                      key={r.id}
                      className={'calendar-event ' + r.status.toLowerCase()}
                      href={'#/request/' + r.id}
                      title={`${db.employees.find((e) => e.id === r.employeeId)?.name} · ${formatDate(iso)} · ${statusLabels[r.status]}`}
                    >
                      {db.employees.find((e) => e.id === r.employeeId)?.name.split(' ')[0]}
                      {r.duration !== 'Full' ? ' · ' + durations[r.duration] : ''}
                    </a>
                  ))}
                </div>
              );
            })}
          </div>
        </div>
        <div className="calendar-legend">
          <span>
            <i className="approved-dot" />
            อนุมัติแล้ว
          </span>
          <span>
            <i className="pending-dot" />
            รอพิจารณา
          </span>
          <span>คลิกชื่อเพื่อดูรายละเอียดคำขอ</span>
        </div>
      </Card>
    </>
  );
}
