package app

import (
	"fmt"
	"net/http"
	"net/http/httputil"
	"net/url"
	"path"
	"path/filepath"
	"strings"
)

const (
	codeRunnerWorkerCSP = "frame-ancestors 'none'; default-src 'none'; script-src 'unsafe-eval'; connect-src 'none'; worker-src 'none'; object-src 'none'; base-uri 'none'"
	defaultWebCSP       = "frame-ancestors 'none'; object-src 'none'; base-uri 'self'"
)

func withWebSecurityHeaders(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Header.Get("Sec-Fetch-Mode") == "navigate" &&
			r.Header.Get("Sec-Fetch-Dest") != "" &&
			r.Header.Get("Sec-Fetch-Dest") != "document" {
			http.Error(w, "Cross-frame navigation rejected", http.StatusForbidden)
			return
		}
		w.Header().Set("X-Frame-Options", "DENY")
		w.Header().Set("X-Content-Type-Options", "nosniff")
		w.Header().Set("Referrer-Policy", "same-origin")
		w.Header().Set("Content-Security-Policy", defaultWebCSP)
		next.ServeHTTP(w, r)
	})
}

func newDevelopmentWebProxy(rawTarget string) (http.Handler, error) {
	target, err := url.Parse(rawTarget)
	if err != nil {
		return nil, fmt.Errorf("parse development web URL: %w", err)
	}
	if target.Scheme != "http" || target.Hostname() != "127.0.0.1" || target.Port() == "" {
		return nil, fmt.Errorf("development web URL must be an HTTP loopback URL with an explicit port")
	}
	return httputil.NewSingleHostReverseProxy(target), nil
}

func isClientNavigationRoute(clean string) bool {
	if clean == "/" {
		return true
	}
	if strings.HasPrefix(clean, "/workspaces/") {
		rest := strings.TrimPrefix(clean, "/workspaces/")
		if rest != "" && !strings.Contains(rest, "/") {
			return true
		}
	}
	return false
}

// Routes composes the HTTP API and SPA/static delivery. In desktop mode, the
// desktop sidecar owns outer navigation and security headers explicitly instead
// of relying on header overwrite precedence.
func Routes(api http.Handler, webDir string, developmentProxy http.Handler, desktopMode bool) http.Handler {
	mux := http.NewServeMux()
	mux.Handle("/api/", api)
	mux.HandleFunc("/", func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodGet && r.Method != http.MethodHead {
			w.Header().Set("Allow", "GET, HEAD")
			http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
			return
		}
		if path.Clean("/"+r.URL.Path) == "/code-runner-worker.js" {
			destination := r.Header.Get("Sec-Fetch-Dest")
			if destination != "" && destination != "worker" {
				http.NotFound(w, r)
				return
			}
			w.Header().Set("Content-Security-Policy", codeRunnerWorkerCSP)
			w.Header().Set("Cache-Control", "no-store")
			if developmentProxy != nil {
				developmentProxy.ServeHTTP(w, r)
				return
			}
			http.FileServer(http.Dir(webDir)).ServeHTTP(w, r)
			return
		}
		if developmentProxy != nil {
			developmentProxy.ServeHTTP(w, r)
			return
		}
		clean := path.Clean("/" + r.URL.Path)
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
	if desktopMode {
		return mux
	}
	return withWebSecurityHeaders(mux)
}
