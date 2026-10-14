package service

import (
	"fmt"
	"leave-management/internal/model"
	"strings"
	"time"
)

// Apply changes an in-memory transaction copy. The repository commits everything,
// including approvals, documents and notifications, only after this returns success.
func Apply(db *model.Database, actorID int, c model.Command, now time.Time) (model.Result, error) {
	actor, err := Actor(db, actorID)
	if err != nil {
		return model.Result{}, err
	}
	at := timestamp(now)
	switch c.Type {
	case "sendLeaveReport":
		return sendLeaveReport(db, actor, c, at)
	case "submit", "edit":
		return submit(db, actor, c, now)
	case "withdraw":
		r, err := pending(db, c.ID, c.Version)
		if err != nil {
			return model.Result{}, err
		}
		if r.EmployeeID != actor.ID {
			return model.Result{}, Problem("คุณยกเลิกคำขอผู้อื่นไม่ได้", "FORBIDDEN")
		}
		r.Status = "Withdrawn"
		r.Version++
		r.Timeline = append(r.Timeline, model.TimelineEvent{Action: "ยกเลิกคำขอ", ActorID: actorID, At: at})
		cancelApprovals(db, r.ID)
		if reviewer := requestReviewer(db, actor); reviewer != nil {
			notify(db, reviewer.ID, pointer(r.ID), actor.Name+"ยกเลิก "+RequestCode(r), at)
		}
		return model.Result{ID: r.ID, Message: "ยกเลิกคำขอแล้ว ไม่มีการหักโควตา"}, nil
	case "approve", "reject", "refer":
		return decision(db, actor, c, now)
	case "consult":
		return consult(db, actor, c, at)
	case "work":
		if _, err := ParseDate(c.Date); err != nil || c.StatusType != "In-office" && c.StatusType != "WFH" && c.StatusType != "Outside" {
			return model.Result{}, Invalid("สถานะหรือวันที่ไม่ถูกต้อง")
		}
		if approvedUnits(db, actor.ID, c.Date) > 0 {
			return model.Result{}, Invalid("วันที่เลือกมีการลาที่อนุมัติแล้ว ระบบแสดงสถานะให้อัตโนมัติ")
		}
		for i := range db.WorkStatuses {
			w := &db.WorkStatuses[i]
			if w.EmployeeID == actorID && w.Date == c.Date {
				w.StatusType = c.StatusType
				w.UpdatedAt = at
				return model.Result{Message: "บันทึกสถานะการทำงานแล้ว"}, nil
			}
		}
		db.WorkStatuses = append(db.WorkStatuses, model.WorkStatus{ID: nextID(db.WorkStatuses), EmployeeID: actorID, Date: c.Date, StatusType: c.StatusType, UpdatedAt: at})
		return model.Result{Message: "บันทึกสถานะการทำงานแล้ว"}, nil
	case "readNotifications":
		for i := range db.Notifications {
			if db.Notifications[i].EmployeeID == actorID {
				db.Notifications[i].Read = true
			}
		}
		return model.Result{Message: "อ่านการแจ้งเตือนทั้งหมดแล้ว"}, nil
	default:
		return admin(db, actor, c, at)
	}
}

func submit(db *model.Database, actor *model.Employee, c model.Command, now time.Time) (model.Result, error) {
	if actor.Role != "Employee" && actor.Role != "Manager" && actor.Role != "HR" {
		return model.Result{}, Problem("ขั้นตอนยื่นลานี้เปิดให้บทบาทพนักงาน", "FORBIDDEN")
	}
	var r *model.LeaveRequest
	if c.Type == "edit" {
		var err error
		r, err = pending(db, c.ID, c.Version)
		if err != nil {
			return model.Result{}, err
		}
		if r.EmployeeID != actor.ID {
			return model.Result{}, Problem("คุณแก้ไขคำขอผู้อื่นไม่ได้", "FORBIDDEN")
		}
	}
	exclude := 0
	if r != nil {
		exclude = r.ID
	}
	days, err := CheckRequest(db, actor.ID, c.Input, exclude, now, "VALIDATION")
	if err != nil {
		return model.Result{}, err
	}
	at := timestamp(now)
	editing := r != nil
	if !editing {
		id := max(1001, nextID(db.Requests))
		db.Requests = append(db.Requests, model.LeaveRequest{ID: id, EmployeeID: actor.ID, RequestDate: at, Status: "Pending", Timeline: []model.TimelineEvent{}})
		r = &db.Requests[len(db.Requests)-1]
	}
	i := c.Input
	t, _ := leaveType(db, i.LeaveTypeID)
	r.LeaveTypeID = i.LeaveTypeID
	r.MaternityCaseID = nil
	if t.QuotaScope == "Pregnancy" {
		r.MaternityCaseID = i.MaternityCaseID
	}
	r.StartDate = i.StartDate
	r.EndDate = i.EndDate
	r.Duration = i.Duration
	r.Reason = strings.TrimSpace(i.Reason)
	r.Version++
	if editing {
		cancelApprovals(db, r.ID)
	}
	db.Days = filter(db.Days, func(d model.LeaveDay) bool { return d.LeaveID != r.ID })
	for _, d := range days {
		d.ID = nextID(db.Days)
		d.LeaveID = r.ID
		db.Days = append(db.Days, d)
	}
	if i.Attachment != nil || i.KeepDocument != nil && !*i.KeepDocument {
		db.Documents = filter(db.Documents, func(d model.LeaveDocument) bool { return d.LeaveID != r.ID })
	}
	if a := i.Attachment; a != nil {
		name := valueOf(t.RequiredDocumentType)
		if name == "" {
			name = "Supporting Document"
		}
		db.Documents = append(db.Documents, model.LeaveDocument{ID: nextID(db.Documents), LeaveID: r.ID, DocumentType: name, FileName: a.FileName, FileType: a.FileType, FileSize: a.FileSize, DataURL: a.DataURL, StorageKey: fmt.Sprintf("mock/%d/%s", r.ID, a.FileName), UploadedAt: at})
	}
	reviewer := requestReviewer(db, actor)
	db.Approvals = append(db.Approvals, model.LeaveApproval{ID: nextID(db.Approvals), LeaveID: r.ID, ApproverID: reviewer.ID, StepNo: approvalStep(db, r.ID), ReviewRole: reviewer.Role, ReviewType: "Decision", Status: "Pending", AssignedAt: at})
	action := "ยื่นคำขอ"
	verb := "ส่ง"
	text := "ส่งคำขอแล้ว รอผู้พิจารณา"
	message := "ส่งคำขอเรียบร้อยแล้ว"
	if editing {
		action = "แก้ไขคำขอ / เริ่มพิจารณาใหม่"
		verb = "แก้ไข"
		text = "แก้ไขคำขอแล้ว และเริ่มพิจารณาใหม่"
		message = "บันทึกการแก้ไขแล้ว"
	}
	r.Timeline = append(r.Timeline, model.TimelineEvent{Action: action, ActorID: actor.ID, At: at})
	notify(db, reviewer.ID, pointer(r.ID), actor.Name+verb+"คำขอ "+RequestCode(r), at)
	notify(db, actor.ID, pointer(r.ID), text, at)
	return model.Result{ID: r.ID, Message: message}, nil
}
func notify(db *model.Database, owner int, leaveID *int, text, at string) {
	db.Notifications = append(db.Notifications, model.Notification{ID: nextID(db.Notifications), EmployeeID: owner, LeaveID: leaveID, Text: text, CreatedAt: at})
}
func cancelApprovals(db *model.Database, id int) {
	for i := range db.Approvals {
		if db.Approvals[i].LeaveID == id {
			db.Approvals[i].Cancelled = true
		}
	}
}
func approvalStep(db *model.Database, id int) int {
	n := 1
	for _, a := range db.Approvals {
		if a.LeaveID == id {
			n++
		}
	}
	return n
}
func comment(s string) (string, error) {
	s = strings.TrimSpace(s)
	if s == "" || TextLength(s) > 500 {
		return "", Invalid("กรุณาระบุข้อความ 1–500 ตัวอักษร")
	}
	return s, nil
}

func decision(db *model.Database, actor *model.Employee, c model.Command, now time.Time) (model.Result, error) {
	r, err := pending(db, c.ID, c.Version)
	if err != nil {
		return model.Result{}, err
	}
	owner := employee(db, r.EmployeeID)
	if !isDecisionReviewer(db, actor, *r) {
		return model.Result{}, Problem("คุณไม่มีสิทธิ์พิจารณาคำขอนี้", "FORBIDDEN")
	}
	t, err := leaveType(db, r.LeaveTypeID)
	if err != nil {
		return model.Result{}, err
	}
	if c.Type == "approve" && t.QuotaScope == "Pregnancy" {
		owner, err = Actor(db, r.EmployeeID)
		if err != nil {
			return model.Result{}, err
		}
		if err := requireMaternityCase(db, owner, r.MaternityCaseID); err != nil {
			return model.Result{}, err
		}
	}
	waiting := false
	for _, a := range db.Approvals {
		if a.LeaveID == r.ID && a.ReviewType == "Consultation" && !a.Cancelled && a.Status == "Pending" {
			waiting = true
		}
	}
	at := timestamp(now)
	if c.Type == "refer" {
		if actor.Role != "Manager" || c.HRID == r.EmployeeID {
			return model.Result{}, Problem("ส่งปรึกษาได้เฉพาะ HR ที่ไม่ได้เป็นผู้ยื่นคำขอ", "FORBIDDEN")
		}
		text, err := comment(c.Comment)
		if err != nil {
			return model.Result{}, err
		}
		if waiting {
			return model.Result{}, Invalid("คำขอนี้อยู่ระหว่างรอความเห็น HR")
		}
		hr := employee(db, c.HRID)
		if hr == nil || !hr.Active || hr.Role != "HR" {
			return model.Result{}, Invalid("ไม่พบเจ้าหน้าที่ HR")
		}
		db.Approvals = append(db.Approvals, model.LeaveApproval{ID: nextID(db.Approvals), LeaveID: r.ID, ApproverID: c.HRID, StepNo: approvalStep(db, r.ID), ReviewRole: "HR", ReviewType: "Consultation", Status: "Pending", Comment: text, AssignedAt: at})
		r.Version++
		r.Timeline = append(r.Timeline, model.TimelineEvent{Action: "ส่งปรึกษา HR", ActorID: actor.ID, At: at, Comment: text})
		notify(db, c.HRID, pointer(r.ID), "ผู้จัดการขอความเห็นสำหรับ "+RequestCode(r), at)
		return model.Result{ID: r.ID, Message: "ส่งให้ HR ร่วมพิจารณาแล้ว"}, nil
	}
	if waiting {
		return model.Result{}, Invalid("กรุณารอความเห็น HR ก่อนบันทึกผลพิจารณา")
	}
	text := strings.TrimSpace(c.Comment)
	if c.Type == "reject" {
		text, err = comment(c.Comment)
		if err != nil {
			return model.Result{}, err
		}
	}
	if TextLength(text) > 500 {
		return model.Result{}, Invalid("ความเห็นยาวเกิน 500 ตัวอักษร")
	}
	if c.Type == "approve" {
		if err := checkApproval(db, r, t); err != nil {
			return model.Result{}, err
		}
	}
	status, action, message, result := "Rejected", "ไม่อนุมัติ", "บันทึกผลไม่อนุมัติแล้ว", "ไม่ได้รับอนุมัติ"
	if c.Type == "approve" {
		status = "Approved"
		action = "อนุมัติคำขอ"
		message = "อนุมัติและอัปเดตโควตาแล้ว"
		result = "ได้รับอนุมัติ"
	}
	r.Status = status
	r.Version++
	r.Timeline = append(r.Timeline, model.TimelineEvent{Action: action, ActorID: actor.ID, At: at, Comment: text})
	for i := range db.Approvals {
		a := &db.Approvals[i]
		if a.LeaveID == r.ID && a.ReviewType == "Decision" && !a.Cancelled && a.Status == "Pending" {
			a.Status = status
			a.Comment = text
			a.ReviewedAt = pointer(at)
			break
		}
	}
	if text != "" {
		result += " · " + text
	}
	notify(db, r.EmployeeID, pointer(r.ID), RequestCode(r)+" "+result, at)
	return model.Result{ID: r.ID, Message: message}, nil
}

func checkApproval(db *model.Database, r *model.LeaveRequest, t *model.LeaveType) error {
	days := filter(db.Days, func(d model.LeaveDay) bool { return d.LeaveID == r.ID })
	if t.QuotaScope == "Pregnancy" {
		submitted := r.RequestDate
		for _, e := range r.Timeline {
			if e.Action == "ยื่นคำขอ" || e.Action == "แก้ไขคำขอ / เริ่มพิจารณาใหม่" {
				submitted = e.At
			}
		}
		at, err := time.Parse(time.RFC3339, submitted)
		if err != nil {
			return Problem("ข้อมูลวันลาคลอดไม่สอดคล้องกัน กรุณาติดต่อ HR", "CONFLICT")
		}
		checked, err := CheckRequest(db, r.EmployeeID, &model.RequestInput{LeaveTypeID: r.LeaveTypeID, MaternityCaseID: r.MaternityCaseID, StartDate: r.StartDate, EndDate: r.EndDate, Duration: r.Duration, Reason: r.Reason, KeepDocument: pointer(true)}, r.ID, at, "CONFLICT")
		if err != nil {
			return err
		}
		consistent := len(days) == len(checked)
		saved := map[string]bool{}
		for _, d := range days {
			if d.Units != 1 || d.EntitlementID != nil {
				consistent = false
			}
			saved[d.Date] = true
		}
		for _, d := range checked {
			if !saved[d.Date] {
				consistent = false
			}
		}
		if !consistent {
			return Problem("ข้อมูลวันลาคลอดไม่สอดคล้องกัน กรุณาติดต่อ HR", "CONFLICT")
		}
	}
	if len(days) == 0 {
		return Invalid("คำขอไม่มีวันลา")
	}
	hasDoc := false
	for _, d := range db.Documents {
		if d.LeaveID == r.ID {
			hasDoc = true
		}
	}
	if t.DocumentRequiredFromDays != nil && TotalDays(db, r.ID) >= float64(*t.DocumentRequiredFromDays) && !hasDoc {
		return Invalid("ไม่พบเอกสารประกอบตามนโยบาย")
	}
	if t.QuotaScope == "Annual" {
		years := map[int]float64{}
		for _, d := range days {
			date, _ := ParseDate(d.Date)
			years[date.Year()] += d.Units
		}
		for y, needed := range years {
			if needed > Balance(db, r.EmployeeID, t.ID, y, nil, 0).Remaining {
				return Problem("โควตาปัจจุบันไม่เพียงพอ จึงอนุมัติไม่ได้", "CONFLICT")
			}
		}
	} else if TotalDays(db, r.ID) > Balance(db, r.EmployeeID, t.ID, 0, r.MaternityCaseID, 0).Remaining {
		return Problem("โควตาลาคลอดปัจจุบันไม่เพียงพอ", "CONFLICT")
	}
	return nil
}
func consult(db *model.Database, actor *model.Employee, c model.Command, at string) (model.Result, error) {
	r, err := pending(db, c.ID, c.Version)
	if err != nil {
		return model.Result{}, err
	}
	if actor.Role != "HR" || r.EmployeeID == actor.ID {
		return model.Result{}, Problem("เฉพาะ HR ที่ได้รับมอบหมายและไม่ได้เป็นผู้ยื่นเท่านั้น", "FORBIDDEN")
	}
	for i := range db.Approvals {
		a := &db.Approvals[i]
		if a.LeaveID == r.ID && a.ApproverID == actor.ID && a.ReviewType == "Consultation" && a.Status == "Pending" && !a.Cancelled {
			text, err := comment(c.Comment)
			if err != nil {
				return model.Result{}, err
			}
			a.Status = "Completed"
			a.Comment = text
			a.ReviewedAt = pointer(at)
			r.Version++
			r.Timeline = append(r.Timeline, model.TimelineEvent{Action: "HR ส่งความเห็น", ActorID: actor.ID, At: at, Comment: text})
			if owner := employee(db, r.EmployeeID); owner != nil && owner.ManagerID != nil {
				notify(db, *owner.ManagerID, pointer(r.ID), "HR ส่งความเห็นสำหรับ "+RequestCode(r)+" แล้ว", at)
			}
			return model.Result{ID: r.ID, Message: "ส่งความเห็นให้ผู้จัดการแล้ว คำขอยังรอผลพิจารณา"}, nil
		}
	}
	return model.Result{}, Problem("ไม่มีรายการที่มอบหมายให้คุณ", "FORBIDDEN")
}
