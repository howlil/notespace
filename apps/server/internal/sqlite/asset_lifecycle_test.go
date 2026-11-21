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
	if _, err := store.PutAsset(ctx, asset.Stored{ID: "svg", WorkspaceID: workspace.ID, MimeType: "image/svg+xml", Data: []byte("<svg/>")}); !errors.Is(err, asset.ErrInvalid) {
		t.Fatalf("SVG storage error = %v, want invalid (SVG can run script in the same origin)", err)
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

func TestCanvasNoteImageSurvivesOriginWorkspaceTrashAndPermanentDelete(t *testing.T) {
	ctx := context.Background()
	store, err := Open(ctx, filepath.Join(t.TempDir(), "shared-note-asset.db"))
	if err != nil {
		t.Fatal(err)
	}
	defer store.Close()

	service := workspacepkg.NewService(store)
	origin, err := service.Create(ctx, "Origin workspace")
	if err != nil {
		t.Fatal(err)
	}
	linked, err := service.Create(ctx, "Linked workspace")
	if err != nil {
		t.Fatal(err)
	}
	if _, err := store.PutAsset(ctx, asset.Stored{ID: "shared-img", WorkspaceID: origin.ID, MimeType: "image/png", Data: []byte("shared-png")}); err != nil {
		t.Fatal(err)
	}
	document := json.RawMessage(`{"type":"doc","content":[{"type":"noteImage","attrs":{"src":"/api/workspaces/` + origin.ID + `/assets/shared-img","assetId":"shared-img","alt":"shared"}}]}`)
	originCanvas := json.RawMessage(`{"elements":[{"id":"el-origin","isDeleted":false,"customData":{"notespaceNote":{"noteId":"shared-note","instanceId":"inst-origin"}}}],"appState":{},"files":{}}`)
	created, err := store.CreateNoteInstance(ctx, origin.ID, note.CreateInstanceRequest{
		ClientRequestID: "req-origin", ClientNoteID: "shared-note", ClientInstanceID: "inst-origin", ElementID: "el-origin",
		ExpectedCanvasVersion: origin.CanvasVersion, Document: document,
		Canvas: note.CanvasSnapshot{Format: "excalidraw", Version: 1, Data: originCanvas}, X: 0, Y: 0, Width: 320, Height: 180,
	})
	if err != nil {
		t.Fatal(err)
	}
	linkedCanvas := json.RawMessage(`{"elements":[{"id":"el-linked","isDeleted":false,"customData":{"notespaceNote":{"noteId":"shared-note","instanceId":"inst-linked"}}}],"appState":{},"files":{}}`)
	if _, err := store.CreateNoteInstance(ctx, linked.ID, note.CreateInstanceRequest{
		ClientRequestID: "req-linked", ClientNoteID: "unused", ClientInstanceID: "inst-linked", ExistingNoteID: created.Note.ID, ElementID: "el-linked",
		ExpectedCanvasVersion: linked.CanvasVersion,
		Canvas:                note.CanvasSnapshot{Format: "excalidraw", Version: 1, Data: linkedCanvas}, X: 0, Y: 0, Width: 320, Height: 180,
	}); err != nil {
		t.Fatal(err)
	}

	originLatest, err := store.Get(ctx, origin.ID)
	if err != nil {
		t.Fatal(err)
	}
	if err := store.TrashWorkspace(ctx, origin.ID, originLatest.Version); err != nil {
		t.Fatal(err)
	}
	// While origin is in Trash, the Note image referenced via origin.ID must remain readable.
	gotWhileTrashed, err := store.GetAsset(ctx, origin.ID, "shared-img")
	if err != nil || string(gotWhileTrashed.Data) != "shared-png" {
		t.Fatalf("note image while origin workspace in Trash = %+v, err=%v", gotWhileTrashed, err)
	}

	// Permanently deleting the trashed origin workspace re-homes the shared Note asset so linked workspaces keep it.
	if err := store.DeleteTrashedWorkspace(ctx, origin.ID); err != nil {
		t.Fatal(err)
	}
	gotAfterPurge, err := store.GetAsset(ctx, origin.ID, "shared-img")
	if err != nil || string(gotAfterPurge.Data) != "shared-png" {
		t.Fatalf("note image after origin workspace permanently deleted = %+v, err=%v", gotAfterPurge, err)
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
	state, err := service.UpdateCanvas(ctx, workspace.ID, workspacepkg.CanvasUpdate{Canvas: canvas, Version: workspace.CanvasVersion})
	if err != nil {
		t.Fatal(err)
	}
	if _, err := store.PutAsset(ctx, asset.Stored{ID: "file-1", WorkspaceID: workspace.ID, MimeType: "image/png", Data: []byte("canvas-image")}); err != nil {
		t.Fatal(err)
	}

	emptyCanvas := workspacepkg.Snapshot{Format: "excalidraw", Version: 1, Data: json.RawMessage(`{"elements":[],"appState":{},"files":{}}`)}
	if _, err := service.UpdateCanvas(ctx, workspace.ID, workspacepkg.CanvasUpdate{Canvas: emptyCanvas, Version: state.Version}); err != nil {
		t.Fatal(err)
	}
	if _, err := store.GetAsset(ctx, workspace.ID, "file-1"); !errors.Is(err, asset.ErrNotFound) {
		t.Fatalf("removed canvas image blob still exists: %v", err)
	}
}

func TestEraserIconAssetCanBeReinsertedAfterCanvasDeletionTombstone(t *testing.T) {
	ctx := context.Background()
	store, err := Open(ctx, filepath.Join(t.TempDir(), "eraser-icon-tombstone.db"))
	if err != nil {
		t.Fatal(err)
	}
	defer store.Close()
	service := workspacepkg.NewService(store)
	workspace, err := service.Create(ctx, "Diagram icons")
	if err != nil {
		t.Fatal(err)
	}

	if _, err := store.PutAsset(ctx, asset.Stored{ID: "eraser-icon-docker", WorkspaceID: workspace.ID, MimeType: "image/webp", Data: []byte("RIFFxxxxWEBPVP8 ")}); err != nil {
		t.Fatal(err)
	}
	withIcon := workspacepkg.Snapshot{Format: "excalidraw", Version: 1, Data: json.RawMessage(`{"elements":[{"id":"icon-1","type":"image","fileId":"eraser-icon-docker"}],"appState":{},"files":{}}`)}
	state, err := service.UpdateCanvas(ctx, workspace.ID, workspacepkg.CanvasUpdate{Canvas: withIcon, Version: workspace.CanvasVersion})
	if err != nil {
		t.Fatal(err)
	}

	emptyCanvas := workspacepkg.Snapshot{Format: "excalidraw", Version: 1, Data: json.RawMessage(`{"elements":[],"appState":{},"files":{}}`)}
	if _, err := service.UpdateCanvas(ctx, workspace.ID, workspacepkg.CanvasUpdate{Canvas: emptyCanvas, Version: state.Version}); err != nil {
		t.Fatal(err)
	}
	if _, err := store.GetAsset(ctx, workspace.ID, "eraser-icon-docker"); !errors.Is(err, asset.ErrNotFound) {
		t.Fatalf("expected removed icon asset to be cleaned up, got err=%v", err)
	}

	// Re-inserting a diagram with the same deterministic catalog icon ID must clear the tombstone and succeed.
	if _, err := store.PutAsset(ctx, asset.Stored{ID: "eraser-icon-docker", WorkspaceID: workspace.ID, MimeType: "image/webp", Data: []byte("RIFFxxxxWEBPVP8 ")}); err != nil {
		t.Fatalf("re-uploading deterministic eraser-icon asset after canvas removal failed: %v", err)
	}
}
