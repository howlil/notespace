package httpapi_test

import (
	"context"
	"testing"

	"encoding/json"
	"github.com/howlil/notespace/apps/server/internal/sqlite"
	workspacepkg "github.com/howlil/notespace/apps/server/internal/workspace"
	"net/http"
	"path/filepath"
)

func TestSearchReturnsExactParentBlockContext(t *testing.T) {
	store, err := sqlite.Open(context.Background(), filepath.Join(t.TempDir(), "search.db"))
	if err != nil {
		t.Fatal(err)
	}
	defer store.Close()
	api := newAPI(store)
	p := decodeWorkspace(t, call(t, api, "POST", "/api/workspaces", map[string]string{"title": "Search workspace"}))
	p.Document = workspacepkg.Snapshot{Format: "tiptap", Version: 1, Data: json.RawMessage(`{"type":"doc","content":[{"type":"paragraph","attrs":{"blockId":"block-raft"},"content":[{"type":"text","text":"Raft consensus"}]}]}`)}
	p.Notes[0].Document = p.Document
	saved := call(t, api, "PATCH", "/api/workspaces/"+p.ID, workspacepkg.Update{Title: p.Title, Version: p.Version, Document: p.Document, Notes: p.Notes, Canvas: p.Canvas, References: p.References, SplitRatio: p.SplitRatio})
	expect(t, saved, 200)
	results := call(t, api, "GET", "/api/search?q=consensus", nil)
	expect(t, results, 200)
	var got []workspacepkg.SearchResult
	if err := json.Unmarshal(results.Body.Bytes(), &got); err != nil {
		t.Fatal(err)
	}
	if len(got) != 1 || got[0].BlockID != "block-raft" || got[0].NoteID != p.Notes[0].ID {
		t.Fatalf("search context = %+v", got)
	}
}

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
