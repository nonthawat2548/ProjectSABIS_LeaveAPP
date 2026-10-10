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
