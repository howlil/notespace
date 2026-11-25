package desktop

import (
	"context"
	"errors"
	"fmt"
	"net"
	"os"
	"path/filepath"
	"strconv"
	"strings"
)

const primaryPort = "49832"

// listen pins the first available loopback port across restarts so WebView
// origin-scoped storage remains stable. An occupied pinned port fails closed
// with a recoverable startup error instead of silently switching origins.
func listen(ctx context.Context, originFile string) (net.Listener, error) {
	var lc net.ListenConfig
	saved, err := os.ReadFile(originFile)
	if err == nil {
		port := strings.TrimSpace(string(saved))
		value, parseErr := strconv.Atoi(port)
		if parseErr != nil || value < 1 || value > 65535 || strconv.Itoa(value) != port {
			return nil, fmt.Errorf("invalid desktop origin-port hint at %s", originFile)
		}
		address := net.JoinHostPort("127.0.0.1", port)
		listener, listenErr := lc.Listen(ctx, "tcp", address)
		if listenErr != nil {
			return nil, fmt.Errorf("saved desktop port %s is unavailable; close the application using it and retry: %w", port, listenErr)
		}
		return listener, nil
	}
	if !errors.Is(err, os.ErrNotExist) {
		return nil, fmt.Errorf("read desktop origin-port hint: %w", err)
	}

	candidates := []string{
		"127.0.0.1:" + primaryPort,
		"127.0.0.1:41371",
		"127.0.0.1:41372",
		"127.0.0.1:0",
	}
	var lastErr error
	for _, address := range candidates {
		listener, listenErr := lc.Listen(ctx, "tcp", address)
		if listenErr != nil {
			lastErr = listenErr
			continue
		}
		_, port, splitErr := net.SplitHostPort(listener.Addr().String())
		if splitErr != nil {
			_ = listener.Close()
			return nil, splitErr
		}
		if err := persistOriginPort(originFile, port); err != nil {
			_ = listener.Close()
			return nil, fmt.Errorf("save desktop origin-port hint: %w", err)
		}
		return listener, nil
	}
	return nil, fmt.Errorf("no desktop loopback port is available: %w", lastErr)
}

func persistOriginPort(path, port string) error {
	file, err := os.CreateTemp(filepath.Dir(path), ".desktop-origin-*.tmp")
	if err != nil {
		return err
	}
	defer func() { _ = os.Remove(file.Name()) }()
	if err := file.Chmod(0600); err != nil {
		_ = file.Close()
		return err
	}
	if _, err := file.WriteString(port + "\n"); err != nil {
		_ = file.Close()
		return err
	}
	if err := file.Sync(); err != nil {
		_ = file.Close()
		return err
	}
	if err := file.Close(); err != nil {
		return err
	}
	return os.Rename(file.Name(), path)
}
