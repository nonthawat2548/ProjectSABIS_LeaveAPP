package service

import "leave-management/internal/model"

type EmployeeProfile struct {
	Employee *model.Employee `json:"employee"`
	Manager  *ProfileManager `json:"manager"`
}

type ProfileManager struct {
	ID   int    `json:"id"`
	Name string `json:"name"`
}

// Employees read themselves; managers and HR read across departments.
func Profile(db *model.Database, actorID, employeeID int) (*EmployeeProfile, error) {
	actor, err := Actor(db, actorID)
	if err != nil {
		return nil, err
	}
	if employeeID < 1 || employeeID > 9007199254740991 {
		return nil, Invalid("รหัสพนักงานไม่ถูกต้อง")
	}
	if actor.Role != "Manager" && actor.Role != "HR" && !(actor.Role == "Employee" && actor.ID == employeeID) {
		return nil, Problem("ไม่มีสิทธิ์ดูประวัติพนักงานคนอื่น", "FORBIDDEN")
	}
	person := employee(db, employeeID)
	if person == nil || (!person.Active && actor.Role != "HR") {
		return nil, Problem("ไม่พบข้อมูลพนักงาน", "NOT_FOUND")
	}
	result := &EmployeeProfile{Employee: person}
	if manager := employee(db, valueOf(person.ManagerID)); manager != nil {
		result.Manager = &ProfileManager{ID: manager.ID, Name: manager.Name}
	}
	return result, nil
}
