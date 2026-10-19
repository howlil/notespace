package main

import (
    "net"
    "os"
    "path/filepath"
    "strings"
    "testing"
)

func TestDesktopListenPinsFirstAvailableLoopbackOrigin(t *testing.T) {
    originFile := filepath.Join(t.TempDir(), "desktop-origin-port")
    first, err := listenDesktop(originFile)
    if err != nil { t.Fatal(err) }
    address := first.Addr().String()
    host, port, err := net.SplitHostPort(address)
    if err != nil || host != "127.0.0.1" || port == "0" {
        first.Close()
        t.Fatalf("desktop bound an unsafe address %q: %v", address, err)
    }
    persisted, err := os.ReadFile(originFile)
    if err != nil || strings.TrimSpace(string(persisted)) != port {
        first.Close()
        t.Fatalf("desktop port was not pinned: %q, %v", persisted, err)
    }

    // A conflicting listener must NOT make Notespace silently switch origins.
    _, err = listenDesktop(originFile)
    if err == nil || !strings.Contains(err.Error(), "saved desktop port") {
        first.Close()
        t.Fatalf("expected recoverable pinned-port conflict, got %v", err)
    }

    if err := first.Close(); err != nil { t.Fatal(err) }
    second, err := listenDesktop(originFile)
    if err != nil { t.Fatal(err) }
    defer second.Close()
    if second.Addr().String() != address {
        t.Fatalf("desktop origin changed after release: %s -> %s", address, second.Addr())
    }
}

func TestDesktopListenRejectsInvalidPinnedPortInsteadOfChangingOrigin(t *testing.T) {
    originFile := filepath.Join(t.TempDir(), "desktop-origin-port")
    if err := os.WriteFile(originFile, []byte("0\n"), 0600); err != nil { t.Fatal(err) }
    if listener, err := listenDesktop(originFile); err == nil {
        listener.Close()
        t.Fatal("invalid pinned port must not be replaced silently")
    }
}
