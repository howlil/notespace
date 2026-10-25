package sqlite

import (
	"context"
	"errors"
	"fmt"
	"path/filepath"
	"testing"

	workspacepkg "github.com/howlil/notespace/apps/server/internal/workspace"
)

// Actual concurrent Note UPDATE and Workspace Trash, on the same SQLite store.
// Exactly one mutation wins: either the new Note survives in the active
// Workspace, or the pre-edit Note is preserved inside an restorable Trash record.
func TestConcurrentNoteWriteAndWorkspaceTrashHaveNoPartialOutcome(t *testing.T) {
	ctx := context.Background()
	store, err := Open(ctx, filepath.Join(t.TempDir(), "trash-note-race.db"))
	if err != nil { t.Fatal(err) }
	defer store.Close()
	service := workspacepkg.NewService(store)

	for i := 0; i < 8; i++ {
		created, err := service.Create(ctx, fmt.Sprintf("Trash race %d", i))
		if err != nil { t.Fatal(err) }
		original := created.Notes[0]
		newDocument := granularDocument(fmt.Sprintf("concurrent-draft-%d", i))

		start := make(chan struct{})
		type updateResult struct { note workspacepkg.Note; err error }
		updates := make(chan updateResult, 1)
		trashes := make(chan error, 1)
		go func() {
			<-start
			updated, updateErr := service.UpdateNote(ctx, created.ID, original.ID, workspacepkg.NoteUpdate{
				Title: original.Title, Document: newDocument, Version: original.Version,
			})
			updates <- updateResult{note: updated, err: updateErr}
		}()
		go func() {
			<-start
			trashes <- store.TrashWorkspace(ctx, created.ID, created.Version)
		}()
		close(start)
		update := <-updates
		trashErr := <-trashes

		switch {
		case update.err == nil && errors.Is(trashErr, workspacepkg.ErrConflict):
			active, getErr := service.Get(ctx, created.ID)
			if getErr != nil { t.Fatal(getErr) }
			if len(active.Notes) != 1 || active.Version != created.Version+1 ||
				active.Notes[0].Version != update.note.Version ||
				string(active.Notes[0].Document.Data) != string(newDocument.Data) {
				t.Fatalf("write winner lost content or revision: %+v", active)
			}
		case trashErr == nil && errors.Is(update.err, workspacepkg.ErrNotFound):
			if _, getErr := service.Get(ctx, created.ID); !errors.Is(getErr, workspacepkg.ErrNotFound) {
				t.Fatalf("trashed Workspace still visible: %v", getErr)
			}
			restored, restoreErr := store.RestoreTrashedWorkspace(ctx, created.ID)
			if restoreErr != nil { t.Fatal(restoreErr) }
			if len(restored.Notes) != 1 || restored.Notes[0].ID != original.ID ||
				restored.Notes[0].Version != original.Version ||
				string(restored.Notes[0].Document.Data) != string(original.Document.Data) {
				t.Fatalf("trash winner lost the original Note: %+v", restored)
			}
		default:
			t.Fatalf("non-serializable result: update=%v trash=%v", update.err, trashErr)
		}
	}
}
