import { useRef, useState } from 'react';
import {
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  FileText,
  Info,
  Send,
  Upload,
  X,
} from 'lucide-react';

import { addDays, formatDate, nextWorkingDay, parseThaiDate, today } from '../domain/date.js';
import {
  balance,
  maternityGenderIssue,
  previewRequest,
  requestCode,
  validateAttachment,
} from '../domain/service.js';
import {
  ALLOWED_ATTACHMENT_TYPES,
  MAX_ATTACHMENT_BYTES,
  MAX_ATTACHMENT_LABEL,
} from '../domain/attachments.js';
import { Badge, Card, DateField, DocumentRow, Heading, KeyRow } from '../components.jsx';
import { Stepper } from '../ui.jsx';
import { durationLabels as durations } from '../labels.js';
import { useTask } from './useTask.js';
import { HR_PERSONAL_LEAVE_UNAVAILABLE, requestReviewer } from '../domain/approvalRouting.js';

function HRContact({ db }) {
  const contacts = db.employees.filter((e) => e.role === 'HR' && e.active);
  return (
    <div className="hr-contact">
      <strong>ติดต่อฝ่ายบุคคล (HR)</strong>
      {contacts.length ? (
        contacts.map((e) => (
          <div key={e.id}>
            <span>{e.name}</span>
            {' · '}
            <a href={'mailto:' + e.email}>{e.email}</a>
            {e.phone && (
              <>
                {' · '}
                <a href={'tel:' + e.phone}>{e.phone}</a>
              </>
            )}
          </div>
        ))
      ) : (
        <p>ติดต่อฝ่ายบุคคลขององค์กรเพื่อเปิดกรณีหรือตรวจสอบข้อมูล</p>
      )}
    </div>
  );
}

/** @param {import('./types.js').PageProps & { editId?: number }} props */
export function LeaveForm({ db, actor, run, editId }) {
  const previous = db.requests.find((r) => r.id === editId);
  const owner = db.employees.find((e) => e.id === actor.id) ?? actor;
  const reviewer = requestReviewer(db, owner);
  const historyPath = actor.role === 'Employee' ? '#/requests' : '#/my-requests';
  const [typeId, setTypeId] = useState(previous?.leaveTypeId ?? 1);
  const [start, setStart] = useState(
    formatDate(previous?.startDate ?? nextWorkingDay(addDays(today(), 1))),
  );
  const [end, setEnd] = useState(
    formatDate(previous?.endDate ?? nextWorkingDay(addDays(today(), 1))),
  );
  const [duration, setDuration] = useState(previous?.duration ?? 'Full');
  const [reason, setReason] = useState(previous?.reason ?? '');
  const [caseId, setCaseId] = useState(previous?.maternityCaseId ?? null);
  const [attachment, setAttachment] = useState(null);
  const fileInput = useRef(null);
  const [keepDocument, setKeepDocument] = useState(true),
    [reading, setReading] = useState(false);
  const [review, setReview] = useState(false),
    [submitted, setSubmitted] = useState(null);
  const { busy, error, setError, perform } = useTask(run);
  const type = db.leaveTypes.find((t) => t.id === typeId);
  const isMaternity = type.quotaScope === 'Pregnancy';
  const genderIssue = maternityGenderIssue(owner);
  const existing = db.documents.find((d) => d.leaveId === editId);
  const cases = db.maternityCases.filter((c) => c.employeeId === owner.id);
  const selectedCase = cases.find((c) => c.id === caseId);
  const isoStart = parseThaiDate(start),
    isoEnd = parseThaiDate(end);
  const year = Number((isoStart ?? today()).slice(0, 4));
  const q = balance(db, owner.id, typeId, year, caseId, editId);
  const input = {
    leaveTypeId: typeId,
    maternityCaseId: isMaternity ? caseId : null,
    startDate: isoStart ?? '',
    endDate: isoEnd ?? '',
    duration,
    reason,
    attachment,
    keepDocument,
  };
  let count = 0;
  try {
    count = previewRequest(db, owner, input, editId).total;
  } catch {
    if (isoStart && isoEnd && (!isMaternity || (!genderIssue && selectedCase))) {
      const calendar = isMaternity || type.dayCountBasis === 'Calendar Days';
      let d = isoStart;
      for (let i = 0; i < 366 && d <= isoEnd; i++, d = addDays(d, 1)) {
        const wd = new Date(d + 'T00:00:00Z').getUTCDay();
        if (calendar || (wd !== 0 && wd !== 6 && !db.holidays.some((h) => h.date === d)))
          count += duration === 'Full' ? 1 : 0.5;
      }
    }
  }
  function changeType(id) {
    setTypeId(id);
    setCaseId(null);
    setError('');
    setReview(false);
    if (db.leaveTypes.find((t) => t.id === id)?.quotaScope === 'Pregnancy') setDuration('Full');
  }
  if (owner.role === 'HR')
    return <Heading title="ไม่สามารถยื่นคำขอลา" description={HR_PERSONAL_LEAVE_UNAVAILABLE} />;
  if (editId && (!previous || previous.employeeId !== owner.id || previous.status !== 'Pending'))
    return (
      <>
        <Heading title="แก้ไขคำขอนี้ไม่ได้" description="แก้ไขได้เฉพาะคำขอของคุณที่ยังรอพิจารณา" />
        <a className="btn" href={historyPath}>
          กลับรายการคำขอ
        </a>
      </>
    );

  async function upload(file) {
    if (!file) return;
    setReading(true);
    setError('');
    try {
      if (
        !ALLOWED_ATTACHMENT_TYPES.includes(file.type) ||
        file.size > MAX_ATTACHMENT_BYTES ||
        file.size === 0
      )
        throw new Error(`กรุณาเลือก PDF, JPG หรือ PNG ขนาดไม่เกิน ${MAX_ATTACHMENT_LABEL}`);
      const dataUrl = await new Promise((resolve, reject) => {
        const r = new FileReader();
        r.onload = () => resolve(String(r.result));
        r.onerror = () => reject(new Error('อ่านไฟล์ไม่สำเร็จ'));
        r.readAsDataURL(file);
      });
      const a = { fileName: file.name, fileType: file.type, fileSize: file.size, dataUrl };
      validateAttachment(a);
      setAttachment(a);
    } catch (e) {
      setError(e.message);
    } finally {
      setReading(false);
    }
  }
  function validate(e) {
    e.preventDefault();
    setError('');
    try {
      // Maternity uses domain ordering before any field-level date or required check.
      if (!isMaternity && (!isoStart || !isoEnd))
        throw new Error('กรุณากรอกวันที่เป็น วัน/เดือน/ปี พ.ศ. เช่น 5/12/2569');
      previewRequest(db, owner, input, editId);
      setReview(true);
      window.scrollTo(0, 0);
    } catch (e) {
      setError(e.message);
    }
  }
  if (submitted)
    return (
      <>
        <Stepper step={3} />
        <Card>
          <div className="success">
            <span>
              <CheckCircle2 size={36} />
            </span>
            <h1>{editId ? 'บันทึกการแก้ไขเรียบร้อย' : 'ส่งคำขอเรียบร้อย'}</h1>
            <p>คำขอถูกส่งให้ผู้พิจารณาแล้ว</p>
            <div className="success-summary">
              <KeyRow label="เลขคำขอ">
                {requestCode(db.requests.find((r) => r.id === submitted))}
              </KeyRow>
              <KeyRow label="วันที่ลา">
                {start}
                {' – '}
                {end}
              </KeyRow>
              <KeyRow label="สถานะ">
                <Badge status="Pending" />
              </KeyRow>
            </div>
            <div className="actions">
              <a className="btn primary" href={'#/request/' + submitted}>
                ดูรายละเอียดคำขอ
              </a>
              <a className="btn" href="#/dashboard">
                กลับหน้าหลัก
              </a>
            </div>
          </div>
        </Card>
      </>
    );

  if (review)
    return (
      <>
        <Stepper step={2} />
        <Heading
          title="ตรวจสอบก่อนส่งคำขอ"
          description="ตรวจสอบวันที่ เอกสาร และจำนวนวันลาให้ครบถ้วน"
        />

        <Card title="สรุปคำขอ">
          <div className="review-grid">
            <KeyRow label="ประเภท">{type.name}</KeyRow>
            <KeyRow label="ช่วงวันที่">
              {start}
              {' – '}
              {end}
            </KeyRow>
            <KeyRow label="ช่วงเวลา">{durations[duration]}</KeyRow>
            <KeyRow label="จำนวนวันลา">
              {count}
              {' วัน'}
            </KeyRow>
            {isMaternity && selectedCase && (
              <>
                <KeyRow label="กรณีลาคลอด">
                  {'กรณีที่ '}
                  {selectedCase.caseNo}
                </KeyRow>
                <KeyRow label="สิทธิ์ทั้งหมด">
                  {q.total}
                  {' วัน'}
                </KeyRow>
                <KeyRow label="ใช้แล้ว">
                  {q.used}
                  {' วัน'}
                </KeyRow>
                <KeyRow label={editId ? 'รอพิจารณา (ไม่รวมคำขอนี้)' : 'รอพิจารณา'}>
                  {q.pending}
                  {' วัน'}
                </KeyRow>
                <KeyRow label="คงเหลือ">
                  {q.remaining}
                  {' วัน'}
                </KeyRow>
              </>
            )}
          </div>
          <div className="reason-box">
            <small>เหตุผล</small>
            <p>{reason}</p>
          </div>
          <KeyRow label="เอกสาร">
            {attachment?.fileName ??
              (keepDocument ? existing?.fileName : undefined) ??
              'ไม่มีเอกสาร'}
          </KeyRow>
          <div className="info">
            <Info size={17} />
            <span>
              ระบบหักสิทธิ์วันลาเมื่อคำขอได้รับอนุมัติ
              {editId && ' · ความเห็นเดิมจะยกเลิกและเริ่มพิจารณาใหม่'}
            </span>
          </div>
          {error && (
            <p className="error" role="alert">
              {error}
            </p>
          )}
          <div className="actions end">
            <button className="btn" disabled={busy} onClick={() => setReview(false)}>
              <ChevronLeft size={16} />
              กลับไปแก้ไข
            </button>
            <button
              className="btn primary"
              disabled={busy}
              onClick={() =>
                void perform(
                  editId
                    ? { type: 'edit', id: editId, version: previous.version, input }
                    : { type: 'submit', input },
                  (id) => setSubmitted(id),
                )
              }
            >
              <Send size={16} />
              {busy ? 'กำลังบันทึก…' : 'ยืนยันส่งคำขอ'}
            </button>
          </div>
        </Card>
      </>
    );

  return (
    <>
      <Stepper step={1} />
      <Heading
        title={editId ? 'แก้ไขคำขอลา' : 'แบบฟอร์มยื่นคำขอลา'}
        description={
          editId
            ? 'คำขอ ' + requestCode(previous) + ' · การแก้ไขจะเริ่มขั้นตอนพิจารณาใหม่'
            : 'กรอกข้อมูลแล้วตรวจสอบก่อนส่งให้ผู้พิจารณา'
        }
      />

      <div className="columns form-columns">
        <Card title="ข้อมูลการลา">
          <form onSubmit={validate} noValidate={isMaternity}>
            <div className="field">
              <label htmlFor="leave-type">
                {'ประเภทการลา '}
                <span className="required">*</span>
              </label>
              <select
                id="leave-type"
                value={typeId}
                onChange={(e) => changeType(Number(e.target.value))}
                aria-describedby={genderIssue ? 'maternity-gender-hint' : undefined}
              >
                {db.leaveTypes
                  .filter(
                    (t) =>
                      t.quotaScope === 'Pregnancy' ||
                      !t.eligibleGender ||
                      t.eligibleGender === owner.gender,
                  )
                  .map((t) => (
                    <option
                      key={t.id}
                      value={t.id}
                      disabled={t.quotaScope === 'Pregnancy' && !!genderIssue}
                    >
                      {t.name}
                      {t.quotaScope === 'Pregnancy' && genderIssue ? ' · ยังใช้สิทธิ์ไม่ได้' : ''}
                    </option>
                  ))}
              </select>
              {genderIssue && <small id="maternity-gender-hint">{genderIssue}</small>}
            </div>
            {isMaternity && genderIssue && (
              <div className="info">
                <Info size={17} />
                <div>
                  <p>{genderIssue}</p>
                  <HRContact db={db} />
                </div>
              </div>
            )}
            {isMaternity && !genderIssue && (
              <div className="field">
                <label htmlFor="leave-case">
                  {'กรณีลาคลอด '}
                  <span className="required">*</span>
                </label>
                <select
                  id="leave-case"
                  value={selectedCase?.id ?? ''}
                  onChange={(e) => {
                    setCaseId(e.target.value ? Number(e.target.value) : null);
                    setError('');
                  }}
                  required
                  disabled={!cases.length}
                >
                  <option value="">เลือกกรณีที่ HR เปิดไว้</option>
                  {cases.map((c) => (
                    <option value={c.id} key={c.id}>
                      {'กรณีที่ '}
                      {c.caseNo}
                      {' · สิทธิ์ '}
                      {c.maximumDays}
                      {' วัน'}
                    </option>
                  ))}
                </select>
                {!cases.length && (
                  <div className="info maternity-help">
                    <Info size={17} />
                    <div>
                      <p>ยังไม่มีกรณีลาคลอด กรุณาติดต่อ HR เพื่อเปิดกรณีก่อนยื่นคำขอ</p>
                      <HRContact db={db} />
                    </div>
                  </div>
                )}
              </div>
            )}
            <div className="form-grid">
              <DateField label="วันที่เริ่มลา" value={start} onChange={setStart} required />
              <DateField label="วันที่สิ้นสุดลา" value={end} onChange={setEnd} required />
            </div>
            <div className="field">
              <label htmlFor="leave-duration">ช่วงเวลา</label>
              <select
                id="leave-duration"
                value={duration}
                onChange={(e) => setDuration(e.target.value)}
              >
                {Object.entries(durations)
                  .filter(([v]) => !isMaternity || v === 'Full')
                  .map(([v, label]) => (
                    <option value={v} key={v}>
                      {label}
                    </option>
                  ))}
              </select>
              <small>
                {isMaternity
                  ? 'ลาคลอดใช้การลาเต็มวัน นับตามปฏิทินรวมวันหยุด'
                  : 'การลาครึ่งวันต้องเป็นวันเดียวกัน'}
              </small>
            </div>
            <div className="field">
              <label htmlFor="leave-reason">
                {'เหตุผลการลา '}
                <span className="required">*</span>
              </label>
              <textarea
                id="leave-reason"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                rows={4}
                maxLength={500}
                placeholder="อธิบายเหตุผลการลา"
                required
              />

              <small>{reason.length}/500 ตัวอักษร</small>
            </div>
            <div className="field">
              <label htmlFor="leave-document">
                เอกสารประกอบ
                {type.documentRequiredFromDays !== null &&
                  count >= type.documentRequiredFromDays && (
                    <span className="required">{' *'}</span>
                  )}
              </label>
              <div className="upload-box">
                <Upload size={23} />
                <p id="leave-document-hint">
                  {'PDF, JPG หรือ PNG · ไม่เกิน '}
                  {MAX_ATTACHMENT_LABEL}
                </p>
                <button
                  className="btn small"
                  type="button"
                  aria-label="เลือกไฟล์เอกสารประกอบ"
                  aria-describedby="leave-document-hint"
                  disabled={reading || busy}
                  onClick={() => fileInput.current?.click()}
                >
                  เลือกไฟล์
                </button>
                <input
                  ref={fileInput}
                  hidden
                  id="leave-document"
                  type="file"
                  accept=".pdf,.jpg,.jpeg,.png"
                  disabled={reading || busy}
                  onChange={(e) => {
                    void upload(e.target.files?.[0]);
                    e.target.value = '';
                  }}
                />
              </div>
              {reading && <small role="status">กำลังอ่านเอกสาร…</small>}
              {attachment && (
                <div className="file-row">
                  <FileText size={17} />
                  <span className="file-info" title={attachment.fileName}>
                    {attachment.fileName}
                  </span>
                  <button
                    className="icon-btn"
                    type="button"
                    aria-label="นำไฟล์ออก"
                    onClick={() => setAttachment(null)}
                  >
                    <X size={16} />
                  </button>
                </div>
              )}
              {!attachment && existing && keepDocument && (
                <>
                  <DocumentRow document={existing} />
                  <button
                    type="button"
                    className="text-link danger-text"
                    onClick={() => setKeepDocument(false)}
                  >
                    นำเอกสารเดิมออก
                  </button>
                </>
              )}
            </div>
            {error && (
              <div className="error" role="alert">
                {error}
              </div>
            )}
            <div className="actions end">
              <a className="btn" href={historyPath}>
                ยกเลิก
              </a>
              <button className="btn primary" disabled={busy || reading}>
                ตรวจสอบคำขอ
                <ChevronRight size={16} />
              </button>
            </div>
          </form>
        </Card>
        <div className="stack">
          <Card title="สรุปสิทธิ์และวันลา">
            <KeyRow label="ประเภทการลา">{type.name}</KeyRow>
            {isMaternity && (!selectedCase || genderIssue) ? (
              <p className="muted">
                {genderIssue ??
                  (cases.length
                    ? 'เลือกกรณีลาคลอดเพื่อดูสิทธิ์ที่ HR เปิดไว้'
                    : 'ยังไม่มีกรณีลาคลอด กรุณาติดต่อ HR เพื่อเปิดกรณีก่อนยื่นคำขอ')}
              </p>
            ) : (
              <>
                {isMaternity && selectedCase && (
                  <KeyRow label="กรณีที่เลือก">
                    {'กรณีที่ '}
                    {selectedCase.caseNo}
                  </KeyRow>
                )}
                <KeyRow label={isMaternity ? 'สิทธิ์ทั้งหมดของกรณี' : 'โควตาปี ' + (year + 543)}>
                  {q.total}
                  {' วัน'}
                </KeyRow>
                <KeyRow label="ใช้แล้ว">
                  {q.used}
                  {' วัน'}
                </KeyRow>
                <KeyRow label={editId ? 'รอพิจารณา (ไม่รวมคำขอนี้)' : 'รอพิจารณา'}>
                  {q.pending}
                  {' วัน'}
                </KeyRow>
                <KeyRow label="คงเหลือ">
                  {q.remaining}
                  {' วัน'}
                </KeyRow>
                {isMaternity && (
                  <KeyRow label="สิทธิ์ที่ขอเพิ่มได้">
                    {Math.max(0, q.remaining - q.pending)}
                    {' วัน'}
                  </KeyRow>
                )}
              </>
            )}
            <div className="key-total">
              <KeyRow label="คำขอนี้">
                {count}
                {' วัน'}
              </KeyRow>
            </div>
            <p className="tiny">
              {isMaternity
                ? 'ใช้สิทธิ์ของกรณีที่เลือกตลอดช่วงลา แม้ข้ามปี ไม่แยกเป็นโควตารายปี'
                : 'คำขอข้ามปีจะแยกหักสิทธิ์ตามปีของแต่ละวันลา'}
            </p>
          </Card>
          <Card title="เงื่อนไขการลา">
            <ul className="policy-list">
              <li>
                นับ
                {isMaternity || type.dayCountBasis === 'Calendar Days'
                  ? 'วันตามปฏิทิน รวมวันหยุด'
                  : 'วันทำงาน ไม่รวมเสาร์–อาทิตย์และวันหยุดที่ HR ตั้งไว้'}
              </li>
              <li>
                {type.advanceNoticeDays > 0
                  ? 'ยื่นล่วงหน้าอย่างน้อย ' + type.advanceNoticeDays + ' วัน'
                  : 'ยื่นลาป่วยย้อนหลังได้ไม่เกิน 30 วัน'}
              </li>
              {type.documentRequiredFromDays !== null && (
                <li>
                  {'ตั้งแต่ '}
                  {type.documentRequiredFromDays}
                  {' วัน ต้องแนบ'}
                  {type.requiredDocumentType === 'Medical Certificate'
                    ? 'ใบรับรองแพทย์'
                    : 'เอกสารประกอบ'}
                </li>
              )}
              <li>
                {'ผู้พิจารณา: '}
                {reviewer?.name ?? 'ยังไม่มีผู้พิจารณา'}
              </li>
            </ul>
            <p className="tiny">นโยบายการลาตัวอย่าง ปรับได้โดยฝ่ายบุคคล</p>
          </Card>
        </div>
      </div>
    </>
  );
}
