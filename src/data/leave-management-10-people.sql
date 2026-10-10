-- Standalone fictional 10-person sample. Import into an empty SQLite database.
-- SQLite starter schema. The first 9 tables follow the original Data Dictionary.
-- App additions are labelled; dates are Gregorian ISO, never Buddhist Era strings.
PRAGMA foreign_keys = ON;

CREATE TABLE Employee (
 Employee_id INTEGER PRIMARY KEY,
 Name VARCHAR(150) NOT NULL,
 Gender VARCHAR(20) NOT NULL CHECK (Gender IN ('Male','Female','Other')),
 Email VARCHAR(255) NOT NULL UNIQUE COLLATE NOCASE,
 Phone VARCHAR(20),
 Position VARCHAR(100) NOT NULL,
 Role VARCHAR(50) NOT NULL CHECK (Role IN ('Employee','Manager','HR')),
 Manager_id INTEGER REFERENCES Employee(Employee_id),
 Department VARCHAR(100) NOT NULL DEFAULT '', -- app addition
 Active INTEGER NOT NULL DEFAULT 1 CHECK (Active IN (0,1)) -- app addition
);
CREATE TABLE Leave_Type (
 Leave_type_id INTEGER PRIMARY KEY,
 Leave_type_name VARCHAR(100) NOT NULL UNIQUE,
 Quota_scope VARCHAR(30) NOT NULL CHECK (Quota_scope IN ('Annual','Pregnancy')),
 Default_quota_days NUMERIC NOT NULL CHECK (Default_quota_days BETWEEN 0 AND 999),
 Day_count_basis VARCHAR(30) NOT NULL CHECK (Day_count_basis IN ('Working Days','Calendar Days')),
 Advance_notice_days INTEGER NOT NULL CHECK (Advance_notice_days BETWEEN 0 AND 999),
 Document_required_from_days INTEGER CHECK (Document_required_from_days BETWEEN 1 AND 999),
 Required_document_type VARCHAR(100),
 Eligible_gender VARCHAR(20) CHECK (Eligible_gender IN ('Male','Female','Other'))
);
CREATE TABLE Leave_Entitlement (
 Entitlement_id INTEGER PRIMARY KEY,
 Employee_id INTEGER NOT NULL REFERENCES Employee(Employee_id),
 Leave_type_id INTEGER NOT NULL REFERENCES Leave_Type(Leave_type_id),
 Entitlement_year INTEGER NOT NULL CHECK (Entitlement_year BETWEEN 1900 AND 2200),
 Granted_days NUMERIC NOT NULL CHECK (Granted_days BETWEEN 0 AND 999),
 UNIQUE(Employee_id,Leave_type_id,Entitlement_year)
 -- Used_days and Remaining_days are derived by the view below.
);
CREATE TABLE Maternity_Case (
 Maternity_case_id INTEGER PRIMARY KEY,
 Employee_id INTEGER NOT NULL REFERENCES Employee(Employee_id),
 Case_no INTEGER NOT NULL CHECK (Case_no BETWEEN 1 AND 999),
 Maximum_days INTEGER NOT NULL CHECK (Maximum_days BETWEEN 1 AND 999),
 UNIQUE(Employee_id,Case_no)
 -- Used_days and Remaining_days are derived.
);
CREATE TABLE Leave_Request (
 Leave_id INTEGER PRIMARY KEY,
 Employee_id INTEGER NOT NULL REFERENCES Employee(Employee_id),
 Leave_type_id INTEGER NOT NULL REFERENCES Leave_Type(Leave_type_id),
 Maternity_case_id INTEGER REFERENCES Maternity_Case(Maternity_case_id),
 Start_date DATE NOT NULL,
 End_date DATE NOT NULL CHECK (End_date >= Start_date),
 Reason VARCHAR(500) NOT NULL CHECK (length(Reason) BETWEEN 1 AND 500),
 Request_date TIMESTAMP NOT NULL,
 Status VARCHAR(20) NOT NULL CHECK (Status IN ('Pending','Approved','Rejected','Withdrawn')),
 Duration VARCHAR(10) NOT NULL DEFAULT 'Full' CHECK (Duration IN ('Full','AM','PM')), -- app addition
 Version INTEGER NOT NULL DEFAULT 1, -- app addition: optimistic concurrency
 Timeline_json TEXT NOT NULL DEFAULT '[]' -- app addition: demo audit trail
 -- Total_days is derived from Leave_Day.
);
CREATE TABLE Leave_Day (
 Leave_day_id INTEGER PRIMARY KEY,
 Leave_id INTEGER NOT NULL REFERENCES Leave_Request(Leave_id),
 Leave_date DATE NOT NULL,
 Entitlement_id INTEGER REFERENCES Leave_Entitlement(Entitlement_id),
 Units NUMERIC NOT NULL DEFAULT 1 CHECK (Units IN (0.5,1)), -- app addition: half day
 UNIQUE(Leave_id,Leave_date)
);
CREATE TABLE Leave_Document (
 Document_id INTEGER PRIMARY KEY,
 Leave_id INTEGER NOT NULL REFERENCES Leave_Request(Leave_id),
 Document_type VARCHAR(100) NOT NULL,
 File_name VARCHAR(255) NOT NULL,
 Storage_key VARCHAR(500) NOT NULL,
 File_type VARCHAR(20) NOT NULL,
 File_size BIGINT NOT NULL CHECK (File_size > 0),
 Uploaded_at TIMESTAMP NOT NULL,
 Data_url TEXT NOT NULL DEFAULT '' -- demo only: replace with object storage
);
CREATE TABLE Leave_Approval (
 Approval_id INTEGER PRIMARY KEY,
 Leave_id INTEGER NOT NULL REFERENCES Leave_Request(Leave_id),
 Approver_id INTEGER NOT NULL REFERENCES Employee(Employee_id),
 Step_no INTEGER NOT NULL,
 Review_role VARCHAR(50) NOT NULL CHECK (Review_role IN ('Manager','HR')),
 Review_type VARCHAR(30) NOT NULL CHECK (Review_type IN ('Decision','Consultation')),
 Status VARCHAR(20) NOT NULL CHECK (Status IN ('Pending','Approved','Rejected','Completed')),
 Comment VARCHAR(500),
 Assigned_at TIMESTAMP NOT NULL,
 Reviewed_at TIMESTAMP,
 Cancelled INTEGER NOT NULL DEFAULT 0 CHECK (Cancelled IN (0,1)) -- app addition
);
CREATE TABLE Work_Status (
 Work_status_id INTEGER PRIMARY KEY,
 Employee_id INTEGER NOT NULL REFERENCES Employee(Employee_id),
 Status_date DATE NOT NULL,
 Status_type VARCHAR(30) NOT NULL CHECK (Status_type IN ('In-office','Leave','WFH','Outside')),
 Leave_id INTEGER REFERENCES Leave_Request(Leave_id),
 Updated_at TIMESTAMP NOT NULL,
 UNIQUE(Employee_id,Status_date)
 -- In the app, Leave is calculated from approved Leave_Day rows.
);

-- Supporting tables for the approved navigation additions; not part of the 9 core tables.
CREATE TABLE App_Notification (
 Notification_id INTEGER PRIMARY KEY,
 Employee_id INTEGER NOT NULL REFERENCES Employee(Employee_id),
 Leave_id INTEGER REFERENCES Leave_Request(Leave_id),
 Message TEXT NOT NULL,
 Created_at TIMESTAMP NOT NULL,
 Is_read INTEGER NOT NULL DEFAULT 0 CHECK (Is_read IN (0,1))
);
CREATE TABLE App_Holiday (Holiday_date DATE PRIMARY KEY, Name VARCHAR(100) NOT NULL);

CREATE INDEX idx_request_employee_status ON Leave_Request(Employee_id,Status);
CREATE INDEX idx_day_date ON Leave_Day(Leave_date);
CREATE INDEX idx_approval_assigned ON Leave_Approval(Approver_id,Status,Cancelled);
CREATE INDEX idx_employee_manager ON Employee(Manager_id);
CREATE VIEW Leave_Request_Summary AS
 SELECT r.*,COALESCE((SELECT SUM(d.Units) FROM Leave_Day d WHERE d.Leave_id=r.Leave_id),0) AS Total_days FROM Leave_Request r;
CREATE VIEW Leave_Entitlement_Balance AS
 SELECT e.*,
 COALESCE((SELECT SUM(d.Units) FROM Leave_Day d JOIN Leave_Request r ON r.Leave_id=d.Leave_id WHERE d.Entitlement_id=e.Entitlement_id AND r.Status='Approved'),0) AS Used_days,
 e.Granted_days-COALESCE((SELECT SUM(d.Units) FROM Leave_Day d JOIN Leave_Request r ON r.Leave_id=d.Leave_id WHERE d.Entitlement_id=e.Entitlement_id AND r.Status='Approved'),0) AS Remaining_days,
 COALESCE((SELECT SUM(d.Units) FROM Leave_Day d JOIN Leave_Request r ON r.Leave_id=d.Leave_id WHERE d.Entitlement_id=e.Entitlement_id AND r.Status='Pending'),0) AS Pending_days
 FROM Leave_Entitlement e;
CREATE VIEW Maternity_Case_Balance AS
 SELECT c.*,
 COALESCE((SELECT SUM(d.Units) FROM Leave_Day d JOIN Leave_Request r ON r.Leave_id=d.Leave_id WHERE r.Maternity_case_id=c.Maternity_case_id AND r.Status='Approved'),0) AS Used_days,
 c.Maximum_days-COALESCE((SELECT SUM(d.Units) FROM Leave_Day d JOIN Leave_Request r ON r.Leave_id=d.Leave_id WHERE r.Maternity_case_id=c.Maternity_case_id AND r.Status='Approved'),0) AS Remaining_days
 FROM Maternity_Case c;

BEGIN TRANSACTION;
PRAGMA defer_foreign_keys=ON;
INSERT INTO "App_Holiday" VALUES('2026-11-06','วันหยุดบริษัท (ข้อมูลสมมติสำหรับทดสอบ)');
INSERT INTO "App_Holiday" VALUES('2026-12-31','วันหยุดบริษัท (ข้อมูลสมมติสำหรับทดสอบ)');
INSERT INTO "App_Holiday" VALUES('2027-01-01','วันหยุดบริษัท (ข้อมูลสมมติสำหรับทดสอบ)');
INSERT INTO "App_Notification" VALUES(1,4,1001,'พิมพ์ชนก วัฒนกุลส่งคำขอ LR-2026-01001','2026-10-10T05:00:00.000Z',0);
INSERT INTO "App_Notification" VALUES(2,1,1001,'ส่งคำขอแล้ว รอผู้จัดการพิจารณา','2026-10-10T05:00:00.000Z',0);
INSERT INTO "App_Notification" VALUES(3,4,1002,'นัทธพงศ์ สุขใจส่งคำขอ LR-2026-01002','2026-10-10T05:00:00.000Z',0);
INSERT INTO "App_Notification" VALUES(4,2,1002,'ส่งคำขอแล้ว รอผู้จัดการพิจารณา','2026-10-10T05:00:00.000Z',0);
INSERT INTO "App_Notification" VALUES(5,5,1002,'ผู้จัดการขอความเห็นสำหรับ LR-2026-01002','2026-10-10T05:00:00.000Z',0);
INSERT INTO "App_Notification" VALUES(6,4,1003,'อรทัย มั่นคงส่งคำขอ LR-2026-01003','2026-10-10T05:00:00.000Z',0);
INSERT INTO "App_Notification" VALUES(7,3,1003,'ส่งคำขอแล้ว รอผู้จัดการพิจารณา','2026-10-10T05:00:00.000Z',0);
INSERT INTO "App_Notification" VALUES(8,3,1003,'LR-2026-01003 ได้รับอนุมัติ · อนุมัติตามสิทธิ์ตัวอย่าง','2026-10-10T05:00:00.000Z',0);
INSERT INTO "App_Notification" VALUES(9,7,1004,'กานต์ พรชัยส่งคำขอ LR-2026-01004','2026-10-10T05:00:00.000Z',0);
INSERT INTO "App_Notification" VALUES(10,6,1004,'ส่งคำขอแล้ว รอผู้จัดการพิจารณา','2026-10-10T05:00:00.000Z',0);
INSERT INTO "App_Notification" VALUES(11,6,1004,'LR-2026-01004 ไม่ได้รับอนุมัติ · มีงานของทีมในวันดังกล่าว กรุณาปรับช่วงวันลา','2026-10-10T05:00:00.000Z',0);
INSERT INTO "App_Notification" VALUES(12,7,1005,'ชุติมา แสงทองส่งคำขอ LR-2026-01005','2026-10-10T05:00:00.000Z',0);
INSERT INTO "App_Notification" VALUES(13,8,1005,'ส่งคำขอแล้ว รอผู้จัดการพิจารณา','2026-10-10T05:00:00.000Z',0);
INSERT INTO "App_Notification" VALUES(14,8,1005,'LR-2026-01005 ได้รับอนุมัติ · อนุมัติครึ่งวันเช้า','2026-10-10T05:00:00.000Z',0);
INSERT INTO "App_Notification" VALUES(15,7,1006,'ชุติมา แสงทองส่งคำขอ LR-2026-01006','2026-10-10T05:00:00.000Z',0);
INSERT INTO "App_Notification" VALUES(16,8,1006,'ส่งคำขอแล้ว รอผู้จัดการพิจารณา','2026-10-10T05:00:00.000Z',0);
INSERT INTO "App_Notification" VALUES(17,7,1007,'มาลินี สุขสวัสดิ์ส่งคำขอ LR-2026-01007','2026-10-10T05:00:00.000Z',0);
INSERT INTO "App_Notification" VALUES(18,9,1007,'ส่งคำขอแล้ว รอผู้จัดการพิจารณา','2026-10-10T05:00:00.000Z',0);
INSERT INTO "App_Notification" VALUES(19,9,1007,'LR-2026-01007 ได้รับอนุมัติ · อนุมัติตามกรณีลาคลอด','2026-10-10T05:00:00.000Z',0);
INSERT INTO "App_Notification" VALUES(20,4,1008,'วีรภัทร ตั้งใจส่งคำขอ LR-2026-01008','2026-10-10T05:00:00.000Z',0);
INSERT INTO "App_Notification" VALUES(21,10,1008,'ส่งคำขอแล้ว รอผู้จัดการพิจารณา','2026-10-10T05:00:00.000Z',0);
INSERT INTO "App_Notification" VALUES(22,4,1008,'วีรภัทร ตั้งใจยกเลิก LR-2026-01008','2026-10-10T05:00:00.000Z',0);
INSERT INTO "App_Notification" VALUES(23,4,1009,'พิมพ์ชนก วัฒนกุลส่งคำขอ LR-2026-01009','2026-10-10T05:00:00.000Z',0);
INSERT INTO "App_Notification" VALUES(24,1,1009,'ส่งคำขอแล้ว รอผู้จัดการพิจารณา','2026-10-10T05:00:00.000Z',0);
INSERT INTO "App_Notification" VALUES(25,1,1009,'LR-2026-01009 ได้รับอนุมัติ · แบ่งโควตาตามปีของแต่ละวัน','2026-10-10T05:00:00.000Z',0);
INSERT INTO "App_Notification" VALUES(26,7,1010,'กานต์ พรชัยส่งคำขอ LR-2026-01010','2026-10-10T05:00:00.000Z',0);
INSERT INTO "App_Notification" VALUES(27,6,1010,'ส่งคำขอแล้ว รอผู้จัดการพิจารณา','2026-10-10T05:00:00.000Z',0);
INSERT INTO "App_Notification" VALUES(28,5,1010,'ผู้จัดการขอความเห็นสำหรับ LR-2026-01010','2026-10-10T05:00:00.000Z',0);
INSERT INTO "App_Notification" VALUES(29,7,1010,'HR ส่งความเห็นสำหรับ LR-2026-01010 แล้ว','2026-10-10T05:00:00.000Z',0);
INSERT INTO "App_Notification" VALUES(30,4,1011,'วีรภัทร ตั้งใจส่งคำขอ LR-2026-01011','2026-10-10T05:00:00.000Z',0);
INSERT INTO "App_Notification" VALUES(31,10,1011,'ส่งคำขอแล้ว รอผู้จัดการพิจารณา','2026-10-10T05:00:00.000Z',0);
INSERT INTO "App_Notification" VALUES(32,5,1011,'ผู้จัดการขอความเห็นสำหรับ LR-2026-01011','2026-10-10T05:00:00.000Z',0);
INSERT INTO "App_Notification" VALUES(33,4,1011,'HR ส่งความเห็นสำหรับ LR-2026-01011 แล้ว','2026-10-10T05:00:00.000Z',0);
INSERT INTO "App_Notification" VALUES(34,10,1011,'LR-2026-01011 ได้รับอนุมัติ · อนุมัติหลังได้รับความเห็น HR','2026-10-10T05:00:00.000Z',0);
INSERT INTO "App_Notification" VALUES(35,4,1012,'อรทัย มั่นคงส่งคำขอ LR-2026-01012','2026-10-10T05:00:00.000Z',0);
INSERT INTO "App_Notification" VALUES(36,3,1012,'ส่งคำขอแล้ว รอผู้จัดการพิจารณา','2026-10-10T05:00:00.000Z',0);
INSERT INTO "App_Notification" VALUES(37,4,1013,'นัทธพงศ์ สุขใจส่งคำขอ LR-2026-01013','2026-10-10T05:00:00.000Z',0);
INSERT INTO "App_Notification" VALUES(38,2,1013,'ส่งคำขอแล้ว รอผู้จัดการพิจารณา','2026-10-10T05:00:00.000Z',0);
INSERT INTO "App_Notification" VALUES(39,2,1013,'LR-2026-01013 ได้รับอนุมัติ · นับเฉพาะวันทำงาน','2026-10-10T05:00:00.000Z',0);
INSERT INTO "App_Notification" VALUES(40,4,1014,'วีรภัทร ตั้งใจส่งคำขอ LR-2026-01014','2026-10-10T05:00:00.000Z',0);
INSERT INTO "App_Notification" VALUES(41,10,1014,'ส่งคำขอแล้ว รอผู้จัดการพิจารณา','2026-10-10T05:00:00.000Z',0);
INSERT INTO "App_Notification" VALUES(42,4,1014,'วีรภัทร ตั้งใจแก้ไขคำขอ LR-2026-01014','2026-10-10T05:00:00.000Z',0);
INSERT INTO "App_Notification" VALUES(43,10,1014,'แก้ไขคำขอแล้ว และเริ่มพิจารณาใหม่','2026-10-10T05:00:00.000Z',0);
INSERT INTO "Employee" VALUES(1,'พิมพ์ชนก วัฒนกุล','Female','employee@demo.local','0810000001','นักพัฒนาระบบ','Employee',4,'ฝ่ายไอที',1);
INSERT INTO "Employee" VALUES(2,'นัทธพงศ์ สุขใจ','Male','nat@demo.local','0810000002','เจ้าหน้าที่ระบบ','Employee',4,'ฝ่ายไอที',1);
INSERT INTO "Employee" VALUES(3,'อรทัย มั่นคง','Female','orn@demo.local','0810000003','นักวิเคราะห์ระบบ','Employee',4,'ฝ่ายไอที',1);
INSERT INTO "Employee" VALUES(4,'ธนวัฒน์ กิตติวงศ์','Male','manager@demo.local','0810000004','ผู้จัดการฝ่ายไอที','Manager',NULL,'ฝ่ายไอที',1);
INSERT INTO "Employee" VALUES(5,'ศิริพร ใจดี','Female','hr@demo.local','0810000005','เจ้าหน้าที่ฝ่ายบุคคล','HR',NULL,'ฝ่ายบุคคล',1);
INSERT INTO "Employee" VALUES(6,'กานต์ พรชัย','Other','other@demo.local','0810000006','เจ้าหน้าที่ฝ่ายขาย','Employee',7,'ฝ่ายขาย',1);
INSERT INTO "Employee" VALUES(7,'ปกรณ์ รุ่งเรือง','Male','sales-manager@demo.local','0810000007','ผู้จัดการฝ่ายขาย','Manager',NULL,'ฝ่ายขาย',1);
INSERT INTO "Employee" VALUES(8,'ชุติมา แสงทอง','Female','chutima@demo.local','0810000008','เจ้าหน้าที่ประสานงานขาย','Employee',7,'ฝ่ายขาย',1);
INSERT INTO "Employee" VALUES(9,'มาลินี สุขสวัสดิ์','Female','malinee@demo.local','0810000009','เจ้าหน้าที่ดูแลลูกค้า','Employee',7,'ฝ่ายขาย',1);
INSERT INTO "Employee" VALUES(10,'วีรภัทร ตั้งใจ','Male','weeraphat@demo.local','0810000010','เจ้าหน้าที่ทดสอบระบบ','Employee',4,'ฝ่ายไอที',1);
INSERT INTO "Leave_Approval" VALUES(1,1001,4,1,'Manager','Decision','Pending','','2026-10-10T05:00:00.000Z',NULL,0);
INSERT INTO "Leave_Approval" VALUES(2,1002,4,1,'Manager','Decision','Pending','','2026-10-10T05:00:00.000Z',NULL,0);
INSERT INTO "Leave_Approval" VALUES(3,1002,5,2,'HR','Consultation','Pending','ขอความเห็น HR เรื่องนโยบายและเอกสารตัวอย่าง','2026-10-10T05:00:00.000Z',NULL,0);
INSERT INTO "Leave_Approval" VALUES(4,1003,4,1,'Manager','Decision','Approved','อนุมัติตามสิทธิ์ตัวอย่าง','2026-10-10T05:00:00.000Z','2026-10-10T05:00:00.000Z',0);
INSERT INTO "Leave_Approval" VALUES(5,1004,7,1,'Manager','Decision','Rejected','มีงานของทีมในวันดังกล่าว กรุณาปรับช่วงวันลา','2026-10-10T05:00:00.000Z','2026-10-10T05:00:00.000Z',0);
INSERT INTO "Leave_Approval" VALUES(6,1005,7,1,'Manager','Decision','Approved','อนุมัติครึ่งวันเช้า','2026-10-10T05:00:00.000Z','2026-10-10T05:00:00.000Z',0);
INSERT INTO "Leave_Approval" VALUES(7,1006,7,1,'Manager','Decision','Pending','','2026-10-10T05:00:00.000Z',NULL,0);
INSERT INTO "Leave_Approval" VALUES(8,1007,7,1,'Manager','Decision','Approved','อนุมัติตามกรณีลาคลอด','2026-10-10T05:00:00.000Z','2026-10-10T05:00:00.000Z',0);
INSERT INTO "Leave_Approval" VALUES(9,1008,4,1,'Manager','Decision','Pending','','2026-10-10T05:00:00.000Z',NULL,1);
INSERT INTO "Leave_Approval" VALUES(10,1009,4,1,'Manager','Decision','Approved','แบ่งโควตาตามปีของแต่ละวัน','2026-10-10T05:00:00.000Z','2026-10-10T05:00:00.000Z',0);
INSERT INTO "Leave_Approval" VALUES(11,1010,7,1,'Manager','Decision','Pending','','2026-10-10T05:00:00.000Z',NULL,0);
INSERT INTO "Leave_Approval" VALUES(12,1010,5,2,'HR','Consultation','Completed','ตรวจข้อมูลตัวอย่างแล้ว ผู้จัดการเป็นผู้ตัดสินผลสุดท้าย','2026-10-10T05:00:00.000Z','2026-10-10T05:00:00.000Z',0);
INSERT INTO "Leave_Approval" VALUES(13,1011,4,1,'Manager','Decision','Approved','อนุมัติหลังได้รับความเห็น HR','2026-10-10T05:00:00.000Z','2026-10-10T05:00:00.000Z',0);
INSERT INTO "Leave_Approval" VALUES(14,1011,5,2,'HR','Consultation','Completed','ตรวจข้อมูลตัวอย่างแล้ว ผู้จัดการเป็นผู้ตัดสินผลสุดท้าย','2026-10-10T05:00:00.000Z','2026-10-10T05:00:00.000Z',0);
INSERT INTO "Leave_Approval" VALUES(15,1012,4,1,'Manager','Decision','Pending','','2026-10-10T05:00:00.000Z',NULL,0);
INSERT INTO "Leave_Approval" VALUES(16,1013,4,1,'Manager','Decision','Approved','นับเฉพาะวันทำงาน','2026-10-10T05:00:00.000Z','2026-10-10T05:00:00.000Z',0);
INSERT INTO "Leave_Approval" VALUES(17,1014,4,1,'Manager','Decision','Pending','','2026-10-10T05:00:00.000Z',NULL,1);
INSERT INTO "Leave_Approval" VALUES(18,1014,4,2,'Manager','Decision','Pending','','2026-10-10T05:00:00.000Z',NULL,0);
INSERT INTO "Leave_Day" VALUES(1,1001,'2026-10-13',1,1);
INSERT INTO "Leave_Day" VALUES(2,1001,'2026-10-14',1,1);
INSERT INTO "Leave_Day" VALUES(3,1002,'2026-10-19',9,1);
INSERT INTO "Leave_Day" VALUES(4,1002,'2026-10-20',9,1);
INSERT INTO "Leave_Day" VALUES(5,1002,'2026-10-21',9,1);
INSERT INTO "Leave_Day" VALUES(6,1003,'2026-10-15',13,1);
INSERT INTO "Leave_Day" VALUES(7,1003,'2026-10-16',13,1);
INSERT INTO "Leave_Day" VALUES(8,1004,'2026-10-22',35,1);
INSERT INTO "Leave_Day" VALUES(9,1005,'2026-11-17',43,0.5);
INSERT INTO "Leave_Day" VALUES(10,1006,'2026-11-17',47,0.5);
INSERT INTO "Leave_Day" VALUES(11,1007,'2026-12-01',NULL,1);
INSERT INTO "Leave_Day" VALUES(12,1007,'2026-12-02',NULL,1);
INSERT INTO "Leave_Day" VALUES(13,1007,'2026-12-03',NULL,1);
INSERT INTO "Leave_Day" VALUES(14,1007,'2026-12-04',NULL,1);
INSERT INTO "Leave_Day" VALUES(15,1007,'2026-12-05',NULL,1);
INSERT INTO "Leave_Day" VALUES(16,1007,'2026-12-06',NULL,1);
INSERT INTO "Leave_Day" VALUES(17,1007,'2026-12-07',NULL,1);
INSERT INTO "Leave_Day" VALUES(18,1007,'2026-12-08',NULL,1);
INSERT INTO "Leave_Day" VALUES(19,1007,'2026-12-09',NULL,1);
INSERT INTO "Leave_Day" VALUES(20,1007,'2026-12-10',NULL,1);
INSERT INTO "Leave_Day" VALUES(21,1007,'2026-12-11',NULL,1);
INSERT INTO "Leave_Day" VALUES(22,1007,'2026-12-12',NULL,1);
INSERT INTO "Leave_Day" VALUES(23,1007,'2026-12-13',NULL,1);
INSERT INTO "Leave_Day" VALUES(24,1007,'2026-12-14',NULL,1);
INSERT INTO "Leave_Day" VALUES(25,1007,'2026-12-15',NULL,1);
INSERT INTO "Leave_Day" VALUES(26,1007,'2026-12-16',NULL,1);
INSERT INTO "Leave_Day" VALUES(27,1007,'2026-12-17',NULL,1);
INSERT INTO "Leave_Day" VALUES(28,1007,'2026-12-18',NULL,1);
INSERT INTO "Leave_Day" VALUES(29,1007,'2026-12-19',NULL,1);
INSERT INTO "Leave_Day" VALUES(30,1007,'2026-12-20',NULL,1);
INSERT INTO "Leave_Day" VALUES(31,1008,'2026-11-23',55,1);
INSERT INTO "Leave_Day" VALUES(32,1008,'2026-11-24',55,1);
INSERT INTO "Leave_Day" VALUES(33,1009,'2026-12-30',1,1);
INSERT INTO "Leave_Day" VALUES(34,1009,'2027-01-04',2,1);
INSERT INTO "Leave_Day" VALUES(35,1010,'2026-11-09',33,1);
INSERT INTO "Leave_Day" VALUES(36,1010,'2026-11-10',33,1);
INSERT INTO "Leave_Day" VALUES(37,1010,'2026-11-11',33,1);
INSERT INTO "Leave_Day" VALUES(38,1011,'2026-11-02',57,1);
INSERT INTO "Leave_Day" VALUES(39,1011,'2026-11-03',57,1);
INSERT INTO "Leave_Day" VALUES(40,1011,'2026-11-04',57,1);
INSERT INTO "Leave_Day" VALUES(41,1012,'2026-11-01',NULL,1);
INSERT INTO "Leave_Day" VALUES(42,1012,'2026-11-02',NULL,1);
INSERT INTO "Leave_Day" VALUES(43,1012,'2026-11-03',NULL,1);
INSERT INTO "Leave_Day" VALUES(44,1012,'2026-11-04',NULL,1);
INSERT INTO "Leave_Day" VALUES(45,1012,'2026-11-05',NULL,1);
INSERT INTO "Leave_Day" VALUES(46,1012,'2026-11-06',NULL,1);
INSERT INTO "Leave_Day" VALUES(47,1012,'2026-11-07',NULL,1);
INSERT INTO "Leave_Day" VALUES(48,1012,'2026-11-08',NULL,1);
INSERT INTO "Leave_Day" VALUES(49,1012,'2026-11-09',NULL,1);
INSERT INTO "Leave_Day" VALUES(50,1012,'2026-11-10',NULL,1);
INSERT INTO "Leave_Day" VALUES(51,1012,'2026-11-11',NULL,1);
INSERT INTO "Leave_Day" VALUES(52,1012,'2026-11-12',NULL,1);
INSERT INTO "Leave_Day" VALUES(53,1012,'2026-11-13',NULL,1);
INSERT INTO "Leave_Day" VALUES(54,1012,'2026-11-14',NULL,1);
INSERT INTO "Leave_Day" VALUES(55,1012,'2026-11-15',NULL,1);
INSERT INTO "Leave_Day" VALUES(56,1013,'2026-11-05',11,1);
INSERT INTO "Leave_Day" VALUES(57,1013,'2026-11-09',11,1);
INSERT INTO "Leave_Day" VALUES(58,1014,'2026-12-09',59,1);
INSERT INTO "Leave_Document" VALUES(1,1002,'Medical Certificate','DEMO_PLACEHOLDER_NOT_A_MEDICAL_CERTIFICATE.png','mock/1002/DEMO_PLACEHOLDER_NOT_A_MEDICAL_CERTIFICATE.png','image/png',68,'2026-10-10T05:00:00.000Z','data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=');
INSERT INTO "Leave_Document" VALUES(2,1010,'Medical Certificate','DEMO_PLACEHOLDER_NOT_A_MEDICAL_CERTIFICATE.png','mock/1010/DEMO_PLACEHOLDER_NOT_A_MEDICAL_CERTIFICATE.png','image/png',68,'2026-10-10T05:00:00.000Z','data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=');
INSERT INTO "Leave_Document" VALUES(3,1011,'Medical Certificate','DEMO_PLACEHOLDER_NOT_A_MEDICAL_CERTIFICATE.png','mock/1011/DEMO_PLACEHOLDER_NOT_A_MEDICAL_CERTIFICATE.png','image/png',68,'2026-10-10T05:00:00.000Z','data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=');
INSERT INTO "Leave_Entitlement" VALUES(1,1,1,2026,10);
INSERT INTO "Leave_Entitlement" VALUES(2,1,1,2027,10);
INSERT INTO "Leave_Entitlement" VALUES(3,1,2,2026,30);
INSERT INTO "Leave_Entitlement" VALUES(4,1,2,2027,30);
INSERT INTO "Leave_Entitlement" VALUES(5,1,3,2026,6);
INSERT INTO "Leave_Entitlement" VALUES(6,1,3,2027,6);
INSERT INTO "Leave_Entitlement" VALUES(7,2,1,2026,10);
INSERT INTO "Leave_Entitlement" VALUES(8,2,1,2027,10);
INSERT INTO "Leave_Entitlement" VALUES(9,2,2,2026,30);
INSERT INTO "Leave_Entitlement" VALUES(10,2,2,2027,30);
INSERT INTO "Leave_Entitlement" VALUES(11,2,3,2026,6);
INSERT INTO "Leave_Entitlement" VALUES(12,2,3,2027,6);
INSERT INTO "Leave_Entitlement" VALUES(13,3,1,2026,10);
INSERT INTO "Leave_Entitlement" VALUES(14,3,1,2027,10);
INSERT INTO "Leave_Entitlement" VALUES(15,3,2,2026,30);
INSERT INTO "Leave_Entitlement" VALUES(16,3,2,2027,30);
INSERT INTO "Leave_Entitlement" VALUES(17,3,3,2026,6);
INSERT INTO "Leave_Entitlement" VALUES(18,3,3,2027,6);
INSERT INTO "Leave_Entitlement" VALUES(19,4,1,2026,10);
INSERT INTO "Leave_Entitlement" VALUES(20,4,1,2027,10);
INSERT INTO "Leave_Entitlement" VALUES(21,4,2,2026,30);
INSERT INTO "Leave_Entitlement" VALUES(22,4,2,2027,30);
INSERT INTO "Leave_Entitlement" VALUES(23,4,3,2026,6);
INSERT INTO "Leave_Entitlement" VALUES(24,4,3,2027,6);
INSERT INTO "Leave_Entitlement" VALUES(25,5,1,2026,10);
INSERT INTO "Leave_Entitlement" VALUES(26,5,1,2027,10);
INSERT INTO "Leave_Entitlement" VALUES(27,5,2,2026,30);
INSERT INTO "Leave_Entitlement" VALUES(28,5,2,2027,30);
INSERT INTO "Leave_Entitlement" VALUES(29,5,3,2026,6);
INSERT INTO "Leave_Entitlement" VALUES(30,5,3,2027,6);
INSERT INTO "Leave_Entitlement" VALUES(31,6,1,2026,10);
INSERT INTO "Leave_Entitlement" VALUES(32,6,1,2027,10);
INSERT INTO "Leave_Entitlement" VALUES(33,6,2,2026,30);
INSERT INTO "Leave_Entitlement" VALUES(34,6,2,2027,30);
INSERT INTO "Leave_Entitlement" VALUES(35,6,3,2026,6);
INSERT INTO "Leave_Entitlement" VALUES(36,6,3,2027,6);
INSERT INTO "Leave_Entitlement" VALUES(37,7,1,2026,10);
INSERT INTO "Leave_Entitlement" VALUES(38,7,1,2027,10);
INSERT INTO "Leave_Entitlement" VALUES(39,7,2,2026,30);
INSERT INTO "Leave_Entitlement" VALUES(40,7,2,2027,30);
INSERT INTO "Leave_Entitlement" VALUES(41,7,3,2026,6);
INSERT INTO "Leave_Entitlement" VALUES(42,7,3,2027,6);
INSERT INTO "Leave_Entitlement" VALUES(43,8,1,2026,10);
INSERT INTO "Leave_Entitlement" VALUES(44,8,1,2027,10);
INSERT INTO "Leave_Entitlement" VALUES(45,8,2,2026,30);
INSERT INTO "Leave_Entitlement" VALUES(46,8,2,2027,30);
INSERT INTO "Leave_Entitlement" VALUES(47,8,3,2026,6);
INSERT INTO "Leave_Entitlement" VALUES(48,8,3,2027,6);
INSERT INTO "Leave_Entitlement" VALUES(49,9,1,2026,10);
INSERT INTO "Leave_Entitlement" VALUES(50,9,1,2027,10);
INSERT INTO "Leave_Entitlement" VALUES(51,9,2,2026,30);
INSERT INTO "Leave_Entitlement" VALUES(52,9,2,2027,30);
INSERT INTO "Leave_Entitlement" VALUES(53,9,3,2026,6);
INSERT INTO "Leave_Entitlement" VALUES(54,9,3,2027,6);
INSERT INTO "Leave_Entitlement" VALUES(55,10,1,2026,10);
INSERT INTO "Leave_Entitlement" VALUES(56,10,1,2027,10);
INSERT INTO "Leave_Entitlement" VALUES(57,10,2,2026,30);
INSERT INTO "Leave_Entitlement" VALUES(58,10,2,2027,30);
INSERT INTO "Leave_Entitlement" VALUES(59,10,3,2026,6);
INSERT INTO "Leave_Entitlement" VALUES(60,10,3,2027,6);
INSERT INTO "Leave_Request" VALUES(1001,1,1,NULL,'2026-10-13','2026-10-14','พักผ่อนกับครอบครัว','2026-10-10T05:00:00.000Z','Pending','Full',1,'[{"action": "ยื่นคำขอ", "actorId": 1, "at": "2026-10-10T05:00:00.000Z", "comment": ""}]');
INSERT INTO "Leave_Request" VALUES(1002,2,2,NULL,'2026-10-19','2026-10-21','พักรักษาตัว (สถานการณ์จำลอง)','2026-10-10T05:00:00.000Z','Pending','Full',2,'[{"action": "ยื่นคำขอ", "actorId": 2, "at": "2026-10-10T05:00:00.000Z", "comment": ""}, {"action": "ส่งปรึกษา HR", "actorId": 4, "at": "2026-10-10T05:00:00.000Z", "comment": "ขอความเห็น HR เรื่องนโยบายและเอกสารตัวอย่าง"}]');
INSERT INTO "Leave_Request" VALUES(1003,3,1,NULL,'2026-10-15','2026-10-16','พักผ่อนประจำปี','2026-10-10T05:00:00.000Z','Approved','Full',2,'[{"action": "ยื่นคำขอ", "actorId": 3, "at": "2026-10-10T05:00:00.000Z", "comment": ""}, {"action": "อนุมัติคำขอ", "actorId": 4, "at": "2026-10-10T05:00:00.000Z", "comment": "อนุมัติตามสิทธิ์ตัวอย่าง"}]');
INSERT INTO "Leave_Request" VALUES(1004,6,3,NULL,'2026-10-22','2026-10-22','ติดต่อหน่วยงานราชการ','2026-10-10T05:00:00.000Z','Rejected','Full',2,'[{"action": "ยื่นคำขอ", "actorId": 6, "at": "2026-10-10T05:00:00.000Z", "comment": ""}, {"action": "ไม่อนุมัติ", "actorId": 7, "at": "2026-10-10T05:00:00.000Z", "comment": "มีงานของทีมในวันดังกล่าว กรุณาปรับช่วงวันลา"}]');
INSERT INTO "Leave_Request" VALUES(1005,8,1,NULL,'2026-11-17','2026-11-17','ลาครึ่งวันเช้า','2026-10-10T05:00:00.000Z','Approved','AM',2,'[{"action": "ยื่นคำขอ", "actorId": 8, "at": "2026-10-10T05:00:00.000Z", "comment": ""}, {"action": "อนุมัติคำขอ", "actorId": 7, "at": "2026-10-10T05:00:00.000Z", "comment": "อนุมัติครึ่งวันเช้า"}]');
INSERT INTO "Leave_Request" VALUES(1006,8,3,NULL,'2026-11-17','2026-11-17','ลาครึ่งวันบ่าย','2026-10-10T05:00:00.000Z','Pending','PM',1,'[{"action": "ยื่นคำขอ", "actorId": 8, "at": "2026-10-10T05:00:00.000Z", "comment": ""}]');
INSERT INTO "Leave_Request" VALUES(1007,9,4,2,'2026-12-01','2026-12-20','ลาคลอดตามกรณีตัวอย่าง','2026-10-10T05:00:00.000Z','Approved','Full',2,'[{"action": "ยื่นคำขอ", "actorId": 9, "at": "2026-10-10T05:00:00.000Z", "comment": ""}, {"action": "อนุมัติคำขอ", "actorId": 7, "at": "2026-10-10T05:00:00.000Z", "comment": "อนุมัติตามกรณีลาคลอด"}]');
INSERT INTO "Leave_Request" VALUES(1008,10,1,NULL,'2026-11-23','2026-11-24','วางแผนพักผ่อน','2026-10-10T05:00:00.000Z','Withdrawn','Full',2,'[{"action": "ยื่นคำขอ", "actorId": 10, "at": "2026-10-10T05:00:00.000Z", "comment": ""}, {"action": "ยกเลิกคำขอ", "actorId": 10, "at": "2026-10-10T05:00:00.000Z", "comment": ""}]');
INSERT INTO "Leave_Request" VALUES(1009,1,1,NULL,'2026-12-30','2027-01-04','พักผ่อนข้ามปี โดยยกเว้นวันหยุดบริษัทตัวอย่าง','2026-10-10T05:00:00.000Z','Approved','Full',2,'[{"action": "ยื่นคำขอ", "actorId": 1, "at": "2026-10-10T05:00:00.000Z", "comment": ""}, {"action": "อนุมัติคำขอ", "actorId": 4, "at": "2026-10-10T05:00:00.000Z", "comment": "แบ่งโควตาตามปีของแต่ละวัน"}]');
INSERT INTO "Leave_Request" VALUES(1010,6,2,NULL,'2026-11-09','2026-11-11','พักรักษาตัวพร้อมเอกสารจำลอง','2026-10-10T05:00:00.000Z','Pending','Full',3,'[{"action": "ยื่นคำขอ", "actorId": 6, "at": "2026-10-10T05:00:00.000Z", "comment": ""}, {"action": "ส่งปรึกษา HR", "actorId": 7, "at": "2026-10-10T05:00:00.000Z", "comment": "ขอความเห็น HR เรื่องนโยบายและเอกสารตัวอย่าง"}, {"action": "HR ส่งความเห็น", "actorId": 5, "at": "2026-10-10T05:00:00.000Z", "comment": "ตรวจข้อมูลตัวอย่างแล้ว ผู้จัดการเป็นผู้ตัดสินผลสุดท้าย"}]');
INSERT INTO "Leave_Request" VALUES(1011,10,2,NULL,'2026-11-02','2026-11-04','พักรักษาตัว (ตัวอย่างครบขั้นตอน HR)','2026-10-10T05:00:00.000Z','Approved','Full',4,'[{"action": "ยื่นคำขอ", "actorId": 10, "at": "2026-10-10T05:00:00.000Z", "comment": ""}, {"action": "ส่งปรึกษา HR", "actorId": 4, "at": "2026-10-10T05:00:00.000Z", "comment": "ขอความเห็น HR เรื่องนโยบายและเอกสารตัวอย่าง"}, {"action": "HR ส่งความเห็น", "actorId": 5, "at": "2026-10-10T05:00:00.000Z", "comment": "ตรวจข้อมูลตัวอย่างแล้ว ผู้จัดการเป็นผู้ตัดสินผลสุดท้าย"}, {"action": "อนุมัติคำขอ", "actorId": 4, "at": "2026-10-10T05:00:00.000Z", "comment": "อนุมัติหลังได้รับความเห็น HR"}]');
INSERT INTO "Leave_Request" VALUES(1012,3,4,1,'2026-11-01','2026-11-15','ลาคลอดรอพิจารณา','2026-10-10T05:00:00.000Z','Pending','Full',1,'[{"action": "ยื่นคำขอ", "actorId": 3, "at": "2026-10-10T05:00:00.000Z", "comment": ""}]');
INSERT INTO "Leave_Request" VALUES(1013,2,3,NULL,'2026-11-05','2026-11-09','ลากิจโดยยกเว้นวันหยุดบริษัทและวันเสาร์อาทิตย์','2026-10-10T05:00:00.000Z','Approved','Full',2,'[{"action": "ยื่นคำขอ", "actorId": 2, "at": "2026-10-10T05:00:00.000Z", "comment": ""}, {"action": "อนุมัติคำขอ", "actorId": 4, "at": "2026-10-10T05:00:00.000Z", "comment": "นับเฉพาะวันทำงาน"}]');
INSERT INTO "Leave_Request" VALUES(1014,10,3,NULL,'2026-12-09','2026-12-09','ปรับวันนัดหมายแล้ว รอผู้จัดการพิจารณา','2026-10-10T05:00:00.000Z','Pending','Full',2,'[{"action": "ยื่นคำขอ", "actorId": 10, "at": "2026-10-10T05:00:00.000Z", "comment": ""}, {"action": "แก้ไขคำขอ / เริ่มพิจารณาใหม่", "actorId": 10, "at": "2026-10-10T05:00:00.000Z", "comment": ""}]');
INSERT INTO "Leave_Type" VALUES(1,'ลาพักร้อน','Annual',10,'Working Days',1,NULL,NULL,NULL);
INSERT INTO "Leave_Type" VALUES(2,'ลาป่วย','Annual',30,'Working Days',0,3,'Medical Certificate',NULL);
INSERT INTO "Leave_Type" VALUES(3,'ลากิจ','Annual',6,'Working Days',1,NULL,NULL,NULL);
INSERT INTO "Leave_Type" VALUES(4,'ลาคลอด','Pregnancy',120,'Calendar Days',1,NULL,NULL,'Female');
INSERT INTO "Maternity_Case" VALUES(1,3,1,120);
INSERT INTO "Maternity_Case" VALUES(2,9,1,120);
INSERT INTO "Work_Status" VALUES(1,1,'2026-10-09','In-office',NULL,'2026-10-10T05:00:00.000Z');
INSERT INTO "Work_Status" VALUES(2,1,'2026-10-12','In-office',NULL,'2026-10-10T05:00:00.000Z');
INSERT INTO "Work_Status" VALUES(3,2,'2026-10-09','Outside',NULL,'2026-10-10T05:00:00.000Z');
INSERT INTO "Work_Status" VALUES(4,2,'2026-10-12','Outside',NULL,'2026-10-10T05:00:00.000Z');
INSERT INTO "Work_Status" VALUES(5,3,'2026-10-09','WFH',NULL,'2026-10-10T05:00:00.000Z');
INSERT INTO "Work_Status" VALUES(6,3,'2026-10-12','WFH',NULL,'2026-10-10T05:00:00.000Z');
INSERT INTO "Work_Status" VALUES(7,4,'2026-10-09','In-office',NULL,'2026-10-10T05:00:00.000Z');
INSERT INTO "Work_Status" VALUES(8,4,'2026-10-12','In-office',NULL,'2026-10-10T05:00:00.000Z');
INSERT INTO "Work_Status" VALUES(9,5,'2026-10-09','Outside',NULL,'2026-10-10T05:00:00.000Z');
INSERT INTO "Work_Status" VALUES(10,5,'2026-10-12','Outside',NULL,'2026-10-10T05:00:00.000Z');
INSERT INTO "Work_Status" VALUES(11,6,'2026-10-09','WFH',NULL,'2026-10-10T05:00:00.000Z');
INSERT INTO "Work_Status" VALUES(12,6,'2026-10-12','WFH',NULL,'2026-10-10T05:00:00.000Z');
INSERT INTO "Work_Status" VALUES(13,7,'2026-10-09','In-office',NULL,'2026-10-10T05:00:00.000Z');
INSERT INTO "Work_Status" VALUES(14,7,'2026-10-12','In-office',NULL,'2026-10-10T05:00:00.000Z');
INSERT INTO "Work_Status" VALUES(15,8,'2026-10-09','Outside',NULL,'2026-10-10T05:00:00.000Z');
INSERT INTO "Work_Status" VALUES(16,8,'2026-10-12','Outside',NULL,'2026-10-10T05:00:00.000Z');
INSERT INTO "Work_Status" VALUES(17,9,'2026-10-09','WFH',NULL,'2026-10-10T05:00:00.000Z');
INSERT INTO "Work_Status" VALUES(18,9,'2026-10-12','WFH',NULL,'2026-10-10T05:00:00.000Z');
INSERT INTO "Work_Status" VALUES(19,10,'2026-10-09','In-office',NULL,'2026-10-10T05:00:00.000Z');
INSERT INTO "Work_Status" VALUES(20,10,'2026-10-12','In-office',NULL,'2026-10-10T05:00:00.000Z');
COMMIT;
