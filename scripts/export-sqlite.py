"""Build the supplied SQLite seed from mock JSON; Python stdlib only."""
import json, sqlite3
from pathlib import Path

root = Path(__file__).resolve().parent.parent
source = json.loads((root / 'database/mock-db.json').read_text(encoding='utf-8'))
db_path = root / 'database/mock.sqlite'
if db_path.exists():
    db_path.unlink()
db = sqlite3.connect(db_path)
db.executescript((root / 'database/schema.sql').read_text(encoding='utf-8'))
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
dump = '\n'.join(line for line in db.iterdump() if line.startswith('INSERT INTO'))
(root / 'database/seed.sql').write_text('-- Load after schema.sql into an empty database.\nPRAGMA foreign_keys=ON;\nBEGIN TRANSACTION;\nPRAGMA defer_foreign_keys=ON;\n'+dump+'\nCOMMIT;\n',encoding='utf-8')
print('SQLite seed created; foreign keys and integrity verified.')
db.close()
