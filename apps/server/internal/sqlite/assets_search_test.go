package sqlite

import (
	"context"
	"encoding/json"
	"github.com/howlil/notespace/apps/server/internal/asset"
	"github.com/howlil/notespace/apps/server/internal/note"
	workspacepkg "github.com/howlil/notespace/apps/server/internal/workspace"
	"path/filepath"
	"strings"
	"testing"
)

func TestWorkspaceAssetPersistsAcrossReopen(t *testing.T) {
	ctx := context.Background()
	path := filepath.Join(t.TempDir(), "notespace.db")
	store, err := Open(ctx, path)
	if err != nil {
		t.Fatal(err)
	}
	workspace, err := workspacepkg.NewService(store).Create(ctx, "Asset durability")
	if err != nil {
		t.Fatal(err)
	}
	want := []byte("image-bytes")
	if _, err := store.PutAsset(ctx, asset.Stored{ID: "image-1", WorkspaceID: workspace.ID, MimeType: "image/png", Data: want}); err != nil {
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
	service := workspacepkg.NewService(NewIndexedWorkspaceStore(store))
	workspace, err := service.Create(ctx, "Raft consensus workspace")
	if err != nil {
		t.Fatal(err)
	}
	results, err := service.Search(ctx, "consensus")
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
	workspace, err := workspacepkg.NewService(store).Create(ctx, "Asset fast path")
	if err != nil {
		t.Fatal(err)
	}
	exists, err := store.WorkspaceExists(ctx, workspace.ID)
	if err != nil || !exists {
		t.Fatalf("workspace exists = %v err=%v", exists, err)
	}
	exists, err = store.WorkspaceExists(ctx, "missing")
	if err != nil || exists {
		t.Fatalf("missing workspace exists = %v err=%v", exists, err)
	}

	stored, err := store.PutAsset(ctx, asset.Stored{
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
	workspace, err := workspacepkg.NewService(store).Create(ctx, "Canvas note search")
	if err != nil {
		t.Fatal(err)
	}
	canvasData := json.RawMessage(`{"elements":[{"id":"note-element","isDeleted":false,"customData":{"notespaceNote":{"noteId":"note-indexed","instanceId":"instance-indexed"}}}],"appState":{},"files":{}}`)
	created, err := store.CreateNoteInstance(ctx, workspace.ID, note.CreateInstanceRequest{
		ClientRequestID:       "request-indexed",
		ClientNoteID:          "note-indexed",
		ClientInstanceID:      "instance-indexed",
		ElementID:             "note-element",
		ExpectedCanvasVersion: workspace.CanvasVersion,
		Document:              json.RawMessage(`{"type":"doc","content":[{"type":"paragraph","content":[{"type":"text","text":"Indexed canvas note content"}]}]}`),
		Canvas:                note.CanvasSnapshot{Format: "excalidraw", Version: 1, Data: canvasData},
		X:                     0, Y: 0, Width: 320, Height: 180,
	})
	if err != nil {
		t.Fatal(err)
	}
	results, err := workspacepkg.NewService(NewIndexedWorkspaceStore(store)).Search(ctx, "indexed")
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
	workspace, err := workspacepkg.NewService(store).Create(ctx, "Canvas note reindex")
	if err != nil {
		t.Fatal(err)
	}
	canvasData := json.RawMessage(`{"elements":[{"id":"note-element","isDeleted":false,"customData":{"notespaceNote":{"noteId":"note-reindex","instanceId":"instance-reindex"}}}],"appState":{},"files":{}}`)
	created, err := store.CreateNoteInstance(ctx, workspace.ID, note.CreateInstanceRequest{
		ClientRequestID:       "request-reindex",
		ClientNoteID:          "note-reindex",
		ClientInstanceID:      "instance-reindex",
		ElementID:             "note-element",
		ExpectedCanvasVersion: workspace.CanvasVersion,
		Document:              json.RawMessage(`{"type":"doc","content":[{"type":"paragraph","content":[{"type":"text","text":"Initial body"}]}]}`),
		Canvas:                note.CanvasSnapshot{Format: "excalidraw", Version: 1, Data: canvasData},
		X:                     0, Y: 0, Width: 320, Height: 180,
	})
	if err != nil {
		t.Fatal(err)
	}

	indexed := workspacepkg.NewService(NewIndexedWorkspaceStore(store))
	// First search builds the projection for the new Note.
	if _, err := indexed.Search(ctx, "Initial"); err != nil {
		t.Fatal(err)
	}
	// Content update bumps revision; the next search must reindex and find it.
	updated, err := store.UpdateNote(ctx, created.Note.ID, note.UpdateRequest{
		ExpectedRevision: created.Note.Revision,
		Document:         json.RawMessage(`{"type":"doc","content":[{"type":"paragraph","content":[{"type":"text","text":"Freshly updated body"}]}]}`),
	})
	if err != nil {
		t.Fatal(err)
	}
	_ = updated
	results, err := indexed.Search(ctx, "Freshly")
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
	staleResults, err := indexed.Search(ctx, "Initial")
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
	indexed := workspacepkg.NewService(NewIndexedWorkspaceStore(store))
	initialCat, err := indexed.CreateCategory(ctx, "Systems")
	if err != nil {
		t.Fatal(err)
	}
	movedCat, err := indexed.CreateCategory(ctx, "Storage")
	if err != nil {
		t.Fatal(err)
	}
	workspace, err := indexed.Create(ctx, "Original title", initialCat.ID)
	if err != nil {
		t.Fatal(err)
	}
	canvasData := json.RawMessage(`{"elements":[{"id":"note-element","isDeleted":false,"customData":{"notespaceNote":{"noteId":"note-move","instanceId":"instance-move"}}}],"appState":{},"files":{}}`)
	created, err := store.CreateNoteInstance(ctx, workspace.ID, note.CreateInstanceRequest{
		ClientRequestID:       "request-move",
		ClientNoteID:          "note-move",
		ClientInstanceID:      "instance-move",
		ElementID:             "note-element",
		ExpectedCanvasVersion: workspace.CanvasVersion,
		Document:              json.RawMessage(`{"type":"doc","content":[{"type":"paragraph","content":[{"type":"text","text":"Distributed consensus invariant"}]}]}`),
		Canvas:                note.CanvasSnapshot{Format: "excalidraw", Version: 1, Data: canvasData},
		X:                     0, Y: 0, Width: 320, Height: 180,
	})
	if err != nil {
		t.Fatal(err)
	}

	if _, err := indexed.Search(ctx, "consensus"); err != nil {
		t.Fatal(err)
	}

	renamed, err := indexed.Rename(ctx, workspace.ID, "Renamed workspace", workspace.Title)
	if err != nil {
		t.Fatal(err)
	}
	afterRename, err := indexed.Search(ctx, "consensus")
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

	moved, err := indexed.Move(ctx, workspace.ID, movedCat.ID, initialCat.ID)
	if err != nil {
		t.Fatal(err)
	}
	afterMove, err := indexed.Search(ctx, "consensus")
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

	emptyCanvas := note.CanvasSnapshot{
		Format:  "excalidraw",
		Version: 1,
		Data:    json.RawMessage(`{"elements":[{"id":"note-element","isDeleted":true,"customData":{"notespaceNote":{"noteId":"note-move","instanceId":"instance-move"}}}],"appState":{},"files":{}}`),
	}
	if _, err := store.DeleteNoteInstance(ctx, workspace.ID, created.Instance.ID, note.DeleteInstanceRequest{
		ExpectedCanvasVersion: moved.CanvasVersion,
		Canvas:                emptyCanvas,
	}); err != nil {
		t.Fatal(err)
	}
	for _, attempt := range []string{"first", "second"} {
		afterDelete, err := indexed.Search(ctx, "consensus")
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

func TestIndexedSearchExcludesProseMirrorMetadataAndUUIDs(t *testing.T) {
	ctx := context.Background()
	store, err := Open(ctx, filepath.Join(t.TempDir(), "canvas-note-clean-search.db"))
	if err != nil {
		t.Fatal(err)
	}
	defer store.Close()

	workspace, err := workspacepkg.NewService(store).Create(ctx, "Clean Index Workspace")
	if err != nil {
		t.Fatal(err)
	}
	canvasData := json.RawMessage(`{"elements":[{"id":"el-clean","isDeleted":false,"customData":{"notespaceNote":{"noteId":"note-clean","instanceId":"inst-clean"}}}],"appState":{},"files":{}}`)
	doc := json.RawMessage(`{
		"type":"doc",
		"content":[
			{"type":"heading","attrs":{"level":1,"blockId":"550e8400-e29b-41d4-a716-446655440000"},"content":[{"type":"text","text":"Quarterly Architecture Review"}]},
			{"type":"paragraph","attrs":{"blockId":"660e8400-e29b-41d4-a716-446655440001"},"content":[
				{"type":"text","text":"Ship "},
				{"type":"text","text":"vector search","marks":[{"type":"link","attrs":{"href":"https://internal.example/hiddenpath"}}]}
			]},
			{"type":"noteCallout","attrs":{"tone":"warning","blockId":"770e8400-e29b-41d4-a716-446655440002"},"content":[
				{"type":"paragraph","content":[{"type":"text","text":"Keep latency predictable"}]}
			]},
			{"type":"noteImage","attrs":{"src":"/api/workspaces/w1/assets/asset-secret","assetId":"asset-secret","alt":"Topology diagram"}}
		]
	}`)
	if _, err := store.CreateNoteInstance(ctx, workspace.ID, note.CreateInstanceRequest{
		ClientRequestID:       "req-clean",
		ClientNoteID:          "note-clean",
		ClientInstanceID:      "inst-clean",
		ElementID:             "el-clean",
		ExpectedCanvasVersion: workspace.CanvasVersion,
		Document:              doc,
		Canvas:                note.CanvasSnapshot{Format: "excalidraw", Version: 1, Data: canvasData},
		X:                     0, Y: 0, Width: 320, Height: 180,
	}); err != nil {
		t.Fatal(err)
	}

	indexed := workspacepkg.NewService(NewIndexedWorkspaceStore(store))
	for _, noise := range []string{"paragraph", "doc", "noteCallout", "550e8400", "660e8400", "hiddenpath", "asset", "Canvas"} {
		results, err := indexed.Search(ctx, noise)
		if err != nil {
			t.Fatalf("search(%q) error: %v", noise, err)
		}
		for _, r := range results {
			if r.Type == "note" && r.NoteID == "note-clean" {
				t.Fatalf("noise query %q falsely matched note: %#v", noise, r)
			}
		}
	}

	results, err := indexed.Search(ctx, "vector")
	if err != nil {
		t.Fatal(err)
	}
	var hit *workspacepkg.SearchResult
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
	if err := store.db.QueryRowContext(ctx, `SELECT note_title FROM workspace_search WHERE type='note' AND note_id='note-clean'`).Scan(&storedNoteTitle); err != nil {
		t.Fatal(err)
	}
	if storedNoteTitle != "Quarterly Architecture Review" {
		t.Fatalf("workspace_search.note_title = %q, want %q", storedNoteTitle, "Quarterly Architecture Review")
	}
}
