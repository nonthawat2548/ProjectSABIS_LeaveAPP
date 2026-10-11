package httpapi

import (
	"leave-management/internal/model"
	"testing"
)

func TestEmployeeProfilesAcrossDepartments(t *testing.T) {
	store, handler := newFixture(t)
	c := testClient{t: t, handler: handler}
	if status, _ := c.request("GET", "/employee-profile?employeeId=6", nil); status != 401 {
		t.Fatal(status)
	}
	for _, username := range []string{"pimchanok", "thanawat", "siriporn"} {
		c.login(username)
		for id := 1; id <= 10; id++ {
			status, result := c.request("GET", "/employee-profile?employeeId="+strconvID(id), nil)
			if username == "pimchanok" && id != 1 {
				if status != 403 || result["employee"] != nil {
					t.Fatal("private profile exposed", id, status, result)
				}
				continue
			}
			if status != 200 {
				t.Fatal(username, id, status, result)
			}
			if len(result) != 2 || result["employee"].(map[string]any)["id"] != float64(id) {
				t.Fatal(result)
			}
			if manager, ok := result["manager"].(map[string]any); ok && len(manager) != 2 {
				t.Fatal("manager private data exposed", manager)
			}
		}
	}
	c.login("pimchanok")
	for _, query := range []string{"", "0", "-1", "no", "1e0", "9007199254740993"} {
		if status, _ := c.request("GET", "/employee-profile?employeeId="+query, nil); status != 400 {
			t.Fatal(query, status)
		}
	}
	if status, _ := c.request("GET", "/employee-profile?employeeId=999999", nil); status != 403 {
		t.Fatal(status)
	}
	_, snapshot := c.request("GET", "/snapshot", nil)
	for _, row := range snapshot["requests"].([]any) {
		if row.(map[string]any)["employeeId"] != float64(1) {
			t.Fatal("private requests exposed")
		}
	}
	change(t, store, func(db *model.Database) { db.Employees[5].Active = false })
	c.login("thanawat")
	if status, _ := c.request("GET", "/employee-profile?employeeId=6", nil); status != 404 {
		t.Fatal(status)
	}
	c.login("siriporn")
	if status, _ := c.request("GET", "/employee-profile?employeeId=6", nil); status != 200 {
		t.Fatal(status)
	}
	c.login("pimchanok")
	change(t, store, func(db *model.Database) { db.Employees[0].Active = false })
	if status, _ := c.request("GET", "/employee-profile?employeeId=6", nil); status != 401 {
		t.Fatal(status)
	}
}
