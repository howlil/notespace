package persistence

import (
	"context"
	"encoding/json"
	"errors"
	"path/filepath"
	"testing"

	"github.com/howlil/notespace/apps/server/internal/project"
)

func granularDocument(text string) project.Snapshot {
	data, _ := json.Marshal(map[string]any{
		"type": "doc",
		"content": []any{map[string]any{
			"type":    "paragraph",
			"content": []any{map[string]any{"type": "text", "text": text}},
		}},
	})
	return project.Snapshot{Format: "tiptap", Version: 1, Data: data}
}

func granularCanvas(id string) project.Snapshot {
	data, _ := json.Marshal(map[string]any{
		"elements": []any{map[string]any{"id": id, "type": "rectangle"}},
		"appState": map[string]any{},
		"files":    map[string]any{},
	})
	return project.Snapshot{Format: "excalidraw", Version: 1, Data: data}
}

func TestGranularWorkspaceStateHasIndependentVersions(t *testing.T) {
	ctx := context.Background()
	store, err := Open(ctx, filepath.Join(t.TempDir(), "granular.db"))
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = store.Close() })

	service := project.Service{Store: store}
	workspace, err := service.Create(ctx, "Granular")
	if err != nil {
		t.Fatal(err)
	}
	if workspace.CanvasVersion != 1 {
		t.Fatalf("initial canvas version = %d, want 1", workspace.CanvasVersion)
	}
	if len(workspace.Notes) != 1 || workspace.Notes[0].Version != 1 {
		t.Fatalf("initial notes = %#v, want one versioned note", workspace.Notes)
	}

	created, err := service.CreateNote(ctx, workspace.ID, project.NoteCreate{
		ID: "note-2", Title: "Second", Document: granularDocument("second"),
	})
	if err != nil {
		t.Fatal(err)
	}
	if created.Version != 1 {
		t.Fatalf("created note version = %d, want 1", created.Version)
	}

	updated, err := service.UpdateNote(ctx, workspace.ID, created.ID, project.NoteUpdate{
		Title: "Second updated", Document: granularDocument("updated"), Version: created.Version,
	})
	if err != nil {
		t.Fatal(err)
	}
	if updated.Version != 2 {
		t.Fatalf("updated note version = %d, want 2", updated.Version)
	}

	if _, err := service.UpdateNote(ctx, workspace.ID, created.ID, project.NoteUpdate{
		Title: "stale", Document: granularDocument("stale"), Version: created.Version,
	}); !errors.Is(err, project.ErrConflict) {
		t.Fatalf("stale note update error = %v, want conflict", err)
	}

	canvas, err := service.UpdateCanvas(ctx, workspace.ID, project.CanvasUpdate{
		Canvas: granularCanvas("shape-1"), Version: workspace.CanvasVersion,
	})
	if err != nil {
		t.Fatal(err)
	}
	if canvas.Version != 2 {
		t.Fatalf("canvas version = %d, want 2", canvas.Version)
	}
	if _, err := service.UpdateCanvas(ctx, workspace.ID, project.CanvasUpdate{
		Canvas: granularCanvas("stale"), Version: workspace.CanvasVersion,
	}); !errors.Is(err, project.ErrConflict) {
		t.Fatalf("stale canvas update error = %v, want conflict", err)
	}

	if err := service.DeleteNote(ctx, workspace.ID, created.ID, created.Version); !errors.Is(err, project.ErrConflict) {
		t.Fatalf("stale note delete error = %v, want conflict", err)
	}
	if err := service.DeleteNote(ctx, workspace.ID, created.ID, updated.Version); err != nil {
		t.Fatal(err)
	}

	reloaded, err := service.Get(ctx, workspace.ID)
	if err != nil {
		t.Fatal(err)
	}
	if len(reloaded.Notes) != 1 {
		t.Fatalf("note count after delete = %d, want 1", len(reloaded.Notes))
	}
	if reloaded.CanvasVersion != canvas.Version {
		t.Fatalf("reloaded canvas version = %d, want %d", reloaded.CanvasVersion, canvas.Version)
	}
	if string(reloaded.Canvas.Data) != string(canvas.Canvas.Data) {
		t.Fatalf("reloaded canvas = %s, want %s", reloaded.Canvas.Data, canvas.Canvas.Data)
	}
}
