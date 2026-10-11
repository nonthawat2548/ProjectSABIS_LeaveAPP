// Package httpapi translates HTTP/JSON to service calls. Leave policy lives in
// internal/service, and SQL/filesystem details live in internal/repository.
package httpapi

import (
	"crypto/rand"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"github.com/gin-gonic/gin"
	"github.com/jackc/pgx/v5/pgconn"
	"io"
	"leave-management/internal/model"
	"leave-management/internal/repository"
	"leave-management/internal/service"
	"log"
	"net/http"
	"regexp"
	"strconv"
	"strings"
	"time"
)

type Options struct {
	DemoLogin      bool
	Now            func() time.Time
	SecureProxy    bool
	AllowedOrigins []string
}
type API struct {
	store   repository.Store
	options Options
}

var tokenPattern = regexp.MustCompile(`^[0-9a-f]{64}$`)

func New(store repository.Store, options Options) http.Handler {
	gin.SetMode(gin.ReleaseMode)
	a := &API{store: store, options: options}
	r := gin.New()
	_ = r.SetTrustedProxies(nil)
	r.Use(a.protect, gin.CustomRecovery(func(c *gin.Context, _ any) {
		a.fail(c, service.Problem("ไม่สามารถทำรายการได้ กรุณาลองอีกครั้งหรือติดต่อผู้ดูแลระบบ", "SERVER"))
	}))
	r.GET("/api/health", a.health)
	r.POST("/api/session", a.login)
	r.DELETE("/api/session", a.logout)
	private := r.Group("/api", a.requireSession)
	private.GET("/session", a.session)
	private.GET("/snapshot", a.snapshot)
	private.GET("/colleagues", a.colleagues)
	private.GET("/employee-profile", a.employeeProfile)
	private.POST("/commands", a.command)
	private.POST("/demo/reset", a.reset)
	private.POST("/uploads", a.createUpload)
	private.DELETE("/uploads/:id", a.deleteUpload)
	private.PUT("/uploads/:id/parts/:part", a.putPart)
	private.GET("/documents/:id", a.document)
	private.GET("/documents/:id/parts/:part", a.document)
	r.NoRoute(func(c *gin.Context) { a.fail(c, service.Problem("ไม่พบ API นี้", "NOT_FOUND")) })
	return http.HandlerFunc(func(w http.ResponseWriter, request *http.Request) {
		// Vercel rewrites /api/* to this one function. No frontend endpoint changes.
		if request.URL.Path == "/api/go" {
			copy := request.Clone(request.Context())
			u := *request.URL
			u.Path = "/api/" + strings.Trim(request.URL.Query().Get("endpoint"), "/")
			copy.URL = &u
			request = copy
		}
		r.ServeHTTP(w, request)
	})
}
func (a *API) now() time.Time {
	if a.options.Now != nil {
		return a.options.Now()
	}
	return time.Now()
}
func (a *API) secure(c *gin.Context) bool {
	return c.Request.TLS != nil || a.options.SecureProxy && c.GetHeader("X-Forwarded-Proto") == "https"
}
func (a *API) protect(c *gin.Context) {
	c.Header("Cache-Control", "no-store")
	c.Header("X-Content-Type-Options", "nosniff")
	origin := c.GetHeader("Origin")
	scheme := "http"
	if a.secure(c) {
		scheme = "https"
	}
	same := scheme + "://" + c.Request.Host
	allowed := origin == "" || origin == same
	for _, o := range a.options.AllowedOrigins {
		if origin == o {
			allowed = true
			c.Header("Access-Control-Allow-Origin", origin)
			c.Header("Access-Control-Allow-Credentials", "true")
			c.Header("Vary", "Origin")
		}
	}
	if !allowed || c.GetHeader("Sec-Fetch-Site") == "cross-site" && c.Request.Method != http.MethodGet {
		a.fail(c, service.Problem("ไม่อนุญาตให้ทำรายการจากเว็บไซต์อื่น", "FORBIDDEN"))
		return
	}
	if c.Request.Method == http.MethodOptions {
		c.Header("Access-Control-Allow-Methods", "GET,POST,PUT,DELETE,OPTIONS")
		c.Header("Access-Control-Allow-Headers", "Content-Type")
		c.AbortWithStatus(204)
		return
	}
	c.Next()
}
func sessionToken(c *gin.Context) string {
	cookie, err := c.Request.Cookie("leave_session")
	if err != nil || !tokenPattern.MatchString(cookie.Value) {
		return ""
	}
	return cookie.Value
}
func tokenHash(token string) string {
	h := sha256.Sum256([]byte(token))
	return hex.EncodeToString(h[:])
}
func randomToken() string {
	b := make([]byte, 32)
	if _, err := rand.Read(b); err != nil {
		panic(err)
	}
	return hex.EncodeToString(b)
}
func (a *API) setCookie(c *gin.Context, value string, clear bool) {
	age := 28800
	if clear {
		age = -1
	}
	http.SetCookie(c.Writer, &http.Cookie{Name: "leave_session", Value: value, Path: "/api", HttpOnly: true, Secure: a.secure(c), SameSite: http.SameSiteLaxMode, MaxAge: age})
}
func (a *API) authenticate(tx repository.Tx, c *gin.Context) (int, error) {
	token := sessionToken(c)
	if token == "" {
		return 0, service.Problem("กรุณาเข้าสู่ระบบ", "UNAUTHENTICATED")
	}
	s, err := tx.Session(tokenHash(token))
	if err != nil {
		return 0, err
	}
	if s == nil {
		return 0, service.Problem("กรุณาเข้าสู่ระบบอีกครั้ง", "UNAUTHENTICATED")
	}
	db, err := tx.Load()
	if err != nil {
		return 0, err
	}
	if _, err = service.Actor(db, s.EmployeeID); err != nil {
		return 0, err
	}
	return s.EmployeeID, nil
}
func (a *API) requireSession(c *gin.Context) {
	err := a.store.Transaction(c.Request.Context(), false, func(tx repository.Tx) error { _, err := a.authenticate(tx, c); return err })
	if err != nil {
		a.fail(c, err)
		return
	}
	c.Next()
}
func (a *API) body(c *gin.Context, limit int, target any) error {
	if c.Request.ContentLength > int64(limit) {
		return service.Problem("ข้อมูลในคำขอใหญ่เกินไป", "PAYLOAD_TOO_LARGE")
	}
	b, err := io.ReadAll(io.LimitReader(c.Request.Body, int64(limit)+1))
	if err != nil {
		return service.Invalid("JSON ไม่ถูกต้อง")
	}
	if len(b) > limit {
		return service.Problem("ข้อมูลในคำขอใหญ่เกินไป", "PAYLOAD_TOO_LARGE")
	}
	if len(b) == 0 {
		b = []byte("{}")
	}
	if err = json.Unmarshal(b, target); err != nil {
		return service.Invalid("JSON ไม่ถูกต้อง")
	}
	return nil
}
func (a *API) send(c *gin.Context, data any) {
	b, err := json.Marshal(data)
	if err != nil {
		a.fail(c, err)
		return
	}
	if len(b) > service.MaxBodyBytes {
		a.fail(c, service.Problem("ข้อมูลสำหรับแสดงผลมีขนาดใหญ่เกินไป กรุณาติดต่อผู้ดูแลระบบ", "PAYLOAD_TOO_LARGE"))
		return
	}
	c.Data(200, "application/json; charset=utf-8", b)
}
func (a *API) fail(c *gin.Context, err error) {
	var problem *service.Error
	if !errors.As(err, &problem) {
		var postgresError *pgconn.PgError
		if errors.As(err, &postgresError) {
			// SQLSTATE diagnoses pooler/schema errors without logging SQL, values or credentials.
			log.Printf("Go API error (%T) sqlstate=%q route=%s %s", err, postgresError.Code, c.Request.Method, c.FullPath())
		} else {
			log.Printf("Go API error (%T) route=%s %s", err, c.Request.Method, c.FullPath())
		}
		problem = &service.Error{Message: "ไม่สามารถทำรายการได้ กรุณาลองอีกครั้งหรือติดต่อผู้ดูแลระบบ", Code: "SERVER"}
	}
	status := map[string]int{"UNAUTHENTICATED": 401, "FORBIDDEN": 403, "NOT_FOUND": 404, "CONFLICT": 409, "PAYLOAD_TOO_LARGE": 413, "UNAVAILABLE": 503, "SERVER": 500}[problem.Code]
	if status == 0 {
		status = 400
	}
	c.AbortWithStatusJSON(status, problem)
}
func (a *API) run(c *gin.Context, write bool, fn func(repository.Tx, int) (any, error)) {
	var result any
	err := a.store.Transaction(c.Request.Context(), write, func(tx repository.Tx) error {
		id, err := a.authenticate(tx, c)
		if err != nil {
			return err
		}
		result, err = fn(tx, id)
		return err
	})
	if err != nil {
		a.fail(c, err)
		return
	}
	a.send(c, result)
}

func (a *API) health(c *gin.Context) {
	if err := a.store.Transaction(c.Request.Context(), false, func(tx repository.Tx) error { return tx.Ready() }); err != nil {
		a.fail(c, err)
		return
	}
	a.send(c, gin.H{"status": "ok", "mode": a.store.Mode(), "backend": "go-gin", "documentTransport": "parts-v1", "partCharacters": service.PartCharacters})
}
func (a *API) login(c *gin.Context) {
	if !a.options.DemoLogin {
		a.fail(c, service.Problem("บัญชีทดลองยังไม่เปิดใช้งาน กรุณาติดต่อผู้ดูแลระบบ", "UNAVAILABLE"))
		return
	}
	var input struct {
		Email    string `json:"email"`
		Password string `json:"password"`
	}
	if err := a.body(c, 64*1024, &input); err != nil {
		a.fail(c, err)
		return
	}
	if service.TextLength(input.Email) > 255 || input.Password != service.DemoPassword {
		a.fail(c, service.Problem(service.LoginError, "UNAUTHENTICATED"))
		return
	}
	token := randomToken()
	var account *model.Employee
	err := a.store.Transaction(c.Request.Context(), true, func(tx repository.Tx) error {
		db, err := tx.Load()
		if err != nil {
			return err
		}
		account, err = service.LoginAccount(db, input.Email)
		if err != nil {
			return err
		}
		if old := sessionToken(c); old != "" {
			if err = tx.DeleteSession(tokenHash(old)); err != nil {
				return err
			}
		}
		return tx.PutSession(tokenHash(token), repository.Session{EmployeeID: account.ID, ExpiresAt: time.Now().Add(8 * time.Hour)})
	})
	if err != nil {
		a.fail(c, err)
		return
	}
	a.setCookie(c, token, false)
	a.send(c, gin.H{"employee": account})
}
func (a *API) logout(c *gin.Context) {
	if token := sessionToken(c); token != "" {
		err := a.store.Transaction(c.Request.Context(), true, func(tx repository.Tx) error { return tx.DeleteSession(tokenHash(token)) })
		if err != nil {
			a.fail(c, err)
			return
		}
	}
	a.setCookie(c, "", true)
	a.send(c, model.Result{Message: "ออกจากระบบแล้ว"})
}
func (a *API) session(c *gin.Context) {
	a.run(c, false, func(tx repository.Tx, id int) (any, error) {
		db, err := tx.Load()
		if err != nil {
			return nil, err
		}
		e, err := service.Actor(db, id)
		return gin.H{"employee": e}, err
	})
}
func (a *API) snapshot(c *gin.Context) {
	a.run(c, false, func(tx repository.Tx, id int) (any, error) {
		db, err := tx.Load()
		if err != nil {
			return nil, err
		}
		return service.Snapshot(db, id)
	})
}
func (a *API) colleagues(c *gin.Context) {
	a.run(c, false, func(tx repository.Tx, id int) (any, error) {
		db, err := tx.Load()
		if err != nil {
			return nil, err
		}
		return service.Colleagues(db, id, c.Query("query"), c.Query("date"))
	})
}
func (a *API) employeeProfile(c *gin.Context) {
	a.run(c, false, func(tx repository.Tx, id int) (any, error) {
		db, err := tx.Load()
		if err != nil {
			return nil, err
		}
		if !regexp.MustCompile(`^\d+$`).MatchString(c.Query("employeeId")) {
			return nil, service.Invalid("รหัสพนักงานไม่ถูกต้อง")
		}
		employeeID, err := strconv.Atoi(c.Query("employeeId"))
		if err != nil {
			return nil, service.Invalid("รหัสพนักงานไม่ถูกต้อง")
		}
		return service.Profile(db, id, employeeID)
	})
}
func (a *API) command(c *gin.Context) {
	var input model.Command
	if err := a.body(c, service.MaxBodyBytes, &input); err != nil {
		a.fail(c, err)
		return
	}
	if input.Type == "" {
		a.fail(c, service.Invalid("คำสั่งไม่ถูกต้อง"))
		return
	}
	a.run(c, true, func(tx repository.Tx, id int) (any, error) {
		db, err := tx.Load()
		if err != nil {
			return nil, err
		}
		before := model.Clone(db)
		uploadID := ""
		if (input.Type == "submit" || input.Type == "edit") && input.Input != nil && input.Input.Attachment != nil && input.Input.Attachment.UploadID != "" {
			uploadID = input.Input.Attachment.UploadID
			input.Input.Attachment, err = resolveAttachment(tx, uploadID, id)
			if err != nil {
				return nil, err
			}
		}
		result, err := service.Apply(db, id, input, a.now())
		if err != nil {
			return nil, err
		}
		for i := range db.Documents {
			if db.Documents[i].DataURL != "" {
				db.Documents[i].StorageKey = "cloud/" + strconvID(db.Documents[i].ID)
			}
		}
		if err = tx.Save(before, db); err != nil {
			return nil, err
		}
		if uuidPattern.MatchString(uploadID) {
			if err = tx.DeleteUpload(uploadID, id); err != nil {
				return nil, err
			}
		}
		return result, nil
	})
}
func (a *API) reset(c *gin.Context) {
	a.run(c, true, func(tx repository.Tx, id int) (any, error) {
		db, err := tx.Load()
		if err != nil {
			return nil, err
		}
		actor, err := service.Actor(db, id)
		if err != nil {
			return nil, err
		}
		if actor.Role != "HR" {
			return nil, service.Problem("เฉพาะ HR เท่านั้น", "FORBIDDEN")
		}
		next := repository.DemoDatabase()
		ids := []int{}
		for _, e := range next.Employees {
			ids = append(ids, e.ID)
		}
		if err = tx.ResetTransient(ids); err != nil {
			return nil, err
		}
		if err = tx.Save(db, next); err != nil {
			return nil, err
		}
		return model.Result{Message: "คืนค่าข้อมูลจำลองแล้ว"}, nil
	})
}
