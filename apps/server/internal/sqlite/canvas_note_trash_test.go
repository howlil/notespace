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

func TestCanvasNoteTrashLifecycle(t *testing.T) {
	ctx := context.Background()
	store, err := Open(ctx, filepath.Join(t.TempDir(), "canvas-note-trash.db"))
	if err != nil {
		t.Fatal(err)
	}
	defer store.Close()

	workspace, err := workspacepkg.NewService(store).Create(ctx, "Trash lifecycle")
	if err != nil {
		t.Fatal(err)
	}
	created, err := store.CreateNoteInstance(ctx, workspace.ID, note.CreateInstanceRequest{
		ClientRequestID: "trash-request", ClientNoteID: "trash-note", ClientInstanceID: "trash-instance",
		ElementID: "trash-element", ExpectedCanvasVersion: workspace.CanvasVersion,
		Document: json.RawMessage(`{"type":"doc","content":[{"type":"paragraph","content":[{"type":"text","text":"zebrafinch research"}]}]}`),
		Canvas:   note.CanvasSnapshot{Format: "excalidraw", Version: 1, Data: noteDeleteScene("trash-element", "trash-note", "trash-instance", false)},
		X:        40, Y: 64, Width: 320, Height: 180,
	})
	if err != nil {
		t.Fatal(err)
	}

	searchHits := func() int {
		results, err := store.Search(ctx, "zebrafinch")
		if err != nil {
			t.Fatal(err)
		}
		return len(results)
	}
	if searchHits() == 0 {
		t.Fatal("active note is not searchable")
	}

	if err := store.TrashNote(ctx, "trash-note"); err != nil {
		t.Fatalf("trash placed contentful note = %v", err)
	}
	if err := store.TrashNote(ctx, "trash-note"); !errors.Is(err, note.ErrNoteTrashed) {
		t.Fatalf("second trash = %v, want ErrNoteTrashed", err)
	}
	if err := store.TrashNote(ctx, "missing-note"); !errors.Is(err, note.ErrNotFound) {
		t.Fatalf("trash missing note = %v, want ErrNotFound", err)
	}

	trashed, err := store.GetNote(ctx, "trash-note")
	if err != nil || trashed.DeletedAt == "" || trashed.Revision != created.Note.Revision {
		t.Fatalf("trashed note = %+v, %v; want readable with deletedAt and unchanged revision", trashed, err)
	}
	if _, err := store.UpdateNote(ctx, "trash-note", note.UpdateRequest{Document: created.Note.Document, ExpectedRevision: trashed.Revision}); !errors.Is(err, note.ErrNoteTrashed) {
		t.Fatalf("update trashed note = %v, want ErrNoteTrashed", err)
	}
	if _, err := store.CreateNoteInstance(ctx, workspace.ID, note.CreateInstanceRequest{
		ClientRequestID: "again-request", ClientNoteID: "again-note", ClientInstanceID: "again-instance",
		ExistingNoteID: "trash-note", ElementID: "again-element", ExpectedCanvasVersion: created.Canvas.Version,
		Canvas: note.CanvasSnapshot{Format: "excalidraw", Version: 1, Data: noteDeleteScene("again-element", "trash-note", "again-instance", false)},
		X:      40, Y: 64, Width: 320, Height: 180,
	}); !errors.Is(err, note.ErrNoteTrashed) {
		t.Fatalf("place trashed note = %v, want ErrNoteTrashed", err)
	}

	listed, err := store.ListNotes(ctx, note.ListQuery{Limit: 50})
	if err != nil || len(listed) != 0 {
		t.Fatalf("library list with only a trashed note = %+v, %v; want empty", listed, err)
	}
	if hits := searchHits(); hits != 0 {
		t.Fatalf("trashed note search hits = %d, want 0", hits)
	}
	items, err := store.ListTrashedNotes(ctx)
	if err != nil || len(items) != 1 || items[0].ID != "trash-note" || items[0].PlacementCount != 1 || items[0].Label != "zebrafinch research" {
		t.Fatalf("trashed notes = %+v, %v", items, err)
	}

	if err := store.DeleteEmptyNote(ctx, "trash-note"); !errors.Is(err, note.ErrNotEmpty) {
		t.Fatalf("guarded delete of trashed contentful note = %v, want ErrNotEmpty", err)
	}

	archive, err := store.ExportBackupArchive(ctx)
	if err != nil {
		t.Fatal(err)
	}

	if err := store.RestoreTrashedNote(ctx, "trash-note"); err != nil {
		t.Fatalf("restore = %v", err)
	}
	restored, err := store.GetNote(ctx, "trash-note")
	if err != nil || restored.DeletedAt != "" {
		t.Fatalf("note after restore = %+v, %v", restored, err)
	}
	if err := store.RestoreTrashedNote(ctx, "trash-note"); !errors.Is(err, note.ErrNotFound) {
		t.Fatalf("restore active note = %v, want ErrNotFound", err)
	}
	if err := store.DeleteTrashedNote(ctx, "trash-note"); !errors.Is(err, note.ErrNotFound) {
		t.Fatalf("permanent delete of active note = %v, want ErrNotFound", err)
	}
	if hits := searchHits(); hits == 0 {
		t.Fatal("restored note is not searchable again")
	}
	if _, err := store.UpdateNote(ctx, "trash-note", note.UpdateRequest{Document: created.Note.Document, ExpectedRevision: restored.Revision}); err != nil {
		t.Fatalf("update restored note = %v", err)
	}

	// The archive taken while the note was trashed keeps it trashed after restore.
	if err := store.RestoreBackupArchive(ctx, archive); err != nil {
		t.Fatal(err)
	}
	fromBackup, err := store.GetNote(ctx, "trash-note")
	if err != nil || fromBackup.DeletedAt == "" {
		t.Fatalf("note after backup restore = %+v, %v; want still trashed", fromBackup, err)
	}

	if err := store.DeleteTrashedNote(ctx, "trash-note"); err != nil {
		t.Fatalf("permanent delete = %v", err)
	}
	if _, err := store.GetNote(ctx, "trash-note"); !errors.Is(err, note.ErrNotFound) {
		t.Fatalf("note after permanent delete = %v, want ErrNotFound", err)
	}
}
