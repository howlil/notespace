package main

import (
	"net"
	"net/http"
	"strings"
)

// desktopLoopbackBoundary limits the unauthenticated Tauri sidecar to its
// expected loopback authority. It prevents DNS rebinding, hostile Host headers,
// cross-origin browser requests, and embedding of the local Notespace UI.
// This is an additional boundary, NOT a substitute for per-instance auth.
func desktopLoopbackBoundary(next http.Handler, listenAddress string) http.Handler {
	host, port, err := net.SplitHostPort(listenAddress)
	if err != nil || host != "127.0.0.1" || port == "" {
		return http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
			http.Error(w, "Invalid desktop listen address", http.StatusServiceUnavailable)
		})
	}
	allowedHost := net.JoinHostPort(host, port)
	allowedOrigin := "http://" + allowedHost
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		// Perform checks before either static assets or private API respond.
		if r.Host != allowedHost {
			http.Error(w, "Desktop host rejected", http.StatusForbidden)
			return
		}
		if origin := r.Header.Get("Origin"); origin != "" && origin != allowedOrigin {
			http.Error(w, "Desktop origin rejected", http.StatusForbidden)
			return
		}
		switch strings.ToLower(r.Header.Get("Sec-Fetch-Site")) {
		case "cross-site", "same-site":
			// The first Tauri bootstrap navigation starts on a different
			// scheme. Its 256-bit one-use secret is independently verified by
			// desktopSession.handler. No other cross-site request is allowed.
			bootstrap := r.URL.Path == "/__desktop_session" &&
				r.Method == http.MethodGet &&
				r.Header.Get("Sec-Fetch-Mode") == "navigate"
			if !bootstrap {
				http.Error(w, "Cross-origin desktop request rejected", http.StatusForbidden)
				return
			}
		}
		if r.Header.Get("Sec-Fetch-Mode") == "navigate" &&
			r.Header.Get("Sec-Fetch-Dest") != "document" &&
			r.Header.Get("Sec-Fetch-Dest") != "" {
			http.Error(w, "Desktop navigation rejected", http.StatusForbidden)
			return
		}
		w.Header().Set("X-Frame-Options", "DENY")
		w.Header().Set("X-Content-Type-Options", "nosniff")
		w.Header().Set("Referrer-Policy", "no-referrer")
		w.Header().Set("Cross-Origin-Resource-Policy", "same-origin")
		// The desktop SPA needs third-party fonts and dynamic styles. Limit
		// high-risk constructs here without inventing an untested script-src
		// policy that would break hydration in production.
		w.Header().Set("Content-Security-Policy", "frame-ancestors 'none'; object-src 'none'; base-uri 'self'")
		next.ServeHTTP(w, r)
	})
}
