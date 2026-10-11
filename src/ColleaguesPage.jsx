import { EmployeeLabel } from './EmployeeLabel';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Clock3, LoaderCircle, Search, Users } from 'lucide-react';

import { employeeCode } from './domain/colleagues';
import { formatDate, formatDateTime, parseThaiDate, today } from './domain/date';
import { repository } from './data';
import { Card, DateField, Empty, Heading } from './components';
import { durationLabels, workStatusLabels } from './labels';
import { Avatar } from './ui';

function Status({ person }) {
  if (person.leaveDuration === 'Full') return <span className="work-badge leave">ลาเต็มวัน</span>;
  return (
    <div className="colleague-status">
      <span className={'work-badge' + (person.workStatus ? '' : ' colleague-unreported')}>
        {person.workStatus ? workStatusLabels[person.workStatus] : 'ยังไม่ได้ระบุสถานะ'}
      </span>
      {person.leaveDuration && (
        <span className="work-badge leave">ลา{durationLabels[person.leaveDuration]}</span>
      )}
    </div>
  );
}

/** @param {import('./pages/types').PageProps} props */
export function ColleaguesPage({ actor, db }) {
  const initialDate = useRef(today());
  const [query, setQuery] = useState(''),
    [date, setDate] = useState(formatDate(initialDate.current));
  const [results, setResults] = useState(null),
    [busy, setBusy] = useState(true),
    [error, setError] = useState('');
  const [searchedDate, setSearchedDate] = useState(''),
    [searchedQuery, setSearchedQuery] = useState('');
  const generation = useRef(0),
    submitted = useRef({ query: '', date: initialDate.current });
  const search = useCallback(async (input) => {
    const current = ++generation.current;
    setBusy(true);
    setError('');
    setResults(null);
    try {
      const rows = await repository.searchColleagues(input.query, input.date);
      if (current === generation.current) {
        setResults(rows);
        setSearchedDate(input.date);
        setSearchedQuery(input.query);
      }
    } catch (failure) {
      if (current === generation.current) setError(failure.message);
    } finally {
      if (current === generation.current) setBusy(false);
    }
  }, []);
  useEffect(
    () => () => {
      generation.current++;
    },
    [],
  );
  // Load everyone on entry; focus refresh and API polling repeat the last applied filter.
  useEffect(() => {
    void search(submitted.current);
  }, [db, search]);
  function applyFilter(value) {
    if (busy) return;
    const iso = parseThaiDate(date);
    if (!iso) {
      setError('กรุณากรอกวันที่เป็นวัน/เดือน/ปี พ.ศ. ให้ถูกต้อง');
      return;
    }
    submitted.current = { query: value.trim(), date: iso };
    void search(submitted.current);
  }
  function submit(event) {
    event.preventDefault();
    applyFilter(query);
  }
  return (
    <div className="colleagues-page">
      <Heading
        title="สถานะเพื่อนร่วมงาน"
        description="ดูสถานะการทำงานตามวันที่ หรือค้นหาด้วยชื่อและรหัสพนักงาน"
      />

      <Card title="ค้นหาเพื่อนร่วมงาน">
        <form className="colleague-search" onSubmit={submit} noValidate aria-busy={busy}>
          <div className="field search-field">
            <label htmlFor="colleague-query">ชื่อหรือรหัสพนักงาน</label>
            <div className="search-input">
              <Search size={17} />
              <input
                id="colleague-query"
                value={query}
                onChange={(event) => {
                  setError('');
                  setQuery(event.target.value);
                }}
                placeholder="เช่น พิมพ์ชนก, EMP-00001 หรือ 1"
                maxLength={100}
                disabled={busy}
                aria-describedby="colleague-query-hint"
              />
            </div>
            <small id="colleague-query-hint">
              {'เว้นว่างเพื่อแสดงทุกคน · รหัสของคุณ '}
              {employeeCode(actor.id)}
            </small>
          </div>
          <DateField
            label="วันที่ตรวจสอบสถานะ"
            value={date}
            onChange={(value) => {
              if (value !== date) {
                setError('');
                setDate(value);
              }
            }}
            disabled={busy}
          />

          <button className="btn primary" disabled={busy} type="submit">
            {busy ? (
              <LoaderCircle size={17} className="button-spinner" aria-hidden="true" />
            ) : (
              <Search size={17} />
            )}
            {busy ? 'กำลังค้นหา…' : 'ค้นหาสถานะ'}
          </button>
        </form>
        {error && (
          <div className="error" role="alert">
            {error}
          </div>
        )}
      </Card>
      {busy ? (
        <div className="colleague-loading" role="status">
          <LoaderCircle size={20} className="button-spinner" aria-hidden="true" />
          กำลังโหลดสถานะเพื่อนร่วมงาน…
        </div>
      ) : results ? (
        <>
          <div className="colleague-result-heading">
            <p className="list-count" role="status">
              {searchedQuery ? 'พบ' : 'พนักงานทั้งหมด'} {results.length}
              {' คน · สถานะวันที่ '}
              {formatDate(searchedDate)}
            </p>
            {(query.trim() || searchedQuery) && (
              <button
                type="button"
                className="text-link"
                onClick={() => {
                  setQuery('');
                  applyFilter('');
                }}
              >
                <Users size={16} />
                แสดงทุกคน
              </button>
            )}
          </div>
          {results.length ? (
            <ul className="colleague-results" aria-label="ผลค้นหาสถานะเพื่อนร่วมงาน">
              {results.map((person) => (
                <li key={person.employeeId}>
                  <Card>
                    <div className="colleague-person">
                      <Avatar person={{ id: person.employeeId, name: person.name }} />
                      <div>
                        <strong>
                          {person.name}
                          {person.employeeId === actor.id && <small>{' · คุณ'}</small>}
                        </strong>
                        <span>{employeeCode(person.employeeId)}</span>
                      </div>
                    </div>
                    <p className="colleague-position">
                      <EmployeeLabel kind="position" value={person.position} />
                      {' · '}
                      <EmployeeLabel kind="department" value={person.department} />
                    </p>
                    <Status person={person} />
                    <p className="colleague-updated">
                      <Clock3 size={14} />
                      {person.leaveDuration
                        ? 'สถานะลาจากคำขอที่อนุมัติแล้ว'
                        : person.updatedAt
                          ? 'อัปเดต ' + formatDateTime(person.updatedAt)
                          : 'ยังไม่มีข้อมูลสถานะในวันที่เลือก'}
                    </p>
                  </Card>
                </li>
              ))}
            </ul>
          ) : (
            <Card>
              <Empty>
                {searchedQuery
                  ? 'ไม่พบพนักงานที่ตรงกับชื่อหรือรหัสนี้ กรุณาตรวจสอบแล้วลองอีกครั้ง'
                  : 'ยังไม่มีพนักงานที่ใช้งานอยู่'}
              </Empty>
            </Card>
          )}
        </>
      ) : null}
    </div>
  );
}
