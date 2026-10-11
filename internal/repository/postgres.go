package repository

import (
	"context"
	"crypto/tls"
	"crypto/x509"
	"encoding/json"
	"errors"
	"fmt"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	"leave-management/internal/model"
	"leave-management/internal/service"
	"net"
	"net/url"
	"os"
	"reflect"
	"sort"
	"strings"
	"time"
)

type PostgresStore struct{ pool *pgxpool.Pool }

func OpenPostgres(ctx context.Context, dsn, ca string, local bool) (*PostgresStore, error) {
	u, err := url.Parse(dsn)
	if err != nil {
		return nil, err
	}
	q := u.Query()
	for _, key := range []string{"sslmode", "sslcert", "sslkey", "sslrootcert"} {
		q.Del(key)
	}
	u.RawQuery = q.Encode()
	cfg, err := pgxpool.ParseConfig(u.String())
	if err != nil {
		return nil, err
	}
	cfg.MaxConns = 2
	cfg.MaxConnIdleTime = 10 * time.Second
	cfg.ConnConfig.ConnectTimeout = 15 * time.Second
	// Always verify cloud TLS. Local integration tests must opt in and use loopback.
	host := cfg.ConnConfig.Host
	ip := net.ParseIP(host)
	if local && os.Getenv("VERCEL") == "" && (host == "localhost" || ip != nil && ip.IsLoopback()) {
		cfg.ConnConfig.TLSConfig = nil
	} else {
		tlsConfig := &tls.Config{MinVersion: tls.VersionTLS12, ServerName: host}
		if ca != "" {
			roots, err := x509.SystemCertPool()
			if err != nil {
				roots = x509.NewCertPool()
			}
			if !roots.AppendCertsFromPEM([]byte(strings.ReplaceAll(ca, `\n`, "\n"))) {
				return nil, service.Problem("ใบรับรองฐานข้อมูลไม่ถูกต้อง กรุณาติดต่อผู้ดูแลระบบ", "UNAVAILABLE")
			}
			tlsConfig.RootCAs = roots
		}
		cfg.ConnConfig.TLSConfig = tlsConfig
	}
	cfg.ConnConfig.Fallbacks = nil
	pool, err := pgxpool.NewWithConfig(ctx, cfg)
	if err != nil {
		return nil, err
	}
	return &PostgresStore{pool: pool}, nil
}
func (s *PostgresStore) Close()       { s.pool.Close() }
func (s *PostgresStore) Mode() string { return "cloud-postgres" }
func (s *PostgresStore) Transaction(ctx context.Context, write bool, fn func(Tx) error) error {
	options := pgx.TxOptions{IsoLevel: pgx.RepeatableRead, AccessMode: pgx.ReadOnly}
	if write {
		options = pgx.TxOptions{}
	}
	tx, err := s.pool.BeginTx(ctx, options)
	if err != nil {
		return err
	}
	defer tx.Rollback(context.Background())
	if write {
		if _, err = tx.Exec(ctx, "SELECT pg_advisory_xact_lock(1279607126,1)"); err != nil {
			return err
		}
	}
	if err = fn(&postgresTx{tx: tx, ctx: ctx, write: write}); err != nil {
		return err
	}
	return tx.Commit(ctx)
}

type postgresTx struct {
	tx    pgx.Tx
	ctx   context.Context
	write bool
}
type field struct{ column, key string }
type table struct {
	name, collection string
	fields           []field
}

// Explicit SQL-to-JSON mapping mirrors docs/DATABASE.md. Table names are constants,
// never supplied by HTTP callers.
var tables = []table{
	{"employee", "employees", []field{{"employee_id", "id"}, {"name", "name"}, {"gender", "gender"}, {"email", "email"}, {"phone", "phone"}, {"position", "position"}, {"role", "role"}, {"manager_id", "managerId"}, {"department", "department"}, {"active", "active"}}},
	{"leave_type", "leaveTypes", []field{{"leave_type_id", "id"}, {"leave_type_name", "name"}, {"quota_scope", "quotaScope"}, {"default_quota_days", "defaultQuotaDays"}, {"day_count_basis", "dayCountBasis"}, {"advance_notice_days", "advanceNoticeDays"}, {"document_required_from_days", "documentRequiredFromDays"}, {"required_document_type", "requiredDocumentType"}, {"eligible_gender", "eligibleGender"}}},
	{"leave_entitlement", "entitlements", []field{{"entitlement_id", "id"}, {"employee_id", "employeeId"}, {"leave_type_id", "leaveTypeId"}, {"entitlement_year", "year"}, {"granted_days", "grantedDays"}}},
	{"maternity_case", "maternityCases", []field{{"maternity_case_id", "id"}, {"employee_id", "employeeId"}, {"case_no", "caseNo"}, {"maximum_days", "maximumDays"}}},
	{"leave_request", "requests", []field{{"leave_id", "id"}, {"employee_id", "employeeId"}, {"leave_type_id", "leaveTypeId"}, {"maternity_case_id", "maternityCaseId"}, {"start_date", "startDate"}, {"end_date", "endDate"}, {"reason", "reason"}, {"request_date", "requestDate"}, {"status", "status"}, {"duration", "duration"}, {"version", "version"}, {"timeline_json", "timeline"}}},
	{"leave_day", "days", []field{{"leave_day_id", "id"}, {"leave_id", "leaveId"}, {"leave_date", "date"}, {"entitlement_id", "entitlementId"}, {"units", "units"}}},
	{"leave_document", "documents", []field{{"document_id", "id"}, {"leave_id", "leaveId"}, {"document_type", "documentType"}, {"file_name", "fileName"}, {"storage_key", "storageKey"}, {"file_type", "fileType"}, {"file_size", "fileSize"}, {"uploaded_at", "uploadedAt"}, {"data_url", "dataUrl"}}},
	{"leave_approval", "approvals", []field{{"approval_id", "id"}, {"leave_id", "leaveId"}, {"approver_id", "approverId"}, {"step_no", "stepNo"}, {"review_role", "reviewRole"}, {"review_type", "reviewType"}, {"status", "status"}, {"comment", "comment"}, {"assigned_at", "assignedAt"}, {"reviewed_at", "reviewedAt"}, {"cancelled", "cancelled"}}},
	{"work_status", "workStatuses", []field{{"work_status_id", "id"}, {"employee_id", "employeeId"}, {"status_date", "date"}, {"status_type", "statusType"}, {"leave_id", ""}, {"updated_at", "updatedAt"}}},
	{"app_notification", "notifications", []field{{"notification_id", "id"}, {"employee_id", "employeeId"}, {"leave_id", "leaveId"}, {"message", "text"}, {"created_at", "createdAt"}, {"is_read", "read"}}},
	{"app_holiday", "holidays", []field{{"holiday_date", "date"}, {"name", "name"}}},
}

func (t *postgresTx) Ready() error {
	var ready bool
	err := t.tx.QueryRow(t.ctx, "SELECT to_regclass('leave_app.employee') IS NOT NULL AND to_regclass('leave_app.app_session') IS NOT NULL AND to_regclass('leave_app.app_upload_part') IS NOT NULL").Scan(&ready)
	if err != nil {
		return err
	}
	if !ready {
		return service.Problem("ระบบยังไม่พร้อมใช้งาน กรุณาติดต่อผู้ดูแลระบบ", "UNAVAILABLE")
	}
	return nil
}
func (t *postgresTx) Load() (*model.Database, error) {
	collections := map[string]json.RawMessage{"schemaVersion": json.RawMessage("1")}
	for _, spec := range tables {
		selections := []string{}
		for _, f := range spec.fields {
			if f.key == "" {
				continue
			}
			expr := f.column
			switch f.key {
			case "dataUrl":
				expr = "''::text"
			case "active", "read", "cancelled":
				expr = f.column + "=1"
			case "date", "startDate", "endDate":
				expr = f.column + "::text"
			case "requestDate", "assignedAt", "reviewedAt", "uploadedAt", "createdAt", "updatedAt":
				expr = "to_char(" + f.column + " AT TIME ZONE 'UTC','YYYY-MM-DD\"T\"HH24:MI:SS.MS\"Z\"')"
			}
			selections = append(selections, expr+` AS "`+f.key+`"`)
		}
		lock := ""
		if t.write {
			lock = " FOR UPDATE"
		}
		sql := "SELECT COALESCE(json_agg(row_to_json(row)), '[]'::json) FROM (SELECT " + strings.Join(selections, ",") + " FROM leave_app." + spec.name + " ORDER BY " + spec.fields[0].column + lock + ") row"
		var b []byte
		if err := t.tx.QueryRow(t.ctx, sql).Scan(&b); err != nil {
			return nil, err
		}
		collections[spec.collection] = b
	}
	b, err := json.Marshal(collections)
	if err != nil {
		return nil, err
	}
	var db model.Database
	err = json.Unmarshal(b, &db)
	return &db, err
}
func collections(db *model.Database) (map[string][]map[string]any, error) {
	b, err := json.Marshal(db)
	if err != nil {
		return nil, err
	}
	var fields map[string]json.RawMessage
	if err = json.Unmarshal(b, &fields); err != nil {
		return nil, err
	}
	result := map[string][]map[string]any{}
	for k, v := range fields {
		if k == "schemaVersion" {
			continue
		}
		var rows []map[string]any
		if err = json.Unmarshal(v, &rows); err != nil {
			return nil, err
		}
		result[k] = rows
	}
	return result, nil
}
func rowKey(row map[string]any, key string) string { return fmt.Sprint(row[key]) }
func (t *postgresTx) Save(before, after *model.Database) error {
	previous, err := collections(before)
	if err != nil {
		return err
	}
	next, err := collections(after)
	if err != nil {
		return err
	}
	order := []string{"workStatuses", "notifications", "approvals", "documents", "days", "requests", "entitlements", "maternityCases", "employees", "leaveTypes", "holidays"}
	for _, name := range order {
		var spec table
		for _, s := range tables {
			if s.collection == name {
				spec = s
				break
			}
		}
		key := spec.fields[0].key
		keys := map[string]bool{}
		for _, r := range next[name] {
			keys[rowKey(r, key)] = true
		}
		for _, r := range previous[name] {
			if !keys[rowKey(r, key)] {
				if _, err = t.tx.Exec(t.ctx, "DELETE FROM leave_app."+spec.name+" WHERE "+spec.fields[0].column+"=$1", sqlValue(r[key], key)); err != nil {
					return err
				}
			}
		}
	}
	for _, spec := range tables {
		key := spec.fields[0].key
		old := map[string]map[string]any{}
		for _, r := range previous[spec.collection] {
			old[rowKey(r, key)] = r
		}
		rows := next[spec.collection]
		if spec.collection == "employees" {
			sort.SliceStable(rows, func(i, j int) bool { return rows[i]["managerId"] == nil && rows[j]["managerId"] != nil })
		}
		for _, r := range rows {
			if reflect.DeepEqual(old[rowKey(r, key)], r) {
				continue
			}
			columns, placeholders, updates := []string{}, []string{}, []string{}
			values := []any{}
			for i, f := range spec.fields {
				columns = append(columns, f.column)
				placeholders = append(placeholders, fmt.Sprintf("$%d", i+1))
				values = append(values, sqlValue(r[f.key], f.key))
				if i > 0 {
					update := f.column + "=EXCLUDED." + f.column
					if f.key == "dataUrl" {
						update = "data_url=CASE WHEN EXCLUDED.data_url='' THEN leave_document.data_url ELSE EXCLUDED.data_url END"
					}
					updates = append(updates, update)
				}
			}
			sql := "INSERT INTO leave_app." + spec.name + " (" + strings.Join(columns, ",") + ") VALUES (" + strings.Join(placeholders, ",") + ") ON CONFLICT (" + spec.fields[0].column + ") DO UPDATE SET " + strings.Join(updates, ",")
			if _, err = t.tx.Exec(t.ctx, sql, values...); err != nil {
				return err
			}
		}
	}
	return nil
}
func sqlValue(value any, key string) any {
	if value == nil {
		if key == "cancelled" {
			return 0
		}
		return nil
	}
	if key == "timeline" {
		b, _ := json.Marshal(value)
		return string(b)
	}
	if b, ok := value.(bool); ok {
		if b {
			return 1
		}
		return 0
	}
	if n, ok := value.(float64); ok && key != "units" && key != "grantedDays" && key != "defaultQuotaDays" {
		return int(n)
	}
	return value
}
func (t *postgresTx) Session(hash string) (*Session, error) {
	var s Session
	err := t.tx.QueryRow(t.ctx, "SELECT s.employee_id,s.expires_at FROM leave_app.app_session s JOIN leave_app.employee e ON e.employee_id=s.employee_id WHERE s.token_hash=$1 AND s.expires_at>CURRENT_TIMESTAMP AND e.active=1", hash).Scan(&s.EmployeeID, &s.ExpiresAt)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, nil
	}
	return &s, err
}
func (t *postgresTx) PutSession(hash string, s Session) error {
	if _, err := t.tx.Exec(t.ctx, "DELETE FROM leave_app.app_session WHERE expires_at<=CURRENT_TIMESTAMP"); err != nil {
		return err
	}
	_, err := t.tx.Exec(t.ctx, "INSERT INTO leave_app.app_session(token_hash,employee_id,expires_at) VALUES ($1,$2,$3)", hash, s.EmployeeID, s.ExpiresAt)
	return err
}
func (t *postgresTx) DeleteSession(hash string) error {
	_, err := t.tx.Exec(t.ctx, "DELETE FROM leave_app.app_session WHERE token_hash=$1", hash)
	return err
}
func (t *postgresTx) CreateUpload(u Upload) error {
	if _, err := t.tx.Exec(t.ctx, "DELETE FROM leave_app.app_upload WHERE expires_at<=CURRENT_TIMESTAMP"); err != nil {
		return err
	}
	var n int
	if err := t.tx.QueryRow(t.ctx, "SELECT count(*) FROM leave_app.app_upload WHERE employee_id=$1", u.EmployeeID).Scan(&n); err != nil {
		return err
	}
	if n >= 3 {
		return service.Problem("มีไฟล์ที่กำลังอัปโหลดอยู่ กรุณารอหรือยกเลิกไฟล์เดิม", "CONFLICT")
	}
	_, err := t.tx.Exec(t.ctx, "INSERT INTO leave_app.app_upload(upload_id,employee_id,file_name,file_type,file_size,encoded_length,expires_at) VALUES ($1,$2,$3,$4,$5,$6,$7)", u.ID, u.EmployeeID, u.FileName, u.FileType, u.FileSize, u.EncodedLength, u.ExpiresAt)
	return err
}
func (t *postgresTx) Upload(id string, owner int) (*Upload, error) {
	var u Upload
	err := t.tx.QueryRow(t.ctx, "SELECT upload_id::text,employee_id,file_name,file_type,file_size,encoded_length,expires_at FROM leave_app.app_upload WHERE upload_id=$1 AND employee_id=$2 AND expires_at>CURRENT_TIMESTAMP FOR UPDATE", id, owner).Scan(&u.ID, &u.EmployeeID, &u.FileName, &u.FileType, &u.FileSize, &u.EncodedLength, &u.ExpiresAt)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, nil
	}
	return &u, err
}
func (t *postgresTx) Parts(id string) ([]UploadPart, error) {
	rows, err := t.tx.Query(t.ctx, "SELECT part_no,encoded_data FROM leave_app.app_upload_part WHERE upload_id=$1 ORDER BY part_no", id)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	result := []UploadPart{}
	for rows.Next() {
		var p UploadPart
		if err = rows.Scan(&p.Number, &p.Data); err != nil {
			return nil, err
		}
		result = append(result, p)
	}
	return result, rows.Err()
}
func (t *postgresTx) PutPart(id string, p UploadPart) error {
	_, err := t.tx.Exec(t.ctx, "INSERT INTO leave_app.app_upload_part(upload_id,part_no,encoded_data) VALUES ($1,$2,$3) ON CONFLICT(upload_id,part_no) DO UPDATE SET encoded_data=EXCLUDED.encoded_data", id, p.Number, p.Data)
	return err
}
func (t *postgresTx) DeleteUpload(id string, owner int) error {
	_, err := t.tx.Exec(t.ctx, "DELETE FROM leave_app.app_upload WHERE upload_id=$1 AND employee_id=$2", id, owner)
	return err
}
func (t *postgresTx) DocumentLength(id int) (int, error) {
	var n int
	err := t.tx.QueryRow(t.ctx, "SELECT length(data_url) FROM leave_app.leave_document WHERE document_id=$1", id).Scan(&n)
	return n, err
}
func (t *postgresTx) DocumentPart(id, part, length int) (string, error) {
	var data string
	err := t.tx.QueryRow(t.ctx, "SELECT substring(data_url FROM $2::integer FOR $3::integer) FROM leave_app.leave_document WHERE document_id=$1", id, part*length+1, length).Scan(&data)
	return data, err
}
func (t *postgresTx) ResetTransient(ids []int) error {
	if _, err := t.tx.Exec(t.ctx, "DELETE FROM leave_app.app_upload"); err != nil {
		return err
	}
	_, err := t.tx.Exec(t.ctx, "DELETE FROM leave_app.app_session WHERE NOT(employee_id=ANY($1::integer[]))", ids)
	return err
}
