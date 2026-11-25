package httpapi_test

import (
	"bytes"
	"context"
	"encoding/json"
	"github.com/howlil/notespace/apps/server/internal/domain"
	"github.com/howlil/notespace/apps/server/internal/httpapi"
	"github.com/howlil/notespace/apps/server/internal/infra/store"
	"net/http"
	"net/http/httptest"
	"strconv"
	"testing"
)

// --- merged from api_test_helpers_test.go ---

func call(t *testing.T, api http.Handler, method, path string, body any) *httptest.ResponseRecorder {
	t.Helper()
	data, err := json.Marshal(body)
	if err != nil {
		t.Fatal(err)
	}
	req := httptest.NewRequest(method, path, bytes.NewReader(data))
	req.Header.Set("Content-Type", "application/json")
	res := httptest.NewRecorder()
	api.ServeHTTP(res, req)
	return res
}

type testIconSource struct{}

func (testIconSource) Fetch(context.Context, string) (domain.IconEntry, error) {
	return domain.IconEntry{}, domain.ErrIconNotFound
}

func apiDependencies(store *store.Store) httpapi.Dependencies {
	return httpapi.Dependencies{
		Library: store,
		Icons:   testIconSource{},
	}
}

func newAPI(store *store.Store) http.Handler {
	return httpapi.WithSameOriginMutations(httpapi.New(apiDependencies(store)))
}

func expect(t *testing.T, res *httptest.ResponseRecorder, status int) {
	t.Helper()
	if res.Code != status {
		t.Fatalf("status %d, want %d: %s", res.Code, status, res.Body.String())
	}
}

func deleteWorkspaceRequest(t *testing.T, api http.Handler, path string) *httptest.ResponseRecorder {
	t.Helper()
	version := 1
	current := call(t, api, http.MethodGet, path, nil)
	if current.Code == http.StatusOK {
		version = decodeWorkspace(t, current).Version
	}
	req := httptest.NewRequest(http.MethodDelete, path, nil)
	req.Header.Set("If-Match", `"`+strconv.Itoa(version)+`"`)
	res := httptest.NewRecorder()
	api.ServeHTTP(res, req)
	return res
}

func decodeWorkspace(t *testing.T, res *httptest.ResponseRecorder) domain.Workspace {
	t.Helper()
	var p domain.Workspace
	if err := json.Unmarshal(res.Body.Bytes(), &p); err != nil {
		t.Fatal(err)
	}
	return p
}

func decodeCategories(t *testing.T, res *httptest.ResponseRecorder) []domain.CategorySummary {
	t.Helper()
	var categories []domain.CategorySummary
	if err := json.Unmarshal(res.Body.Bytes(), &categories); err != nil {
		t.Fatal(err)
	}
	return categories
}
