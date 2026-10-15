package service

import "leave-management/internal/model"

const HRPersonalLeaveUnavailable = "ยังไม่เปิดการยื่นลาสำหรับ HR เนื่องจากยังไม่มีผู้อนุมัติระดับสูงกว่า"

func requestReviewer(db *model.Database, owner *model.Employee) *model.Employee {
	if owner == nil || owner.Role == "HR" {
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
