package main

import (
	"context"
	"errors"
	"log/slog"
	"net/http"
	"os"
	"os/signal"
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
	server := &http.Server{Addr: env("NOTESPACE_ADDR", "127.0.0.1:8080"), Handler: handler, ReadHeaderTimeout: 5 * time.Second, ReadTimeout: 2 * time.Minute, WriteTimeout: 2 * time.Minute, IdleTimeout: 60 * time.Second}
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
