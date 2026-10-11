package handler

import (
	"net/http/httptest"
	"strings"
	"testing"
)

func TestCloudFunctionRequiresDatabaseAndReturnsJSON(t *testing.T) {
	t.Setenv("POSTGRES_URL", "")
	t.Setenv("DATABASE_URL", "")
	t.Setenv("GO_DATA_MODE", "json")
	t.Setenv("VERCEL", "")
	for _, path := range []string{"/api/go?endpoint=health", "/api/go?endpoint=session", "/api/health"} {
		w := httptest.NewRecorder()
		Handler(w, httptest.NewRequest("GET", "https://leave.test"+path, nil))
		if w.Code != 503 || !strings.Contains(w.Body.String(), `"code":"UNAVAILABLE"`) {
			t.Fatal(w.Code, w.Body.String())
		}
		if !strings.Contains(w.Header().Get("Content-Type"), "application/json") || strings.Contains(w.Body.String(), "POSTGRES_URL") {
			t.Fatal("invalid cloud error response")
		}
	}
}
