package icon

import (
	"context"
	"errors"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

func TestEraserSourceMapsInvalidUpstreamResponses(t *testing.T) {
	tests := []struct {
		name         string
		status       int
		contentType  string
		body         string
		wantNotFound bool
	}{
		{"not found", http.StatusNotFound, "image/svg+xml", "", true},
		{"server failure", http.StatusInternalServerError, "image/svg+xml", "", false},
		{"wrong mime", http.StatusOK, "text/html", "<svg></svg>", true},
		{"empty body", http.StatusOK, "image/svg+xml", "", true},
		{"malformed svg", http.StatusOK, "image/svg+xml", "<svg", true},
		{"unsafe svg", http.StatusOK, "image/svg+xml", "<svg><script>alert(1)</script></svg>", true},
		{"oversized svg", http.StatusOK, "image/svg+xml", "<svg>"+strings.Repeat(" ", maxEraserIconBytes)+"</svg>", true},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			upstream := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
				w.Header().Set("Content-Type", tc.contentType)
				w.WriteHeader(tc.status)
				_, _ = w.Write([]byte(tc.body))
			}))
			defer upstream.Close()

			_, err := NewEraserSource(upstream.Client(), upstream.URL).Fetch(context.Background(), "test")
			if err == nil {
				t.Fatal("expected upstream response to fail")
			}
			if tc.wantNotFound && !errors.Is(err, ErrNotFound) {
				t.Fatalf("error = %v, want ErrNotFound", err)
			}
			if !tc.wantNotFound && errors.Is(err, ErrNotFound) {
				t.Fatalf("error = %v, want operational upstream error", err)
			}
		})
	}
}
