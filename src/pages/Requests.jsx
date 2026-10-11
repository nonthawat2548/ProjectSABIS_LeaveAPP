import { useState } from 'react';
import { FilePlus2, Search } from 'lucide-react';

import { parseThaiDate } from '../domain/date.js';
import { requestCode } from '../domain/service.js';
import { Card, DateField, Heading, RequestTable, statusLabels } from '../components.jsx';
import { assigned } from './requestScope.js';

/** @param {import('./types.js').PageProps} props */
export function Requests({ db, actor }) {
  const [query, setQuery] = useState(''),
    [status, setStatus] = useState('all'),
    [typeId, setTypeId] = useState('all'),
    [start, setStart] = useState(''),
    [end, setEnd] = useState('');
  const rows = assigned(db, actor);
  const startIso = parseThaiDate(start),
    endIso = parseThaiDate(end);
  const filtered = rows
    .filter((r) => {
      const employee = db.employees.find((e) => e.id === r.employeeId);
      const consultationPending = db.approvals.some(
        (a) =>
          a.leaveId === r.id &&
          a.reviewType === 'Consultation' &&
          !a.cancelled &&
          a.status === 'Pending' &&
          a.approverId === actor.id,
      );
      return (
        (status === 'all' ||
          (status === 'HRPending' ? consultationPending : r.status === status)) &&
        (typeId === 'all' || r.leaveTypeId === Number(typeId)) &&
        (!startIso || r.endDate >= startIso) &&
        (!endIso || r.startDate <= endIso) &&
        `${requestCode(r)} ${employee?.name} ${r.reason}`
          .toLowerCase()
          .includes(query.toLowerCase().trim())
      );
    })
    .sort((a, b) => b.id - a.id);
  return (
    <>
      <Heading
        title={
          actor.role === 'Employee'
            ? 'ประวัติคำขอลา'
            : actor.role === 'HR'
              ? 'รายการคำขอปรึกษา HR'
              : 'รายการคำขอของทีม'
        }
        description={
          actor.role === 'HR'
            ? 'คำขอที่ผู้จัดการส่งมาขอความเห็น'
            : 'ค้นหาตามเลขคำขอ ชื่อพนักงาน หรือเหตุผล'
        }
        action={
          actor.role === 'Employee' && (
            <a className="btn primary" href="#/new">
              <FilePlus2 size={17} />
              ยื่นคำขอใหม่
            </a>
          )
        }
      />

      <Card>
        <div className="filters">
          <div className="field search-field">
            <label htmlFor="request-search">ค้นหา</label>
            <div className="search-input">
              <Search size={17} />
              <input
                id="request-search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="เลขคำขอ / ชื่อ / เหตุผล"
              />
            </div>
          </div>
          <div className="field">
            <label htmlFor="request-status">สถานะ</label>
            <select id="request-status" value={status} onChange={(e) => setStatus(e.target.value)}>
              <option value="all">ทุกสถานะ</option>
              {actor.role === 'HR' && <option value="HRPending">รอความเห็น HR</option>}
              {Object.entries(statusLabels).map(([v, label]) => (
                <option key={v} value={v}>
                  {label}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label htmlFor="request-type">ประเภทการลา</label>
            <select id="request-type" value={typeId} onChange={(e) => setTypeId(e.target.value)}>
              <option value="all">ทุกประเภท</option>
              {db.leaveTypes.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
          </div>
        </div>
        <details className="date-filter">
          <summary>กรองช่วงวันที่ลา</summary>
          <div className="form-grid">
            <DateField label="ตั้งแต่วันที่" value={start} onChange={setStart} />
            <DateField label="ถึงวันที่" value={end} onChange={setEnd} />
          </div>
          {((start && !startIso) ||
            (end && !endIso) ||
            (startIso && endIso && endIso < startIso)) && (
            <p className="error">ช่วงวันที่ไม่ถูกต้อง กรุณาตรวจสอบ</p>
          )}
        </details>
      </Card>
      <p className="list-count">
        {'พบ '}
        {filtered.length}
        {' คำขอ'}
      </p>
      <Card className="table-card">
        <RequestTable db={db} requests={filtered} showEmployee={actor.role !== 'Employee'} />
      </Card>
    </>
  );
}
