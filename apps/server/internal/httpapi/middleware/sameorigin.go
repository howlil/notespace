// Package middleware provides cross-cutting HTTP wrappers for same-origin
// mutation protection and request observability.
package middleware

import (
	"net/http"

	"github.com/howlil/notespace/apps/server/internal/httpapi/transport"
)

func sameOriginMutation(w http.ResponseWriter, r *http.Request) bool {
	if r.Method == http.MethodGet || r.Method == http.MethodHead {
		return true
	}
	if r.Header.Get("Sec-Fetch-Site") == "cross-site" {
		transport.SendJSON(w, http.StatusForbidden, map[string]string{"error": "Cross-site request rejected"})
		return false
	}
	if origin := r.Header.Get("Origin"); origin != "" && origin != "http://"+r.Host && origin != "https://"+r.Host {
		transport.SendJSON(w, http.StatusForbidden, map[string]string{"error": "Origin rejected"})
		return false
	}
	return true
}

func SameOriginMutations(base http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if !sameOriginMutation(w, r) {
			return
		}
		base.ServeHTTP(w, r)
	})
}
