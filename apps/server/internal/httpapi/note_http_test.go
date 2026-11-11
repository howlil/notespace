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

func TestCanvasNoteCreateUpdateConflictRetryAndRemove(t *testing.T) {
	ctx := context.Background()
	store, err := sqlite.Open(ctx, filepath.Join(t.TempDir(), "canvas-note.db"))
	if err != nil {
		t.Fatal(err)
	}
	defer store.Close()
	api := newAPI(store)

	workspace := decodeWorkspace(t, call(t, api, http.MethodPost, "/api/workspaces", map[string]string{"title": "Canvas notes"}))
	canvas := testNoteCanvas("element-1", "note-1", "instance-1", false)
	request := note.CreateInstanceRequest{
		ClientRequestID:       "request-1",
		ClientNoteID:          "note-1",
		ClientInstanceID:      "instance-1",
		ElementID:             "element-1",
		ExpectedCanvasVersion: workspace.CanvasVersion,
		Document:              json.RawMessage(`{"type":"doc","content":[]}`),
		Canvas:                canvas,
		X:                     40,
		Y:                     64,
		Width:                 320,
		Height:                180,
	}

	createdResponse := call(t, api, http.MethodPost, "/api/workspaces/"+workspace.ID+"/note-instances", request)
	expect(t, createdResponse, http.StatusOK)
	var created note.CreateInstanceResult
	if err := json.Unmarshal(createdResponse.Body.Bytes(), &created); err != nil {
		t.Fatal(err)
	}
	if created.Note.ID != request.ClientNoteID || created.Instance.ID != request.ClientInstanceID || created.Canvas.Version <= workspace.CanvasVersion {
		t.Fatalf("create result = %+v", created)
	}

	retry := call(t, api, http.MethodPost, "/api/workspaces/"+workspace.ID+"/note-instances", request)
	expect(t, retry, http.StatusOK)
	var retried note.CreateInstanceResult
	if err := json.Unmarshal(retry.Body.Bytes(), &retried); err != nil {
		t.Fatal(err)
	}
	if retried.Note.ID != created.Note.ID || retried.Instance.ID != created.Instance.ID {
		t.Fatalf("idempotent retry changed identity: first=%+v retry=%+v", created, retried)
	}

	updatedDocument := json.RawMessage(`{"type":"doc","content":[{"type":"paragraph","content":[{"type":"text","text":"edited"}]}]}`)
	updated := call(t, api, http.MethodPut, "/api/notes/"+created.Note.ID, note.UpdateRequest{Document: updatedDocument, ExpectedRevision: created.Note.Revision})
	expect(t, updated, http.StatusOK)
	var updatedNote note.Note
	if err := json.Unmarshal(updated.Body.Bytes(), &updatedNote); err != nil {
		t.Fatal(err)
	}
	if updatedNote.Revision != created.Note.Revision+1 || string(updatedNote.Document) != string(updatedDocument) {
		t.Fatalf("updated note = %+v", updatedNote)
	}
	var searchResults []struct {
		Type       string `json:"type"`
		NoteID     string `json:"noteId"`
		InstanceID string `json:"instanceId"`
	}
	searchResponse := call(t, api, http.MethodGet, "/api/search?q=edited", nil)
	expect(t, searchResponse, http.StatusOK)
	if err := json.Unmarshal(searchResponse.Body.Bytes(), &searchResults); err != nil {
		t.Fatal(err)
	}
	if len(searchResults) == 0 || searchResults[0].Type != "note" || searchResults[0].NoteID != created.Note.ID || searchResults[0].InstanceID != created.Instance.ID {
		t.Fatalf("note search results = %+v", searchResults)
	}

	secondWorkspace := decodeWorkspace(t, call(t, api, http.MethodPost, "/api/workspaces", map[string]string{"title": "Shared note target"}))
	sharedInstance := note.CreateInstanceRequest{
		ClientRequestID:       "request-2",
		ClientNoteID:          created.Note.ID,
		ClientInstanceID:      "instance-2",
		ExistingNoteID:        created.Note.ID,
		ElementID:             "element-2",
		ExpectedCanvasVersion: secondWorkspace.CanvasVersion,
		Canvas:                testNoteCanvas("element-2", created.Note.ID, "instance-2", false),
		X:                     420,
		Y:                     64,
		Width:                 320,
		Height:                180,
	}
	sharedResponse := call(t, api, http.MethodPost, "/api/workspaces/"+secondWorkspace.ID+"/note-instances", sharedInstance)
	expect(t, sharedResponse, http.StatusOK)
	var shared note.CreateInstanceResult
	if err := json.Unmarshal(sharedResponse.Body.Bytes(), &shared); err != nil {
		t.Fatal(err)
	}
	if shared.Note.ID != created.Note.ID || shared.Instance.ID != sharedInstance.ClientInstanceID {
		t.Fatalf("linked instance changed canonical identity: %+v", shared)
	}
	backlinkWorkspace := decodeWorkspace(t, call(t, api, http.MethodPost, "/api/workspaces", map[string]string{"title": "Backlink source"}))
	backlinkDocument := json.RawMessage(`{"type":"doc","content":[{"type":"paragraph","content":[{"type":"text","text":"See target","marks":[{"type":"link","attrs":{"href":"/workspaces/` + workspace.ID + `?noteId=` + created.Note.ID + `"}}]}]}]}`)
	backlinkCreated := call(t, api, http.MethodPost, "/api/workspaces/"+backlinkWorkspace.ID+"/note-instances", note.CreateInstanceRequest{
		ClientRequestID:       "request-backlink",
		ClientNoteID:          "backlink-note",
		ClientInstanceID:      "backlink-instance",
		ElementID:             "backlink-element",
		ExpectedCanvasVersion: backlinkWorkspace.CanvasVersion,
		Document:              backlinkDocument,
		Canvas:                testNoteCanvas("backlink-element", "backlink-note", "backlink-instance", false),
		X:                     40, Y: 64, Width: 320, Height: 180,
	})
	expect(t, backlinkCreated, http.StatusOK)
	backlinksResponse := call(t, api, http.MethodGet, "/api/notes/"+created.Note.ID+"/backlinks", nil)
	expect(t, backlinksResponse, http.StatusOK)
	var backlinks []note.Backlink
	if err := json.Unmarshal(backlinksResponse.Body.Bytes(), &backlinks); err != nil {
		t.Fatal(err)
	}
	if len(backlinks) != 1 || backlinks[0].NoteID != "backlink-note" || backlinks[0].WorkspaceID != backlinkWorkspace.ID {
		t.Fatalf("backlinks = %+v", backlinks)
	}
	expect(t, call(t, api, http.MethodPut, "/api/notes/"+created.Note.ID, note.UpdateRequest{Document: updatedDocument, ExpectedRevision: created.Note.Revision}), http.StatusConflict)

	removedCanvas := testNoteCanvas("element-1", created.Note.ID, created.Instance.ID, true)
	removed := call(t, api, http.MethodDelete, "/api/workspaces/"+workspace.ID+"/note-instances/"+created.Instance.ID, note.DeleteInstanceRequest{
		ExpectedCanvasVersion: created.Canvas.Version,
		Canvas:                removedCanvas,
	})
	expect(t, removed, http.StatusOK)
	var removedState note.CanvasState
	if err := json.Unmarshal(removed.Body.Bytes(), &removedState); err != nil {
		t.Fatal(err)
	}
	if removedState.Version <= created.Canvas.Version {
		t.Fatalf("remove did not advance Canvas version: %+v", removedState)
	}
	expect(t, call(t, api, http.MethodGet, "/api/notes/"+created.Note.ID, nil), http.StatusOK)
	searchAfterRemove := call(t, api, http.MethodGet, "/api/search?q=edited", nil)
	expect(t, searchAfterRemove, http.StatusOK)
	if !strings.Contains(searchAfterRemove.Body.String(), `"noteId":"`+created.Note.ID+`"`) {
		t.Fatalf("unplaced note disappeared from search: %s", searchAfterRemove.Body.String())
	}
	if !strings.Contains(searchAfterRemove.Body.String(), `"instanceId":"`+shared.Instance.ID+`"`) {
		t.Fatalf("linked instance disappeared when first placement was removed: %s", searchAfterRemove.Body.String())
	}
}

func TestCanvasNoteCreateRollsBackOnUnknownWorkspace(t *testing.T) {
	ctx := context.Background()
	store, err := sqlite.Open(ctx, filepath.Join(t.TempDir(), "canvas-note-rollback.db"))
	if err != nil {
		t.Fatal(err)
	}
	defer store.Close()
	api := newAPI(store)
	request := note.CreateInstanceRequest{
		ClientRequestID:       "orphan-request",
		ClientNoteID:          "orphan-note",
		ClientInstanceID:      "orphan-instance",
		ElementID:             "orphan-element",
		ExpectedCanvasVersion: 1,
		Document:              json.RawMessage(`{"type":"doc","content":[]}`),
		Canvas:                testNoteCanvas("orphan-element", "orphan-note", "orphan-instance", false),
		X:                     40,
		Y:                     64,
		Width:                 320,
		Height:                180,
	}
	expect(t, call(t, api, http.MethodPost, "/api/workspaces/missing-workspace/note-instances", request), http.StatusConflict)
	expect(t, call(t, api, http.MethodGet, "/api/notes/orphan-note", nil), http.StatusNotFound)
}

func testNoteCanvas(elementID, noteID, instanceID string, deleted bool) note.CanvasSnapshot {
	data, _ := json.Marshal(map[string]any{
		"elements": []any{map[string]any{
			"id":        elementID,
			"isDeleted": deleted,
			"customData": map[string]any{
				"notespaceNote": map[string]string{"noteId": noteID, "instanceId": instanceID},
			},
		}},
		"appState": map[string]any{},
		"files":    map[string]any{},
	})
	return note.CanvasSnapshot{Format: "excalidraw", Version: 1, Data: data}
}
