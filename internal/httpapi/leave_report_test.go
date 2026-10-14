package httpapi

import (
	"leave-management/internal/model"
	"net/http"
	"strings"
	"testing"
)

func testLeaveReportFlow(t *testing.T, handler http.Handler) {
	t.Helper()
	manager := testClient{t: t, handler: handler}
	manager.login("thanawat")
	body := map[string]any{"type": "sendLeaveReport", "employeeId": 1, "hrId": 5, "year": 2026, "month": 0, "leaveTypeId": 0, "approvedDays": 999999}
	status, result := manager.request("POST", "/commands", body)
	if status != 200 || result["id"] == nil {
		t.Fatal("report failed", status, result)
	}
	id := result["id"]
	hr := testClient{t: t, handler: handler}
	hr.login("siriporn")
	status, snapshot := hr.request("GET", "/snapshot", nil)
	if status != 200 {
		t.Fatal(status, snapshot)
	}
	var received string
	for _, value := range snapshot["notifications"].([]any) {
		row := value.(map[string]any)
		if row["id"] == id {
			received, _ = row["text"].(string)
			if row["read"] != false || row["leaveId"] != nil {
				t.Fatal("report notification metadata", row)
			}
		}
	}
	if !strings.HasPrefix(received, "รายงานสรุปการลา\nผู้ส่ง: ") || strings.Contains(received, "999999") || strings.Contains(received, "กานต์ พรชัย") {
		t.Fatal("missing or unsafe report", received)
	}
	_, snapshot = manager.request("GET", "/snapshot", nil)
	foundCopy := false
	for _, value := range snapshot["notifications"].([]any) {
		if value.(map[string]any)["text"] == received {
			foundCopy = true
		}
	}
	if !foundCopy {
		t.Fatal("sender copy not persisted")
	}
	for _, target := range []int{5, 6, 999} {
		body["employeeId"] = target
		status, result = manager.request("POST", "/commands", body)
		if status != 403 || result["code"] != "FORBIDDEN" {
			t.Fatal("unauthorized target", target, status, result)
		}
	}
	body["employeeId"] = 1
	for _, username := range []string{"pimchanok", "siriporn"} {
		client := testClient{t: t, handler: handler}
		client.login(username)
		status, result = client.request("POST", "/commands", body)
		if status != 403 {
			t.Fatal("unauthorized sender", username, status, result)
		}
	}
}

func TestLeaveReportDelivery(t *testing.T) {
	_, handler := newFixture(t)
	testLeaveReportFlow(t, handler)
}

func TestManagerCannotReadHRLeave(t *testing.T) {
	store, handler := newFixture(t)
	change(t, store, func(db *model.Database) {
		managerID := 4
		db.Employees[4].ManagerID = &managerID
		request := db.Requests[0]
		request.ID, request.EmployeeID, request.Status = 9000, 5, "Pending"
		request.Version = 1
		db.Requests = append(db.Requests, request)
		db.Days = append(db.Days, model.LeaveDay{ID: 9000, LeaveID: 9000, Date: "2026-12-04", Units: 1})
	})
	manager := testClient{t: t, handler: handler}
	manager.login("thanawat")
	status, snapshot := manager.request("GET", "/snapshot", nil)
	if status != 200 {
		t.Fatal(status, snapshot)
	}
	for _, key := range []string{"requests", "entitlements", "maternityCases", "workStatuses"} {
		for _, value := range snapshot[key].([]any) {
			if value.(map[string]any)["employeeId"] == float64(5) {
				t.Fatal("HR private data leaked", key)
			}
		}
	}
	for _, value := range snapshot["days"].([]any) {
		if value.(map[string]any)["leaveId"] == float64(9000) {
			t.Fatal("HR leave days leaked")
		}
	}
	for _, command := range []string{"approve", "reject", "refer"} {
		status, result := manager.request("POST", "/commands", map[string]any{"type": command, "id": 9000, "version": 1, "comment": "ทดสอบ", "hrId": 5})
		if status != 403 || result["code"] != "FORBIDDEN" {
			t.Fatal("HR request became actionable", command, status, result)
		}
	}
	if status, _ := manager.request("GET", "/employee-profile?employeeId=5", nil); status != 200 {
		t.Fatal("profile permission changed", status)
	}
}
