package httpapi_test

import (
	"bytes"
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strconv"
	"testing"

	"github.com/howlil/notespace/apps/server/internal/activity"
	"github.com/howlil/notespace/apps/server/internal/asset"
	"github.com/howlil/notespace/apps/server/internal/httpapi"
	"github.com/howlil/notespace/apps/server/internal/icon"
	"github.com/howlil/notespace/apps/server/internal/library"
	"github.com/howlil/notespace/apps/server/internal/planning"
	"github.com/howlil/notespace/apps/server/internal/sqlite"
	workspacepkg "github.com/howlil/notespace/apps/server/internal/workspace"
)

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

func (testIconSource) Fetch(context.Context, string) (icon.Entry, error) {
	return icon.Entry{}, icon.ErrNotFound
}

func apiDependencies(store *sqlite.Store) httpapi.Dependencies {
	workspaceService := workspacepkg.NewService(store)
	planningService := planning.NewService(store, store, nil)
	activityService := activity.NewService(store, store, nil)
	assetService := asset.NewService(store, store)
	libraryService := library.NewService(store)
	return httpapi.Dependencies{
		Workspace: &workspaceService,
		Planning:  &planningService,
		Activity:  &activityService,
		Assets:    &assetService,
		Library:   &libraryService,
		Icons:     testIconSource{},
		Health:    store.Healthy,
	}
}

func newAPI(store *sqlite.Store) http.Handler {
	return httpapi.WithSameOriginMutations(httpapi.New(apiDependencies(store)))
}

func newLibraryAPI(store *sqlite.Store) http.Handler {
	return newAPI(store)
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

func decodeWorkspace(t *testing.T, res *httptest.ResponseRecorder) workspacepkg.Workspace {
	t.Helper()
	var p workspacepkg.Workspace
	if err := json.Unmarshal(res.Body.Bytes(), &p); err != nil {
		t.Fatal(err)
	}
	return p
}

func decodeCategories(t *testing.T, res *httptest.ResponseRecorder) []workspacepkg.CategorySummary {
	t.Helper()
	var categories []workspacepkg.CategorySummary
	if err := json.Unmarshal(res.Body.Bytes(), &categories); err != nil {
		t.Fatal(err)
	}
	return categories
}
