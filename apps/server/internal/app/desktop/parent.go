package desktop

import (
	"bufio"
	"context"
	"errors"
	"io"
	"log/slog"
	"strings"
)

// watchParentLifecycle monitors the parent Tauri process stdin pipe and cancels
// the sidecar context when an explicit shutdown command or EOF arrives.
func watchParentLifecycle(stdin io.Reader, stop context.CancelFunc) {
	reader := bufio.NewReader(stdin)
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
