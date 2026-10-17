package main

import (
	"context"
	"time"

	"fmt"
	"github.com/howlil/notespace/apps/server/internal/sqlite"
	"log/slog"
	"os"
	"strings"
)

func main() {
	// The desktop backup worker runs as a separate read-only process, never
	// starts the HTTP server and never runs migrations.
	if os.Getenv("NOTESPACE_SNAPSHOT_ONLY") == "1" {
		database := os.Getenv("NOTESPACE_DB")
		if database == "" {
			fmt.Fprintln(os.Stderr, "backup requires NOTESPACE_DB")
			os.Exit(1)
		}
		ctx, cancel := context.WithTimeout(context.Background(), 2*time.Minute)
		defer cancel()
		path, err := sqlite.CreateManualSnapshot(ctx, database)
		if err != nil {
			slog.Error("create SQLite recovery backup", "error", err)
			os.Exit(1)
		}
		fmt.Println("NOTESPACE_SNAPSHOT=" + path)
		return
	}
	if err := run(); err != nil {
		slog.Error("server stopped", "error", err)
		// The desktop shell needs a specific failure cause before the sidecar
		// exits; ordinary stdout logs are not part of the readiness protocol.
		if os.Getenv("NOTESPACE_READY_STDOUT") == "1" {
			detail := strings.NewReplacer("\r", " ", "\n", " ").Replace(err.Error())
			fmt.Fprintln(os.Stderr, "NOTESPACE_STARTUP_ERROR="+detail)
		}
		os.Exit(1)
	}
}
