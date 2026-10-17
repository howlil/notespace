package main

import "net"

// Prefer a stable origin to preserve WebView localStorage/IndexedDB across
// restarts. When Windows reserves the historical port, use a stable fallback.
// Only choose an ephemeral port if every stable candidate is unavailable.
func listenDesktop() (net.Listener, error) {
	for _, address := range []string{
		"127.0.0.1:49832",
		"127.0.0.1:41371",
		"127.0.0.1:41372",
	} {
		listener, err := net.Listen("tcp", address)
		if err == nil {
			return listener, nil
		}
	}
	return net.Listen("tcp", "127.0.0.1:0")
}
