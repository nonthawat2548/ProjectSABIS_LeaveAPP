// Package handler is the Vercel entrypoint. It uses exactly the same Gin API as
// cmd/server; only the HTTP hosting changes.
package handler

import (
	"context"
	"encoding/json"
	"leave-management/internal/app"
	"net/http"
	"sync"
)

var once sync.Once
var handler http.Handler
var startupError error

func Handler(w http.ResponseWriter, r *http.Request) {
	once.Do(func() { handler, _, startupError = app.NewCloud(context.Background()) })
	if startupError != nil {
		w.Header().Set("Content-Type", "application/json; charset=utf-8")
		w.Header().Set("Cache-Control", "no-store")
		w.WriteHeader(503)
		_ = json.NewEncoder(w).Encode(map[string]string{"message": "ระบบยังไม่พร้อมเชื่อมต่อฐานข้อมูล กรุณาติดต่อผู้ดูแลระบบ", "code": "UNAVAILABLE"})
		return
	}
	handler.ServeHTTP(w, r)
}
