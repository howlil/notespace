package main

import (
	"net/http"
	"net/http/httptest"
	"testing"
)

func TestDesktopLoopbackBoundaryRejectsOtherHostsAndOrigins(t *testing.T) {
	protected := desktopLoopbackBoundary(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		w.WriteHeader(http.StatusNoContent)
	}), "127.0.0.1:49832")
	cases := []struct {
		name, host, origin, site string
		want                     int
	}{
		{"normal webview", "127.0.0.1:49832", "http://127.0.0.1:49832", "same-origin", http.StatusNoContent},
		{"health probe", "127.0.0.1:49832", "", "", http.StatusNoContent},
		{"DNS rebinding", "private.example:49832", "", "", http.StatusForbidden},
		{"localhost alias", "localhost:49832", "", "", http.StatusForbidden},
		{"wrong port", "127.0.0.1:8080", "", "", http.StatusForbidden},
		{"cross origin GET", "127.0.0.1:49832", "https://evil.example", "", http.StatusForbidden},
		{"opaque origin", "127.0.0.1:49832", "null", "", http.StatusForbidden},
		{"same site not same origin", "127.0.0.1:49832", "", "same-site", http.StatusForbidden},
		{"cross site fetch metadata", "127.0.0.1:49832", "", "cross-site", http.StatusForbidden},
	}
	for _, testCase := range cases {
		t.Run(testCase.name, func(t *testing.T) {
			req := httptest.NewRequest(http.MethodGet, "http://127.0.0.1:49832/api/projects", nil)
			req.Host = testCase.host
			if testCase.origin != "" {
				req.Header.Set("Origin", testCase.origin)
			}
			if testCase.site != "" {
				req.Header.Set("Sec-Fetch-Site", testCase.site)
			}
			result := httptest.NewRecorder()
			protected.ServeHTTP(result, req)
			if result.Code != testCase.want {
				t.Fatalf("status = %d, want %d", result.Code, testCase.want)
			}
			if testCase.want == http.StatusNoContent {
				if result.Header().Get("X-Frame-Options") != "DENY" {
					t.Fatal("desktop UI must not be frameable")
				}
				if result.Header().Get("Content-Security-Policy") == "" {
					t.Fatal("desktop UI missing baseline CSP")
				}
			}
		})
	}
}

func TestDesktopLoopbackBoundaryRejectsNonLoopbackBind(t *testing.T) {
	for _, address := range []string{"0.0.0.0:49832", "localhost:49832", "127.0.0.1"} {
		handler := desktopLoopbackBoundary(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
			w.WriteHeader(http.StatusNoContent)
		}), address)
		result := httptest.NewRecorder()
		handler.ServeHTTP(result, httptest.NewRequest(http.MethodGet, "http://127.0.0.1:49832/", nil))
		if result.Code != http.StatusServiceUnavailable {
			t.Fatalf("bind %s accepted: %d", address, result.Code)
		}
	}
}
