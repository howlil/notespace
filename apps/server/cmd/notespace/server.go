package main

import (
	"bufio"
	"context"
	"errors"
	"fmt"
	"io"
	"log/slog"
	"net"
	"net/http"
	"os"
	"os/signal"
	"strconv"
	"strings"
	"syscall"
	"time"

	"github.com/howlil/notespace/apps/server/internal/activity"
	"github.com/howlil/notespace/apps/server/internal/asset"
	"github.com/howlil/notespace/apps/server/internal/httpapi"
	"github.com/howlil/notespace/apps/server/internal/icon"
	"github.com/howlil/notespace/apps/server/internal/library"
	"github.com/howlil/notespace/apps/server/internal/planning"
	"github.com/howlil/notespace/apps/server/internal/sqlite"
	"github.com/howlil/notespace/apps/server/internal/workspace"
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
	store, err := sqlite.Open(ctx, env("NOTESPACE_DB", "data/notespace.db"))
	if err != nil {
		return err
	}
	defer store.Close()
	workspaceStore := sqlite.NewIndexedWorkspaceStore(store)
	workspaceService := workspace.NewService(workspaceStore)
	planningService := planning.NewService(store, store, nil)
	activityService := activity.NewService(store, store, nil)
	assetService := asset.NewService(store, store)
	libraryService := library.NewService(store)
	iconSource := icon.NewEraserSource(&http.Client{Timeout: 5 * time.Second}, icon.DefaultEraserOrigin)

	deps := httpapi.Dependencies{
		Workspace: &workspaceService,
		Planning:  &planningService,
		Activity:  &activityService,
		Assets:    &assetService,
		Library:   &libraryService,
		Icons:     iconSource,
		Health:    store.Healthy,
	}
	api := httpapi.WithSameOriginMutations(httpapi.New(deps))
	api = httpapi.WithRequestObservability(api, func() httpapi.DatabaseStats {
		stats := store.Stats()
		return httpapi.DatabaseStats{
			OpenConnections: stats.OpenConnections,
			InUse:           stats.InUse,
			Idle:            stats.Idle,
			WaitCount:       stats.WaitCount,
			WaitDuration:    stats.WaitDuration,
		}
	})
	webDir := env("NOTESPACE_WEB_DIR", "apps/web/dist/client")
	handler := ownerAuth(routes(api, webDir), env("NOTESPACE_PASSWORD", ""))
	handler = withTestNoteSaveDelay(handler)
	server := &http.Server{Addr: env("NOTESPACE_ADDR", "127.0.0.1:8080"), Handler: handler, ReadHeaderTimeout: 5 * time.Second, ReadTimeout: 2 * time.Minute, WriteTimeout: 2 * time.Minute, IdleTimeout: 60 * time.Second}
	if env("NOTESPACE_PARENT_LIFECYCLE", "") == "1" {
		go watchParentLifecycle(stop)
	}
	listener, err := net.Listen("tcp", server.Addr)
	if err != nil {
		return err
	}
	failures := make(chan error, 1)
	go func() { failures <- server.Serve(listener) }()
	actualAddress := listener.Addr().String()
	if os.Getenv("NOTESPACE_READY_STDOUT") == "1" {
		fmt.Printf("NOTESPACE_READY=http://%s\n", actualAddress)
	}
	slog.Info("notespace listening", "address", actualAddress)
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

// withTestNoteSaveDelay is an opt-in integration-test fixture. It delays only
// granular Note writes so the desktop close journey can observe an in-flight
// save and prove that the second pending snapshot is flushed before exit.
func withTestNoteSaveDelay(next http.Handler) http.Handler {
	delayMs, err := strconv.Atoi(os.Getenv("NOTESPACE_TEST_NOTE_SAVE_DELAY_MS"))
	if err != nil || delayMs <= 0 {
		return next
	}
	delay := time.Duration(delayMs) * time.Millisecond
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Method == http.MethodPatch && strings.Contains(r.URL.Path, "/notes/") {
			timer := time.NewTimer(delay)
			defer timer.Stop()
			select {
			case <-timer.C:
			case <-r.Context().Done():
				return
			}
		}
		next.ServeHTTP(w, r)
	})
}

func watchParentLifecycle(stop context.CancelFunc) {
	reader := bufio.NewReader(os.Stdin)
	for {
		line, err := reader.ReadString('\n')
		if strings.TrimSpace(line) == "shutdown" {
			stop()
			return
		}
		if errors.Is(err, io.EOF) {
			stop()
			return
		}
		if err != nil {
			slog.Warn("parent lifecycle channel failed", "error", err)
			stop()
			return
		}
	}
}
