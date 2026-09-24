package main

import (
	"net/http"
	"path"
	"path/filepath"
	"strings"
)

// isClientNavigationRoute defines the authoritative single source of truth for SPA client routes.
func isClientNavigationRoute(clean string) bool {
	if clean == "/" || clean == "/today" || clean == "/inbox" {
		return true
	}
	prefixes := []string{"/categories/", "/workspaces/", "/projects/"}
	for _, prefix := range prefixes {
		if strings.HasPrefix(clean, prefix) {
			rest := strings.TrimPrefix(clean, prefix)
			if rest != "" && !strings.Contains(rest, "/") {
				return true
			}
		}
	}
	return false
}

func routes(api http.Handler, webDir string) http.Handler {
	mux := http.NewServeMux()
	mux.Handle("/api/", api)
	mux.HandleFunc("/", func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodGet && r.Method != http.MethodHead {
			w.Header().Set("Allow", "GET, HEAD")
			http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
			return
		}
		w.Header().Set("X-Content-Type-Options", "nosniff")
		w.Header().Set("Referrer-Policy", "same-origin")
		clean := path.Clean("/" + r.URL.Path)
		// Only explicit client navigation routes use the SPA shell; missing assets/unknown routes stay 404.
		if isClientNavigationRoute(clean) {
			w.Header().Set("Cache-Control", "no-cache")
			http.ServeFile(w, r, filepath.Join(webDir, "index.html"))
			return
		}
		if strings.HasPrefix(clean, "/assets/") {
			w.Header().Set("Cache-Control", "public,max-age=31536000,immutable")
		}
		http.FileServer(http.Dir(webDir)).ServeHTTP(w, r)
	})
	return mux
}
