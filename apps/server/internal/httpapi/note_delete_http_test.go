package httpapi_test

import (
	"context"
	"encoding/json"
	"net/http"
	"path/filepath"
	"strings"
	"testing"

	"github.com/howlil/notespace/apps/server/internal/note"
	"github.com/howlil/notespace/apps/server/internal/sqlite"
)

func TestDeleteNoteRequiresEmptyUnplacedNote(t *testing.T) {
	ctx := context.Background()
	store, err := sqlite.Open(ctx, filepath.Join(t.TempDir(), "note-delete.db"))
	if err != nil {
		t.Fatal(err)
	}
	defer store.Close()
	api := newAPI(store)

	workspace := decodeWorkspace(t, call(t, api, http.MethodPost, "/api/workspaces", map[string]string{"title": "Delete note"}))
	created := call(t, api, http.MethodPost, "/api/workspaces/"+workspace.ID+"/note-instances", note.CreateInstanceRequest{
		ClientRequestID:       "delete-request",
		ClientNoteID:          "delete-note",
		ClientInstanceID:      "delete-instance",
		ElementID:             "delete-element",
		ExpectedCanvasVersion: workspace.CanvasVersion,
		Document:              json.RawMessage(`{"type":"doc","content":[]}`),
		Canvas:                testNoteCanvas("delete-element", "delete-note", "delete-instance", false),
		X:                     40, Y: 64, Width: 320, Height: 180,
	})
	expect(t, created, http.StatusOK)
	var createdResult note.CreateInstanceResult
	if err := json.Unmarshal(created.Body.Bytes(), &createdResult); err != nil {
		t.Fatal(err)
	}

	placed := call(t, api, http.MethodDelete, "/api/notes/delete-note", nil)
	expect(t, placed, http.StatusConflict)
	if !strings.Contains(placed.Body.String(), `"code":"note_in_use"`) {
		t.Fatalf("placed delete body = %s", placed.Body.String())
	}

	removed := call(t, api, http.MethodDelete, "/api/workspaces/"+workspace.ID+"/note-instances/delete-instance", note.DeleteInstanceRequest{
		ExpectedCanvasVersion: createdResult.Canvas.Version,
		Canvas:                testNoteCanvas("delete-element", "delete-note", "delete-instance", true),
	})
	expect(t, removed, http.StatusOK)

	expect(t, call(t, api, http.MethodDelete, "/api/notes/delete-note", nil), http.StatusNoContent)
	expect(t, call(t, api, http.MethodGet, "/api/notes/delete-note", nil), http.StatusNotFound)
	expect(t, call(t, api, http.MethodDelete, "/api/notes/delete-note", nil), http.StatusNotFound)
}
