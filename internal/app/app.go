// Package app wires the repository and Gin handlers together at startup.
package app

import (
	"context"
	"leave-management/internal/httpapi"
	"leave-management/internal/repository"
	"leave-management/internal/service"
	"net/http"
	"os"
	"strings"
)

func New(ctx context.Context) (http.Handler, func(), error) {
	return newApplication(ctx, os.Getenv("VERCEL") == "1")
}

// A deployed function always requires PostgreSQL, even if a platform variable
// is missing or an old local GO_DATA_MODE=json setting was copied accidentally.
func NewCloud(ctx context.Context) (http.Handler, func(), error) {
	return newApplication(ctx, true)
}

func newApplication(ctx context.Context, cloud bool) (http.Handler, func(), error) {
	mode := os.Getenv("GO_DATA_MODE")
	if cloud {
		mode = "postgres"
	}
	if mode == "" {
		mode = "json"
	}
	var store repository.Store
	closeStore := func() {}
	switch mode {
	case "json":
		path := os.Getenv("GO_DATA_FILE")
		if path == "" {
			path = "server/data/leave-management-go.json"
		}
		local, err := repository.NewJSON(path)
		if err != nil {
			return nil, nil, err
		}
		store = local
	case "postgres":
		dsn := os.Getenv("POSTGRES_URL")
		if dsn == "" {
			dsn = os.Getenv("DATABASE_URL")
		}
		if dsn == "" {
			return nil, nil, service.Problem("ระบบยังไม่พร้อมเชื่อมต่อฐานข้อมูล กรุณาติดต่อผู้ดูแลระบบ", "UNAVAILABLE")
		}
		pg, err := repository.OpenPostgres(ctx, dsn, os.Getenv("POSTGRES_SSL_CA"), !cloud && os.Getenv("POSTGRES_LOCAL") == "true")
		if err != nil {
			return nil, nil, err
		}
		store = pg
		closeStore = pg.Close
	default:
		return nil, nil, service.Problem("โหมดข้อมูลไม่ถูกต้อง กรุณาติดต่อผู้ดูแลระบบ", "UNAVAILABLE")
	}
	origins := []string{}
	for _, o := range strings.Split(os.Getenv("GO_ALLOWED_ORIGINS"), ",") {
		if o = strings.TrimSpace(o); o != "" {
			origins = append(origins, o)
		}
	}
	demo := os.Getenv("ENABLE_DEMO_LOGIN") == "true"
	if mode == "json" && !cloud && os.Getenv("ENABLE_DEMO_LOGIN") == "" {
		demo = true
	}
	return httpapi.New(store, httpapi.Options{DemoLogin: demo, SecureProxy: cloud, AllowedOrigins: origins}), closeStore, nil
}
