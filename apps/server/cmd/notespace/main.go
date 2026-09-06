package main

import (
	"context"
	"errors"
	"log/slog"
	"net/http"
	"os"
	"os/signal"
	"path"
	"path/filepath"
	"strings"
	"syscall"
	"time"

	"github.com/howlil/notespace/apps/server/internal/httpapi"
	"github.com/howlil/notespace/apps/server/internal/persistence"
)

func env(key, fallback string) string {
	if value := os.Getenv(key); value != "" {
		return value
	}
	return fallback
}

func run() error {
	slog.SetDefault(slog.New(slog.NewJSONHandler(os.Stdout, nil)))
	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()
	store, err := persistence.Open(ctx, env("NOTESPACE_DB", "data/notespace.db"))
	if err != nil {
		return err
	}
	defer store.Close()
	api := httpapi.WithLibraryRoutes(httpapi.New(store, store.Healthy), store)
	webDir := env("NOTESPACE_WEB_DIR", "apps/web/dist/client")
	handler := ownerAuth(routes(api, webDir), env("NOTESPACE_PASSWORD", ""))
	server := &http.Server{Addr: env("NOTESPACE_ADDR", "127.0.0.1:8080"), Handler: handler, ReadHeaderTimeout: 5 * time.Second, ReadTimeout: 30 * time.Second, WriteTimeout: 30 * time.Second, IdleTimeout: 60 * time.Second}
	failures := make(chan error, 1)
	go func() { failures <- server.ListenAndServe() }()
	slog.Info("notespace listening", "address", server.Addr)
	select {
	case err := <-failures:
		if !errors.Is(err, http.ErrServerClosed) {
			return err
		}
	case <-ctx.Done():
		shutdown, cancel := context.WithTimeout(context.Background(), 10*time.Second)
		defer cancel()
		if err := server.Shutdown(shutdown); err != nil {
			_ = server.Close()
			return err
		}
	}
	return nil
}

// isClientNavigationRoute defines the authoritative single source of truth for SPA client routes.
func isClientNavigationRoute(clean string) bool {
	if clean == "/" {
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

func main() {
	if err := run(); err != nil {
		slog.Error("server stopped", "error", err)
		os.Exit(1)
	}
}
