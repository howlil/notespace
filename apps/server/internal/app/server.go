package app

import (
	"context"
	"errors"
	"fmt"
	"log/slog"
	"net"
	"net/http"
	"os"
	"os/signal"
	"strings"
	"syscall"
	"time"

	"github.com/howlil/notespace/apps/server/internal/app/desktop"
	"github.com/howlil/notespace/apps/server/internal/httpapi"
	"github.com/howlil/notespace/apps/server/internal/infra/eraser"
	"github.com/howlil/notespace/apps/server/internal/infra/sqlite"
	"github.com/howlil/notespace/apps/server/internal/infra/store"
)

// RunSnapshotOnly executes the read-only desktop recovery backup worker without
// starting HTTP listeners or running schema migrations.
func RunSnapshotOnly(cfg Config) error {
	if !cfg.DatabasePathExplicit {
		return fmt.Errorf("backup requires NOTESPACE_DB")
	}
	ctx, cancel := context.WithTimeout(context.Background(), 2*time.Minute)
	defer cancel()
	path, err := sqlite.CreateManualSnapshot(ctx, cfg.DatabasePath)
	if err != nil {
		return err
	}
	fmt.Println("NOTESPACE_SNAPSHOT=" + path)
	return nil
}

func Run(cfg Config) error {
	slog.SetDefault(slog.New(slog.NewJSONHandler(os.Stdout, nil)))
	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()

	st, err := store.Open(ctx, cfg.DatabasePath)
	if err != nil {
		return err
	}
	defer func() { _ = st.Close() }()

	api := httpapi.WithSameOriginMutations(httpapi.New(httpapi.Dependencies{
		Library: st,
		Icons:   eraser.NewEraserSource(&http.Client{Timeout: 5 * time.Second}, eraser.DefaultOrigin),
	}))
	api = httpapi.WithRequestObservability(api, func() httpapi.PoolStats {
		stats := st.PoolStats()
		return httpapi.PoolStats{
			OpenConnections: stats.OpenConnections,
			InUse:           stats.InUse,
			Idle:            stats.Idle,
			WaitCount:       stats.WaitCount,
			WaitDuration:    stats.WaitDuration,
		}
	})

	var developmentProxy http.Handler
	if cfg.Desktop && cfg.DevServerURL != "" {
		developmentProxy, err = newDevelopmentWebProxy(cfg.DevServerURL)
		if err != nil {
			return err
		}
	}

	handler := Routes(api, cfg.WebDir, developmentProxy, cfg.Desktop)
	if !cfg.Desktop {
		handler = OwnerAuth(handler, cfg.OwnerPassword)
	}
	handler = withTestCanvasSaveDelay(handler, cfg.TestCanvasSaveDelay)

	var listener net.Listener
	var readyURL string
	if cfg.Desktop {
		sidecar, err := desktop.Start(ctx, desktop.Options{
			OriginFile: cfg.DesktopOriginFile,
			Inner:      handler,
			Stdin:      os.Stdin,
			OnShutdown: stop,
		})
		if err != nil {
			return err
		}
		defer func() { _ = sidecar.Close() }()
		listener = sidecar.Listener
		handler = sidecar.Handler
		readyURL = sidecar.ReadyURL
	} else {
		var lc net.ListenConfig
		listener, err = lc.Listen(ctx, "tcp", cfg.ListenAddr)
		if err != nil {
			return err
		}
		defer func() { _ = listener.Close() }()
		readyURL = "http://" + listener.Addr().String()
	}

	actualAddress := listener.Addr().String()
	srv := &http.Server{
		Addr:              actualAddress,
		Handler:           handler,
		ReadHeaderTimeout: 5 * time.Second,
		ReadTimeout:       2 * time.Minute,
		WriteTimeout:      2 * time.Minute,
		IdleTimeout:       60 * time.Second,
	}

	failures := make(chan error, 1)
	go func() { failures <- srv.Serve(listener) }()

	if cfg.ReadyStdout {
		fmt.Printf("NOTESPACE_READY=%s\n", readyURL)
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
		if err := srv.Shutdown(shutdown); err != nil {
			_ = srv.Close()
			return err
		}
	}
	return nil
}

// withTestCanvasSaveDelay is an opt-in desktop integration-test fixture used to
// observe in-flight granular Canvas writes during window-close flush proofs.
func withTestCanvasSaveDelay(next http.Handler, delay time.Duration) http.Handler {
	if delay <= 0 {
		return next
	}
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Method == http.MethodPatch && strings.HasSuffix(r.URL.Path, "/canvas") {
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
