package httpapi_test

import (
	"context"
	"encoding/json"
	"net/http"
	"path/filepath"
	"testing"

	"github.com/howlil/notespace/apps/server/internal/domain"
	"github.com/howlil/notespace/apps/server/internal/infra/store"
)

func TestTagsAndRelatedNotesHTTPAPI(t *testing.T) {
	ctx := context.Background()
	s, err := store.Open(ctx, filepath.Join(t.TempDir(), "tags-http.db"))
	if err != nil {
		t.Fatal(err)
	}
	defer s.Close()
	api := newAPI(s)

	ws := decodeWorkspace(t, call(t, api, http.MethodPost, "/api/workspaces", map[string]string{"title": "HTTP Board"}))
	createdRes := call(t, api, http.MethodPost, "/api/workspaces/"+ws.ID+"/note-instances", domain.CreateNoteInstanceRequest{
		ClientRequestID:       "req-1",
		ClientNoteID:          "note-1",
		ClientInstanceID:      "inst-1",
		ElementID:             "el-1",
		ExpectedCanvasVersion: ws.CanvasVersion,
		Document:              json.RawMessage(`{"type":"markdown","text":"# Source\n\nSee [target](/workspaces/` + ws.ID + `?noteId=note-2)"}`),
		Canvas:                testNoteCanvas("el-1", "note-1", "inst-1", false),
		X:                     40,
		Y:                     64,
		Width:                 320,
		Height:                180,
	})
	expect(t, createdRes, http.StatusOK)

	// Create tag (and idempotent duplicate)
	tagRes := call(t, api, http.MethodPost, "/api/tags", map[string]string{"name": "Project"})
	expect(t, tagRes, http.StatusCreated)
	var tag domain.Tag
	if err := json.Unmarshal(tagRes.Body.Bytes(), &tag); err != nil {
		t.Fatal(err)
	}
	dupRes := call(t, api, http.MethodPost, "/api/tags", map[string]string{"name": "  project "})
	expect(t, dupRes, http.StatusCreated)
	var dup domain.Tag
	if err := json.Unmarshal(dupRes.Body.Bytes(), &dup); err != nil {
		t.Fatal(err)
	}
	if dup.ID != tag.ID {
		t.Fatalf("duplicate tag ID = %q, want %q", dup.ID, tag.ID)
	}

	// List tags
	listTagsRes := call(t, api, http.MethodGet, "/api/tags", nil)
	expect(t, listTagsRes, http.StatusOK)

	// Rename tag
	renameRes := call(t, api, http.MethodPatch, "/api/tags/"+tag.ID, map[string]string{"name": "Roadmap"})
	expect(t, renameRes, http.StatusOK)

	// Assign & batch tags
	expect(t, call(t, api, http.MethodPost, "/api/notes/note-1/tags", map[string]string{"tagId": tag.ID}), http.StatusNoContent)
	expect(t, call(t, api, http.MethodPost, "/api/notes/batch-tags", domain.BatchNoteTagsRequest{
		NoteIDs:   []string{"note-1"},
		AddTagIDs: []string{tag.ID},
	}), http.StatusNoContent)

	// Filter notes by tagIds
	filteredRes := call(t, api, http.MethodGet, "/api/notes?tagIds="+tag.ID+"&scope=all", nil)
	expect(t, filteredRes, http.StatusOK)
	var filtered domain.NoteListResult
	if err := json.Unmarshal(filteredRes.Body.Bytes(), &filtered); err != nil {
		t.Fatal(err)
	}
	if filtered.Total != 1 || len(filtered.Notes[0].Tags) != 1 || filtered.Notes[0].Tags[0].Name != "Roadmap" {
		t.Fatalf("filtered notes = %+v", filtered)
	}

	// GetNoteInfo includes tags and outgoing refs
	infoRes := call(t, api, http.MethodGet, "/api/notes/note-1/info", nil)
	expect(t, infoRes, http.StatusOK)
	var info domain.NoteInfo
	if err := json.Unmarshal(infoRes.Body.Bytes(), &info); err != nil {
		t.Fatal(err)
	}
	if len(info.Tags) != 1 || len(info.Outgoing) != 1 || !info.Outgoing[0].Unresolved {
		t.Fatalf("info = %+v", info)
	}

	// Remove tag from note and delete tag
	expect(t, call(t, api, http.MethodDelete, "/api/notes/note-1/tags/"+tag.ID, nil), http.StatusNoContent)
	expect(t, call(t, api, http.MethodDelete, "/api/tags/"+tag.ID, nil), http.StatusNoContent)
}
