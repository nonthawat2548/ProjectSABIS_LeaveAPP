package httpapi

import (
	"fmt"
	"net/http"
	"testing"
)

func TestPersonalLeaveForEveryRole(t *testing.T) {
	_, handler := newFixture(t)
	testPersonalRoleFlow(t, handler)
}

func testPersonalRoleFlow(t *testing.T, handler http.Handler) {
	for _, account := range []struct{ owner, reviewer string }{{"pimchanok", "thanawat"}, {"thanawat", "siriporn"}, {"pakorn", "siriporn"}, {"siriporn", "thanawat"}} {
		t.Run(account.owner, func(t *testing.T) {
			owner := testClient{t: t, handler: handler}
			owner.login(account.owner)
			input := annualInput()
			input["startDate"], input["endDate"] = "2026-12-22", "2026-12-22"
			status, result := owner.request("POST", "/commands", command(input))
			if status != 200 {
				t.Fatal(status, result)
			}
			id := result["id"]
			action := map[string]any{"type": "approve", "id": id, "version": 1}
			status, result = owner.request("POST", "/commands", action)
			if status != 403 {
				t.Fatal("self approval allowed", status, result)
			}
			reviewer := testClient{t: t, handler: handler}
			reviewer.login(account.reviewer)
			status, result = reviewer.request("POST", "/commands", action)
			if status != 200 {
				t.Fatal("reviewer decision failed", status, result, fmt.Sprint(id))
			}
		})
	}
}
