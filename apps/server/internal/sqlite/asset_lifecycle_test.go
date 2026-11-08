package sqlite

import (
	"context"
	"encoding/json"
	"errors"
	"github.com/howlil/notespace/apps/server/internal/asset"
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
