package main

import (
	"fmt"
	"log/slog"
	"os"
	"strings"

	"github.com/howlil/notespace/apps/server/internal/app"
)

func main() {
	cfg := app.ConfigFromEnv()

	// The desktop backup worker runs as a separate read-only process, never
	// starts the HTTP server and never runs migrations.
	if cfg.SnapshotOnly {
		if err := app.RunSnapshotOnly(cfg); err != nil {
			slog.Error("create SQLite recovery backup", "error", err)
			fmt.Fprintln(os.Stderr, err.Error())
			os.Exit(1)
		}
		return
	}

	if err := app.Run(cfg); err != nil {
		slog.Error("server stopped", "error", err)
		if cfg.ReadyStdout {
			detail := strings.NewReplacer("\r", " ", "\n", " ").Replace(err.Error())
			fmt.Fprintln(os.Stderr, "NOTESPACE_STARTUP_ERROR="+detail)
		}
		os.Exit(1)
	}
}
