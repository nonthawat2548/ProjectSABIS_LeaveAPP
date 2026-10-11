package service

import (
	"fmt"
	"leave-management/internal/model"
	"math"
	"strings"
)

func admin(db *model.Database, actor *model.Employee, c model.Command, at string) (model.Result, error) {
	if actor.Role != "HR" {
		return model.Result{}, Problem("เฉพาะฝ่ายบุคคลเท่านั้น", "FORBIDDEN")
	}
	switch c.Type {
	case "entitlement":
		t, err := leaveType(db, c.LeaveTypeID)
		amount := valueOf(c.GrantedDays)
		if employee(db, c.EmployeeID) == nil || err != nil || t.QuotaScope != "Annual" || c.Year < 1900 || c.Year > 2200 || c.GrantedDays == nil || amount < 0 || amount > 999 || math.Mod(amount*2, 1) != 0 {
			return model.Result{}, Invalid("ข้อมูลสิทธิ์ไม่ถูกต้อง")
		}
		b := Balance(db, c.EmployeeID, c.LeaveTypeID, c.Year, nil, 0)
		if amount < b.Used+b.Pending {
			return model.Result{}, Invalid("สิทธิ์ต้องไม่น้อยกว่าวันที่ใช้แล้วรวมกับคำขอที่รอพิจารณา")
		}
		found := false
		for i := range db.Entitlements {
			e := &db.Entitlements[i]
			if e.EmployeeID == c.EmployeeID && e.LeaveTypeID == c.LeaveTypeID && e.Year == c.Year {
				e.GrantedDays = amount
				found = true
				break
			}
		}
		if !found {
			db.Entitlements = append(db.Entitlements, model.Entitlement{ID: nextID(db.Entitlements), EmployeeID: c.EmployeeID, LeaveTypeID: c.LeaveTypeID, Year: c.Year, GrantedDays: amount})
		}
		notify(db, c.EmployeeID, nil, fmt.Sprintf("HR อัปเดตสิทธิ์ลาปี %d", c.Year+543), at)
		return model.Result{Message: "บันทึกสิทธิ์วันลาแล้ว"}, nil
	case "maternity":
		e := employee(db, c.EmployeeID)
		if e == nil || !e.Active {
			return model.Result{}, Invalid("ไม่พบพนักงานที่เลือก")
		}
		if err := MaternityGenderIssue(e); err != nil {
			return model.Result{}, err
		}
		if c.MaximumDays < 1 || c.MaximumDays > 999 {
			return model.Result{}, Invalid("ข้อมูลกรณีลาคลอดไม่ถูกต้อง")
		}
		n := 1
		for _, m := range db.MaternityCases {
			if m.EmployeeID == c.EmployeeID {
				n++
			}
		}
		id := nextID(db.MaternityCases)
		db.MaternityCases = append(db.MaternityCases, model.MaternityCase{ID: id, EmployeeID: c.EmployeeID, CaseNo: n, MaximumDays: c.MaximumDays})
		return model.Result{ID: id, Message: "เปิดกรณีลาคลอดแล้ว"}, nil
	case "holiday":
		if _, err := ParseDate(c.Date); err != nil || !c.Remove && (strings.TrimSpace(c.Name) == "" || TextLength(c.Name) > 100) {
			return model.Result{}, Invalid("ข้อมูลวันหยุดไม่ถูกต้อง")
		}
		db.Holidays = filter(db.Holidays, func(h model.Holiday) bool { return h.Date != c.Date })
		if !c.Remove {
			db.Holidays = append(db.Holidays, model.Holiday{Date: c.Date, Name: strings.TrimSpace(c.Name)})
		}
		return model.Result{Message: "บันทึกปฏิทินวันหยุดแล้ว"}, nil
	case "policy":
		p := c.Policy
		if p == nil {
			return model.Result{}, Invalid("ไม่พบประเภทการลา")
		}
		t, err := leaveType(db, p.ID)
		if err != nil {
			return model.Result{}, err
		}
		if p.QuotaScope != t.QuotaScope || p.DayCountBasis != t.DayCountBasis || valueOf(p.EligibleGender) != valueOf(t.EligibleGender) {
			return model.Result{}, Invalid("รูปแบบสิทธิ์และวิธีนับวันแก้ไขได้ใน seed หรือหลังบ้าน")
		}
		if c.PolicyFields != nil {
			for _, key := range []string{"quotaScope", "dayCountBasis", "eligibleGender"} {
				if !c.PolicyFields[key] {
					return model.Result{}, Invalid("รูปแบบสิทธิ์และวิธีนับวันแก้ไขได้ใน seed หรือหลังบ้าน")
				}
			}
			for _, key := range []string{"defaultQuotaDays", "advanceNoticeDays", "documentRequiredFromDays"} {
				if !c.PolicyFields[key] {
					return model.Result{}, Invalid("เงื่อนไขการลาไม่ถูกต้อง")
				}
			}
		}
		if strings.TrimSpace(p.Name) == "" || TextLength(p.Name) > 100 || p.AdvanceNoticeDays < 0 || p.AdvanceNoticeDays > 999 || p.DefaultQuotaDays < 0 || p.DefaultQuotaDays > 999 || math.Mod(p.DefaultQuotaDays, 1) != 0 || p.DocumentRequiredFromDays != nil && (*p.DocumentRequiredFromDays < 1 || *p.DocumentRequiredFromDays > 999) {
			return model.Result{}, Invalid("เงื่อนไขการลาไม่ถูกต้อง")
		}
		t.Name = strings.TrimSpace(p.Name)
		t.AdvanceNoticeDays = p.AdvanceNoticeDays
		t.DefaultQuotaDays = p.DefaultQuotaDays
		t.DocumentRequiredFromDays = p.DocumentRequiredFromDays
		t.RequiredDocumentType = nil
		if p.DocumentRequiredFromDays != nil {
			t.RequiredDocumentType = pointer("Medical Certificate")
		}
		return model.Result{Message: "บันทึกนโยบายตัวอย่างแล้ว สิทธิ์ที่จัดสรรไว้ไม่ถูกเปลี่ยนอัตโนมัติ"}, nil
	default:
		return model.Result{}, Invalid("ไม่รองรับคำสั่งนี้")
	}
}
