package sqlite

import (
	"context"
	"encoding/json"
	"errors"
	"path/filepath"
	"testing"

	"github.com/howlil/notespace/apps/server/internal/workspace"
)

func granularDocument(text string) workspace.Snapshot {
	data, _ := json.Marshal(map[string]any{
		"type": "doc",
		"content": []any{map[string]any{
			"type":    "paragraph",
			"content": []any{map[string]any{"type": "text", "text": text}},
		}},
	})
	return workspace.Snapshot{Format: "tiptap", Version: 1, Data: data}
}

func granularCanvas(id string) workspace.Snapshot {
	data, _ := json.Marshal(map[string]any{
		"elements": []any{map[string]any{"id": id, "type": "rectangle"}},
		"appState": map[string]any{},
		"files":    map[string]any{},
	})
	return workspace.Snapshot{Format: "excalidraw", Version: 1, Data: data}
}

func TestGranularWorkspaceStateHasIndependentVersions(t *testing.T) {
	ctx := context.Background()
	store, err := Open(ctx, filepath.Join(t.TempDir(), "granular.db"))
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = store.Close() })

	service := workspace.Service{Store: store}
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

	created, err := service.CreateNote(ctx, workspace.ID, workspace.NoteCreate{
		ID: "note-2", Title: "Second", Document: granularDocument("second"),
	})
	if err != nil {
		t.Fatal(err)
	}
	if created.Version != 1 {
		t.Fatalf("created note version = %d, want 1", created.Version)
	}

	updated, err := service.UpdateNote(ctx, workspace.ID, created.ID, workspace.NoteUpdate{
		Title: "Second updated", Document: granularDocument("updated"), Version: created.Version,
	})
	if err != nil {
		t.Fatal(err)
	}
	if updated.Version != 2 {
		t.Fatalf("updated note version = %d, want 2", updated.Version)
	}

	if _, err := service.UpdateNote(ctx, workspace.ID, created.ID, workspace.NoteUpdate{
		Title: "stale", Document: granularDocument("stale"), Version: created.Version,
	}); !errors.Is(err, workspace.ErrConflict) {
		t.Fatalf("stale note update error = %v, want conflict", err)
	}

	canvas, err := service.UpdateCanvas(ctx, workspace.ID, workspace.CanvasUpdate{
		Canvas: granularCanvas("shape-1"), Version: workspace.CanvasVersion,
	})
	if err != nil {
		t.Fatal(err)
	}
	if canvas.Version != 2 {
		t.Fatalf("canvas version = %d, want 2", canvas.Version)
	}
	if _, err := service.UpdateCanvas(ctx, workspace.ID, workspace.CanvasUpdate{
		Canvas: granularCanvas("stale"), Version: workspace.CanvasVersion,
	}); !errors.Is(err, workspace.ErrConflict) {
		t.Fatalf("stale canvas update error = %v, want conflict", err)
	}

	page, err := service.ListWorkspaces(ctx, workspace.WorkspaceQuery{Offset: 0, Limit: 50, HasCanvas: true, HasNotes: true})
	if err != nil {
		t.Fatal(err)
	}
	if len(page.Items) != 1 || page.Items[0].ID != workspace.ID || page.Items[0].NoteCount != 2 || !page.Items[0].HasCanvas {
		t.Fatalf("granular library summary = %#v, want noteCount=2 and hasCanvas=true", page.Items)
	}

	if err := service.DeleteNote(ctx, workspace.ID, created.ID, created.Version); !errors.Is(err, workspace.ErrConflict) {
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

func TestGranularWriteInvalidatesStaleAggregateSnapshot(t *testing.T) {
	ctx := context.Background()
	store, err := Open(ctx, filepath.Join(t.TempDir(), "granular-aggregate-race.db"))
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = store.Close() })

	service := workspace.Service{Store: store}
	workspace, err := service.Create(ctx, "Race guard")
	if err != nil {
		t.Fatal(err)
	}
	stale := workspace
	note := workspace.Notes[0]

	savedNote, err := service.UpdateNote(ctx, workspace.ID, note.ID, workspace.NoteUpdate{
		Title: note.Title, Document: granularDocument("new granular content"), Version: note.Version,
	})
	if err != nil {
		t.Fatal(err)
	}
	if savedNote.Version != note.Version+1 {
		t.Fatalf("saved note version = %d, want %d", savedNote.Version, note.Version+1)
	}

	_, err = service.Update(ctx, workspace.ID, workspace.Update{
		Title: stale.Title, Document: stale.Document, Notes: stale.Notes, Canvas: stale.Canvas,
		References: stale.References, SplitRatio: stale.SplitRatio, Version: stale.Version,
	})
	if !errors.Is(err, workspace.ErrConflict) {
		t.Fatalf("stale aggregate write error = %v, want conflict", err)
	}

	reloaded, err := service.Get(ctx, workspace.ID)
	if err != nil {
		t.Fatal(err)
	}
	if len(reloaded.Notes) != 1 || string(reloaded.Notes[0].Document.Data) != string(savedNote.Document.Data) {
		t.Fatalf("stale aggregate write replaced granular note: %#v", reloaded.Notes)
	}
	if reloaded.Version <= stale.Version {
		t.Fatalf("aggregate revision = %d, want > stale %d", reloaded.Version, stale.Version)
	}
}
