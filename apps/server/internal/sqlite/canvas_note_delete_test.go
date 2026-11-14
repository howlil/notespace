package sqlite

import (
	"context"
	"encoding/json"
	"errors"
	"path/filepath"
	"testing"

	"github.com/howlil/notespace/apps/server/internal/note"
	workspacepkg "github.com/howlil/notespace/apps/server/internal/workspace"
)

func TestDeleteEmptyNoteRefusesPlacedOrContentfulNotesAndClearsUndoneOrphans(t *testing.T) {
	ctx := context.Background()
	store, err := Open(ctx, filepath.Join(t.TempDir(), "canvas-note-delete.db"))
	if err != nil {
		t.Fatal(err)
	}
	defer store.Close()

	workspace, err := workspacepkg.NewService(store).Create(ctx, "Delete empty note")
	if err != nil {
		t.Fatal(err)
	}
	created, err := store.CreateNoteInstance(ctx, workspace.ID, note.CreateInstanceRequest{
		ClientRequestID:       "empty-request",
		ClientNoteID:          "empty-note",
		ClientInstanceID:      "empty-instance",
		ElementID:             "empty-element",
		ExpectedCanvasVersion: workspace.CanvasVersion,
		Document:              json.RawMessage(`{"type":"doc","content":[]}`),
		Canvas:                note.CanvasSnapshot{Format: "excalidraw", Version: 1, Data: noteDeleteScene("empty-element", "empty-note", "empty-instance", false)},
		X:                     40, Y: 64, Width: 320, Height: 180,
	})
	if err != nil {
		t.Fatal(err)
	}

	if err := store.DeleteEmptyNote(ctx, "empty-note"); !errors.Is(err, note.ErrNoteInUse) {
		t.Fatalf("placed empty note delete = %v, want ErrNoteInUse", err)
	}

	// Undo removes the element from the Canvas but leaves its instance row behind.
	undone, err := store.UpdateCanvas(ctx, workspace.ID, workspacepkg.CanvasUpdate{
		Canvas:  workspacepkg.Snapshot{Format: "excalidraw", Version: 1, Data: noteDeleteScene("empty-element", "empty-note", "empty-instance", true)},
		Version: created.Canvas.Version,
	})
	if err != nil {
		t.Fatal(err)
	}
	if err := store.DeleteEmptyNote(ctx, "empty-note"); err != nil {
		t.Fatalf("undone empty note delete = %v", err)
	}
	if _, err := store.GetNote(ctx, "empty-note"); !errors.Is(err, note.ErrNotFound) {
		t.Fatalf("deleted note lookup = %v, want ErrNotFound", err)
	}
	var orphans int
	if err := store.db.QueryRowContext(ctx, `SELECT COUNT(*) FROM canvas_note_instances WHERE id=?`, created.Instance.ID).Scan(&orphans); err != nil {
		t.Fatal(err)
	}
	if orphans != 0 {
		t.Fatalf("orphan instance rows after delete = %d, want 0", orphans)
	}
	if undone.Version <= created.Canvas.Version {
		t.Fatalf("undo did not advance Canvas version: %+v", undone)
	}

	contentful, err := store.CreateNoteInstance(ctx, workspace.ID, note.CreateInstanceRequest{
		ClientRequestID:       "contentful-request",
		ClientNoteID:          "contentful-note",
		ClientInstanceID:      "contentful-instance",
		ElementID:             "contentful-element",
		ExpectedCanvasVersion: undone.Version,
		Document:              json.RawMessage(`{"type":"doc","content":[{"type":"paragraph","content":[{"type":"text","text":"kept"}]}]}`),
		Canvas:                note.CanvasSnapshot{Format: "excalidraw", Version: 1, Data: noteDeleteScene("contentful-element", "contentful-note", "contentful-instance", true)},
		X:                     40, Y: 64, Width: 320, Height: 180,
	})
	if err != nil {
		t.Fatal(err)
	}
	if err := store.DeleteEmptyNote(ctx, contentful.Note.ID); !errors.Is(err, note.ErrNotEmpty) {
		t.Fatalf("contentful note delete = %v, want ErrNotEmpty", err)
	}
	if err := store.DeleteEmptyNote(ctx, "missing-note"); !errors.Is(err, note.ErrNotFound) {
		t.Fatalf("missing note delete = %v, want ErrNotFound", err)
	}
}

func noteDeleteScene(elementID, noteID, instanceID string, deleted bool) json.RawMessage {
	data, _ := json.Marshal(map[string]any{
		"elements": []any{map[string]any{
			"id": elementID, "isDeleted": deleted, "x": 40, "y": 64, "width": 320, "height": 180,
			"customData": map[string]any{"notespaceNote": map[string]any{"noteId": noteID, "instanceId": instanceID}},
		}},
		"appState": map[string]any{}, "files": map[string]any{},
	})
	return data
}
