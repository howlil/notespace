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
	api := httpapi.New(store, store.Healthy)
	webDir := env("NOTESPACE_WEB_DIR", "apps/web/dist/client")
	server := &http.Server{Addr: env("NOTESPACE_ADDR", "127.0.0.1:8080"), Handler: routes(api, webDir), ReadHeaderTimeout: 5 * time.Second, ReadTimeout: 30 * time.Second, WriteTimeout: 30 * time.Second, IdleTimeout: 60 * time.Second}
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
		// Only explicit app routes use the Start SPA shell; missing assets stay 404.
		if clean == "/" || (strings.HasPrefix(clean, "/projects/") && !strings.Contains(strings.TrimPrefix(clean, "/projects/"), "/")) {
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
