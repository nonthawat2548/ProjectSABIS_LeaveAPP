package service

import (
	"fmt"
	"leave-management/internal/model"
	"math"
	"sort"
	"strconv"
	"strings"
)

type reportGroup struct {
	name              string
	count             int
	approved, pending float64
}
type reportMonth struct{ approved, pending float64 }

var reportMonths = []string{"มกราคม", "กุมภาพันธ์", "มีนาคม", "เมษายน", "พฤษภาคม", "มิถุนายน", "กรกฎาคม", "สิงหาคม", "กันยายน", "ตุลาคม", "พฤศจิกายน", "ธันวาคม"}

func reportNumber(value float64) string { return strconv.FormatFloat(value, 'f', -1, 64) }
func reportEmployee(id int) string      { return fmt.Sprintf("EMP-%05d", id) }
func canReadReportNotification(actor *model.Employee, notification model.Notification) bool {
	if !strings.HasPrefix(notification.Text, "รายงานสรุปการลา\nผู้ส่ง: ") {
		return true
	}
	if actor.Role == "HR" {
		return true
	}
	lines := strings.SplitN(notification.Text, "\n", 3)
	return actor.Role == "Manager" && strings.HasSuffix(lines[1], "("+reportEmployee(actor.ID)+")")
}
func reportDate(value string) string {
	date, err := ParseDate(value)
	if err != nil {
		return "—"
	}
	return fmt.Sprintf("%d/%d/%d", date.Day(), date.Month(), date.Year()+543)
}

// Reports are immutable readable snapshots in existing App_Notification.Message.
// Compute inside the command transaction; never accept totals/rows from the client.
func sendLeaveReport(db *model.Database, actor *model.Employee, c model.Command, at string) (model.Result, error) {
	if actor.Role != "Manager" {
		return model.Result{}, Problem("เฉพาะผู้จัดการสามารถส่งรายงานให้ HR ได้", "FORBIDDEN")
	}
	hr := employee(db, c.HRID)
	if hr == nil || hr.Role != "HR" || !hr.Active {
		return model.Result{}, Invalid("กรุณาเลือก HR ที่ใช้งานได้")
	}
	if c.Year < 1900 || c.Year > 2200 {
		return model.Result{}, Invalid("ปีที่เลือกไม่ถูกต้อง")
	}
	if c.Month < 0 || c.Month > 12 {
		return model.Result{}, Invalid("เดือนที่เลือกไม่ถูกต้อง")
	}
	if c.LeaveTypeID < 0 {
		return model.Result{}, Invalid("ประเภทการลาที่เลือกไม่ถูกต้อง")
	}
	if c.EmployeeID < 0 {
		return model.Result{}, Invalid("พนักงานที่เลือกไม่ถูกต้อง")
	}
	person := employee(db, c.EmployeeID)
	if c.EmployeeID != 0 && (person == nil || !(person.ID == actor.ID || person.Role == "Employee" && valueOf(person.ManagerID) == actor.ID)) {
		return model.Result{}, Problem("คุณไม่มีสิทธิ์ดูสรุปการลาของพนักงานคนนี้", "FORBIDDEN")
	}
	typeName := "ทุกประเภท"
	if c.LeaveTypeID != 0 {
		t, err := leaveType(db, c.LeaveTypeID)
		if err != nil {
			return model.Result{}, Invalid("ไม่พบประเภทการลา")
		}
		typeName = t.Name
	}
	selected := map[int]model.LeaveRequest{}
	for _, r := range db.Requests {
		if CanView(db, actor, r) && (c.EmployeeID == 0 || r.EmployeeID == c.EmployeeID) && (c.LeaveTypeID == 0 || r.LeaveTypeID == c.LeaveTypeID) {
			selected[r.ID] = r
		}
	}
	units := map[int]float64{}
	months := make([]reportMonth, 12)
	for _, day := range db.Days {
		r, ok := selected[day.LeaveID]
		date, err := ParseDate(day.Date)
		if !ok || err != nil || date.Year() != c.Year || c.Month != 0 && int(date.Month()) != c.Month || day.Units <= 0 || math.IsNaN(day.Units) || math.IsInf(day.Units, 0) {
			continue
		}
		units[r.ID] += day.Units
		if r.Status == "Approved" {
			months[int(date.Month())-1].approved += day.Units
		}
		if r.Status == "Pending" {
			months[int(date.Month())-1].pending += day.Units
		}
	}
	counts := map[string]int{}
	groups := map[int]*reportGroup{}
	ids := []int{}
	approved, pending := 0.0, 0.0
	for id, days := range units {
		r := selected[id]
		counts[r.Status]++
		ids = append(ids, id)
		if groups[r.LeaveTypeID] == nil {
			name := fmt.Sprintf("ประเภทการลา %d", r.LeaveTypeID)
			if t, err := leaveType(db, r.LeaveTypeID); err == nil {
				name = t.Name
			}
			groups[r.LeaveTypeID] = &reportGroup{name: name}
		}
		group := groups[r.LeaveTypeID]
		group.count++
		if r.Status == "Approved" {
			approved += days
			group.approved += days
		}
		if r.Status == "Pending" {
			pending += days
			group.pending += days
		}
	}
	period := fmt.Sprintf("ปี %d", c.Year+543)
	if c.Month != 0 {
		period = fmt.Sprintf("%s %d", reportMonths[c.Month-1], c.Year+543)
	}
	personName := "ทุกคนที่ผู้จัดการมีสิทธิ์ดู"
	if person != nil {
		personName = fmt.Sprintf("%s (%s)", person.Name, reportEmployee(person.ID))
	}
	lines := []string{
		"รายงานสรุปการลา",
		fmt.Sprintf("ผู้ส่ง: %s (%s)", actor.Name, reportEmployee(actor.ID)),
		fmt.Sprintf("ผู้รับ: %s (%s)", hr.Name, reportEmployee(hr.ID)),
		"พนักงาน: " + personName,
		"ช่วงวันที่ลา: " + period,
		"ประเภทการลา: " + typeName,
		fmt.Sprintf("คำขอทั้งหมด: %d คำขอ", len(ids)),
		fmt.Sprintf("อนุมัติแล้ว: %d คำขอ / %s วัน", counts["Approved"], reportNumber(approved)),
		fmt.Sprintf("รอพิจารณา: %d คำขอ / %s วัน", counts["Pending"], reportNumber(pending)),
		fmt.Sprintf("ไม่อนุมัติ: %d คำขอ", counts["Rejected"]),
		fmt.Sprintf("ยกเลิก: %d คำขอ", counts["Withdrawn"]),
		"", "รายเดือน",
	}
	for i, row := range months {
		if c.Month == 0 || i+1 == c.Month {
			lines = append(lines, fmt.Sprintf("%d/%d | อนุมัติ %s วัน | รอพิจารณา %s วัน", i+1, c.Year+543, reportNumber(row.approved), reportNumber(row.pending)))
		}
	}
	lines = append(lines, "", "แยกตามประเภทการลา")
	typeIDs := []int{}
	for id := range groups {
		typeIDs = append(typeIDs, id)
	}
	sort.Ints(typeIDs)
	for _, id := range typeIDs {
		row := groups[id]
		lines = append(lines, fmt.Sprintf("%s | %d คำขอ | อนุมัติ %s วัน | รอพิจารณา %s วัน", row.name, row.count, reportNumber(row.approved), reportNumber(row.pending)))
	}
	lines = append(lines, "", "รายละเอียดคำขอ")
	sort.Sort(sort.Reverse(sort.IntSlice(ids)))
	statuses := map[string]string{"Pending": "รอพิจารณา", "Approved": "อนุมัติแล้ว", "Rejected": "ไม่อนุมัติ", "Withdrawn": "ยกเลิก"}
	for _, id := range ids {
		r := selected[id]
		ownerName, leaveName := "ไม่พบชื่อ", "ไม่พบประเภท"
		if owner := employee(db, r.EmployeeID); owner != nil {
			ownerName = owner.Name
		}
		if t, err := leaveType(db, r.LeaveTypeID); err == nil {
			leaveName = t.Name
		}
		lines = append(lines, fmt.Sprintf("%s | %s (%s) | %s | %s–%s | %s วันในช่วงที่เลือก | %s", RequestCode(&r), ownerName, reportEmployee(r.EmployeeID), leaveName, reportDate(r.StartDate), reportDate(r.EndDate), reportNumber(units[id]), statuses[r.Status]))
	}
	lines = append(lines, "", "นับจากวันลาที่บันทึกไว้ ครึ่งวัน = 0.5 วัน คำขอข้ามปีนับเฉพาะช่วงที่เลือก", "วันลาที่อนุมัติรวมวันที่ในอนาคต ยอดในรายงานเป็นข้อมูล ณ เวลาส่ง")
	text := strings.Join(lines, "\n")
	if TextLength(text) > 150000 {
		return model.Result{}, Invalid("รายงานมีรายการมากเกินไป กรุณาเลือกเดือนหรือพนักงานเพื่อแบ่งรายงาน")
	}
	id := nextID(db.Notifications)
	notify(db, hr.ID, nil, text, at)
	notify(db, actor.ID, nil, text, at)
	return model.Result{ID: id, Message: "ส่งรายงานให้ HR แล้ว และเก็บสำเนาในรายการแจ้งเตือนของคุณ"}, nil
}
