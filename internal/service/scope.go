package service

import (
	"fmt"
	"leave-management/internal/model"
)

func nextID[T interface{ GetID() int }](rows []T) int {
	n := 0
	for _, r := range rows {
		n = max(n, r.GetID())
	}
	return n + 1
}
func filter[T any](rows []T, keep func(T) bool) []T {
	result := make([]T, 0)
	for _, r := range rows {
		if keep(r) {
			result = append(result, r)
		}
	}
	return result
}
func pointer[T any](value T) *T { return &value }
func sameID(a, b *int) bool     { return a == nil && b == nil || a != nil && b != nil && *a == *b }
func valueOf[T comparable](value *T) T {
	if value != nil {
		return *value
	}
	var zero T
	return zero
}
func Actor(db *model.Database, id int) (*model.Employee, error) {
	for i := range db.Employees {
		e := &db.Employees[i]
		if e.ID == id && e.Active {
			return e, nil
		}
	}
	return nil, Problem("กรุณาเข้าสู่ระบบอีกครั้ง", "UNAUTHENTICATED")
}
func employee(db *model.Database, id int) *model.Employee {
	for i := range db.Employees {
		if db.Employees[i].ID == id {
			return &db.Employees[i]
		}
	}
	return nil
}
func leaveType(db *model.Database, id int) (*model.LeaveType, error) {
	for i := range db.LeaveTypes {
		if db.LeaveTypes[i].ID == id {
			return &db.LeaveTypes[i], nil
		}
	}
	return nil, Invalid("ไม่พบประเภทการลา")
}
func CanView(db *model.Database, actor *model.Employee, r model.LeaveRequest) bool {
	owner := employee(db, r.EmployeeID)
	return actor.ID == r.EmployeeID || actor.Role == "HR" || actor.Role == "Manager" && owner != nil && (owner.Role == "Employee" && valueOf(owner.ManagerID) == actor.ID || isDecisionReviewer(db, actor, r))
}
func RequestCode(r *model.LeaveRequest) string {
	return fmt.Sprintf("LR-%s-%05d", r.RequestDate[:4], r.ID)
}
func TotalDays(db *model.Database, id int) float64 {
	n := 0.0
	for _, d := range db.Days {
		if d.LeaveID == id {
			n += d.Units
		}
	}
	return n
}

// Snapshot keeps private records scoped exactly as in the original TypeScript service.
func Snapshot(db *model.Database, actorID int) (*model.Database, error) {
	actor, err := Actor(db, actorID)
	if err != nil {
		return nil, err
	}
	result := model.Clone(db)
	allowed := map[int]bool{}
	for _, r := range db.Requests {
		allowed[r.ID] = CanView(db, actor, r)
	}
	scoped := func(id int) bool {
		e := employee(db, id)
		return e != nil && (actor.Role == "HR" || id == actor.ID || actor.Role == "Manager" && e.Role != "HR" && valueOf(e.ManagerID) == actor.ID)
	}
	result.Employees = filter(result.Employees, func(e model.Employee) bool { return scoped(e.ID) || e.ID == valueOf(actor.ManagerID) || e.Role == "HR" })
	result.Entitlements = filter(result.Entitlements, func(e model.Entitlement) bool { return scoped(e.EmployeeID) })
	result.MaternityCases = filter(result.MaternityCases, func(e model.MaternityCase) bool { return scoped(e.EmployeeID) })
	result.Requests = filter(result.Requests, func(r model.LeaveRequest) bool { return allowed[r.ID] })
	result.Days = filter(result.Days, func(d model.LeaveDay) bool { return allowed[d.LeaveID] })
	result.Documents = filter(result.Documents, func(d model.LeaveDocument) bool { return allowed[d.LeaveID] })
	for i := range result.Documents {
		result.Documents[i].DataURL = ""
		result.Documents[i].Remote = true
	}
	result.Approvals = filter(result.Approvals, func(a model.LeaveApproval) bool { return allowed[a.LeaveID] })
	result.WorkStatuses = filter(result.WorkStatuses, func(w model.WorkStatus) bool { return scoped(w.EmployeeID) })
	result.Notifications = filter(result.Notifications, func(n model.Notification) bool { return n.EmployeeID == actorID && canReadReportNotification(actor, n) })
	return result, nil
}
func Balance(db *model.Database, owner, typeID, year int, caseID *int, exclude int) model.Balance {
	t, err := leaveType(db, typeID)
	if err != nil {
		return model.Balance{}
	}
	statuses := map[int]string{}
	for _, r := range db.Requests {
		if r.ID != exclude && r.EmployeeID == owner && r.LeaveTypeID == typeID && (t.QuotaScope == "Annual" || sameID(r.MaternityCaseID, caseID)) {
			statuses[r.ID] = r.Status
		}
	}
	b := model.Balance{}
	for _, d := range db.Days {
		date, _ := ParseDate(d.Date)
		if t.QuotaScope == "Annual" && date.Year() != year {
			continue
		}
		if statuses[d.LeaveID] == "Approved" {
			b.Used += d.Units
		}
		if statuses[d.LeaveID] == "Pending" {
			b.Pending += d.Units
		}
	}
	if t.QuotaScope == "Annual" {
		for _, e := range db.Entitlements {
			if e.EmployeeID == owner && e.LeaveTypeID == typeID && e.Year == year {
				b.Total = e.GrantedDays
				break
			}
		}
	} else {
		for _, c := range db.MaternityCases {
			if c.ID == valueOf(caseID) && c.EmployeeID == owner {
				b.Total = float64(c.MaximumDays)
				break
			}
		}
	}
	b.Remaining = b.Total - b.Used
	return b
}
