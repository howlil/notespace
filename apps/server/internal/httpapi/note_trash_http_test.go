package httpapi_test

import (
	"context"
	"encoding/json"
	"net/http"
	"path/filepath"
	"testing"

	"github.com/howlil/notespace/apps/server/internal/note"
	"github.com/howlil/notespace/apps/server/internal/sqlite"
)

func TestNoteTrashRoutesCoexistWithWorkspaceTrash(t *testing.T) {
	ctx := context.Background()
	store, err := sqlite.Open(ctx, filepath.Join(t.TempDir(), "note-trash.db"))
	if err != nil {
		t.Fatal(err)
	}
	defer store.Close()
	api := newAPI(store)

	workspace := decodeWorkspace(t, call(t, api, http.MethodPost, "/api/workspaces", map[string]string{"title": "Trash routes"}))
	created := call(t, api, http.MethodPost, "/api/workspaces/"+workspace.ID+"/note-instances", note.CreateInstanceRequest{
		ClientRequestID: "r1", ClientNoteID: "trash-note", ClientInstanceID: "trash-instance", ElementID: "trash-element",
		ExpectedCanvasVersion: workspace.CanvasVersion,
		Document:              json.RawMessage(`{"type":"doc","content":[{"type":"paragraph","content":[{"type":"text","text":"keep me"}]}]}`),
		Canvas:                testNoteCanvas("trash-element", "trash-note", "trash-instance", false),
		X:                     40, Y: 64, Width: 320, Height: 180,
	})
	expect(t, created, http.StatusOK)

	// The guarded delete still refuses a contentful note; Trash is the explicit path.
	expect(t, call(t, api, http.MethodDelete, "/api/notes/trash-note", nil), http.StatusConflict)
	expect(t, call(t, api, http.MethodPost, "/api/notes/trash-note/trash", nil), http.StatusNoContent)
	expect(t, call(t, api, http.MethodPost, "/api/notes/trash-note/trash", nil), http.StatusConflict)

	got := call(t, api, http.MethodGet, "/api/notes/trash-note", nil)
	expect(t, got, http.StatusOK)
	var trashed note.Note
	if err := json.Unmarshal(got.Body.Bytes(), &trashed); err != nil || trashed.DeletedAt == "" {
		t.Fatalf("GET trashed note = %s, %v; want deletedAt set", got.Body.String(), err)
	}
	expect(t, call(t, api, http.MethodPut, "/api/notes/trash-note", note.UpdateRequest{Document: trashed.Document, ExpectedRevision: trashed.Revision}), http.StatusConflict)

	listed := call(t, api, http.MethodGet, "/api/trash/notes", nil)
	expect(t, listed, http.StatusOK)
	var items []struct {
		ID             string `json:"id"`
		Label          string `json:"label"`
		PlacementCount int    `json:"placementCount"`
	}
	if err := json.Unmarshal(listed.Body.Bytes(), &items); err != nil || len(items) != 1 || items[0].ID != "trash-note" || items[0].Label != "keep me" || items[0].PlacementCount != 1 {
		t.Fatalf("trashed note list = %s, %v", listed.Body.String(), err)
	}
	// The workspace Trash list stays separate and unaffected.
	workspaceTrash := call(t, api, http.MethodGet, "/api/trash", nil)
	expect(t, workspaceTrash, http.StatusOK)
	if body := workspaceTrash.Body.String(); body != "[]\n" && body != "[]" && body != "null\n" && body != "null" {
		t.Fatalf("workspace trash list = %q, want empty", body)
	}

	expect(t, call(t, api, http.MethodPost, "/api/trash/notes/trash-note", nil), http.StatusNoContent)
	expect(t, call(t, api, http.MethodPost, "/api/trash/notes/trash-note", nil), http.StatusNotFound)
	expect(t, call(t, api, http.MethodDelete, "/api/trash/notes/trash-note", nil), http.StatusNotFound)

	expect(t, call(t, api, http.MethodPost, "/api/notes/trash-note/trash", nil), http.StatusNoContent)
	expect(t, call(t, api, http.MethodDelete, "/api/trash/notes/trash-note", nil), http.StatusNoContent)
	expect(t, call(t, api, http.MethodGet, "/api/notes/trash-note", nil), http.StatusNotFound)
}
