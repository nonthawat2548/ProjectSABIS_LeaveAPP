import { useEffect, useState } from 'react';
import { X, Download, RotateCcw, Database as DatabaseIcon } from 'lucide-react';

import { formatDate, parseThaiDate } from '../domain/date';
import { Card, DateField, Dialog, Heading, KeyRow } from '../components';
import { dataMode, repository } from '../data';
import { useTask } from './useTask';

/** @param {import('./types').PageProps} props */
export function SettingsPage({ db, run, reload }) {
  const [typeId, setTypeId] = useState(2),
    [policy, setPolicy] = useState(db.leaveTypes.find((t) => t.id === 2)),
    [date, setDate] = useState(''),
    [holiday, setHoliday] = useState(''),
    [resetDialog, setResetDialog] = useState(false),
    [resetting, setResetting] = useState(false);
  const { busy, error, setError, perform } = useTask(run);
  useEffect(() => {
    setPolicy({ ...db.leaveTypes.find((t) => t.id === typeId) });
  }, [db, typeId]);
  function exportData() {
    const url = URL.createObjectURL(
      new Blob([JSON.stringify(db, null, 2)], { type: 'application/json' }),
    );
    const a = document.createElement('a');
    a.href = url;
    a.download = 'leave-demo-data.json';
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  async function reset() {
    setResetting(true);
    setError('');
    try {
      await repository.resetDemo();
      await reload();
      setResetDialog(false);
    } catch (e) {
      setError(e.message);
    } finally {
      setResetting(false);
    }
  }
  return (
    <>
      <Heading title="การตั้งค่า" description="กำหนดนโยบายตัวอย่างและปฏิทินวันหยุด" />
      <div className="columns">
        <Card title="เงื่อนไขประเภทการลา">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void perform({ type: 'policy', policy });
            }}
          >
            <div className="field">
              <label htmlFor="settings-type">ประเภท</label>
              <select
                id="settings-type"
                value={typeId}
                onChange={(e) => setTypeId(Number(e.target.value))}
              >
                {db.leaveTypes.map((t) => (
                  <option value={t.id} key={t.id}>
                    {t.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="field">
              <label htmlFor="policy-name">ชื่อประเภทการลา</label>
              <input
                id="policy-name"
                value={policy.name}
                maxLength={100}
                onChange={(e) => setPolicy({ ...policy, name: e.target.value })}
                required
              />
            </div>
            <div className="form-grid">
              <div className="field">
                <label htmlFor="policy-quota">โควตาตั้งต้น (วัน)</label>
                <input
                  id="policy-quota"
                  type="number"
                  min={0}
                  max={999}
                  value={policy.defaultQuotaDays}
                  onChange={(e) =>
                    setPolicy({ ...policy, defaultQuotaDays: Number(e.target.value) })
                  }
                  required
                />
              </div>
              <div className="field">
                <label htmlFor="policy-notice">ล่วงหน้าอย่างน้อย (วัน)</label>
                <input
                  id="policy-notice"
                  type="number"
                  min={0}
                  max={999}
                  value={policy.advanceNoticeDays}
                  onChange={(e) =>
                    setPolicy({ ...policy, advanceNoticeDays: Number(e.target.value) })
                  }
                  required
                />
              </div>
            </div>
            <div className="field">
              <label htmlFor="policy-document">ต้องแนบเอกสารเมื่อลาตั้งแต่ (วัน)</label>
              <input
                id="policy-document"
                type="number"
                min={1}
                max={999}
                value={policy.documentRequiredFromDays ?? ''}
                placeholder="เว้นว่าง = ไม่บังคับ"
                onChange={(e) =>
                  setPolicy({
                    ...policy,
                    documentRequiredFromDays: e.target.value === '' ? null : Number(e.target.value),
                  })
                }
              />
            </div>
            <KeyRow label="วิธีนับวัน">
              {policy.dayCountBasis === 'Working Days' ? 'วันทำงาน' : 'วันปฏิทิน'}
            </KeyRow>
            <p className="tiny">โควตาตั้งต้นใช้เป็นค่าอ้างอิง ไม่เปลี่ยนสิทธิ์รายปีที่จัดสรรแล้ว</p>
            <button className="btn primary" disabled={busy}>
              บันทึกนโยบาย
            </button>
          </form>
        </Card>
        <div className="stack">
          <Card title="ปฏิทินวันหยุด">
            <form
              onSubmit={(e) => {
                e.preventDefault();
                const iso = parseThaiDate(date);
                if (!iso) {
                  setError('วันที่วันหยุดไม่ถูกต้อง');
                  return;
                }
                void perform({ type: 'holiday', date: iso, name: holiday }, () => {
                  setDate('');
                  setHoliday('');
                });
              }}
            >
              <DateField label="วันที่หยุด" value={date} onChange={setDate} required />
              <div className="field">
                <label htmlFor="holiday-name">ชื่อวันหยุด</label>
                <input
                  id="holiday-name"
                  value={holiday}
                  onChange={(e) => setHoliday(e.target.value)}
                  maxLength={100}
                  required
                />
              </div>
              <button className="btn" disabled={busy}>
                เพิ่มวันหยุด
              </button>
            </form>
            {db.holidays.length ? (
              <div className="holiday-list">
                {[...db.holidays]
                  .sort((a, b) => a.date.localeCompare(b.date))
                  .map((h) => (
                    <div key={h.date}>
                      <span>
                        <strong>{h.name}</strong>
                        <small>{formatDate(h.date)}</small>
                      </span>
                      <button
                        className="icon-btn danger-text"
                        aria-label={'ลบวันหยุด ' + h.name}
                        disabled={busy}
                        onClick={() =>
                          void perform({
                            type: 'holiday',
                            date: h.date,
                            name: h.name,
                            remove: true,
                          })
                        }
                      >
                        <X size={16} />
                      </button>
                    </div>
                  ))}
              </div>
            ) : (
              <p className="tiny">ยังไม่มีวันหยุดพิเศษ เสาร์–อาทิตย์ไม่นับในประเภทวันทำงาน</p>
            )}
            <p className="tiny">
              การเปลี่ยนวันหยุดมีผลกับคำขอใหม่หรือคำขอที่แก้ไข ไม่คำนวณคำขอเดิมย้อนหลัง
            </p>
          </Card>
          <Card title="ข้อมูลจำลองและการเชื่อมต่อ">
            <div className="info">
              <DatabaseIcon size={18} />
              <span>
                {dataMode === 'mock'
                  ? 'บันทึกในเบราว์เซอร์นี้ (IndexedDB)'
                  : 'บันทึกในระบบกลาง (REST API)'}
              </span>
            </div>
            <p className="muted">ส่งออกข้อมูลหรือคืนค่าข้อมูลทดลองได้จากส่วนนี้</p>
            <div className="vertical-actions">
              <button className="btn" onClick={exportData}>
                <Download size={16} />
                ส่งออกข้อมูล (JSON)
              </button>
              <button
                className="btn danger"
                onClick={() => {
                  setError('');
                  setResetDialog(true);
                }}
              >
                <RotateCcw size={16} />
                คืนค่าข้อมูลจำลอง
              </button>
            </div>
            <small>
              ไฟล์ JSON นี้มีเฉพาะข้อมูลที่คุณมีสิทธิ์ดู ใช้เป็นข้อมูลอ้างอิง
              ไม่สามารถใช้กู้คืนระบบทั้งหมดได้
            </small>
          </Card>
        </div>
      </div>
      {error && !resetDialog && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      {resetDialog && (
        <Dialog
          title="คืนค่าข้อมูลจำลอง"
          onClose={() => {
            if (!resetting) setResetDialog(false);
          }}
        >
          <p className="muted">
            ข้อมูลที่เพิ่มหรือแก้ไขในโหมดปัจจุบันจะถูกแทนที่ด้วยข้อมูลตัวอย่างเริ่มต้น
          </p>
          {error && (
            <p className="error" role="alert">
              {error}
            </p>
          )}
          <div className="actions end">
            <button className="btn" disabled={resetting} onClick={() => setResetDialog(false)}>
              กลับ
            </button>
            <button className="btn danger" disabled={resetting} onClick={() => void reset()}>
              {resetting ? 'กำลังคืนค่า…' : 'ยืนยันคืนค่า'}
            </button>
          </div>
        </Dialog>
      )}
    </>
  );
}
