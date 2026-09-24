package httpapi_test

import (
	"context"
	"errors"
	"net/http"
	"net/http/httptest"
	"path/filepath"
	"strconv"
	"testing"

	"github.com/howlil/notespace/apps/server/internal/httpapi"
	"github.com/howlil/notespace/apps/server/internal/icon"
	"github.com/howlil/notespace/apps/server/internal/sqlite"
)

type iconSourceFixture struct {
	entry icon.Entry
	err   error
	slug  string
}

func (s *iconSourceFixture) Fetch(_ context.Context, slug string) (icon.Entry, error) {
	s.slug = slug
	return s.entry, s.err
}

func iconAPI(t *testing.T, source icon.Source) http.Handler {
	t.Helper()
	store, err := sqlite.Open(context.Background(), filepath.Join(t.TempDir(), "icon-http.db"))
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = store.Close() })
	deps := apiDependencies(store)
	deps.Icons = source
	return httpapi.New(deps)
}

func TestEraserIconHTTPContract(t *testing.T) {
	payload := []byte("<svg></svg>")
	source := &iconSourceFixture{entry: icon.Entry{Data: payload, ContentType: "image/svg+xml"}}
	api := iconAPI(t, source)

	res := httptest.NewRecorder()
	api.ServeHTTP(res, httptest.NewRequest(http.MethodGet, "/api/icons/eraser/aws-lambda", nil))
	expect(t, res, http.StatusOK)
	if source.slug != "aws-lambda" {
		t.Fatalf("slug = %q", source.slug)
	}
	if got := res.Header().Get("Content-Type"); got != "image/svg+xml" {
		t.Fatalf("Content-Type = %q", got)
	}
	if got := res.Header().Get("Content-Length"); got != strconv.Itoa(len(payload)) {
		t.Fatalf("Content-Length = %q", got)
	}
	if got := res.Header().Get("Cache-Control"); got != "public,max-age=86400,immutable" {
		t.Fatalf("Cache-Control = %q", got)
	}
	if got := res.Header().Get("X-Content-Type-Options"); got != "nosniff" {
		t.Fatalf("X-Content-Type-Options = %q", got)
	}
	if res.Body.String() != string(payload) {
		t.Fatalf("body = %q", res.Body.String())
	}

	head := httptest.NewRecorder()
	api.ServeHTTP(head, httptest.NewRequest(http.MethodHead, "/api/icons/eraser/aws-lambda", nil))
	expect(t, head, http.StatusOK)
	if head.Body.Len() != 0 || head.Header().Get("Content-Length") != strconv.Itoa(len(payload)) {
		t.Fatalf("HEAD body=%q length=%q", head.Body.String(), head.Header().Get("Content-Length"))
	}
}

func TestEraserIconHTTPMapsSourceErrors(t *testing.T) {
	for _, tc := range []struct {
		name   string
		err    error
		status int
	}{
		{"invalid name", icon.ErrInvalidName, http.StatusBadRequest},
		{"not found", icon.ErrNotFound, http.StatusNotFound},
		{"upstream failure", errors.New("upstream failed"), http.StatusBadGateway},
	} {
		t.Run(tc.name, func(t *testing.T) {
			api := iconAPI(t, &iconSourceFixture{err: tc.err})
			res := httptest.NewRecorder()
			api.ServeHTTP(res, httptest.NewRequest(http.MethodGet, "/api/icons/eraser/test", nil))
			expect(t, res, tc.status)
		})
	}
}
