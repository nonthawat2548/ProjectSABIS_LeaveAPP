package httpapi

import (
	"encoding/json"
	"leave-management/internal/model"
	"leave-management/internal/service"
	"net/http"
	"strings"
	"testing"
)

func TestHRReferralDecisions(t *testing.T) {
	_, handler := newFixture(t)
	testHRReferralDecisions(t, handler, true)
}

// Also run against the isolated PostgreSQL fixture to check transactional quota and audit writes.
func testHRReferralDecisions(t *testing.T, handler http.Handler, concurrent bool) {
	for _, action := range []string{"approve", "reject"} {
		t.Run("referred HR "+action, func(t *testing.T) { testHRReferralOutcome(t, handler, concurrent, action) })
	}
}

func testHRReferralOutcome(t *testing.T, handler http.Handler, concurrent bool, outcome string) {
	employee := testClient{t: t, handler: handler}
	manager := testClient{t: t, handler: handler}
	hr := testClient{t: t, handler: handler}
	employee.login("pimchanok")
	manager.login("thanawat")
	hr.login("siriporn")
	snapshot := func(client *testClient) model.Database {
		t.Helper()
		status, data := client.request("GET", "/snapshot", nil)
		if status != 200 {
			t.Fatal(status, data)
		}
		encoded, _ := json.Marshal(data)
		var db model.Database
		if err := json.Unmarshal(encoded, &db); err != nil {
			t.Fatal(err)
		}
		return db
	}
	before := snapshot(&hr)
	usedBefore := service.Balance(&before, 1, 1, 2027, nil, 0).Used
	input := annualInput()
	input["startDate"], input["endDate"], input["duration"] = "2027-03-08", "2027-03-08", "AM"
	if outcome == "reject" {
		input["startDate"], input["endDate"] = "2027-03-09", "2027-03-09"
	}
	status, data := employee.request("POST", "/commands", command(input))
	if status != 200 {
		t.Fatal(status, data)
	}
	id := int(data["id"].(float64))
	action := map[string]any{"type": outcome, "id": id, "version": 1, "comment": "ตรวจสอบคำขอแล้ว"}
	if status, data = hr.request("POST", "/commands", action); status != 403 {
		t.Fatal("unassigned HR approved", status, data)
	}
	status, data = manager.request("POST", "/commands", map[string]any{"type": "refer", "id": id, "version": 1, "hrId": 5, "comment": "ตรวจสิทธิ์"})
	if status != 200 {
		t.Fatal(status, data)
	}
	if status, data = hr.request("POST", "/commands", action); status != 409 {
		t.Fatal("stale HR approval accepted", status, data)
	}
	action["version"] = 2
	if status, data = manager.request("POST", "/commands", action); status != 403 {
		t.Fatal("manager bypassed pending HR consultation", status, data)
	}
	status, data = hr.request("POST", "/commands", map[string]any{"type": "reject", "id": id, "version": 2, "comment": ""})
	if status != 400 {
		t.Fatal("rejection needs a reason", status, data)
	}
	status, data = hr.request("POST", "/commands", map[string]any{"type": "consult", "id": id, "version": 2, "comment": "ส่งกลับ"})
	if status != 403 {
		t.Fatal("HR returned the decision to manager", status, data)
	}
	counts := map[int]int{}
	if concurrent {
		// Two real HTTP commands race with the same version; only one may deduct quota.
		results := make(chan int, 2)
		for range 2 {
			go func(client testClient) {
				code, _ := client.request("POST", "/commands", action)
				results <- code
			}(hr)
		}
		for range 2 {
			counts[<-results]++
		}
	} else {
		// PGlite's wire server supports one connection; verify replay and persistence serially.
		for range 2 {
			code, _ := hr.request("POST", "/commands", action)
			counts[code]++
		}
	}
	if counts[200] != 1 || counts[409] != 1 {
		t.Fatal("decision race", counts)
	}
	after := snapshot(&hr)
	delta, finalStatus := 0.5, "Approved"
	if outcome == "reject" {
		delta, finalStatus = 0, "Rejected"
	}
	if used := service.Balance(&after, 1, 1, 2027, nil, 0).Used; used != usedBefore+delta {
		t.Fatal("quota was not deducted exactly once", usedBefore, used)
	}
	decisions := 0
	for _, step := range after.Approvals {
		if step.LeaveID != id {
			continue
		}
		if !step.Cancelled && step.Status == "Pending" {
			t.Fatal("stale pending assignment", step)
		}
		if step.ReviewType == "Decision" && step.ApproverID == 4 && !step.Cancelled {
			t.Fatal("manager recorded as final approver", step)
		}
		if step.ReviewType == "Decision" && !step.Cancelled && step.Status == finalStatus {
			decisions++
			if step.ApproverID != 5 || step.ReviewRole != "HR" || step.ReviewedAt == nil {
				t.Fatal("incorrect decision author", step)
			}
		}
	}
	if decisions != 1 {
		t.Fatal("expected one HR decision", decisions)
	}
	for _, r := range after.Requests {
		if r.ID == id && (r.Status != finalStatus || r.Version != 3 || r.Timeline[len(r.Timeline)-1].ActorID != 5) {
			t.Fatal("incorrect final request", r)
		}
	}
	for _, client := range []*testClient{&employee, &manager} {
		db := snapshot(client)
		found := false
		for _, n := range db.Notifications {
			if n.LeaveID != nil && *n.LeaveID == id && strings.Contains(n.Text, "อนุมัติ") {
				found = true
			}
		}
		if !found {
			t.Fatal("missing approval notification")
		}
	}
}
