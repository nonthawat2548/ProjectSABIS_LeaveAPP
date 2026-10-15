package httpapi

import (
	"crypto/rand"
	"fmt"
	"github.com/gin-gonic/gin"
	"leave-management/internal/model"
	"leave-management/internal/repository"
	"leave-management/internal/service"
	"regexp"
	"sort"
	"strconv"
	"strings"
	"time"
)

var uuidPattern = regexp.MustCompile(`^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$`)
var partPattern = regexp.MustCompile(`^[A-Za-z0-9+/]+={0,2}$`)

func strconvID(id int) string { return strconv.Itoa(id) }
func newUUID() string {
	b := make([]byte, 16)
	if _, err := rand.Read(b); err != nil {
		panic(err)
	}
	b[6] = (b[6] & 15) | 64
	b[8] = (b[8] & 63) | 128
	return fmt.Sprintf("%x-%x-%x-%x-%x", b[:4], b[4:6], b[6:8], b[8:10], b[10:])
}
func ownedUpload(tx repository.Tx, id string, owner int) (*repository.Upload, error) {
	if !uuidPattern.MatchString(id) {
		return nil, service.Problem("ไม่พบไฟล์ที่กำลังอัปโหลด", "NOT_FOUND")
	}
	u, err := tx.Upload(id, owner)
	if err != nil {
		return nil, err
	}
	if u == nil {
		return nil, service.Problem("ไม่พบไฟล์ที่กำลังอัปโหลด หรือหมดเวลาแล้ว", "NOT_FOUND")
	}
	return u, nil
}

func resolveAttachment(tx repository.Tx, id string, owner int) (*model.Attachment, error) {
	// Invalid references reach the domain validator so gender/case errors take priority.
	invalid := &model.Attachment{FileName: "เอกสาร", FileType: "application/octet-stream"}
	if !uuidPattern.MatchString(id) {
		return invalid, nil
	}
	u, err := tx.Upload(id, owner)
	if err != nil {
		return nil, err
	}
	if u == nil {
		return invalid, nil
	}
	parts, err := tx.Parts(id)
	if err != nil {
		return nil, err
	}
	sort.Slice(parts, func(i, j int) bool { return parts[i].Number < parts[j].Number })
	if len(parts) != (u.EncodedLength+service.PartCharacters-1)/service.PartCharacters {
		return invalid, nil
	}
	var b strings.Builder
	b.Grow(u.EncodedLength)
	for i, p := range parts {
		if p.Number != i {
			return invalid, nil
		}
		b.WriteString(p.Data)
	}
	if b.Len() != u.EncodedLength {
		return invalid, nil
	}
	return &model.Attachment{FileName: u.FileName, FileType: u.FileType, FileSize: u.FileSize, DataURL: "data:" + u.FileType + ";base64," + b.String()}, nil
}
func (a *API) createUpload(c *gin.Context) {
	var u repository.Upload
	if err := a.body(c, 64*1024, &u); err != nil {
		a.fail(c, err)
		return
	}
	if strings.TrimSpace(u.FileName) == "" || service.TextLength(u.FileName) > 255 || !service.FileTypeAllowed(u.FileType) || u.FileSize < 1 || u.FileSize > service.MaxAttachmentBytes || u.EncodedLength != 4*((u.FileSize+2)/3) {
		a.fail(c, service.Invalid("เอกสารต้องเป็น PDF, JPG หรือ PNG ขนาดไม่เกิน 25 MB"))
		return
	}
	u.ID = newUUID()
	u.ExpiresAt = time.Now().Add(time.Hour)
	a.run(c, true, func(tx repository.Tx, id int) (any, error) {
		db, err := tx.Load()
		if err != nil {
			return nil, err
		}
		actor, err := service.Actor(db, id)
		if err != nil {
			return nil, err
		}
		if actor.Role == "HR" {
			return nil, service.Problem(service.HRPersonalLeaveUnavailable, "FORBIDDEN")
		}
		if actor.Role != "Employee" && actor.Role != "Manager" {
			return nil, service.Problem("เฉพาะพนักงานที่ยื่นคำขอเท่านั้น", "FORBIDDEN")
		}
		u.EmployeeID = id
		if err = tx.CreateUpload(u); err != nil {
			return nil, err
		}
		return gin.H{"uploadId": u.ID, "partCharacters": service.PartCharacters}, nil
	})
}
func (a *API) deleteUpload(c *gin.Context) {
	a.run(c, true, func(tx repository.Tx, id int) (any, error) {
		if _, err := ownedUpload(tx, c.Param("id"), id); err != nil {
			return nil, err
		}
		if err := tx.DeleteUpload(c.Param("id"), id); err != nil {
			return nil, err
		}
		return model.Result{Message: "ยกเลิกการอัปโหลดแล้ว"}, nil
	})
}
func (a *API) putPart(c *gin.Context) {
	var input struct {
		Data string `json:"data"`
	}
	if err := a.body(c, service.MaxBodyBytes, &input); err != nil {
		a.fail(c, err)
		return
	}
	part, err := strconv.Atoi(c.Param("part"))
	if err != nil || part < 0 || part > 67 {
		a.fail(c, service.Invalid("ส่วนของไฟล์ไม่ถูกต้อง"))
		return
	}
	a.run(c, true, func(tx repository.Tx, id int) (any, error) {
		u, err := ownedUpload(tx, c.Param("id"), id)
		if err != nil {
			return nil, err
		}
		remaining := u.EncodedLength - part*service.PartCharacters
		expected := min(service.PartCharacters, remaining)
		last := remaining <= service.PartCharacters
		if remaining <= 0 || len(input.Data) != expected || !partPattern.MatchString(input.Data) || !last && strings.Contains(input.Data, "=") {
			return nil, service.Invalid("ส่วนของไฟล์ไม่ถูกต้อง")
		}
		if err = tx.PutPart(u.ID, repository.UploadPart{Number: part, Data: input.Data}); err != nil {
			return nil, err
		}
		return gin.H{"part": part}, nil
	})
}
func (a *API) document(c *gin.Context) {
	id, err := strconv.Atoi(c.Param("id"))
	if err != nil || id < 1 {
		a.fail(c, service.Problem("ไม่พบเอกสาร", "NOT_FOUND"))
		return
	}
	a.run(c, false, func(tx repository.Tx, actorID int) (any, error) {
		db, err := tx.Load()
		if err != nil {
			return nil, err
		}
		actor, err := service.Actor(db, actorID)
		if err != nil {
			return nil, err
		}
		var doc *model.LeaveDocument
		for i := range db.Documents {
			if db.Documents[i].ID == id {
				doc = &db.Documents[i]
				break
			}
		}
		if doc == nil {
			return nil, service.Problem("ไม่พบเอกสาร", "NOT_FOUND")
		}
		allowed := false
		for _, r := range db.Requests {
			if r.ID == doc.LeaveID {
				allowed = service.CanView(db, actor, r)
			}
		}
		if !allowed {
			return nil, service.Problem("คุณไม่มีสิทธิ์อ่านเอกสารนี้", "FORBIDDEN")
		}
		if c.Param("part") == "" {
			n, err := tx.DocumentLength(id)
			if err != nil {
				return nil, err
			}
			doc.Remote = true
			return struct {
				*model.LeaveDocument
				TotalCharacters int `json:"totalCharacters"`
				PartCharacters  int `json:"partCharacters"`
			}{doc, n, service.PartCharacters}, nil
		}
		part, err := strconv.Atoi(c.Param("part"))
		if err != nil || part < 0 || part > 67 {
			return nil, service.Invalid("ส่วนของเอกสารไม่ถูกต้อง")
		}
		data, err := tx.DocumentPart(id, part, service.PartCharacters)
		if err != nil {
			return nil, err
		}
		if data == "" {
			return nil, service.Problem("ไม่พบส่วนของเอกสาร", "NOT_FOUND")
		}
		return gin.H{"part": part, "data": data}, nil
	})
}
