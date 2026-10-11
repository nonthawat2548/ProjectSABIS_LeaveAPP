"""Build the standalone 10-person sample from src/data/ JSON; Python stdlib only."""
import json
import sqlite3
import sys
from tempfile import TemporaryDirectory
from contextlib import closing
from pathlib import Path

root = Path(__file__).resolve().parent.parent
source = json.loads((root / 'src/data/leave-management-10-people.json').read_text(encoding='utf-8'))
schema = (root / 'database/schema.sql').read_text(encoding='utf-8')
exports = root / 'database/sqlite'
check = '--check' in sys.argv
scratch = TemporaryDirectory(prefix='leave-sqlite-check-') if check else None
folder = Path(scratch.name) if scratch else exports
folder.mkdir(parents=True, exist_ok=True)
database_path = folder / 'leave-management-10-people.sqlite'
temporary_path = folder / 'leave-management-10-people.build.sqlite'
if temporary_path.exists():
    temporary_path.unlink()

with closing(sqlite3.connect(temporary_path)) as db:
    db.executescript(schema)

    def insert(table, columns, rows):
        db.executemany(f'INSERT INTO {table} ({",".join(columns)}) VALUES ({",".join("?" for _ in columns)})', rows)

    insert('Employee', ['Employee_id','Name','Gender','Email','Phone','Position','Role','Manager_id','Department','Active'],
        [(r['id'],r['name'],r['gender'],r['email'],r['phone'],r['position'],r['role'],r['managerId'],r['department'],int(r['active'])) for r in sorted(source['employees'], key=lambda r: r['managerId'] is not None)])
    insert('Leave_Type', ['Leave_type_id','Leave_type_name','Quota_scope','Default_quota_days','Day_count_basis','Advance_notice_days','Document_required_from_days','Required_document_type','Eligible_gender'],
        [tuple(r[k] for k in ['id','name','quotaScope','defaultQuotaDays','dayCountBasis','advanceNoticeDays','documentRequiredFromDays','requiredDocumentType','eligibleGender']) for r in source['leaveTypes']])
    insert('Leave_Entitlement', ['Entitlement_id','Employee_id','Leave_type_id','Entitlement_year','Granted_days'],
        [tuple(r[k] for k in ['id','employeeId','leaveTypeId','year','grantedDays']) for r in source['entitlements']])
    insert('Maternity_Case', ['Maternity_case_id','Employee_id','Case_no','Maximum_days'],
        [tuple(r[k] for k in ['id','employeeId','caseNo','maximumDays']) for r in source['maternityCases']])
    insert('Leave_Request', ['Leave_id','Employee_id','Leave_type_id','Maternity_case_id','Start_date','End_date','Reason','Request_date','Status','Duration','Version','Timeline_json'],
        [tuple(r[k] for k in ['id','employeeId','leaveTypeId','maternityCaseId','startDate','endDate','reason','requestDate','status','duration','version'])+(json.dumps(r['timeline'], ensure_ascii=False),) for r in source['requests']])
    insert('Leave_Day', ['Leave_day_id','Leave_id','Leave_date','Entitlement_id','Units'],
        [tuple(r[k] for k in ['id','leaveId','date','entitlementId','units']) for r in source['days']])
    insert('Leave_Document', ['Document_id','Leave_id','Document_type','File_name','Storage_key','File_type','File_size','Uploaded_at','Data_url'],
        [tuple(r[k] for k in ['id','leaveId','documentType','fileName','storageKey','fileType','fileSize','uploadedAt','dataUrl']) for r in source['documents']])
    insert('Leave_Approval', ['Approval_id','Leave_id','Approver_id','Step_no','Review_role','Review_type','Status','Comment','Assigned_at','Reviewed_at','Cancelled'],
        [tuple(r[k] for k in ['id','leaveId','approverId','stepNo','reviewRole','reviewType','status','comment','assignedAt','reviewedAt'])+(int(r.get('cancelled',False)),) for r in source['approvals']])
    insert('Work_Status', ['Work_status_id','Employee_id','Status_date','Status_type','Leave_id','Updated_at'],
        [tuple(r[k] for k in ['id','employeeId','date','statusType'])+(None,r['updatedAt']) for r in source['workStatuses']])
    insert('App_Notification', ['Notification_id','Employee_id','Leave_id','Message','Created_at','Is_read'],
        [tuple(r[k] for k in ['id','employeeId','leaveId','text','createdAt'])+(int(r['read']),) for r in source['notifications']])
    insert('App_Holiday', ['Holiday_date','Name'], [(r['date'],r['name']) for r in source['holidays']])
    db.commit()
    assert db.execute('PRAGMA foreign_key_check').fetchall() == []
    assert db.execute('PRAGMA integrity_check').fetchone()[0] == 'ok'
    assert db.execute('SELECT COUNT(*) FROM Employee').fetchone()[0] == 10
    inserts = '\n'.join(line for line in db.iterdump() if line.startswith('INSERT INTO'))
    sql = '-- Standalone fictional 10-person sample. Import into an empty SQLite database.\n' + schema + '\nBEGIN TRANSACTION;\nPRAGMA defer_foreign_keys=ON;\n' + inserts + '\nCOMMIT;\n'
    # Verify the SQL delivery can independently reconstruct the database.
    with closing(sqlite3.connect(':memory:')) as restored:
        restored.executescript(sql)
        assert restored.execute('PRAGMA foreign_key_check').fetchall() == []
        assert restored.execute('PRAGMA integrity_check').fetchone()[0] == 'ok'
        tables = [r[0] for r in db.execute("SELECT name FROM sqlite_master WHERE type='table'")]
        for table in tables:
            assert db.execute(f'SELECT * FROM {table} ORDER BY 1').fetchall() == restored.execute(f'SELECT * FROM {table} ORDER BY 1').fetchall(), table
    (folder / 'leave-management-10-people.sql').write_text(sql, encoding='utf-8')

# The connection is closed before replacing the generated file on Windows.
temporary_path.replace(database_path)
if check:
    assert sql == (exports / 'leave-management-10-people.sql').read_text(encoding='utf-8'), 'SQL export differs from source'
    with closing(sqlite3.connect(database_path)) as generated, closing(sqlite3.connect((exports / database_path.name).as_uri() + '?mode=ro', uri=True)) as existing:
        for table in tables:
            assert generated.execute(f'SELECT * FROM {table} ORDER BY 1').fetchall() == existing.execute(f'SELECT * FROM {table} ORDER BY 1').fetchall(), table
    scratch.cleanup()
print('SQLite/SQL exports verified without modifying data.' if check else 'SQLite and standalone SQL created; 10 accounts, foreign keys, integrity and SQL round-trip verified.')
