package httpapi_test

import (
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/howlil/notespace/apps/server/internal/httpapi"
)

func TestRequestObservabilityAddsRequestIDWithoutChangingResponse(t *testing.T) {
	handler := httpapi.WithRequestObservability(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		w.WriteHeader(http.StatusCreated)
		_, _ = w.Write([]byte("ok"))
	}), nil)

	res := httptest.NewRecorder()
	handler.ServeHTTP(res, httptest.NewRequest(http.MethodGet, "/test", nil))
	if res.Code != http.StatusCreated || res.Body.String() != "ok" {
		t.Fatalf("response = status %d body %q", res.Code, res.Body.String())
	}
	if res.Header().Get("X-Request-ID") == "" {
		t.Fatal("X-Request-ID is empty")
	}
}

func TestRequestObservabilityPreservesImplicitOK(t *testing.T) {
	handler := httpapi.WithRequestObservability(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		_, _ = w.Write([]byte("implicit"))
	}), func() httpapi.DatabaseStats {
		return httpapi.DatabaseStats{}
	})

	res := httptest.NewRecorder()
	handler.ServeHTTP(res, httptest.NewRequest(http.MethodGet, "/test", nil))
	if res.Code != http.StatusOK || res.Body.String() != "implicit" {
		t.Fatalf("response = status %d body %q", res.Code, res.Body.String())
	}
	if res.Header().Get("X-Request-ID") == "" {
		t.Fatal("X-Request-ID is empty")
	}
}
