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
