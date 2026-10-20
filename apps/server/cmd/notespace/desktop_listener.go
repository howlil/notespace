package main

import (
	"errors"
	"fmt"
	"net"
	"os"
	"path/filepath"
	"strconv"
	"strings"
)

const desktopPrimaryPort = "49832"

// A WebView origin includes the TCP port. Moving to another port on a later
// launch hides existing localStorage/IndexedDB sessions and finalization
// outboxes. Pick a working port only once, then fail closed with a recoverable
// startup error if that pinned port is temporarily unavailable.
func listenDesktop(originFile string) (net.Listener, error) {
	saved, err := os.ReadFile(originFile)
	if err == nil {
		port := strings.TrimSpace(string(saved))
		value, parseErr := strconv.Atoi(port)
		if parseErr != nil || value < 1 || value > 65535 || strconv.Itoa(value) != port {
			return nil, fmt.Errorf("invalid desktop origin-port hint at %s", originFile)
		}
		address := net.JoinHostPort("127.0.0.1", port)
		listener, listenErr := net.Listen("tcp", address)
		if listenErr != nil {
			return nil, fmt.Errorf("Notespace's saved desktop port %s is unavailable; close the application using it and retry: %w", port, listenErr)
		}
		return listener, nil
	}
	if !errors.Is(err, os.ErrNotExist) {
		return nil, fmt.Errorf("read desktop origin-port hint: %w", err)
	}

	candidates := []string{
		"127.0.0.1:" + desktopPrimaryPort,
		"127.0.0.1:41371",
		"127.0.0.1:41372",
		"127.0.0.1:0",
	}
	var lastErr error
	for _, address := range candidates {
		listener, listenErr := net.Listen("tcp", address)
		if listenErr != nil {
			lastErr = listenErr
			continue
		}
		_, port, splitErr := net.SplitHostPort(listener.Addr().String())
		if splitErr != nil {
			listener.Close()
			return nil, splitErr
		}
		if err := persistDesktopOriginPort(originFile, port); err != nil {
			listener.Close()
			return nil, fmt.Errorf("save desktop origin-port hint: %w", err)
		}
		return listener, nil
	}
	return nil, fmt.Errorf("no desktop loopback port is available: %w", lastErr)
}

// Atomic replacement avoids a partially written hint after process interruption.
// The port is OS-level origin metadata, not a duplicate copy of product data.
func persistDesktopOriginPort(path, port string) error {
	file, err := os.CreateTemp(filepath.Dir(path), ".desktop-origin-*.tmp")
	if err != nil {
		return err
	}
	defer os.Remove(file.Name())
	if err := file.Chmod(0600); err != nil {
		file.Close()
		return err
	}
	if _, err := file.WriteString(port + "\n"); err != nil {
		file.Close()
		return err
	}
	if err := file.Sync(); err != nil {
		file.Close()
		return err
	}
	if err := file.Close(); err != nil {
		return err
	}
	return os.Rename(file.Name(), path)
}
