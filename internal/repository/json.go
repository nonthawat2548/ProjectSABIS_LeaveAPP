package repository

import (
	"context"
	"encoding/json"
	"leave-management/internal/model"
	"leave-management/internal/service"
	"os"
	"path/filepath"
	"sync"
	"time"
)

type localState struct {
	db       *model.Database
	sessions map[string]Session
	uploads  map[string]Upload
	parts    map[string][]UploadPart
}
type JSONStore struct {
	mutex sync.Mutex
	path  string
	state localState
}

func NewJSON(path string) (*JSONStore, error) {
	s := &JSONStore{path: path, state: localState{db: DemoDatabase(), sessions: map[string]Session{}, uploads: map[string]Upload{}, parts: map[string][]UploadPart{}}}
	if path != "" {
		b, err := os.ReadFile(path)
		if err == nil {
			if err = json.Unmarshal(b, s.state.db); err != nil {
				return nil, err
			}
			if s.state.db.SchemaVersion != 1 {
				return nil, service.Problem("รูปแบบฐานข้อมูลไม่ถูกต้อง", "UNAVAILABLE")
			}
		} else if !os.IsNotExist(err) {
			return nil, err
		}
	}
	return s, nil
}
func (s *JSONStore) Mode() string { return "go-json" }
func (s *JSONStore) Transaction(ctx context.Context, write bool, fn func(Tx) error) error {
	s.mutex.Lock()
	defer s.mutex.Unlock()
	if err := ctx.Err(); err != nil {
		return err
	}
	state := s.state
	if write {
		state = localState{db: model.Clone(s.state.db), sessions: map[string]Session{}, uploads: map[string]Upload{}, parts: map[string][]UploadPart{}}
		for k, v := range s.state.sessions {
			state.sessions[k] = v
		}
		for k, v := range s.state.uploads {
			state.uploads[k] = v
		}
		for k, v := range s.state.parts {
			state.parts[k] = append([]UploadPart{}, v...)
		}
	}
	tx := &jsonTx{state: &state}
	if err := fn(tx); err != nil {
		return err
	}
	if write {
		if s.path != "" {
			if err := atomicJSON(s.path, state.db); err != nil {
				return err
			}
		}
		s.state = state
	}
	return nil
}
func atomicJSON(path string, value any) error {
	if err := os.MkdirAll(filepath.Dir(path), 0700); err != nil {
		return err
	}
	f, err := os.CreateTemp(filepath.Dir(path), ".leave-go-*.tmp")
	if err != nil {
		return err
	}
	name := f.Name()
	defer os.Remove(name)
	if err = json.NewEncoder(f).Encode(value); err == nil {
		err = f.Sync()
	}
	closeErr := f.Close()
	if err != nil {
		return err
	}
	if closeErr != nil {
		return closeErr
	}
	return os.Rename(name, path)
}

type jsonTx struct{ state *localState }

func (t *jsonTx) Ready() error { return nil }
func (t *jsonTx) Load() (*model.Database, error) {
	db := model.Clone(t.state.db)
	for i := range db.Documents {
		db.Documents[i].DataURL = ""
		db.Documents[i].Remote = false
	}
	return db, nil
}
func (t *jsonTx) Save(before, after *model.Database) error {
	next := model.Clone(after)
	for i := range next.Documents {
		d := &next.Documents[i]
		if d.DataURL == "" {
			for _, old := range t.state.db.Documents {
				if old.ID == d.ID {
					d.DataURL = old.DataURL
					break
				}
			}
		}
		d.Remote = false
	}
	t.state.db = next
	return nil
}
func (t *jsonTx) Session(hash string) (*Session, error) {
	s, ok := t.state.sessions[hash]
	if !ok || !s.ExpiresAt.After(time.Now()) {
		return nil, nil
	}
	return &s, nil
}
func (t *jsonTx) PutSession(hash string, s Session) error {
	for k, v := range t.state.sessions {
		if !v.ExpiresAt.After(time.Now()) {
			delete(t.state.sessions, k)
		}
	}
	t.state.sessions[hash] = s
	return nil
}
func (t *jsonTx) DeleteSession(hash string) error { delete(t.state.sessions, hash); return nil }
func (t *jsonTx) CreateUpload(u Upload) error {
	n := 0
	for k, v := range t.state.uploads {
		if !v.ExpiresAt.After(time.Now()) {
			delete(t.state.uploads, k)
			delete(t.state.parts, k)
		} else if v.EmployeeID == u.EmployeeID {
			n++
		}
	}
	if n >= 3 {
		return service.Problem("มีไฟล์ที่กำลังอัปโหลดอยู่ กรุณารอหรือยกเลิกไฟล์เดิม", "CONFLICT")
	}
	t.state.uploads[u.ID] = u
	return nil
}
func (t *jsonTx) Upload(id string, owner int) (*Upload, error) {
	u, ok := t.state.uploads[id]
	if !ok || u.EmployeeID != owner || !u.ExpiresAt.After(time.Now()) {
		return nil, nil
	}
	return &u, nil
}
func (t *jsonTx) Parts(id string) ([]UploadPart, error) {
	return append([]UploadPart{}, t.state.parts[id]...), nil
}
func (t *jsonTx) PutPart(id string, part UploadPart) error {
	rows := t.state.parts[id]
	for i := range rows {
		if rows[i].Number == part.Number {
			rows[i] = part
			t.state.parts[id] = rows
			return nil
		}
	}
	t.state.parts[id] = append(rows, part)
	return nil
}
func (t *jsonTx) DeleteUpload(id string, owner int) error {
	if u, ok := t.state.uploads[id]; ok && u.EmployeeID == owner {
		delete(t.state.uploads, id)
		delete(t.state.parts, id)
	}
	return nil
}
func (t *jsonTx) DocumentLength(id int) (int, error) {
	for _, d := range t.state.db.Documents {
		if d.ID == id {
			return len(d.DataURL), nil
		}
	}
	return 0, nil
}
func (t *jsonTx) DocumentPart(id, part, length int) (string, error) {
	for _, d := range t.state.db.Documents {
		if d.ID == id {
			start := part * length
			if start >= len(d.DataURL) {
				return "", nil
			}
			return d.DataURL[start:min(start+length, len(d.DataURL))], nil
		}
	}
	return "", nil
}
func (t *jsonTx) ResetTransient(ids []int) error {
	allowed := map[int]bool{}
	for _, id := range ids {
		allowed[id] = true
	}
	for k, s := range t.state.sessions {
		if !allowed[s.EmployeeID] {
			delete(t.state.sessions, k)
		}
	}
	clear(t.state.uploads)
	clear(t.state.parts)
	return nil
}
