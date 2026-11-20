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

func TestListNotesAndNoteInfoHTTPContracts(t *testing.T) {
	ctx := context.Background()
	store, err := sqlite.Open(ctx, filepath.Join(t.TempDir(), "note-http-contracts.db"))
	if err != nil {
		t.Fatal(err)
	}
	defer store.Close()
	api := newAPI(store)

	ws1 := decodeWorkspace(t, call(t, api, http.MethodPost, "/api/workspaces", map[string]string{"title": "Primary Space"}))
	ws2 := decodeWorkspace(t, call(t, api, http.MethodPost, "/api/workspaces", map[string]string{"title": "Secondary Space"}))

	// Create note-1 placed in ws1.
	doc1 := json.RawMessage(`{"type":"doc","content":[{"type":"heading","attrs":{"level":1,"blockId":"blk-h1"},"content":[{"type":"text","text":"HTTP Target Note"}]},{"type":"paragraph","content":[{"type":"text","text":"Detailed body text"}]}]}`)
	res1 := call(t, api, http.MethodPost, "/api/workspaces/"+ws1.ID+"/note-instances", note.CreateInstanceRequest{
		ClientRequestID: "http-req-1", ClientNoteID: "http-note-1", ClientInstanceID: "http-inst-1", ElementID: "http-el-1",
		ExpectedCanvasVersion: ws1.CanvasVersion, Document: doc1,
		Canvas: testNoteCanvas("http-el-1", "http-note-1", "http-inst-1", false),
		X:      20, Y: 30, Width: 320, Height: 180,
	})
	expect(t, res1, http.StatusOK)

	// Create note-2 in ws2 referencing note-1 via link + embed, plus self-link (must be excluded from note-2 info).
	doc2 := json.RawMessage(`{
		"type":"doc",
		"content":[
			{"type":"paragraph","content":[
				{"type":"text","text":"Linker Note "},
				{"type":"text","text":"ref","marks":[{"type":"link","attrs":{"href":"/workspaces/` + ws1.ID + `?noteId=http-note-1&blockId=blk-h1"}}]},
				{"type":"text","text":"self","marks":[{"type":"link","attrs":{"href":"/workspaces/` + ws2.ID + `?noteId=http-note-2"}}]}
			]},
			{"type":"noteEmbed","attrs":{"noteId":"http-note-1","workspaceId":"` + ws1.ID + `"}}
		]
	}`)
	res2 := call(t, api, http.MethodPost, "/api/workspaces/"+ws2.ID+"/note-instances", note.CreateInstanceRequest{
		ClientRequestID: "http-req-2", ClientNoteID: "http-note-2", ClientInstanceID: "http-inst-2", ElementID: "http-el-2",
		ExpectedCanvasVersion: ws2.CanvasVersion, Document: doc2,
		Canvas: testNoteCanvas("http-el-2", "http-note-2", "http-inst-2", false),
		X:      20, Y: 30, Width: 320, Height: 180,
	})
	expect(t, res2, http.StatusOK)

	// GET /api/notes returns both notes sorted by updated_at DESC.
	listRes := call(t, api, http.MethodGet, "/api/notes", nil)
	expect(t, listRes, http.StatusOK)
	var listPayload note.ListResult
	if err := json.Unmarshal(listRes.Body.Bytes(), &listPayload); err != nil {
		t.Fatal(err)
	}
	if len(listPayload.Notes) != 2 || listPayload.Notes[0].ID != "http-note-2" || listPayload.Notes[1].ID != "http-note-1" {
		t.Fatalf("GET /api/notes = %+v", listPayload)
	}
	if listPayload.Notes[1].Label != "HTTP Target Note" || listPayload.Notes[1].PlacementCount != 1 || len(listPayload.Notes[1].WorkspaceIDs) != 1 || listPayload.Notes[1].WorkspaceIDs[0] != ws1.ID || listPayload.Notes[1].IsEmpty {
		t.Fatalf("unexpected note-1 summary: %+v", listPayload.Notes[1])
	}

	// Limit and query filtering.
	limitRes := call(t, api, http.MethodGet, "/api/notes?limit=1", nil)
	expect(t, limitRes, http.StatusOK)
	var limitPayload note.ListResult
	if err := json.Unmarshal(limitRes.Body.Bytes(), &limitPayload); err != nil {
		t.Fatal(err)
	}
	if len(limitPayload.Notes) != 1 {
		t.Fatalf("GET /api/notes?limit=1 len = %d, want 1", len(limitPayload.Notes))
	}

	queryRes := call(t, api, http.MethodGet, "/api/notes?q=detailed", nil)
	expect(t, queryRes, http.StatusOK)
	var queryPayload note.ListResult
	if err := json.Unmarshal(queryRes.Body.Bytes(), &queryPayload); err != nil {
		t.Fatal(err)
	}
	if len(queryPayload.Notes) != 1 || queryPayload.Notes[0].ID != "http-note-1" {
		t.Fatalf("GET /api/notes?q=detailed = %+v", queryPayload)
	}

	// Noise query must return empty list.
	noiseRes := call(t, api, http.MethodGet, "/api/notes?q=paragraph", nil)
	expect(t, noiseRes, http.StatusOK)
	if strings.TrimSpace(noiseRes.Body.String()) != `{"notes":[]}` {
		t.Fatalf("noise query body = %s, want {\"notes\":[]}", noiseRes.Body.String())
	}

	// Validation errors on query params.
	for _, bad := range []string{"?limit=0", "?limit=101", "?limit=abc", "?unplaced=maybe"} {
		expect(t, call(t, api, http.MethodGet, "/api/notes"+bad, nil), http.StatusBadRequest)
	}

	// GET /api/notes/{id}/info for note-1.
	infoRes := call(t, api, http.MethodGet, "/api/notes/http-note-1/info", nil)
	expect(t, infoRes, http.StatusOK)
	var info note.Info
	if err := json.Unmarshal(infoRes.Body.Bytes(), &info); err != nil {
		t.Fatal(err)
	}
	if info.NoteID != "http-note-1" || len(info.Placements) != 1 || info.Placements[0].WorkspaceTitle != "Primary Space" || info.Placements[0].ElementID != "http-el-1" {
		t.Fatalf("note-1 info placements = %+v", info)
	}
	if len(info.Backlinks) != 2 {
		t.Fatalf("note-1 backlinks = %+v, want 2 (link + embed)", info.Backlinks)
	}
	for _, bl := range info.Backlinks {
		if bl.NoteID != "http-note-2" || bl.WorkspaceID != ws2.ID || bl.WorkspaceTitle != "Secondary Space" {
			t.Fatalf("unexpected backlink entry: %+v", bl)
		}
	}

	// Self-link is not included in note-2's backlinks; empty slices serialize as [].
	info2Res := call(t, api, http.MethodGet, "/api/notes/http-note-2/info", nil)
	expect(t, info2Res, http.StatusOK)
	if !strings.Contains(info2Res.Body.String(), `"backlinks":[]`) {
		t.Fatalf("note-2 info should serialize empty backlinks array: %s", info2Res.Body.String())
	}

	// Trash ws2 -> note-2 becomes unplaced and appears in ?unplaced=true, and note-1 backlink workspace clears.
	expect(t, deleteWorkspaceRequest(t, api, "/api/workspaces/"+ws2.ID), http.StatusNoContent)
	unplacedRes := call(t, api, http.MethodGet, "/api/notes?unplaced=true", nil)
	expect(t, unplacedRes, http.StatusOK)
	if !strings.Contains(unplacedRes.Body.String(), `"id":"http-note-2"`) || !strings.Contains(unplacedRes.Body.String(), `"workspaceIds":[]`) {
		t.Fatalf("unplaced after trash = %s", unplacedRes.Body.String())
	}

	infoAfterTrashRes := call(t, api, http.MethodGet, "/api/notes/http-note-1/info", nil)
	expect(t, infoAfterTrashRes, http.StatusOK)
	var infoAfterTrash note.Info
	if err := json.Unmarshal(infoAfterTrashRes.Body.Bytes(), &infoAfterTrash); err != nil {
		t.Fatal(err)
	}
	if len(infoAfterTrash.Backlinks) != 2 || infoAfterTrash.Backlinks[0].WorkspaceID != "" || infoAfterTrash.Backlinks[0].WorkspaceTitle != "" {
		t.Fatalf("backlinks after workspace trash = %+v", infoAfterTrash.Backlinks)
	}

	// 404 for unknown note info.
	expect(t, call(t, api, http.MethodGet, "/api/notes/unknown-note/info", nil), http.StatusNotFound)
}

func TestUpdateNoteValidatesSlice4ExtensionsOverHTTP(t *testing.T) {
	ctx := context.Background()
	store, err := sqlite.Open(ctx, filepath.Join(t.TempDir(), "note-http-slice4.db"))
	if err != nil {
		t.Fatal(err)
	}
	defer store.Close()
	api := newAPI(store)

	ws := decodeWorkspace(t, call(t, api, http.MethodPost, "/api/workspaces", map[string]string{"title": "Slice 4"}))
	createRes := call(t, api, http.MethodPost, "/api/workspaces/"+ws.ID+"/note-instances", note.CreateInstanceRequest{
		ClientRequestID: "s4-req-1", ClientNoteID: "s4-note-1", ClientInstanceID: "s4-inst-1", ElementID: "s4-el-1",
		ExpectedCanvasVersion: ws.CanvasVersion, Document: json.RawMessage(`{"type":"doc","content":[]}`),
		Canvas: testNoteCanvas("s4-el-1", "s4-note-1", "s4-inst-1", false),
		X:      20, Y: 30, Width: 320, Height: 180,
	})
	expect(t, createRes, http.StatusOK)

	validDoc := json.RawMessage(`{
		"type":"doc",
		"content":[{
			"type":"noteToggle",
			"attrs":{"open":true,"blockId":"toggle-blk-1"},
			"content":[
				{"type":"noteToggleSummary","content":[{"type":"text","text":"Details"}]},
				{"type":"paragraph","content":[
					{"type":"text","text":"Important","marks":[{"type":"noteHighlight","attrs":{"tone":"blue"}},{"type":"noteTextColor","attrs":{"tone":"purple"}}]}
				]}
			]
		}]
	}`)
	expect(t, call(t, api, http.MethodPut, "/api/notes/s4-note-1", note.UpdateRequest{Document: validDoc, ExpectedRevision: 1}), http.StatusOK)

	for _, badDoc := range []string{
		`{"type":"doc","content":[{"type":"noteToggle","attrs":{"open":"yes"}}]}`,
		`{"type":"doc","content":[{"type":"paragraph","content":[{"type":"text","text":"x","marks":[{"type":"noteHighlight","attrs":{"tone":"neon"}}]}]}]}`,
		`{"type":"doc","content":[{"type":"paragraph","content":[{"type":"text","text":"x","marks":[{"type":"noteTextColor","attrs":{"tone":"gold"}}]}]}]}`,
	} {
		expect(t, call(t, api, http.MethodPut, "/api/notes/s4-note-1", note.UpdateRequest{Document: json.RawMessage(badDoc), ExpectedRevision: 2}), http.StatusBadRequest)
	}
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
