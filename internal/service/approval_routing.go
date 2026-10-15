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

func latestHRReferral(db *model.Database, r model.LeaveRequest) *model.LeaveApproval {
	var latest *model.LeaveApproval
	for i := range db.Approvals {
		step := &db.Approvals[i]
		if step.LeaveID == r.ID && step.ReviewType == "Consultation" && !step.Cancelled &&
			(latest == nil || step.StepNo > latest.StepNo || step.StepNo == latest.StepNo && step.ID > latest.ID) {
			latest = step
		}
	}
	return latest
}

func pendingHRReferral(db *model.Database, actor *model.Employee, r model.LeaveRequest) *model.LeaveApproval {
	if r.Status != "Pending" || actor.ID == r.EmployeeID || !actor.Active || actor.Role != "HR" {
		return nil
	}
	owner := employee(db, r.EmployeeID)
	if owner == nil || !owner.Active || owner.Role != "Employee" {
		return nil
	}
	step := latestHRReferral(db, r)
	if step != nil && step.ApproverID == actor.ID && step.ReviewRole == "HR" && (step.Status == "Pending" || step.Status == "Completed") {
		return step
	}
	return nil
}
