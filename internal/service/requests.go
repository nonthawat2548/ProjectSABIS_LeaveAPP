package service

import (
	"fmt"
	"leave-management/internal/model"
	"strings"
	"time"
)

func MaternityGenderIssue(e *model.Employee) error {
	if e.Gender == "Female" {
		return nil
	}
	if e.Gender == "Male" {
		return Invalid("พนักงานชายไม่มีสิทธิ์ยื่นลาคลอดตามนโยบายของโปรเจกต์")
	}
	return Invalid("กรุณาติดต่อ HR เพื่อตรวจสอบข้อมูลเพศก่อนดำเนินการลาคลอด")
}
func requireMaternityCase(db *model.Database, owner *model.Employee, id *int) error {
	if err := MaternityGenderIssue(owner); err != nil {
		return err
	}
	if id == nil {
		for _, c := range db.MaternityCases {
			if c.EmployeeID == owner.ID {
				return Invalid("กรุณาเลือกกรณีลาคลอดที่ HR เปิดให้คุณ")
			}
		}
		return Invalid("ยังไม่มีกรณีลาคลอด กรุณาติดต่อ HR เพื่อเปิดกรณีก่อนยื่นคำขอ")
	}
	for _, c := range db.MaternityCases {
		if c.ID == *id {
			if c.EmployeeID != owner.ID {
				return Invalid("กรณีลาคลอดนี้ไม่ใช่ของเจ้าของคำขอ กรุณาเลือกกรณีของตนเอง")
			}
			if c.MaximumDays < 1 || c.MaximumDays > 999 {
				return Invalid("ข้อมูลสิทธิ์ของกรณีลาคลอดไม่ถูกต้อง กรุณาติดต่อ HR")
			}
			return nil
		}
	}
	return Invalid("ไม่พบกรณีลาคลอดที่เลือก กรุณาติดต่อ HR เพื่อตรวจสอบ")
}
func inputDays(db *model.Database, owner *model.Employee, input *model.RequestInput, t *model.LeaveType) ([]model.LeaveDay, error) {
	start, e1 := ParseDate(input.StartDate)
	end, e2 := ParseDate(input.EndDate)
	if e1 != nil || e2 != nil || end.Before(start) || difference(input.StartDate, input.EndDate) > 365 {
		return nil, Invalid("วันที่ไม่ถูกต้อง หรือช่วงวันลาเกิน 366 วัน")
	}
	if input.Duration != "Full" && input.Duration != "AM" && input.Duration != "PM" {
		return nil, Invalid("ช่วงเวลาไม่ถูกต้อง")
	}
	if t.QuotaScope == "Pregnancy" && input.Duration != "Full" {
		return nil, Invalid("ลาคลอดใช้การลาเต็มวัน")
	}
	if input.Duration != "Full" && input.StartDate != input.EndDate {
		return nil, Invalid("ลาครึ่งวันต้องเริ่มและสิ้นสุดวันเดียวกัน")
	}
	if t.QuotaScope != "Pregnancy" && t.EligibleGender != nil && *t.EligibleGender != owner.Gender {
		return nil, Invalid("คุณไม่มีสิทธิ์ใช้ประเภทการลานี้ตามนโยบายตัวอย่าง")
	}
	holidays := map[string]bool{}
	for _, h := range db.Holidays {
		holidays[h.Date] = true
	}
	days := make([]model.LeaveDay, 0)
	for d := start; !d.After(end); d = d.AddDate(0, 0, 1) {
		date := d.Format(dateLayout)
		if t.QuotaScope != "Pregnancy" && t.DayCountBasis == "Working Days" && (d.Weekday() == time.Saturday || d.Weekday() == time.Sunday || holidays[date]) {
			continue
		}
		row := model.LeaveDay{Date: date, Units: 1}
		if input.Duration != "Full" {
			row.Units = 0.5
		}
		if t.QuotaScope == "Annual" {
			for _, e := range db.Entitlements {
				if e.EmployeeID == owner.ID && e.LeaveTypeID == t.ID && e.Year == d.Year() {
					row.EntitlementID = pointer(e.ID)
					break
				}
			}
		}
		days = append(days, row)
	}
	if len(days) == 0 {
		return nil, Invalid("ช่วงวันที่เลือกไม่มีวันที่นับเป็นวันลา")
	}
	return days, nil
}

// Validate in the same order as the form: stored gender, case, manager, dates,
// policy/documents, overlap, then quota. The HTTP body cannot override Employee.gender.
func CheckRequest(db *model.Database, actorID int, input *model.RequestInput, exclude int, now time.Time, quotaCode string) ([]model.LeaveDay, error) {
	actor, err := Actor(db, actorID)
	if err != nil {
		return nil, err
	}
	if actor.Role != "Employee" {
		return nil, Problem("ขั้นตอนยื่นลานี้เปิดให้บทบาทพนักงาน", "FORBIDDEN")
	}
	if exclude != 0 {
		r, err := request(db, exclude)
		if err != nil {
			return nil, err
		}
		if r.EmployeeID != actor.ID {
			return nil, Problem("คุณแก้ไขคำขอผู้อื่นไม่ได้", "FORBIDDEN")
		}
		if r.Status != "Pending" {
			return nil, Problem("คำขอนี้ไม่ได้อยู่ในสถานะรอพิจารณา", "CONFLICT")
		}
	}
	if input == nil {
		return nil, Invalid("ข้อมูลคำขอไม่ถูกต้อง")
	}
	t, err := leaveType(db, input.LeaveTypeID)
	if err != nil {
		return nil, err
	}
	if t.QuotaScope == "Pregnancy" {
		if err := requireMaternityCase(db, actor, input.MaternityCaseID); err != nil {
			return nil, err
		}
	}
	if valueOf(actor.ManagerID) == 0 {
		return nil, Invalid("บัญชีนี้ยังไม่มีผู้จัดการ กรุณาให้ HR กำหนดผู้จัดการก่อน")
	}
	if t.QuotaScope == "Pregnancy" {
		m := employee(db, *actor.ManagerID)
		if m == nil || !m.Active || m.Role != "Manager" {
			return nil, Invalid("ผู้จัดการผู้พิจารณาไม่พร้อมใช้งาน กรุณาติดต่อ HR")
		}
	}
	if t.QuotaScope != "Pregnancy" {
		if err := requireReason(input.Reason); err != nil {
			return nil, err
		}
	}
	days, err := inputDays(db, actor, input, t)
	if err != nil {
		return nil, err
	}
	total := 0.0
	for _, d := range days {
		total += d.Units
	}
	if t.QuotaScope == "Pregnancy" {
		if err := requireReason(input.Reason); err != nil {
			return nil, err
		}
	}
	if t.AdvanceNoticeDays > 0 && difference(Today(now), input.StartDate) < t.AdvanceNoticeDays {
		return nil, Invalid(fmt.Sprintf("ต้องยื่นลาล่วงหน้าอย่างน้อย %d วัน", t.AdvanceNoticeDays))
	}
	if t.AdvanceNoticeDays == 0 && difference(input.EndDate, Today(now)) > 30 {
		return nil, Invalid("ตัวอย่างนี้อนุญาตให้ยื่นลาป่วยย้อนหลังได้ไม่เกิน 30 วัน")
	}
	if input.Attachment != nil {
		if err := ValidateAttachment(input.Attachment); err != nil {
			return nil, err
		}
	}
	hasDocument := false
	if exclude != 0 && (input.KeepDocument == nil || *input.KeepDocument) {
		for _, d := range db.Documents {
			if d.LeaveID == exclude {
				hasDocument = true
			}
		}
	}
	if t.DocumentRequiredFromDays != nil && total >= float64(*t.DocumentRequiredFromDays) && input.Attachment == nil && !hasDocument {
		name := "เอกสารประกอบ"
		if valueOf(t.RequiredDocumentType) == "Medical Certificate" {
			name = "ใบรับรองแพทย์"
		}
		return nil, Invalid(fmt.Sprintf("ลาประเภทนี้ตั้งแต่ %d วัน ต้องแนบ%s", *t.DocumentRequiredFromDays, name))
	}
	for _, r := range db.Requests {
		if r.EmployeeID != actor.ID || r.ID == exclude || (r.Status != "Pending" && r.Status != "Approved") {
			continue
		}
		if input.Duration != "Full" && r.Duration != "Full" && input.Duration != r.Duration {
			continue
		}
		for _, saved := range db.Days {
			if saved.LeaveID == r.ID {
				for _, d := range days {
					if d.Date == saved.Date {
						return nil, Invalid("วันที่ลาซ้อนกับคำขอ " + RequestCode(&r))
					}
				}
			}
		}
	}
	if t.QuotaScope == "Annual" {
		years := map[int]float64{}
		order := []int{}
		for _, d := range days {
			date, _ := ParseDate(d.Date)
			y := date.Year()
			if _, ok := years[y]; !ok {
				order = append(order, y)
			}
			years[y] += d.Units
		}
		for _, y := range order {
			b := Balance(db, actor.ID, t.ID, y, nil, exclude)
			available := b.Remaining - b.Pending
			if years[y] > available {
				return nil, Problem(fmt.Sprintf("สิทธิ์ปี %d ไม่พอ (ใช้ได้ %g วันหลังหักที่รอพิจารณา)", y+543, max(0, available)), quotaCode)
			}
		}
	} else {
		b := Balance(db, actor.ID, t.ID, 0, input.MaternityCaseID, exclude)
		if total > b.Remaining-b.Pending {
			return nil, Problem("โควตาของกรณีลาคลอดนี้ไม่เพียงพอ", quotaCode)
		}
	}
	return days, nil
}
func requireReason(s string) error {
	s = strings.TrimSpace(s)
	if s == "" || TextLength(s) > 500 {
		return Invalid("กรุณาระบุเหตุผล 1–500 ตัวอักษร")
	}
	return nil
}
func request(db *model.Database, id int) (*model.LeaveRequest, error) {
	for i := range db.Requests {
		if db.Requests[i].ID == id {
			return &db.Requests[i], nil
		}
	}
	return nil, Problem("ไม่พบคำขอ", "NOT_FOUND")
}
func pending(db *model.Database, id, version int) (*model.LeaveRequest, error) {
	r, err := request(db, id)
	if err != nil {
		return nil, err
	}
	if r.Status != "Pending" {
		return nil, Problem("คำขอนี้ไม่ได้อยู่ในสถานะรอพิจารณา", "CONFLICT")
	}
	if r.Version != version {
		return nil, Problem("ข้อมูลถูกเปลี่ยนแล้ว กรุณารีเฟรชก่อนทำรายการ", "CONFLICT")
	}
	return r, nil
}
