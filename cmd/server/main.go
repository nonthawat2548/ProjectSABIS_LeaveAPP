package main

import (
	"context"
	"errors"
	"github.com/joho/godotenv"
	"leave-management/internal/app"
	"log"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"
)

func main() {
	if err := godotenv.Load(".env"); err != nil && !os.IsNotExist(err) {
		log.Fatal("อ่านไฟล์ .env ไม่สำเร็จ")
	}
	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()
	handler, closeStore, err := app.New(ctx)
	if err != nil {
		log.Fatalf("เริ่ม Go API ไม่สำเร็จ (%T)", err)
	}
	defer closeStore()
	host := os.Getenv("MOCK_HOST")
	if host == "" {
		host = "127.0.0.1"
	}
	port := os.Getenv("PORT")
	if port == "" {
		port = os.Getenv("MOCK_PORT")
	}
	if port == "" {
		port = "3001"
	}
	server := &http.Server{Addr: host + ":" + port, Handler: handler, ReadHeaderTimeout: 10 * time.Second, ReadTimeout: 60 * time.Second, WriteTimeout: 60 * time.Second, IdleTimeout: 60 * time.Second}
	go func() {
		<-ctx.Done()
		shutdown, cancel := context.WithTimeout(context.Background(), 5*time.Second)
		defer cancel()
		_ = server.Shutdown(shutdown)
	}()
	log.Printf("Go + Gin API: http://%s/api", server.Addr)
	if err := server.ListenAndServe(); err != nil && !errors.Is(err, http.ErrServerClosed) {
		log.Fatal("Go API หยุดทำงาน")
	}
}
