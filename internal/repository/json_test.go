package repository

import (
	"context"
	"errors"
	"leave-management/internal/model"
	"path/filepath"
	"testing"
	"time"
)

func TestJSONCommitRollbackAndRestart(t *testing.T) {
	path := filepath.Join(t.TempDir(), "data.json")
	s, err := NewJSON(path)
	if err != nil {
		t.Fatal(err)
	}
	ctx := context.Background()
	if err = s.Transaction(ctx, true, func(tx Tx) error {
		db, _ := tx.Load()
		before := model.Clone(db)
		db.Employees[0].Position = "Changed"
		return tx.Save(before, db)
	}); err != nil {
		t.Fatal(err)
	}
	if err = s.Transaction(ctx, true, func(tx Tx) error {
		db, _ := tx.Load()
		before := model.Clone(db)
		db.Employees[0].Position = "Should roll back"
		_ = tx.Save(before, db)
		return errors.New("reject transaction")
	}); err == nil {
		t.Fatal("expected failure")
	}
	restarted, err := NewJSON(path)
	if err != nil {
		t.Fatal(err)
	}
	_ = restarted.Transaction(ctx, false, func(tx Tx) error {
		db, _ := tx.Load()
		if db.Employees[0].Position != "Changed" {
			t.Fatal("commit/rollback lost")
		}
		return nil
	})
}
func TestExpiredSessionAndUploadAreUnavailable(t *testing.T) {
	s, _ := NewJSON("")
	_ = s.Transaction(context.Background(), true, func(tx Tx) error {
		_ = tx.PutSession("expired", Session{EmployeeID: 1, ExpiresAt: time.Now().Add(-time.Hour)})
		v, err := tx.Session("expired")
		if err != nil || v != nil {
			t.Fatal(v, err)
		}
		_ = tx.CreateUpload(Upload{ID: "expired", EmployeeID: 1, ExpiresAt: time.Now().Add(-time.Hour)})
		u, err := tx.Upload("expired", 1)
		if err != nil || u != nil {
			t.Fatal(u, err)
		}
		return nil
	})
}
func TestCloudCertificateVerification(t *testing.T) {
	s, err := OpenPostgres(context.Background(), "postgres://user:password@database.example.test/db?sslmode=disable", "", false)
	if err != nil {
		t.Fatal(err)
	}
	defer s.Close()
	c := s.pool.Config().ConnConfig
	if c.TLSConfig == nil || c.TLSConfig.InsecureSkipVerify || len(c.Fallbacks) != 0 {
		t.Fatal("cloud TLS verification can be disabled")
	}
	if _, err = OpenPostgres(context.Background(), "postgres://user:password@database.example.test/db", "not a certificate", false); err == nil {
		t.Fatal("invalid CA accepted")
	}
}
