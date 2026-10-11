package httpapi

import (
	"bytes"
	"encoding/json"
	"errors"
	"fmt"
	"github.com/gin-gonic/gin"
	"github.com/jackc/pgx/v5/pgconn"
	"log"
	"net/http/httptest"
	"strings"
	"testing"
)

func TestServerErrorsLogSQLStateWithoutPrivateDetails(t *testing.T) {
	output, flags := log.Writer(), log.Flags()
	defer log.SetOutput(output)
	defer log.SetFlags(flags)
	log.SetFlags(0)
	for _, code := range []string{"26000", "42P05", "53300", "42703", ""} {
		t.Run(code, func(t *testing.T) {
			var logs bytes.Buffer
			log.SetOutput(&logs)
			var err error = errors.New("postgres://private-value")
			if code != "" {
				err = fmt.Errorf("database query: %w", &pgconn.PgError{
					Code: code, Message: "private-value", Detail: "private-value", Hint: "private-value",
				})
			}
			a := &API{}
			router := gin.New()
			router.GET("/api/snapshot", func(c *gin.Context) { a.fail(c, err) })
			response := httptest.NewRecorder()
			router.ServeHTTP(response, httptest.NewRequest("GET", "/api/snapshot?token=private-value", nil))
			var body map[string]string
			if err := json.Unmarshal(response.Body.Bytes(), &body); err != nil {
				t.Fatal(err)
			}
			if response.Code != 500 || body["code"] != "SERVER" || body["message"] != "ไม่สามารถทำรายการได้ กรุณาลองอีกครั้งหรือติดต่อผู้ดูแลระบบ" {
				t.Fatal(response.Code, body)
			}
			if strings.Contains(logs.String()+response.Body.String(), "private-value") {
				t.Fatal("private error or request values were exposed")
			}
			if !strings.Contains(logs.String(), "route=GET /api/snapshot") {
				t.Fatal("missing request route", logs.String())
			}
			if code != "" && !strings.Contains(logs.String(), "sqlstate="+fmt.Sprintf("%q", code)) {
				t.Fatal("missing PostgreSQL SQLSTATE", logs.String())
			}
		})
	}
}
