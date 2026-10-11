package service

import (
	"leave-management/internal/model"
	"strings"
)

const DemoPassword = "1234"
const LoginError = "ชื่อผู้ใช้ อีเมล หรือรหัสผ่านไม่ถูกต้อง"

var demoUsernames = map[string]string{
	"employee@demo.local": "pimchanok", "nat@demo.local": "natthaphong",
	"orn@demo.local": "orathai", "manager@demo.local": "thanawat",
	"hr@demo.local": "siriporn", "other@demo.local": "kan",
	"sales-manager@demo.local": "pakorn", "chutima@demo.local": "chutima",
	"malinee@demo.local": "malinee", "weeraphat@demo.local": "weeraphat",
}

func Username(email string) string {
	email = strings.ToLower(strings.TrimSpace(email))
	if value, ok := demoUsernames[email]; ok {
		return value
	}
	return strings.Split(email, "@")[0]
}
func LoginAccount(db *model.Database, identifier string) (*model.Employee, error) {
	identifier = strings.ToLower(strings.TrimSpace(identifier))
	var found *model.Employee
	for i := range db.Employees {
		e := &db.Employees[i]
		value := Username(e.Email)
		if strings.Contains(identifier, "@") {
			value = strings.ToLower(e.Email)
		}
		if identifier != "" && value == identifier {
			if found != nil {
				return nil, Problem(LoginError, "UNAUTHENTICATED")
			}
			found = e
		}
	}
	if found == nil || !found.Active {
		return nil, Problem(LoginError, "UNAUTHENTICATED")
	}
	return found, nil
}
