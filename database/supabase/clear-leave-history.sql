-- One-time cleanup of test leave history in an existing leave_app database.
-- Keeps employees, policies, granted entitlements, maternity cases and holidays.
-- Run the whole file in Supabase SQL Editor; do not rerun the setup script.
BEGIN;
SELECT pg_advisory_xact_lock(1279607126, 1);

DELETE FROM leave_app.app_notification WHERE leave_id IS NOT NULL;
DELETE FROM leave_app.work_status WHERE leave_id IS NOT NULL OR status_type = 'Leave';
DELETE FROM leave_app.leave_approval;
DELETE FROM leave_app.leave_document;
DELETE FROM leave_app.leave_day;
DELETE FROM leave_app.leave_request;
-- Removes unfinished test uploads and their parts via ON DELETE CASCADE.
DELETE FROM leave_app.app_upload;

COMMIT;

SELECT
  (SELECT count(*) FROM leave_app.leave_request) AS requests,
  (SELECT count(*) FROM leave_app.leave_approval) AS approvals,
  (SELECT count(*) FROM leave_app.leave_day) AS leave_days,
  (SELECT count(*) FROM leave_app.leave_document) AS documents,
  (SELECT count(*) FROM leave_app.app_notification WHERE leave_id IS NOT NULL) AS leave_notifications,
  (SELECT count(*) FROM leave_app.work_status WHERE leave_id IS NOT NULL OR status_type = 'Leave') AS leave_work_statuses,
  (SELECT count(*) FROM leave_app.app_upload) AS unfinished_uploads;
