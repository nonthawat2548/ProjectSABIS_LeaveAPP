// Package handler is the Vercel entrypoint. Keep its imports public: @vercel/go
// wraps this file in a generated module outside leave-management/internal.
package handler

import (
	"leave-management/serverless"
	"net/http"
)

func Handler(w http.ResponseWriter, r *http.Request) {
	serverless.Handler(w, r)
}
