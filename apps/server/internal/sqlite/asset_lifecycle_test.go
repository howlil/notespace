package sqlite

import (
	"context"
	"encoding/json"
	"errors"
	"github.com/howlil/notespace/apps/server/internal/asset"
	"github.com/howlil/notespace/apps/server/internal/note"
	workspacepkg "github.com/howlil/notespace/apps/server/internal/workspace"
	"path/filepath"
	"testing"
)

func TestPutAssetRejectsNonImageMimeAtStorageBoundary(t *testing.T) {
	ctx := context.Background()
	store, err := Open(ctx, filepath.Join(t.TempDir(), "invalid-asset.db"))
	if err != nil {
		t.Fatal(err)
	}
	defer store.Close()
	workspace, err := workspacepkg.NewService(store).Create(ctx, "Asset validation")
	if err != nil {
		t.Fatal(err)
	}

	if _, err := store.PutAsset(ctx, asset.Stored{ID: "html", WorkspaceID: workspace.ID, MimeType: "text/html", Data: []byte("<html>")}); !errors.Is(err, asset.ErrInvalid) {
		t.Fatalf("non-image storage error = %v, want invalid", err)
	}
	if _, err := store.PutAsset(ctx, asset.Stored{ID: "svg", WorkspaceID: workspace.ID, MimeType: "image/svg+xml", Data: []byte("<svg/>")}); err != nil {
		t.Fatalf("image MIME storage error = %v", err)
	}
}

func TestCanvasNoteImageAssetFollowsCanonicalDocument(t *testing.T) {
	ctx := context.Background()
	store, err := Open(ctx, filepath.Join(t.TempDir(), "canvas-note-asset.db"))
	if err != nil {
		t.Fatal(err)
	}
	defer store.Close()
	workspace, err := workspacepkg.NewService(store).Create(ctx, "Canvas note image")
	if err != nil {
		t.Fatal(err)
	}
	if _, err := store.PutAsset(ctx, asset.Stored{ID: "note-image", WorkspaceID: workspace.ID, MimeType: "image/png", Data: []byte("png")}); err != nil {
		t.Fatal(err)
	}
	canvasData := json.RawMessage(`{"elements":[{"id":"note-image-element","isDeleted":false,"customData":{"notespaceNote":{"noteId":"note-image-doc","instanceId":"note-image-instance"}}}],"appState":{},"files":{}}`)
	document := json.RawMessage(`{"type":"doc","content":[{"type":"noteImage","attrs":{"src":"/api/workspaces/` + workspace.ID + `/assets/note-image","assetId":"note-image","alt":"photo"}}]}`)
	created, err := store.CreateNoteInstance(ctx, workspace.ID, note.CreateInstanceRequest{
		ClientRequestID: "note-image-request", ClientNoteID: "note-image-doc", ClientInstanceID: "note-image-instance", ElementID: "note-image-element",
		ExpectedCanvasVersion: workspace.CanvasVersion, Document: document,
		Canvas: note.CanvasSnapshot{Format: "excalidraw", Version: 1, Data: canvasData}, X: 0, Y: 0, Width: 320, Height: 180,
	})
	if err != nil {
		t.Fatal(err)
	}
	if _, err := store.GetAsset(ctx, workspace.ID, "note-image"); err != nil {
		t.Fatalf("note image asset was not retained after create: %v", err)
	}
	emptyCanvas := note.CanvasSnapshot{Format: "excalidraw", Version: 1, Data: json.RawMessage(`{"elements":[],"appState":{},"files":{}}`)}
	if _, err := store.DeleteNoteInstance(ctx, workspace.ID, created.Instance.ID, note.DeleteInstanceRequest{
		ExpectedCanvasVersion: created.Canvas.Version,
		Canvas:                emptyCanvas,
	}); err != nil {
		t.Fatalf("delete note instance: %v", err)
	}
	if _, err := store.GetAsset(ctx, workspace.ID, "note-image"); err != nil {
		t.Fatalf("note image asset was deleted when removing an instance even though the canonical Note still references it: %v", err)
	}
	if _, err := store.UpdateNote(ctx, created.Note.ID, note.UpdateRequest{Document: json.RawMessage(`{"type":"doc","content":[]}`), ExpectedRevision: created.Note.Revision}); err != nil {
		t.Fatal(err)
	}
	if _, err := store.GetAsset(ctx, workspace.ID, "note-image"); !errors.Is(err, asset.ErrNotFound) {
		t.Fatalf("removed note image asset still exists: %v", err)
	}
}

func TestCanvasFileIDOwnsAssetBlob(t *testing.T) {
	ctx := context.Background()
	store, err := Open(ctx, filepath.Join(t.TempDir(), "canvas-asset.db"))
	if err != nil {
		t.Fatal(err)
	}
	defer store.Close()
	service := workspacepkg.NewService(store)
	workspace, err := service.Create(ctx, "Canvas image")
	if err != nil {
		t.Fatal(err)
	}
	canvas := workspacepkg.Snapshot{Format: "excalidraw", Version: 1, Data: json.RawMessage(`{"elements":[{"id":"el-1","type":"image","fileId":"file-1"}],"appState":{},"files":{}}`)}
	workspace, err = service.Update(ctx, workspace.ID, workspacepkg.Update{Title: workspace.Title, Document: workspace.Document, Notes: workspace.Notes, Canvas: canvas, References: workspace.References, SplitRatio: workspace.SplitRatio, Version: workspace.Version})
	if err != nil {
		t.Fatal(err)
	}
	if _, err := store.PutAsset(ctx, asset.Stored{ID: "file-1", WorkspaceID: workspace.ID, MimeType: "image/png", Data: []byte("canvas-image")}); err != nil {
		t.Fatal(err)
	}

	emptyCanvas := workspacepkg.Snapshot{Format: "excalidraw", Version: 1, Data: json.RawMessage(`{"elements":[],"appState":{},"files":{}}`)}
	if _, err := service.Update(ctx, workspace.ID, workspacepkg.Update{Title: workspace.Title, Document: workspace.Document, Notes: workspace.Notes, Canvas: emptyCanvas, References: workspace.References, SplitRatio: workspace.SplitRatio, Version: workspace.Version}); err != nil {
		t.Fatal(err)
	}
	if _, err := store.GetAsset(ctx, workspace.ID, "file-1"); !errors.Is(err, asset.ErrNotFound) {
		t.Fatalf("removed canvas image blob still exists: %v", err)
	}
}
