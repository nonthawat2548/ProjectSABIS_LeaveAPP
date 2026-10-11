import { useState } from 'react';
import { Info } from 'lucide-react';

import { today } from '../domain/date.js';
import { balance } from '../domain/service.js';
import { Card, Heading, KeyRow } from '../components.jsx';
import { QuotaRing } from '../ui.jsx';

/** @param {import('./types.js').PageProps} props */
export function Quotas({ db, actor }) {
  const [year, setYear] = useState(Number(today().slice(0, 4)));
  const years = [
    ...new Set(db.entitlements.filter((e) => e.employeeId === actor.id).map((e) => e.year)),
  ].sort();
  return (
    <>
      <Heading
        title="สิทธิ์และโควตาวันลา"
        description="คงเหลือ = สิทธิ์ทั้งหมด − วันที่อนุมัติแล้ว"
        action={
          <select
            aria-label="ปีของสิทธิ์วันลา"
            value={year}
            onChange={(e) => setYear(Number(e.target.value))}
          >
            {years.map((y) => (
              <option value={y} key={y}>
                {'ปี '}
                {y + 543}
              </option>
            ))}
          </select>
        }
      />

      <div className="quota-grid">
        {db.leaveTypes
          .filter((t) => t.quotaScope === 'Annual')
          .map((t) => {
            const b = balance(db, actor.id, t.id, year);
            return (
              <Card key={t.id} title={t.name}>
                <QuotaRing remaining={b.remaining} total={b.total} />
                <div className="meter">
                  <span
                    style={{ width: (b.total ? Math.min(100, (b.used / b.total) * 100) : 0) + '%' }}
                  />
                </div>
                <KeyRow label="สิทธิ์ทั้งหมด">
                  {b.total}
                  {' วัน'}
                </KeyRow>
                <KeyRow label="ใช้แล้ว">
                  {b.used}
                  {' วัน'}
                </KeyRow>
                <KeyRow label="รอพิจารณา">
                  {b.pending}
                  {' วัน'}
                </KeyRow>
                <KeyRow label="สิทธิ์ที่ขอเพิ่มได้">
                  {Math.max(0, b.remaining - b.pending)}
                  {' วัน'}
                </KeyRow>
              </Card>
            );
          })}
      </div>
      {db.maternityCases
        .filter((c) => c.employeeId === actor.id)
        .map((c) => {
          const t = db.leaveTypes.find((t) => t.quotaScope === 'Pregnancy');
          const b = balance(db, actor.id, t.id, 0, c.id);
          return (
            <Card key={c.id} title={`สิทธิ์ลาคลอด · กรณีที่ ${c.caseNo}`}>
              <div className="review-grid">
                <KeyRow label="สิทธิ์ทั้งหมด">
                  {b.total}
                  {' วัน'}
                </KeyRow>
                <KeyRow label="ใช้แล้ว">
                  {b.used}
                  {' วัน'}
                </KeyRow>
                <KeyRow label="คงเหลือ">
                  {b.remaining}
                  {' วัน'}
                </KeyRow>
                <KeyRow label="รอพิจารณา">
                  {b.pending}
                  {' วัน'}
                </KeyRow>
              </div>
            </Card>
          );
        })}
      <div className="info">
        <Info size={18} />
        <span>คำขอรอพิจารณาแยกแสดงต่างหาก คำขอที่ไม่อนุมัติหรือยกเลิกไม่หักโควตา</span>
      </div>
    </>
  );
}
