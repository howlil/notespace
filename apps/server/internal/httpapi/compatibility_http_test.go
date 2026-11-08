package httpapi_test

import (
	"context"
	"testing"

	"github.com/howlil/notespace/apps/server/internal/sqlite"
	"net/http"
	"path/filepath"
)

func TestRemovedStudyAndHistoryCompatibilityRoutesStayUnavailable(t *testing.T) {
	store, err := sqlite.Open(context.Background(), filepath.Join(t.TempDir(), "removed-compat-routes.db"))
	if err != nil {
		t.Fatal(err)
	}
	defer store.Close()
	api := newAPI(store)
	p := decodeWorkspace(t, call(t, api, "POST", "/api/workspaces", map[string]string{"title": "Compatibility boundary"}))

	for _, path := range []string{
		"/api/workspaces/" + p.ID + "/history",
		"/api/projects/" + p.ID + "/history",
		"/api/workspaces/" + p.ID + "/study",
		"/api/workspaces/" + p.ID + "/study-sessions",
		"/api/study/activity?from=2026-09-03&to=2026-09-03",
	} {
		expect(t, call(t, api, "GET", path, nil), http.StatusNotFound)
	}
}
