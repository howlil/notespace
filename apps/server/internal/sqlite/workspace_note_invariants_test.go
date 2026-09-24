package sqlite

import (
	"context"
	"errors"
	"path/filepath"
	"testing"

	workspacepkg "github.com/howlil/notespace/apps/server/internal/workspace"
)

func TestWorkspaceCannotDeleteFinalNote(t *testing.T) {
	ctx := context.Background()
	store, err := Open(ctx, filepath.Join(t.TempDir(), "final-note.db"))
	if err != nil {
		t.Fatal(err)
	}
	defer store.Close()

	service := workspacepkg.NewService(store)
	workspace, err := service.Create(ctx, "Final note invariant")
	if err != nil {
		t.Fatal(err)
	}
	note := workspace.Notes[0]

	if err := service.DeleteNote(ctx, workspace.ID, note.ID, note.Version); !errors.Is(err, workspacepkg.ErrInvalid) {
		t.Fatalf("delete final note error = %v, want ErrInvalid", err)
	}
	reloaded, err := service.Get(ctx, workspace.ID)
	if err != nil {
		t.Fatal(err)
	}
	if len(reloaded.Notes) != 1 || reloaded.Notes[0].ID != note.ID {
		t.Fatalf("rejected delete changed notes: %#v", reloaded.Notes)
	}
}

func TestCreateNoteRejectsDuplicateIDWithoutOverwriting(t *testing.T) {
	ctx := context.Background()
	store, err := Open(ctx, filepath.Join(t.TempDir(), "duplicate-note.db"))
	if err != nil {
		t.Fatal(err)
	}
	defer store.Close()

	service := workspacepkg.NewService(store)
	workspace, err := service.Create(ctx, "Duplicate note")
	if err != nil {
		t.Fatal(err)
	}
	input := workspacepkg.NoteCreate{ID: "note-2", Title: "Second", Document: workspace.Document}
	if _, err := service.CreateNote(ctx, workspace.ID, input); err != nil {
		t.Fatal(err)
	}
	duplicate := input
	duplicate.Title = "Overwrite attempt"
	if _, err := service.CreateNote(ctx, workspace.ID, duplicate); !errors.Is(err, workspacepkg.ErrConflict) {
		t.Fatalf("duplicate create error = %v, want ErrConflict", err)
	}

	notes, err := store.ListNotes(ctx, workspace.ID)
	if err != nil {
		t.Fatal(err)
	}
	if len(notes) != 2 {
		t.Fatalf("note count = %d, want 2", len(notes))
	}
	for _, note := range notes {
		if note.ID == "note-2" && note.Title != "Second" {
			t.Fatalf("duplicate create overwrote note: %#v", note)
		}
	}
}
