package httpapi_test

import (
	"context"
	"encoding/json"
	"net/http"
	"net/url"
	"path/filepath"
	"testing"

	"github.com/howlil/notespace/apps/server/internal/sqlite"
	workspacepkg "github.com/howlil/notespace/apps/server/internal/workspace"
)

func TestWorkspaceSnapshotHTTPKeepsStablePagesAndRejectsDifferentFilters(t *testing.T) {
	ctx := context.Background()
	store, err := sqlite.Open(ctx, filepath.Join(t.TempDir(), "snapshot-http.db"))
	if err != nil {
		t.Fatal(err)
	}
	defer store.Close()
	api := newAPI(store)
	for _, title := range []string{"A", "B", "C", "D"} {
		expect(t, call(t, api, http.MethodPost, "/api/workspaces", map[string]string{"title": title}), http.StatusCreated)
	}
	decodePage := func(path string) workspacepkg.WorkspacePage {
		t.Helper()
		response := call(t, api, http.MethodGet, path, nil)
		expect(t, response, http.StatusOK)
		var page workspacepkg.WorkspacePage
		if err := json.Unmarshal(response.Body.Bytes(), &page); err != nil {
			t.Fatal(err)
		}
		return page
	}
	first := decodePage("/api/workspaces?limit=2&snapshot=start")
	if first.Total != 4 || len(first.Items) != 2 || first.Snapshot == "" || first.NextOffset == nil {
		t.Fatalf("invalid first page: %+v", first)
	}
	target := first.Items[1] // The old first-page receipt remains stable after rename.
	updated := decodeWorkspace(t, call(t, api, http.MethodGet, "/api/workspaces/"+target.ID, nil))
	expect(t, call(t, api, http.MethodPatch, "/api/workspaces/"+target.ID+"/title", map[string]string{
		"title": "Changed after snapshot", "expectedTitle": updated.Title,
	}), http.StatusOK)
	pageURL := "/api/workspaces?limit=2&offset=2&snapshot=" + url.QueryEscape(first.Snapshot)
	next := decodePage(pageURL)
	if next.Total != 4 || len(next.Items) != 2 ||
		next.Items[0].ID == first.Items[0].ID || next.Items[0].ID == first.Items[1].ID ||
		next.Items[1].ID == first.Items[0].ID || next.Items[1].ID == first.Items[1].ID {
		t.Fatalf("snapshot yielded overlapping page: first=%+v next=%+v", first.Items, next.Items)
	}
	expect(t, call(t, api, http.MethodGet,
		"/api/workspaces?limit=2&sort=notes&offset=2&snapshot="+url.QueryEscape(first.Snapshot), nil),
		http.StatusBadRequest)
	expect(t, call(t, api, http.MethodGet, "/api/workspaces?limit=2&offset=2&snapshot=start", nil),
		http.StatusBadRequest)
	legacy := decodePage("/api/workspaces?limit=2")
	if legacy.Snapshot != "" {
		t.Fatal("legacy offset endpoint unexpectedly started a snapshot session")
	}
}
