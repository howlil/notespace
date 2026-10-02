package httpapi_test

import (
	"context"
	"encoding/json"
	"net/http"
	"path/filepath"
	"reflect"
	"strings"
	"testing"

	"github.com/howlil/notespace/apps/server/internal/sqlite"
	workspacepkg "github.com/howlil/notespace/apps/server/internal/workspace"
)

func TestWorkspaceHTTPRoundTripsUnicodeNoteAndCanvasAfterReopen(t *testing.T) {
	ctx := context.Background()
	dbPath := filepath.Join(t.TempDir(), "workspace-roundtrip.db")
	store, err := sqlite.Open(ctx, dbPath)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = store.Close() })
	api := newAPI(store)

	title := strings.Repeat("🙂", 160)
	created := decodeWorkspace(t, call(t, api, http.MethodPost, "/api/workspaces", map[string]string{"title": title}))
	note := created.Notes[0]
	document := workspacepkg.Snapshot{
		Format:  "tiptap",
		Version: 1,
		Data:    json.RawMessage(`{"type":"doc","content":[{"type":"paragraph","content":[{"type":"text","text":"日本語 العربية বাংলা 🧠\nline 2"}]}]}`),
	}
	updatedNote := call(t, api, http.MethodPatch, "/api/workspaces/"+created.ID+"/notes/"+note.ID, workspacepkg.NoteUpdate{
		Title:    "研究 🧠",
		Document: document,
		Version:  note.Version,
	})
	expect(t, updatedNote, http.StatusOK)

	canvas := workspacepkg.Snapshot{
		Format:  "excalidraw",
		Version: 1,
		Data:    json.RawMessage(`{"elements":[{"id":"shape-日本語","type":"rectangle"}],"appState":{},"files":{}}`),
	}
	canvasResponse := call(t, api, http.MethodPatch, "/api/workspaces/"+created.ID+"/canvas", workspacepkg.CanvasUpdate{
		Canvas:  canvas,
		Version: created.CanvasVersion,
	})
	// Keep the endpoint assertion close to the request so a route typo cannot
	// turn this persistence proof into a false positive.
	if canvasResponse.Code == http.StatusNotFound {
		t.Fatalf("canvas endpoint was not found: %s", canvasResponse.Body.String())
	}
	expect(t, canvasResponse, http.StatusOK)

	if err := store.Close(); err != nil {
		t.Fatal(err)
	}
	store, err = sqlite.Open(ctx, dbPath)
	if err != nil {
		t.Fatal(err)
	}
	api = newAPI(store)

	reloaded := decodeWorkspace(t, call(t, api, http.MethodGet, "/api/workspaces/"+created.ID, nil))
	if reloaded.Title != title || len(reloaded.Notes) != 1 {
		t.Fatalf("reloaded workspace metadata = %+v", reloaded.Summary)
	}
	if reloaded.Notes[0].Title != "研究 🧠" || string(reloaded.Notes[0].Document.Data) != string(document.Data) {
		t.Fatalf("reloaded note = %+v", reloaded.Notes[0])
	}
	if string(reloaded.Canvas.Data) != string(canvas.Data) {
		t.Fatalf("reloaded canvas = %s, want %s", reloaded.Canvas.Data, canvas.Data)
	}
}

func TestInvalidWorkspaceMutationsPreserveDurableAggregate(t *testing.T) {
	ctx := context.Background()
	store, err := sqlite.Open(ctx, filepath.Join(t.TempDir(), "workspace-invalid.db"))
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = store.Close() })
	api := newAPI(store)
	created := decodeWorkspace(t, call(t, api, http.MethodPost, "/api/workspaces", map[string]string{"title": "Stable state"}))
	before := decodeWorkspace(t, call(t, api, http.MethodGet, "/api/workspaces/"+created.ID, nil))

	invalidAggregate := workspacepkg.Update{
		Title:      "",
		Document:   before.Document,
		Notes:      before.Notes,
		Canvas:     before.Canvas,
		References: before.References,
		SplitRatio: before.SplitRatio,
		Version:    before.Version,
	}
	expect(t, call(t, api, http.MethodPatch, "/api/workspaces/"+created.ID, invalidAggregate), http.StatusBadRequest)

	invalidCanvas := workspacepkg.CanvasUpdate{
		Canvas: workspacepkg.Snapshot{
			Format:  "excalidraw",
			Version: 1,
			Data:    json.RawMessage(`{"elements":null,"appState":{},"files":{}}`),
		},
		Version: before.CanvasVersion,
	}
	expect(t, call(t, api, http.MethodPatch, "/api/workspaces/"+created.ID+"/canvas", invalidCanvas), http.StatusBadRequest)

	after := decodeWorkspace(t, call(t, api, http.MethodGet, "/api/workspaces/"+created.ID, nil))
	if !reflect.DeepEqual(after, before) {
		t.Fatalf("invalid mutation changed durable workspace:\nbefore=%+v\nafter=%+v", before, after)
	}
}

func TestWorkspaceGranularMissingResourceDoesNotCreateData(t *testing.T) {
	ctx := context.Background()
	store, err := sqlite.Open(ctx, filepath.Join(t.TempDir(), "workspace-missing.db"))
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = store.Close() })
	api := newAPI(store)

	missingID := "missing-workspace"
	missingNote := workspacepkg.NoteCreate{
		ID:       "note-1",
		Title:    "Missing parent",
		Document: workspacepkg.Snapshot{Format: "tiptap", Version: 1, Data: json.RawMessage(`{"type":"doc","content":[]}`)},
	}
	expect(t, call(t, api, http.MethodPost, "/api/workspaces/"+missingID+"/notes", missingNote), http.StatusNotFound)
	expect(t, call(t, api, http.MethodGet, "/api/workspaces/"+missingID, nil), http.StatusNotFound)

	list := call(t, api, http.MethodGet, "/api/workspaces", nil)
	expect(t, list, http.StatusOK)
	if !strings.Contains(list.Body.String(), `"items":[]`) {
		t.Fatalf("missing resource request created data: %s", list.Body.String())
	}
}
