package sqlite

import (
	"context"
	"encoding/json"
	workspacepkg "github.com/howlil/notespace/apps/server/internal/workspace"
	"path/filepath"
	"testing"
)

func granularCanvas(id string) workspacepkg.Snapshot {
	data, _ := json.Marshal(map[string]any{
		"elements": []any{map[string]any{"id": id, "type": "rectangle"}},
		"appState": map[string]any{},
		"files":    map[string]any{},
	})
	return workspacepkg.Snapshot{Format: "excalidraw", Version: 1, Data: data}
}

func TestCanvasDeletionTombstonesDoNotAppearAsVisibleContent(t *testing.T) {
	ctx := context.Background()
	store, err := Open(ctx, filepath.Join(t.TempDir(), "canvas-visible.db"))
	if err != nil {
		t.Fatal(err)
	}
	defer store.Close()
	service := workspacepkg.NewService(store)
	created, err := service.Create(ctx, "Delete the last visible shape")
	if err != nil {
		t.Fatal(err)
	}
	scene := granularCanvas("deleted-shape")
	scene.Data, _ = json.Marshal(map[string]any{
		"elements": []any{map[string]any{"id": "deleted-shape", "type": "rectangle", "isDeleted": true}},
		"appState": map[string]any{}, "files": map[string]any{},
	})
	if _, err := service.UpdateCanvas(ctx, created.ID, workspacepkg.CanvasUpdate{Canvas: scene, Version: created.CanvasVersion}); err != nil {
		t.Fatal(err)
	}
	page, err := service.ListWorkspaces(ctx, workspacepkg.WorkspaceQuery{Limit: 10, HasCanvas: true})
	if err != nil || page.Total != 0 {
		t.Fatalf("tombstone marked Canvas nonempty: total=%d err=%v", page.Total, err)
	}
}
