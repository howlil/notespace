package httpapi_test

import (
	"context"
	"encoding/json"
	"net/http"
	"path/filepath"
	"testing"

	"github.com/howlil/notespace/apps/server/internal/capture"
	"github.com/howlil/notespace/apps/server/internal/sqlite"
	workspacepkg "github.com/howlil/notespace/apps/server/internal/workspace"
)

func captureFixture(t *testing.T) (*sqlite.Store, http.Handler) {
	t.Helper()
	store, err := sqlite.Open(context.Background(), filepath.Join(t.TempDir(), "captures.db"))
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = store.Close() })
	return store, newAPI(store)
}

func captureCreateWorkspace(t *testing.T, api http.Handler) workspacepkg.Workspace {
	t.Helper()
	res := call(t, api, http.MethodPost, "/api/workspaces", map[string]string{"title": "Capture source"})
	expect(t, res, http.StatusCreated)
	return decodeWorkspace(t, res)
}

func captureFromResponse(t *testing.T, resBody []byte) capture.Item {
	t.Helper()
	var item capture.Item
	if err := json.Unmarshal(resBody, &item); err != nil {
		t.Fatal(err)
	}
	return item
}

func TestCaptureConversionIsAtomicAndRetrySafe(t *testing.T) {
	store, api := captureFixture(t)
	w := captureCreateWorkspace(t, api)
	res := call(t, api, http.MethodPost, "/api/captures", map[string]string{"content": "Practice SQL joins"})
	expect(t, res, http.StatusCreated)
	item := captureFromResponse(t, res.Body.Bytes())
	organize := capture.Organize{Version: item.Version, WorkspaceID: w.ID, Kind: "task"}
	res = call(t, api, http.MethodPost, "/api/captures/"+item.ID+"/organize", organize)
	expect(t, res, http.StatusOK)
	converted := captureFromResponse(t, res.Body.Bytes())
	if converted.Status != "converted" || converted.TargetKind != "task" || converted.TargetWorkspaceID != w.ID || converted.TargetID == "" {
		t.Fatalf("unexpected conversion: %+v", converted)
	}
	retry := call(t, api, http.MethodPost, "/api/captures/"+item.ID+"/organize", organize)
	expect(t, retry, http.StatusOK)
	repeated := captureFromResponse(t, retry.Body.Bytes())
	if repeated.TargetID != converted.TargetID {
		t.Fatalf("retry duplicated target %q != %q", repeated.TargetID, converted.TargetID)
	}
	plan, err := store.GetPlan(context.Background(), w.ID)
	if err != nil {
		t.Fatal(err)
	}
	if len(plan.Tasks) != 1 || plan.Tasks[0].ID != converted.TargetID {
		t.Fatalf("target count/identity incorrect: %+v", plan.Tasks)
	}
	other := capture.Organize{Version: item.Version, WorkspaceID: w.ID, Kind: "note"}
	expect(t, call(t, api, http.MethodPost, "/api/captures/"+item.ID+"/organize", other), http.StatusConflict)
	expect(t, call(t, api, http.MethodPost, "/api/captures/"+item.ID+"/organize", capture.Organize{Version: converted.Version, WorkspaceID: w.ID, Kind: "task"}), http.StatusConflict)
	list := call(t, api, http.MethodGet, "/api/captures", nil)
	expect(t, list, http.StatusOK)
	var pending []capture.Item
	if err := json.Unmarshal(list.Body.Bytes(), &pending); err != nil {
		t.Fatal(err)
	}
	if len(pending) != 0 {
		t.Fatalf("converted capture still pending: %+v", pending)
	}
	receipt := call(t, api, http.MethodGet, "/api/captures/"+item.ID, nil)
	expect(t, receipt, http.StatusOK)
	if captureFromResponse(t, receipt.Body.Bytes()).TargetID != converted.TargetID {
		t.Fatal("conversion receipt missing")
	}
}

func TestCaptureToNoteAndBackupRestore(t *testing.T) {
	store, api := captureFixture(t)
	w := captureCreateWorkspace(t, api)
	content := "# Important\n\nUse indexes where appropriate."
	res := call(t, api, http.MethodPost, "/api/captures", map[string]string{"content": content})
	expect(t, res, http.StatusCreated)
	item := captureFromResponse(t, res.Body.Bytes())
	res = call(t, api, http.MethodPost, "/api/captures/"+item.ID+"/organize", capture.Organize{Version: 1, WorkspaceID: w.ID, Kind: "note"})
	expect(t, res, http.StatusOK)
	converted := captureFromResponse(t, res.Body.Bytes())
	notes, err := store.ListNotes(context.Background(), w.ID)
	if err != nil {
		t.Fatal(err)
	}
	found := false
	for _, note := range notes {
		if note.ID == converted.TargetID {
			found = true
			if note.Document.Format != "tiptap" {
				t.Fatalf("bad note format: %+v", note.Document)
			}
		}
	}
	if !found {
		t.Fatal("converted Note does not exist")
	}
	// Server-side conversion is also used by clients that omit the optional
	// rich document. The content must be searchable without an editor save.
	search := call(t, api, http.MethodGet, "/api/search?q=indexes", nil)
	expect(t, search, http.StatusOK)
	var matches []workspacepkg.SearchResult
	if err := json.Unmarshal(search.Body.Bytes(), &matches); err != nil {
		t.Fatal(err)
	}
	indexed := false
	for _, result := range matches {
		if result.Type == "block" && result.WorkspaceID == w.ID &&
			result.NoteID == converted.TargetID && result.BlockID != "" {
			indexed = true
		}
	}
	if !indexed {
		t.Fatalf("converted Note body was not indexed by block ID: %+v", matches)
	}
	draft := call(t, api, http.MethodPost, "/api/captures", map[string]string{"content": "Unorganized task"})
	expect(t, draft, http.StatusCreated)
	backup, err := store.ExportBackupArchive(context.Background())
	if err != nil {
		t.Fatal(err)
	}
	other, err := sqlite.Open(context.Background(), filepath.Join(t.TempDir(), "restored.db"))
	if err != nil {
		t.Fatal(err)
	}
	defer other.Close()
	if err := other.RestoreBackupArchive(context.Background(), backup); err != nil {
		t.Fatal(err)
	}
	restored, err := other.GetCapture(context.Background(), item.ID)
	if err != nil {
		t.Fatal(err)
	}
	if restored.Status != "converted" || restored.TargetID != converted.TargetID {
		t.Fatalf("receipt not restored: %+v", restored)
	}
	pending, err := other.ListCaptures(context.Background())
	if err != nil {
		t.Fatal(err)
	}
	if len(pending) != 1 || pending[0].Content != "Unorganized task" {
		t.Fatalf("pending capture not restored: %+v", pending)
	}
}

func TestCaptureVersionAndMissingDestination(t *testing.T) {
	_, api := captureFixture(t)
	item := captureFromResponse(t, call(t, api, http.MethodPost, "/api/captures", map[string]string{"content": "Something useful"}).Body.Bytes())
	if item.ID == "" {
		t.Fatal("missing capture ID")
	}
	expect(t, call(t, api, http.MethodPost, "/api/captures/"+item.ID+"/organize", capture.Organize{Version: 1, WorkspaceID: "not-a-workspace", Kind: "note"}), http.StatusNotFound)
	old := call(t, api, http.MethodPatch, "/api/captures/"+item.ID, map[string]any{"version": 1, "content": "Changed title"})
	expect(t, old, http.StatusOK)
	expect(t, call(t, api, http.MethodPatch, "/api/captures/"+item.ID, map[string]any{"version": 1, "content": "Overwritten"}), http.StatusConflict)
	expect(t, call(t, api, http.MethodPost, "/api/captures/"+item.ID+"/organize", capture.Organize{Version: 1, WorkspaceID: "not-a-workspace", Kind: "task"}), http.StatusConflict)
	updated := captureFromResponse(t, old.Body.Bytes())
	if updated.Version != 2 {
		t.Fatalf("version not advanced: %+v", updated)
	}
}
