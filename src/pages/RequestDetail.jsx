import { EmployeeLabel } from '../EmployeeLabel.jsx';
import { EmployeeProfileLink } from '../EmployeeProfileLink.jsx';
import { useState } from 'react';
import { Check, ChevronLeft, Clock3, Send, Users, X } from 'lucide-react';

import { formatDate, formatDateTime } from '../domain/date.js';
import { balance, requestCode, totalDays } from '../domain/service.js';
import { Badge, Card, Dialog, DocumentRow, Heading, KeyRow } from '../components.jsx';
import { durationLabels as durations } from '../labels.js';
import { useTask } from './useTask.js';

/** @param {import('./types.js').PageProps & { id: number }} props */
export function RequestDetail({ db, actor, run, id }) {
  const r = db.requests.find((r) => r.id === id);
  const [dialog, setDialog] = useState(null),
    [comment, setComment] = useState(''),
    [hrId, setHrId] = useState(db.employees.find((e) => e.role === 'HR')?.id ?? 0);
  const { busy, error, setError, perform } = useTask(run);
  if (!r)
    return (
      <>
        <Heading title="ไม่พบคำขอ หรือไม่มีสิทธิ์เข้าถึง" />
        <a className="btn" href="#/requests">
          กลับรายการคำขอ
        </a>
      </>
    );

  const person = db.employees.find((e) => e.id === r.employeeId);
  const type = db.leaveTypes.find((t) => t.id === r.leaveTypeId);
  const documents = db.documents.filter((d) => d.leaveId === r.id);
  const consults = db.approvals.filter(
    (a) => a.leaveId === r.id && a.reviewType === 'Consultation' && !a.cancelled,
  );
  const waitingHR = consults.some((a) => a.status === 'Pending');
  const ownHR = consults.find((a) => a.approverId === actor.id && a.status === 'Pending');
  const year = Number(r.startDate.slice(0, 4));
  const q = balance(db, r.employeeId, r.leaveTypeId, year, r.maternityCaseId);
  const labels = {
    approve: 'ยืนยันอนุมัติคำขอ',
    reject: 'ไม่อนุมัติคำขอ',
    refer: 'ขอความเห็นจาก HR',
    consult: 'ส่งความเห็นให้ผู้จัดการ',
    withdraw: 'ยืนยันยกเลิกคำขอ',
  };
  function open(d) {
    setDialog(d);
    setComment('');
    setError('');
  }
  async function confirm(e) {
    e.preventDefault();
    if (!dialog) return;
    let c;
    if (dialog === 'withdraw') c = { type: dialog, id: r.id, version: r.version };
    else if (dialog === 'refer') c = { type: dialog, id: r.id, version: r.version, comment, hrId };
    else c = { type: dialog, id: r.id, version: r.version, comment };
    await perform(c, () => setDialog(null));
  }
  return (
    <>
      <Heading
        title={requestCode(r)}
        description={`ยื่นเมื่อ ${formatDateTime(r.requestDate)}`}
        action={<Badge status={r.status} />}
      />

      <div className="columns">
        <div className="stack">
          <Card title="รายละเอียดคำขอ">
            <div className="person">
              <span className="avatar">{person.name[0]}</span>
              <div>
                <strong>
                  <EmployeeProfileLink actor={actor} employee={person}>
                    {person.name}
                  </EmployeeProfileLink>
                </strong>
                <small>
                  <EmployeeLabel kind="position" value={person.position} />
                  {' · '}
                  <EmployeeLabel kind="department" value={person.department} />
                </small>
              </div>
            </div>
            <dl className="detail-grid">
              <div>
                <dt>ประเภทการลา</dt>
                <dd>{type.name}</dd>
              </div>
              <div>
                <dt>จำนวนวันลา</dt>
                <dd>
                  {totalDays(db, r.id)}
                  {' วัน · '}
                  {durations[r.duration]}
                </dd>
              </div>
              <div>
                <dt>วันที่เริ่มลา</dt>
                <dd>{formatDate(r.startDate)}</dd>
              </div>
              <div>
                <dt>วันที่สิ้นสุดลา</dt>
                <dd>{formatDate(r.endDate)}</dd>
              </div>
            </dl>
            <div className="reason-box">
              <small>เหตุผลการลา</small>
              <p>{r.reason}</p>
            </div>
            <h3 className="section-title">เอกสารประกอบ</h3>
            {documents.length ? (
              documents.map((d) => <DocumentRow document={d} key={d.id} />)
            ) : (
              <p className="muted">ไม่มีเอกสารแนบ</p>
            )}
          </Card>
          {consults.length > 0 && (
            <Card title="ความเห็นจาก HR">
              {consults.map((c) => (
                <div className="consult-row" key={c.id}>
                  <div className="actions between">
                    <strong>{db.employees.find((e) => e.id === c.approverId)?.name}</strong>
                    <span className={'badge ' + (c.status === 'Pending' ? 'pending' : 'approved')}>
                      {c.status === 'Pending' ? 'รอความเห็น' : 'ส่งความเห็นแล้ว'}
                    </span>
                  </div>
                  <p>{c.comment}</p>
                  <small>{formatDateTime(c.reviewedAt ?? c.assignedAt)}</small>
                </div>
              ))}
            </Card>
          )}
          <Card title="บันทึกการดำเนินการ">
            <ol className="timeline">
              {r.timeline.map((event, i) => (
                <li key={i}>
                  <strong>{event.action}</strong>
                  <small>
                    {db.employees.find((e) => e.id === event.actorId)?.name ?? 'เจ้าหน้าที่'}
                    {' · '}
                    {formatDateTime(event.at)}
                  </small>
                  {event.comment && <p>{event.comment}</p>}
                </li>
              ))}
            </ol>
          </Card>
        </div>
        <div className="stack">
          <Card title="สิทธิ์วันลาของผู้ยื่น">
            <KeyRow label={type.quotaScope === 'Annual' ? `ปี ${year + 543}` : 'กรณีลาคลอด'}>
              {q.total}
              {' วัน'}
            </KeyRow>
            <KeyRow label="ใช้แล้ว">
              {q.used}
              {' วัน'}
            </KeyRow>
            <KeyRow label="คงเหลือ">
              {q.remaining}
              {' วัน'}
            </KeyRow>
            <KeyRow label="รอพิจารณา">
              {q.pending}
              {' วัน'}
            </KeyRow>
            <p className="tiny">ตรวจสอบสิทธิ์ล่าสุดอีกครั้งเมื่ออนุมัติ</p>
          </Card>
          <Card title="การดำเนินการ">
            {r.status !== 'Pending' ? (
              <p className="muted">คำขอสิ้นสุดการพิจารณาแล้ว</p>
            ) : actor.role === 'Employee' && r.employeeId === actor.id ? (
              <div className="vertical-actions">
                <a className="btn" href={'#/request/' + id + '/edit'}>
                  แก้ไขคำขอ
                </a>
                <button className="btn danger" onClick={() => open('withdraw')}>
                  ยกเลิกคำขอ
                </button>
                <p className="tiny">ทำได้ขณะรอพิจารณาเท่านั้น</p>
              </div>
            ) : actor.role === 'Manager' && person.managerId === actor.id ? (
              <div className="vertical-actions">
                {waitingHR && (
                  <div className="info">
                    <Clock3 size={17} />
                    <span>กำลังรอ HR ส่งความเห็น</span>
                  </div>
                )}
                <button
                  className="btn primary"
                  disabled={waitingHR}
                  onClick={() => open('approve')}
                >
                  <Check size={16} />
                  อนุมัติ
                </button>
                <button className="btn danger" disabled={waitingHR} onClick={() => open('reject')}>
                  <X size={16} />
                  ไม่อนุมัติ
                </button>
                <button className="btn" disabled={waitingHR} onClick={() => open('refer')}>
                  <Users size={16} />
                  ส่งปรึกษา HR
                </button>
              </div>
            ) : actor.role === 'HR' && ownHR ? (
              <div className="vertical-actions">
                <button className="btn primary" onClick={() => open('consult')}>
                  <Send size={16} />
                  ส่งความเห็น
                </button>
                <p className="tiny">HR ให้ความเห็น ผู้จัดการตัดสินผลสุดท้าย</p>
              </div>
            ) : (
              <p className="muted">ไม่มีรายการที่ต้องดำเนินการสำหรับคุณ</p>
            )}
          </Card>
          <a className="btn" href="#/requests">
            <ChevronLeft size={16} />
            กลับรายการคำขอ
          </a>
        </div>
      </div>
      {dialog && (
        <Dialog
          title={labels[dialog]}
          onClose={() => {
            if (!busy) setDialog(null);
          }}
        >
          <form onSubmit={confirm}>
            <p className="muted">
              {dialog === 'approve'
                ? `อนุมัติ ${totalDays(db, r.id)} วัน และอัปเดตโควตาของ ${person.name}`
                : dialog === 'withdraw'
                  ? 'คำขอจะถูกยกเลิกโดยไม่หักสิทธิ์วันลา'
                  : dialog === 'consult'
                    ? 'ส่งความเห็นให้ผู้จัดการ โดยยังคงสถานะรอพิจารณา'
                    : 'ระบุเหตุผลหรือความเห็นประกอบการพิจารณา'}
            </p>
            {dialog === 'refer' && (
              <div className="field">
                <label htmlFor="review-hr">เจ้าหน้าที่ HR</label>
                <select
                  id="review-hr"
                  value={hrId}
                  onChange={(e) => setHrId(Number(e.target.value))}
                >
                  {db.employees
                    .filter((e) => e.role === 'HR' && e.active)
                    .map((e) => (
                      <option value={e.id} key={e.id}>
                        {e.name}
                      </option>
                    ))}
                </select>
              </div>
            )}
            {dialog !== 'withdraw' && (
              <div className="field">
                <label htmlFor="review-comment">
                  {dialog === 'approve' ? 'ความเห็น (ไม่บังคับ)' : 'เหตุผล / ความเห็น *'}
                </label>
                <textarea
                  id="review-comment"
                  rows={4}
                  value={comment}
                  onChange={(e) => setComment(e.target.value)}
                  required={dialog !== 'approve'}
                  maxLength={500}
                />

                <small>{comment.length}/500 ตัวอักษร</small>
              </div>
            )}
            {error && (
              <div className="error" role="alert">
                {error}
              </div>
            )}
            <div className="actions end">
              <button type="button" className="btn" disabled={busy} onClick={() => setDialog(null)}>
                กลับ
              </button>
              <button
                className={
                  'btn ' + (['reject', 'withdraw'].includes(dialog) ? 'danger' : 'primary')
                }
                disabled={busy}
              >
                {busy ? 'กำลังบันทึก…' : 'ยืนยัน'}
              </button>
            </div>
          </form>
        </Dialog>
      )}
    </>
  );
}
