package app

import (
	"crypto/subtle"
	"net/http"
)

const ownerUsername = "notespace"

// OwnerAuth is a single-owner Basic Auth deployment gate. Remote deployments
// must terminate TLS before this handler.
func OwnerAuth(next http.Handler, password string) http.Handler {
	if password == "" {
		return next
	}
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path == "/api/health" {
			next.ServeHTTP(w, r)
			return
		}
		username, supplied, ok := r.BasicAuth()
		usernameOK := subtle.ConstantTimeCompare([]byte(username), []byte(ownerUsername)) == 1
		passwordOK := subtle.ConstantTimeCompare([]byte(supplied), []byte(password)) == 1
		if !ok || !usernameOK || !passwordOK {
			w.Header().Set("WWW-Authenticate", `Basic realm="Notespace", charset="UTF-8"`)
			w.Header().Set("Cache-Control", "no-store")
			http.Error(w, "Authentication required", http.StatusUnauthorized)
			return
		}
		next.ServeHTTP(w, r)
	})
}
