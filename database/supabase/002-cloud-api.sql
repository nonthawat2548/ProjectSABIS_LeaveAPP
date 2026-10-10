-- Run after setup-10-people.sql. Adds private support tables only; preserves all existing data.
BEGIN;
SET LOCAL search_path = leave_app, pg_catalog;
CREATE TABLE IF NOT EXISTS App_Session (
 Token_hash VARCHAR(64) PRIMARY KEY,
 Employee_id INTEGER NOT NULL REFERENCES Employee(Employee_id),
 Expires_at TIMESTAMPTZ NOT NULL
);
CREATE INDEX IF NOT EXISTS app_session_expiry ON App_Session(Expires_at);
CREATE TABLE IF NOT EXISTS App_Upload (
 Upload_id UUID PRIMARY KEY,
 Employee_id INTEGER NOT NULL REFERENCES Employee(Employee_id),
 File_name VARCHAR(255) NOT NULL,
 File_type VARCHAR(50) NOT NULL,
 File_size BIGINT NOT NULL CHECK (File_size BETWEEN 1 AND 104857600),
 Encoded_length INTEGER NOT NULL CHECK (Encoded_length BETWEEN 4 AND 139810136),
 Expires_at TIMESTAMPTZ NOT NULL
);
CREATE TABLE IF NOT EXISTS App_Upload_Part (
 Upload_id UUID NOT NULL REFERENCES App_Upload(Upload_id) ON DELETE CASCADE,
 Part_no INTEGER NOT NULL CHECK (Part_no BETWEEN 0 AND 66),
 Encoded_data TEXT NOT NULL CHECK (length(Encoded_data) BETWEEN 1 AND 2097152),
 PRIMARY KEY (Upload_id,Part_no)
);
CREATE INDEX IF NOT EXISTS app_upload_expiry ON App_Upload(Expires_at);
ALTER TABLE App_Session ENABLE ROW LEVEL SECURITY;
ALTER TABLE App_Upload ENABLE ROW LEVEL SECURITY;
ALTER TABLE App_Upload_Part ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON SCHEMA leave_app FROM PUBLIC, anon, authenticated;
REVOKE ALL ON ALL TABLES IN SCHEMA leave_app FROM PUBLIC, anon, authenticated;
COMMIT;
SELECT 'cloud-api-ready' AS status;
