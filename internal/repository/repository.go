// Package repository owns persistence and transaction boundaries, not leave rules.
package repository

import (
	"context"
	"encoding/json"
	"leave-management/internal/model"
	"leave-management/src/data"
	"time"
)

type Session struct {
	EmployeeID int
	ExpiresAt  time.Time
}
type Upload struct {
	ID            string
	EmployeeID    int
	FileName      string `json:"fileName"`
	FileType      string `json:"fileType"`
	FileSize      int    `json:"fileSize"`
	EncodedLength int    `json:"encodedLength"`
	ExpiresAt     time.Time
}
type UploadPart struct {
	Number int
	Data   string
}

// A callback sees one consistent database state. Returning an error rolls back
// both business data and session/upload changes; all writes share the same lock.
type Store interface {
	Mode() string
	Transaction(context.Context, bool, func(Tx) error) error
}
type Tx interface {
	Ready() error
	Load() (*model.Database, error)
	Save(before, after *model.Database) error
	Session(hash string) (*Session, error)
	PutSession(hash string, session Session) error
	DeleteSession(hash string) error
	CreateUpload(upload Upload) error
	Upload(id string, owner int) (*Upload, error)
	Parts(id string) ([]UploadPart, error)
	PutPart(id string, part UploadPart) error
	DeleteUpload(id string, owner int) error
	DocumentLength(id int) (int, error)
	DocumentPart(id, part, length int) (string, error)
	ResetTransient(employeeIDs []int) error
}

func DemoDatabase() *model.Database {
	var db model.Database
	if err := json.Unmarshal(data.DemoJSON, &db); err != nil {
		panic(err)
	}
	return &db
}
