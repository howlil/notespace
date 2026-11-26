package store

import (
	"context"
	"encoding/json"
	"errors"
	"github.com/howlil/notespace/apps/server/internal/domain"
	"path/filepath"
	"strings"
	"testing"
)

// --- merged from assets_search_test.go ---

func TestWorkspaceAssetPersistsAcrossReopen(t *testing.T) {
	ctx := context.Background()
	path := filepath.Join(t.TempDir(), "notespace.db")
	store, err := Open(ctx, path)
	if err != nil {
		t.Fatal(err)
	}
	workspace, err := store.CreateWorkspace(ctx, "Asset durability")
	if err != nil {
		t.Fatal(err)
	}
	want := []byte("image-bytes")
	if _, err := store.PutAsset(ctx, domain.StoredAsset{ID: "image-1", WorkspaceID: workspace.ID, MimeType: "image/png", Data: want}); err != nil {
		t.Fatal(err)
	}
	if err := store.Close(); err != nil {
		t.Fatal(err)
	}

	store, err = Open(ctx, path)
	if err != nil {
		t.Fatal(err)
	}
	defer store.Close()
	got, err := store.GetAsset(ctx, workspace.ID, "image-1")
	if err != nil {
		t.Fatal(err)
	}
	if string(got.Data) != string(want) || got.MimeType != "image/png" {
		t.Fatalf("asset mismatch: %#v", got)
	}
}

func TestIndexedSearchFindsWorkspaceTitle(t *testing.T) {
	ctx := context.Background()
	store, err := Open(ctx, filepath.Join(t.TempDir(), "search-input.db"))
	if err != nil {
		t.Fatal(err)
	}
	defer store.Close()
	workspace, err := store.CreateWorkspace(ctx, "Raft consensus workspace")
	if err != nil {
		t.Fatal(err)
	}
	results, err := store.Search(ctx, "consensus")
	if err != nil {
		t.Fatal(err)
	}
	for _, result := range results {
		if result.Type == "workspace" && result.WorkspaceID == workspace.ID {
			return
		}
	}
	t.Fatalf("expected workspace search result, got %#v", results)
}

func TestWorkspaceExistsAndAssetPutAvoidHydratedReadback(t *testing.T) {
	ctx := context.Background()
	store, err := Open(ctx, filepath.Join(t.TempDir(), "asset-fast-path.db"))
	if err != nil {
		t.Fatal(err)
	}
	defer store.Close()
	workspace, err := store.CreateWorkspace(ctx, "Asset fast path")
	if err != nil {
		t.Fatal(err)
	}
	if _, err := store.PutAsset(ctx, domain.StoredAsset{
		ID: "image-missing", WorkspaceID: "missing", MimeType: "image/png", Data: []byte("payload"),
	}); !errors.Is(err, domain.ErrWorkspaceNotFound) {
		t.Fatalf("missing workspace put error = %v, want ErrWorkspaceNotFound", err)
	}

	stored, err := store.PutAsset(ctx, domain.StoredAsset{
		ID: "image-fast", WorkspaceID: workspace.ID, MimeType: "image/png", Data: []byte("payload"),
	})
	if err != nil {
		t.Fatal(err)
	}
	if stored.ID != "image-fast" || stored.WorkspaceID != workspace.ID || stored.CreatedAt == "" || string(stored.Data) != "payload" {
		t.Fatalf("put result = %#v", stored)
	}
}

func TestIndexedSearchFindsCanvasNoteContent(t *testing.T) {
	ctx := context.Background()
	store, err := Open(ctx, filepath.Join(t.TempDir(), "canvas-note-search.db"))
	if err != nil {
		t.Fatal(err)
	}
	defer store.Close()
	workspace, err := store.CreateWorkspace(ctx, "Canvas note search")
	if err != nil {
		t.Fatal(err)
	}
	canvasData := json.RawMessage(`{"elements":[{"id":"note-element","isDeleted":false,"customData":{"notespaceNote":{"noteId":"note-indexed","instanceId":"instance-indexed"}}}],"appState":{},"files":{}}`)
	created, err := store.CreateNoteInstance(ctx, workspace.ID, domain.CreateNoteInstanceRequest{
		ClientRequestID:       "request-indexed",
		ClientNoteID:          "note-indexed",
		ClientInstanceID:      "instance-indexed",
		ElementID:             "note-element",
		ExpectedCanvasVersion: workspace.CanvasVersion,
		Document:              json.RawMessage(`{"type":"markdown","text":"Indexed canvas note content"}`),
		Canvas:                domain.CanvasSnapshot{Format: "excalidraw", Version: 1, Data: canvasData},
		X:                     0, Y: 0, Width: 320, Height: 180,
	})
	if err != nil {
		t.Fatal(err)
	}
	results, err := store.Search(ctx, "indexed")
	if err != nil {
		t.Fatal(err)
	}
	for _, result := range results {
		if result.Type == "note" && result.NoteID == created.Note.ID {
			if result.WorkspaceID != workspace.ID || result.InstanceID != created.Instance.ID || !strings.Contains(strings.ToLower(result.Excerpt), "indexed canvas note content") {
				t.Fatalf("note search result = %#v", result)
			}
			return
		}
	}
	t.Fatalf("expected indexed canvas note result, got %#v", results)
}
func TestIndexedSearchReindexesUpdatedNoteContent(t *testing.T) {
	ctx := context.Background()
	store, err := Open(ctx, filepath.Join(t.TempDir(), "canvas-note-update-search.db"))
	if err != nil {
		t.Fatal(err)
	}
	defer store.Close()
	workspace, err := store.CreateWorkspace(ctx, "Canvas note reindex")
	if err != nil {
		t.Fatal(err)
	}
	canvasData := json.RawMessage(`{"elements":[{"id":"note-element","isDeleted":false,"customData":{"notespaceNote":{"noteId":"note-reindex","instanceId":"instance-reindex"}}}],"appState":{},"files":{}}`)
	created, err := store.CreateNoteInstance(ctx, workspace.ID, domain.CreateNoteInstanceRequest{
		ClientRequestID:       "request-reindex",
		ClientNoteID:          "note-reindex",
		ClientInstanceID:      "instance-reindex",
		ElementID:             "note-element",
		ExpectedCanvasVersion: workspace.CanvasVersion,
		Document:              json.RawMessage(`{"type":"markdown","text":"Initial body"}`),
		Canvas:                domain.CanvasSnapshot{Format: "excalidraw", Version: 1, Data: canvasData},
		X:                     0, Y: 0, Width: 320, Height: 180,
	})
	if err != nil {
		t.Fatal(err)
	}
	// First search builds the projection for the new Note.
	if _, err := store.Search(ctx, "Initial"); err != nil {
		t.Fatal(err)
	}
	// Content update bumps revision; the next search must reindex and find it.
	updated, err := store.UpdateNote(ctx, created.Note.ID, domain.UpdateNoteRequest{
		ExpectedRevision: created.Note.Revision,
		Document:         json.RawMessage(`{"type":"markdown","text":"Freshly updated body"}`),
	})
	if err != nil {
		t.Fatal(err)
	}
	_ = updated
	results, err := store.Search(ctx, "Freshly")
	if err != nil {
		t.Fatal(err)
	}
	noteHits := 0
	for _, result := range results {
		if result.Type == "note" && result.NoteID == created.Note.ID {
			noteHits++
			if !strings.Contains(strings.ToLower(result.Excerpt), "freshly updated body") {
				t.Fatalf("stale note search excerpt = %#v", result)
			}
		}
	}
	if noteHits != 1 {
		t.Fatalf("updated note search hits = %d, want 1 (%#v)", noteHits, results)
	}
	staleResults, err := store.Search(ctx, "Initial")
	if err != nil {
		t.Fatal(err)
	}
	for _, result := range staleResults {
		if result.Type == "note" && result.NoteID == created.Note.ID {
			t.Fatalf("stale content still indexed after update: %#v", result)
		}
	}
}

func TestIndexedSearchHandlesWorkspaceRenameMoveAndInstanceDelete(t *testing.T) {
	ctx := context.Background()
	store, err := Open(ctx, filepath.Join(t.TempDir(), "canvas-note-move-delete-search.db"))
	if err != nil {
		t.Fatal(err)
	}
	defer store.Close()
	initialCat, err := store.CreateCategory(ctx, "Systems")
	if err != nil {
		t.Fatal(err)
	}
	movedCat, err := store.CreateCategory(ctx, "Storage")
	if err != nil {
		t.Fatal(err)
	}
	workspace, err := store.CreateWorkspace(ctx, "Original title", initialCat.ID)
	if err != nil {
		t.Fatal(err)
	}
	canvasData := json.RawMessage(`{"elements":[{"id":"note-element","isDeleted":false,"customData":{"notespaceNote":{"noteId":"note-move","instanceId":"instance-move"}}}],"appState":{},"files":{}}`)
	created, err := store.CreateNoteInstance(ctx, workspace.ID, domain.CreateNoteInstanceRequest{
		ClientRequestID:       "request-move",
		ClientNoteID:          "note-move",
		ClientInstanceID:      "instance-move",
		ElementID:             "note-element",
		ExpectedCanvasVersion: workspace.CanvasVersion,
		Document:              json.RawMessage(`{"type":"markdown","text":"Distributed consensus invariant"}`),
		Canvas:                domain.CanvasSnapshot{Format: "excalidraw", Version: 1, Data: canvasData},
		X:                     0, Y: 0, Width: 320, Height: 180,
	})
	if err != nil {
		t.Fatal(err)
	}
	if _, err := store.Search(ctx, "consensus"); err != nil {
		t.Fatal(err)
	}

	renamed, err := store.RenameWorkspace(ctx, workspace.ID, "Renamed workspace", &workspace.Title)
	if err != nil {
		t.Fatal(err)
	}
	afterRename, err := store.Search(ctx, "consensus")
	if err != nil {
		t.Fatal(err)
	}
	foundRenamed := false
	for _, result := range afterRename {
		if result.Type == "note" && result.NoteID == created.Note.ID {
			foundRenamed = true
			if result.WorkspaceTitle != renamed.Title {
				t.Fatalf("note workspace title after rename = %q, want %q", result.WorkspaceTitle, renamed.Title)
			}
		}
	}
	if !foundRenamed {
		t.Fatalf("note vanished from search after workspace rename: %#v", afterRename)
	}

	moved, err := store.MoveWorkspace(ctx, workspace.ID, movedCat.ID, &initialCat.ID)
	if err != nil {
		t.Fatal(err)
	}
	afterMove, err := store.Search(ctx, "consensus")
	if err != nil {
		t.Fatal(err)
	}
	foundMoved := false
	for _, result := range afterMove {
		if result.Type == "note" && result.NoteID == created.Note.ID {
			foundMoved = true
			if result.CategoryID != movedCat.ID || result.CategoryTitle != movedCat.Title {
				t.Fatalf("note category after move = (%q, %q), want (%q, %q)", result.CategoryID, result.CategoryTitle, movedCat.ID, movedCat.Title)
			}
		}
	}
	if !foundMoved {
		t.Fatalf("note vanished from search after workspace move: %#v", afterMove)
	}

	emptyCanvas := domain.CanvasSnapshot{
		Format:  "excalidraw",
		Version: 1,
		Data:    json.RawMessage(`{"elements":[{"id":"note-element","isDeleted":true,"customData":{"notespaceNote":{"noteId":"note-move","instanceId":"instance-move"}}}],"appState":{},"files":{}}`),
	}
	if _, err := store.DeleteNoteInstance(ctx, workspace.ID, created.Instance.ID, domain.DeleteNoteInstanceRequest{
		ExpectedCanvasVersion: moved.CanvasVersion,
		Canvas:                emptyCanvas,
	}); err != nil {
		t.Fatal(err)
	}
	for _, attempt := range []string{"first", "second"} {
		afterDelete, err := store.Search(ctx, "consensus")
		if err != nil {
			t.Fatal(err)
		}
		deleteHits := 0
		for _, result := range afterDelete {
			if result.Type == "note" && result.NoteID == created.Note.ID {
				deleteHits++
				if result.InstanceID != "" || result.WorkspaceID != "" {
					t.Fatalf("deleted note instance still returned by %s search: %#v", attempt, result)
				}
			}
		}
		if deleteHits != 1 {
			t.Fatalf("unplaced note hits on %s search after deleting last instance = %d, want 1 (%#v)", attempt, deleteHits, afterDelete)
		}
	}
}

func TestIndexedSearchExcludesMarkdownSyntaxAndReferenceIDs(t *testing.T) {
	ctx := context.Background()
	store, err := Open(ctx, filepath.Join(t.TempDir(), "canvas-note-clean-search.db"))
	if err != nil {
		t.Fatal(err)
	}
	defer store.Close()

	workspace, err := store.CreateWorkspace(ctx, "Clean Index Workspace")
	if err != nil {
		t.Fatal(err)
	}
	canvasData := json.RawMessage(`{"elements":[{"id":"el-clean","isDeleted":false,"customData":{"notespaceNote":{"noteId":"note-clean","instanceId":"inst-clean"}}}],"appState":{},"files":{}}`)
	doc := mdDoc("# Quarterly Architecture Review ^550e8400-e29b-41d4-a716-446655440000\n\n" +
		"Ship [vector search](https://internal.example/hiddenpath) ^660e8400-e29b-41d4-a716-446655440001\n\n" +
		"> [!warning]\n> Keep latency predictable\n\n" +
		"![Topology diagram](/api/workspaces/w1/assets/asset-secret)")
	if _, err := store.CreateNoteInstance(ctx, workspace.ID, domain.CreateNoteInstanceRequest{
		ClientRequestID:       "req-clean",
		ClientNoteID:          "note-clean",
		ClientInstanceID:      "inst-clean",
		ElementID:             "el-clean",
		ExpectedCanvasVersion: workspace.CanvasVersion,
		Document:              doc,
		Canvas:                domain.CanvasSnapshot{Format: "excalidraw", Version: 1, Data: canvasData},
		X:                     0, Y: 0, Width: 320, Height: 180,
	}); err != nil {
		t.Fatal(err)
	}
	for _, noise := range []string{"warning", "https", "550e8400", "660e8400", "hiddenpath", "asset", "Canvas"} {
		results, err := store.Search(ctx, noise)
		if err != nil {
			t.Fatalf("search(%q) error: %v", noise, err)
		}
		for _, r := range results {
			if r.Type == "note" && r.NoteID == "note-clean" {
				t.Fatalf("noise query %q falsely matched note: %#v", noise, r)
			}
		}
	}

	results, err := store.Search(ctx, "vector")
	if err != nil {
		t.Fatal(err)
	}
	var hit *domain.SearchResult
	for i := range results {
		if results[i].Type == "note" && results[i].NoteID == "note-clean" {
			hit = &results[i]
			break
		}
	}
	if hit == nil {
		t.Fatalf("expected note match for 'vector', got %#v", results)
	}
	wantExcerpt := "Quarterly Architecture Review\nShip vector search\nKeep latency predictable\nTopology diagram"
	if hit.Excerpt != wantExcerpt {
		t.Fatalf("Excerpt = %q, want %q", hit.Excerpt, wantExcerpt)
	}

	var storedNoteTitle string
	if err := store.db.Writer().QueryRowContext(ctx, `SELECT note_title FROM workspace_search WHERE type='note' AND note_id='note-clean'`).Scan(&storedNoteTitle); err != nil {
		t.Fatal(err)
	}
	if storedNoteTitle != "Quarterly Architecture Review" {
		t.Fatalf("workspace_search.note_title = %q, want %q", storedNoteTitle, "Quarterly Architecture Review")
	}
}
