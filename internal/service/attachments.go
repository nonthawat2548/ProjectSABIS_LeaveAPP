package service

import (
	"encoding/base64"
	"leave-management/internal/model"
	"regexp"
	"strings"
)

const MaxAttachmentBytes = 25 * 1024 * 1024
const PartCharacters = 2 * 1024 * 1024
const MaxBodyBytes = 3 * 1024 * 1024

var base64Pattern = regexp.MustCompile(`^[A-Za-z0-9+/]*={0,2}$`)

func FileTypeAllowed(s string) bool {
	return s == "application/pdf" || s == "image/png" || s == "image/jpeg"
}
func ValidateAttachment(a *model.Attachment) error {
	const message = "เอกสารต้องเป็น PDF, JPG หรือ PNG ขนาดไม่เกิน 25 MB"
	if a == nil || !FileTypeAllowed(a.FileType) || strings.TrimSpace(a.FileName) == "" || TextLength(a.FileName) > 255 || a.FileSize < 1 || a.FileSize > MaxAttachmentBytes {
		return Invalid(message)
	}
	prefix := "data:" + a.FileType + ";base64,"
	if !strings.HasPrefix(a.DataURL, prefix) {
		return Invalid(message)
	}
	encoded := strings.Map(func(r rune) rune {
		if strings.ContainsRune(" \t\r\n\f", r) {
			return -1
		}
		return r
	}, strings.TrimPrefix(a.DataURL, prefix))
	if len(encoded) > 4*((MaxAttachmentBytes+2)/3) {
		return Invalid(message)
	}
	padding := len(encoded) - len(strings.TrimRight(encoded, "="))
	if !base64Pattern.MatchString(encoded) || padding > 0 && len(encoded)%4 != 0 || padding == 0 && len(encoded)%4 == 1 {
		return Invalid("ข้อมูลเอกสารไม่ถูกต้อง")
	}
	size := len(encoded)*3/4 - padding
	if size > MaxAttachmentBytes {
		return Invalid(message)
	}
	if size != a.FileSize {
		return Invalid("ขนาดเอกสารไม่ตรงกับข้อมูล")
	}
	header := strings.TrimRight(encoded[:min(12, len(encoded))], "=")
	b, err := base64.RawStdEncoding.DecodeString(header)
	if err != nil {
		return Invalid("ข้อมูลเอกสารไม่ถูกต้อง")
	}
	valid := a.FileType == "application/pdf" && strings.HasPrefix(string(b), "%PDF-") || a.FileType == "image/png" && strings.HasPrefix(string(b), "\x89PNG\r\n\x1a\n") || a.FileType == "image/jpeg" && strings.HasPrefix(string(b), "\xff\xd8\xff")
	if !valid {
		return Invalid("เนื้อหาเอกสารไม่ตรงกับชนิดไฟล์")
	}
	return nil
}
