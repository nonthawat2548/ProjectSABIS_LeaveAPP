package httpapi

import (
	"bytes"
	"context"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"leave-management/internal/model"
	"leave-management/internal/repository"
	"leave-management/internal/service"
	"net/http"
	"net/http/httptest"
	"os"
	"strings"
	"sync"
	"testing"
	"time"
)

var testNow = time.Date(2026, 10, 10, 5, 0, 0, 0, time.UTC)

type testClient struct {
	t       *testing.T
	handler http.Handler
	cookie  string
}

func (c *testClient) request(method, path string, input any) (int, map[string]any) {
	c.t.Helper()
	b, _ := json.Marshal(input)
	r := httptest.NewRequest(method, "http://leave.test/api"+path, bytes.NewReader(b))
	if c.cookie != "" {
		r.Header.Set("Cookie", c.cookie)
	}
	w := httptest.NewRecorder()
	c.handler.ServeHTTP(w, r)
	if cookie := w.Header().Get("Set-Cookie"); cookie != "" {
		c.cookie = strings.Split(cookie, ";")[0]
	}
	var result map[string]any
	_ = json.Unmarshal(w.Body.Bytes(), &result)
	if result == nil {
		result = map[string]any{"body": w.Body.String()}
	}
	return w.Code, result
}
func (c *testClient) login(user string) {
	c.t.Helper()
	status, data := c.request("POST", "/session", map[string]any{"email": user, "password": "1234"})
	if status != 200 {
		c.t.Fatalf("login %s: %d %v", user, status, data)
	}
}
func newFixture(t *testing.T) (*repository.JSONStore, http.Handler) {
	t.Helper()
	store, err := repository.NewJSON("")
	if err != nil {
		t.Fatal(err)
	}
	return store, New(store, Options{DemoLogin: true, Now: func() time.Time { return testNow }})
}
func change(t *testing.T, store repository.Store, fn func(*model.Database)) {
	t.Helper()
	if err := store.Transaction(context.Background(), true, func(tx repository.Tx) error {
		db, err := tx.Load()
		if err != nil {
			return err
		}
		before := model.Clone(db)
		fn(db)
		return tx.Save(before, db)
	}); err != nil {
		t.Fatal(err)
	}
}
func maternityInput() map[string]any {
	return map[string]any{"leaveTypeId": 4, "maternityCaseId": 1, "startDate": "2026-12-30", "endDate": "2027-01-02", "duration": "Full", "reason": "พักฟื้นหลังคลอด"}
}
func annualInput() map[string]any {
	return map[string]any{"leaveTypeId": 1, "maternityCaseId": nil, "startDate": "2026-12-04", "endDate": "2026-12-04", "duration": "Full", "reason": "พักผ่อน"}
}
func command(input map[string]any) map[string]any {
	return map[string]any{"type": "submit", "input": input}
}

func TestPersonalLoginAndSessionScope(t *testing.T) {
	_, handler := newFixture(t)
	for _, account := range []struct{ email, username string }{
		{"employee@demo.local", "pimchanok"}, {"nat@demo.local", "natthaphong"},
		{"orn@demo.local", "orathai"}, {"manager@demo.local", "thanawat"},
		{"hr@demo.local", "siriporn"}, {"other@demo.local", "kan"},
		{"sales-manager@demo.local", "pakorn"}, {"chutima@demo.local", "chutima"},
		{"malinee@demo.local", "malinee"}, {"weeraphat@demo.local", "weeraphat"},
	} {
		t.Run(account.username, func(t *testing.T) {
			c := testClient{t: t, handler: handler}
			c.login(" " + strings.ToUpper(account.username) + " ")
			status, data := c.request("GET", "/session", nil)
			if status != 200 {
				t.Fatal(status)
			}
			if data["employee"].(map[string]any)["email"] != account.email {
				t.Fatal("username resolved another account", data)
			}
			if status, _ = c.request("DELETE", "/session", nil); status != 200 {
				t.Fatal(status)
			}
			if status, _ = c.request("GET", "/snapshot", nil); status != 401 {
				t.Fatal(status)
			}
		})
	}
	c := testClient{t: t, handler: handler}
	for _, name := range []string{"employee", "manager", "hr", "other", "sales-manager"} {
		status, _ := c.request("POST", "/session", map[string]any{"email": name, "password": "1234"})
		if status != 401 {
			t.Fatalf("role alias %s accepted", name)
		}
	}
	c.login("pimchanok")
	status, data := c.request("GET", "/snapshot", nil)
	if status != 200 {
		t.Fatal(data)
	}
	for _, row := range data["requests"].([]any) {
		if row.(map[string]any)["employeeId"] != float64(1) {
			t.Fatal("private request leaked")
		}
	}
	r := httptest.NewRequest("POST", "https://leave.test/api/session", strings.NewReader(`{"email":"pimchanok","password":"1234"}`))
	w := httptest.NewRecorder()
	handler.ServeHTTP(w, r)
	cookie := w.Header().Get("Set-Cookie")
	for _, flag := range []string{"HttpOnly", "Secure", "SameSite=Lax", "Path=/api"} {
		if !strings.Contains(cookie, flag) {
			t.Fatal(cookie)
		}
	}
}
func TestDirectAPIEligibilityOrder(t *testing.T) {
	for _, tc := range []struct {
		gender  string
		message string
	}{{"Male", "พนักงานชาย"}, {"Other", "ข้อมูลเพศ"}, {"", "ข้อมูลเพศ"}, {"female", "ข้อมูลเพศ"}} {
		t.Run(tc.gender, func(t *testing.T) {
			store, handler := newFixture(t)
			change(t, store, func(db *model.Database) {
				db.Employees[2].Gender = tc.gender
				db.Employees[2].ManagerID = nil
				db.MaternityCases = []model.MaternityCase{}
			})
			c := testClient{t: t, handler: handler}
			c.login("orathai")
			i := maternityInput()
			i["startDate"] = "invalid"
			i["reason"] = ""
			i["gender"] = "Female"
			i["maternityCaseId"] = 999
			status, data := c.request("POST", "/commands", command(i))
			if status != 400 || !strings.Contains(fmt.Sprint(data["message"]), tc.message) {
				t.Fatal(status, data)
			}
		})
	}
	for _, tc := range []struct {
		name    string
		mutate  func(*model.Database)
		caseID  any
		message string
	}{{"no case", func(db *model.Database) { db.MaternityCases = nil }, nil, "ยังไม่มีกรณี"}, {"foreign case", func(*model.Database) {}, 2, "ไม่ใช่ของ"}, {"missing case", func(*model.Database) {}, 999, "ไม่พบกรณี"}} {
		t.Run(tc.name, func(t *testing.T) {
			store, handler := newFixture(t)
			change(t, store, tc.mutate)
			c := testClient{t: t, handler: handler}
			c.login("orathai")
			i := maternityInput()
			i["maternityCaseId"] = tc.caseID
			status, data := c.request("POST", "/commands", command(i))
			if status != 400 || !strings.Contains(fmt.Sprint(data["message"]), tc.message) {
				t.Fatal(status, data)
			}
		})
	}
}
func TestMaternityEditCrossYearAndLatestRights(t *testing.T) {
	store, handler := newFixture(t)
	change(t, store, func(db *model.Database) {
		db.Requests = []model.LeaveRequest{}
		db.Days = []model.LeaveDay{}
		db.Approvals = []model.LeaveApproval{}
		db.Documents = []model.LeaveDocument{}
		db.Notifications = []model.Notification{}
	})
	c := testClient{t: t, handler: handler}
	c.login("orathai")
	status, result := c.request("POST", "/commands", command(maternityInput()))
	if status != 200 {
		t.Fatal(result)
	}
	id := int(result["id"].(float64))
	change(t, store, func(db *model.Database) { db.MaternityCases[0].MaximumDays = 4 })
	status, result = c.request("POST", "/commands", map[string]any{"type": "edit", "id": id, "version": 1, "input": maternityInput()})
	if status != 200 {
		t.Fatal("edit double counted quota", result)
	}
	manager := testClient{t: t, handler: handler}
	manager.login("thanawat")
	change(t, store, func(db *model.Database) { db.MaternityCases[0].MaximumDays = 3 })
	status, result = manager.request("POST", "/commands", map[string]any{"type": "approve", "id": id, "version": 2, "comment": ""})
	if status != 409 {
		t.Fatal(status, result)
	}
	change(t, store, func(db *model.Database) { db.MaternityCases[0].MaximumDays = 4; db.Employees[2].Gender = "Male" })
	status, result = manager.request("POST", "/commands", map[string]any{"type": "approve", "id": id, "version": 2, "comment": ""})
	if status != 400 || !strings.Contains(fmt.Sprint(result["message"]), "พนักงานชาย") {
		t.Fatal(status, result)
	}
	change(t, store, func(db *model.Database) { db.Employees[2].Gender = "Female" })
	status, result = manager.request("POST", "/commands", map[string]any{"type": "approve", "id": id, "version": 2, "comment": ""})
	if status != 200 {
		t.Fatal("male manager should approve female owner", result)
	}
	status, _ = manager.request("POST", "/commands", map[string]any{"type": "approve", "id": id, "version": 2, "comment": ""})
	if status != 409 {
		t.Fatal("duplicate approval", status)
	}
	_ = store.Transaction(context.Background(), false, func(tx repository.Tx) error {
		db, _ := tx.Load()
		b := service.Balance(db, 3, 4, 0, ptr(1), 0)
		if b.Used != 4 || b.Pending != 0 {
			t.Fatal(b)
		}
		for _, d := range db.Days {
			if d.LeaveID == id && d.EntitlementID != nil {
				t.Fatal("maternity quota is annual")
			}
		}
		return nil
	})
}
func ptr[T any](v T) *T { return &v }
func TestOverlapHalfDayAndQuota(t *testing.T) {
	for _, tc := range []struct {
		name    string
		mutate  func(*model.Database)
		input   func(map[string]any)
		message string
	}{{"half", func(*model.Database) {}, func(i map[string]any) { i["duration"] = "AM" }, "เต็มวัน"}, {"quota", func(db *model.Database) { db.MaternityCases[0].MaximumDays = 2 }, func(map[string]any) {}, "ไม่เพียงพอ"}} {
		t.Run(tc.name, func(t *testing.T) {
			store, handler := newFixture(t)
			change(t, store, tc.mutate)
			c := testClient{t: t, handler: handler}
			c.login("orathai")
			i := maternityInput()
			tc.input(i)
			status, data := c.request("POST", "/commands", command(i))
			if status != 400 || !strings.Contains(fmt.Sprint(data["message"]), tc.message) {
				t.Fatal(status, data)
			}
		})
	}
	_, handler := newFixture(t)
	c := testClient{t: t, handler: handler}
	c.login("orathai")
	status, data := c.request("POST", "/commands", command(maternityInput()))
	if status != 200 {
		t.Fatal(data)
	}
	status, data = c.request("POST", "/commands", command(maternityInput()))
	if status != 400 || !strings.Contains(fmt.Sprint(data["message"]), "ซ้อน") {
		t.Fatal(status, data)
	}
}
func TestHTTPAuthorizationBodyLimitAndCSRF(t *testing.T) {
	store, handler := newFixture(t)
	w := httptest.NewRecorder()
	handler.ServeHTTP(w, httptest.NewRequest("POST", "http://leave.test/api/commands", strings.NewReader("not JSON")))
	if w.Code != 401 {
		t.Fatal(w.Code)
	}
	c := testClient{t: t, handler: handler}
	c.login("pimchanok")
	r := httptest.NewRequest("POST", "http://leave.test/api/commands", strings.NewReader(`{}`))
	r.Header.Set("Cookie", c.cookie)
	r.Header.Set("Origin", "https://evil.test")
	w = httptest.NewRecorder()
	handler.ServeHTTP(w, r)
	if w.Code != 403 {
		t.Fatal(w.Code)
	}
	r = httptest.NewRequest("POST", "http://leave.test/api/commands", strings.NewReader(strings.Repeat(" ", service.MaxBodyBytes+1)))
	r.Header.Set("Cookie", c.cookie)
	w = httptest.NewRecorder()
	handler.ServeHTTP(w, r)
	if w.Code != 413 {
		t.Fatal(w.Code)
	}
	change(t, store, func(db *model.Database) { db.Employees[0].Active = false })
	status, _ := c.request("GET", "/snapshot", nil)
	if status != 401 {
		t.Fatal("disabled account retained access")
	}
}
func TestAtomicConcurrentApproval(t *testing.T) {
	_, handler := newFixture(t)
	c := testClient{t: t, handler: handler}
	c.login("pimchanok")
	status, data := c.request("POST", "/commands", command(annualInput()))
	if status != 200 {
		t.Fatal(data)
	}
	id := int(data["id"].(float64))
	m := testClient{t: t, handler: handler}
	m.login("thanawat")
	var group sync.WaitGroup
	codes := make(chan int, 2)
	for range 2 {
		group.Add(1)
		go func() {
			defer group.Done()
			client := testClient{t: t, handler: handler, cookie: m.cookie}
			code, _ := client.request("POST", "/commands", map[string]any{"type": "approve", "id": id, "version": 1, "comment": ""})
			codes <- code
		}()
	}
	group.Wait()
	close(codes)
	success, conflict := 0, 0
	for code := range codes {
		if code == 200 {
			success++
		}
		if code == 409 {
			conflict++
		}
	}
	if success != 1 || conflict != 1 {
		t.Fatal(success, conflict)
	}
}
func testDocumentTransport(t *testing.T, store repository.Store, handler http.Handler) int {
	c := testClient{t: t, handler: handler}
	c.login("pimchanok")
	raw := []byte("%PDF-1.7\nทดสอบไฟล์\n%%EOF")
	encoded := base64.StdEncoding.EncodeToString(raw)
	status, data := c.request("POST", "/uploads", map[string]any{"fileName": "test.pdf", "fileType": "application/pdf", "fileSize": len(raw), "encodedLength": len(encoded)})
	if status != 200 {
		t.Fatal(status, data)
	}
	upload := data["uploadId"].(string)
	status, data = c.request("PUT", "/uploads/"+upload+"/parts/0", map[string]any{"data": encoded})
	if status != 200 {
		t.Fatal(status, data)
	}
	i := annualInput()
	i["attachment"] = map[string]any{"uploadId": upload}
	status, data = c.request("POST", "/commands", command(i))
	if status != 200 {
		t.Fatal(status, data)
	}
	requestID := int(data["id"].(float64))
	var docID int
	status, snapshot := c.request("GET", "/snapshot", nil)
	if status != 200 {
		t.Fatal(snapshot)
	}
	for _, row := range snapshot["documents"].([]any) {
		d := row.(map[string]any)
		if int(d["leaveId"].(float64)) == requestID {
			docID = int(d["id"].(float64))
			if d["dataUrl"] != "" || d["remote"] != true {
				t.Fatal("document content in snapshot")
			}
		}
	}
	if docID == 0 {
		t.Fatal("document missing")
	}
	path := fmt.Sprintf("/documents/%d/parts/0", docID)
	status, data = c.request("GET", path, nil)
	if status != 200 || data["data"] != "data:application/pdf;base64,"+encoded {
		t.Fatal(status, data)
	}
	other := testClient{t: t, handler: handler}
	other.login("natthaphong")
	status, _ = other.request("GET", path, nil)
	if status != 403 {
		t.Fatal("document leaked", status)
	}
	i = annualInput()
	i["keepDocument"] = true
	status, data = c.request("POST", "/commands", map[string]any{"type": "edit", "id": requestID, "version": 1, "input": i})
	if status != 200 {
		t.Fatal(data)
	}
	status, data = c.request("GET", path, nil)
	if status != 200 || data["data"] != "data:application/pdf;base64,"+encoded {
		t.Fatal("metadata edit removed document", status, data)
	}
	status, data = c.request("POST", "/uploads", map[string]any{"fileName": "large.pdf", "fileType": "application/pdf", "fileSize": service.MaxAttachmentBytes + 1, "encodedLength": 4 * ((service.MaxAttachmentBytes + 3) / 3)})
	if status != 400 {
		t.Fatal("25 MiB limit bypassed", status, data)
	}
	_ = store
	return requestID
}
func TestPartsDocumentsAndPermissions(t *testing.T) {
	store, handler := newFixture(t)
	testDocumentTransport(t, store, handler)
}
func TestPostgresTransport(t *testing.T) {
	dsn := os.Getenv("GO_TEST_POSTGRES_URL")
	if dsn == "" {
		t.Skip("run npm run test:go:postgres for the isolated PostgreSQL wire fixture")
	}
	store, err := repository.OpenPostgres(context.Background(), dsn, "", true)
	if err != nil {
		t.Fatal(err)
	}
	defer store.Close()
	handler := New(store, Options{DemoLogin: true, Now: func() time.Time { return testNow }})
	c := testClient{t: t, handler: handler}
	status, data := c.request("GET", "/health", nil)
	if status != 200 || data["mode"] != "cloud-postgres" {
		t.Fatal(status, data)
	}
	c.login("pimchanok")
	status, data = c.request("GET", "/employee-profile?employeeId=6", nil)
	if status != 403 || data["employee"] != nil {
		t.Fatal(status, data)
	}
	status, data = c.request("GET", "/employee-profile?employeeId=1", nil)
	if status != 200 || data["employee"].(map[string]any)["id"] != float64(1) {
		t.Fatal(status, data)
	}
	status, data = c.request("GET", "/snapshot", nil)
	if status != 200 {
		t.Fatal(status, data)
	}
	for _, row := range data["requests"].([]any) {
		if row.(map[string]any)["employeeId"] != float64(1) {
			t.Fatal("profile lookup widened request scope")
		}
	}
	requestID := testDocumentTransport(t, store, handler)
	m := testClient{t: t, handler: handler}
	m.login("thanawat")
	status, data = m.request("GET", "/employee-profile?employeeId=6", nil)
	if status != 200 || data["employee"].(map[string]any)["id"] != float64(6) {
		t.Fatal(status, data)
	}
	status, data = m.request("GET", "/snapshot", nil)
	if status != 200 {
		t.Fatal(status, data)
	}
	status, data = m.request("POST", "/commands", map[string]any{"type": "approve", "id": requestID, "version": 2, "comment": ""})
	if status != 200 {
		t.Fatal(status, data)
	}
	hr := testClient{t: t, handler: handler}
	hr.login("siriporn")
	status, data = hr.request("POST", "/demo/reset", map[string]any{})
	if status != 200 {
		t.Fatal(status, data)
	}
	status, _ = hr.request("GET", "/session", nil)
	if status != 200 {
		t.Fatal("reset invalidated unchanged session")
	}
	testLeaveReportFlow(t, handler)
	testPersonalRoleFlow(t, handler)
}
