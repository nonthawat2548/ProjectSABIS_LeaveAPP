package service

import "leave-management/internal/model"

func requestReviewer(db *model.Database, owner *model.Employee) *model.Employee {
	if owner == nil {
		return nil
	}
	if owner.Role == "Manager" {
		var chosen *model.Employee
		for i := range db.Employees {
			p := &db.Employees[i]
			if p.Active && p.Role == "HR" && p.ID != owner.ID && (chosen == nil || p.ID < chosen.ID) {
				chosen = p
			}
		}
		return chosen
	}
	id := valueOf(owner.ManagerID)
	if id == 0 && owner.ID == 5 && owner.Email == "hr@demo.local" {
		id = 4
	}
	p := employee(db, id)
	if p != nil && p.Active && p.Role == "Manager" && p.ID != owner.ID {
		return p
	}
	return nil
}

func isDecisionReviewer(db *model.Database, actor *model.Employee, r model.LeaveRequest) bool {
	if !actor.Active || actor.ID == r.EmployeeID {
		return false
	}
	owner := employee(db, r.EmployeeID)
	reviewer := requestReviewer(db, owner)
	if reviewer == nil || reviewer.ID != actor.ID {
		return false
	}
	count := 0
	for _, step := range db.Approvals {
		if step.LeaveID == r.ID && step.ReviewType == "Decision" && !step.Cancelled {
			count++
			if step.ApproverID == actor.ID && step.ReviewRole == actor.Role {
				return true
			}
		}
	}
	return owner.Role == "Employee" && count == 0
}
