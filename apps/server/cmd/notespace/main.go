package main

import (
	"fmt"
	"log/slog"
	"os"
	"strings"
)

func main() {
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
