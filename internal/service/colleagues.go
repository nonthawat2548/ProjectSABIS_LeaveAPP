package service

import (
	"golang.org/x/text/collate"
	"golang.org/x/text/language"
	"golang.org/x/text/unicode/norm"
	"leave-management/internal/model"
	"regexp"
	"sort"
	"strconv"
	"strings"
)

var codePattern = regexp.MustCompile(`^(?:emp-?)?(\d+)$`)

func keyword(s string) string {
	return strings.ToLower(strings.Join(strings.Fields(norm.NFKC.String(s)), " "))
}
func approvedUnits(db *model.Database, owner int, date string) float64 {
	n := 0.0
	for _, r := range db.Requests {
		if r.EmployeeID == owner && r.Status == "Approved" {
			for _, d := range db.Days {
				if d.LeaveID == r.ID && d.Date == date {
					n += d.Units
				}
			}
		}
	}
	return n
}
func Colleagues(db *model.Database, actorID int, query, date string) ([]model.ColleagueStatus, error) {
	a, err := Actor(db, actorID)
	if err != nil {
		return nil, err
	}
	if a.Role != "Employee" && a.Role != "Manager" && a.Role != "HR" {
		return nil, Problem("ไม่มีสิทธิ์ค้นหาสถานะเพื่อนร่วมงาน", "FORBIDDEN")
	}
	if TextLength(query) > 100 {
		return nil, Invalid("ชื่อหรือรหัสพนักงานต้องไม่เกิน 100 ตัวอักษร")
	}
	if _, err := ParseDate(date); err != nil {
		return nil, Invalid("วันที่สำหรับตรวจสอบสถานะไม่ถูกต้อง")
	}
	q := keyword(query)
	match := codePattern.FindStringSubmatch(q)
	id := 0
	if match != nil {
		id, _ = strconv.Atoi(match[1])
	}
	people := filter(db.Employees, func(e model.Employee) bool {
		return e.Active && (q == "" || match != nil && e.ID == id || match == nil && strings.Contains(keyword(e.Name), q))
	})
	c := collate.New(language.Thai)
	sort.SliceStable(people, func(i, j int) bool { return c.CompareString(people[i].Name, people[j].Name) < 0 })
	result := make([]model.ColleagueStatus, 0, len(people))
	for _, e := range people {
		r := model.ColleagueStatus{EmployeeID: e.ID, Name: e.Name, Position: e.Position, Department: e.Department, Date: date}
		units := approvedUnits(db, e.ID, date)
		if units >= 1 {
			r.LeaveDuration = pointer("Full")
		} else {
			if units > 0 {
				for _, request := range db.Requests {
					if request.EmployeeID == e.ID && request.Status == "Approved" {
						for _, d := range db.Days {
							if d.LeaveID == request.ID && d.Date == date && r.LeaveDuration == nil {
								r.LeaveDuration = pointer(request.Duration)
							}
						}
					}
				}
			}
			for _, w := range db.WorkStatuses {
				if w.EmployeeID == e.ID && w.Date == date {
					r.WorkStatus = pointer(w.StatusType)
					r.UpdatedAt = pointer(w.UpdatedAt)
					break
				}
			}
		}
		result = append(result, r)
	}
	return result, nil
}
