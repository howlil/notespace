package main

import (
	"net"
	"testing"
)

func TestDesktopListenAlwaysUsesLoopbackAndAnAvailablePort(t *testing.T) {
	first, err := listenDesktop()
	if err != nil { t.Fatal(err) }
	address := first.Addr().String()
	host, port, err := net.SplitHostPort(address)
	if err != nil || host != "127.0.0.1" || port == "0" {
		t.Fatalf("desktop bound an unsafe address %q: %v", address, err)
	}
	if err := first.Close(); err != nil { t.Fatal(err) }
	second, err := listenDesktop()
	if err != nil { t.Fatal(err) }
	defer second.Close()
	stable := map[string]bool{"49832": true, "41371": true, "41372": true}
	if stable[port] && second.Addr().String() != address {
		t.Fatalf("stable browser origin changed after release: %s -> %s", address, second.Addr())
	}
}
