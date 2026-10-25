package sqlite

import (
	"context"
	"fmt"
	"path/filepath"
	"reflect"
	"testing"

	workspacepkg "github.com/howlil/notespace/apps/server/internal/workspace"
)

// Recovery must restore the latest granular Note/Canvas revisions, rather than
// stale compatibility fields or the original Workspace creation checkpoint.
func TestWorkspaceRecoveryRoundTripsLatestGranularAuthoredState(t *testing.T) {
	for _, mode := range []string{"trash", "archive"} {
		t.Run(mode, func(t *testing.T) {
			ctx := context.Background()
			store, err := Open(ctx, filepath.Join(t.TempDir(), "granular-recovery.db"))
			if err != nil {
				t.Fatal(err)
			}
			defer store.Close()
			service := workspacepkg.NewService(store)

			created, err := service.Create(ctx, "Recover all authored revisions")
			if err != nil {
				t.Fatal(err)
			}
			updatedNote, err := service.UpdateNote(ctx, created.ID, created.Notes[0].ID, workspacepkg.NoteUpdate{
				Title: "First edited", Document: granularDocument("durable first note"), Version: created.Notes[0].Version,
			})
			if err != nil {
				t.Fatal(err)
			}
			addedNote, err := service.CreateNote(ctx, created.ID, workspacepkg.NoteCreate{
				ID: "second-granular-note", Title: "Second", Document: granularDocument("durable second note"),
			})
			if err != nil {
				t.Fatal(err)
			}
			updatedCanvas, err := service.UpdateCanvas(ctx, created.ID, workspacepkg.CanvasUpdate{
				Canvas: granularCanvas("durable-canvas-shape"), Version: created.CanvasVersion,
			})
			if err != nil {
				t.Fatal(err)
			}
			before, err := service.Get(ctx, created.ID)
			if err != nil {
				t.Fatal(err)
			}
			if len(before.Notes) != 2 || before.CanvasVersion != updatedCanvas.Version ||
				before.Notes[0].Version != updatedNote.Version || before.Notes[1].Version != addedNote.Version {
				t.Fatalf("incorrect fixture before recovery: %+v", before)
			}

			switch mode {
			case "trash":
				if err := store.TrashWorkspace(ctx, created.ID, before.Version); err != nil {
					t.Fatal(err)
				}
				if _, err := store.RestoreTrashedWorkspace(ctx, created.ID); err != nil {
					t.Fatal(err)
				}
			case "archive":
				backup, err := store.ExportBackupArchive(ctx)
				if err != nil {
					t.Fatal(err)
				}
				// Replace the active content so restoration must actually replay
				// the saved granular rows, not return the already-current data.
				if _, err := service.UpdateNote(ctx, created.ID, updatedNote.ID, workspacepkg.NoteUpdate{
					Title: "After backup", Document: granularDocument("not in backup"), Version: updatedNote.Version,
				}); err != nil {
					t.Fatal(err)
				}
				if err := store.RestoreBackupArchive(ctx, backup); err != nil {
					t.Fatal(err)
				}
			}

			after, err := service.Get(ctx, created.ID)
			if err != nil {
				t.Fatal(err)
			}
			if !reflect.DeepEqual(after.Notes, before.Notes) ||
				!reflect.DeepEqual(after.Canvas, before.Canvas) ||
				after.CanvasVersion != before.CanvasVersion ||
				after.Version != before.Version ||
				after.Title != before.Title || after.CategoryID != before.CategoryID {
				t.Fatalf("recovery lost authored versions/content:\nbefore: %+v\nafter: %+v", before, after)
			}
			// Restored optimistic versions are usable for subsequent authoring.
			if _, err := service.UpdateNote(ctx, created.ID, updatedNote.ID, workspacepkg.NoteUpdate{
				Title: "Editable after restore", Document: updatedNote.Document, Version: updatedNote.Version,
			}); err != nil {
				t.Fatalf("restored Note cannot be saved: %v", err)
			}
		})
	}
}

// Category browsing uses a title-based ordering: granular autosave must not
// shift a not-yet-visited Workspace into an already-read offset page.
func TestCategoryWorkspacePaginationRemainsStableAcrossGranularAutosave(t *testing.T) {
	ctx := context.Background()
	store, err := Open(ctx, filepath.Join(t.TempDir(), "category-autosave-pagination.db"))
	if err != nil {
		t.Fatal(err)
	}
	defer store.Close()
	service := workspacepkg.NewService(store)
	category, err := service.CreateCategory(ctx, "Stable pages")
	if err != nil {
		t.Fatal(err)
	}
	entries := make(map[string]workspacepkg.Workspace)
	for _, name := range []string{"Alpha", "Bravo", "Charlie", "Delta", "Echo"} {
		created, err := service.Create(ctx, name, category.ID)
		if err != nil {
			t.Fatal(err)
		}
		entries[name] = created
	}
	read := func(offset int) []string {
		t.Helper()
		page, err := service.ListWorkspaces(ctx, workspacepkg.WorkspaceQuery{
			CategoryID: category.ID, Limit: 2, Offset: offset,
		})
		if err != nil {
			t.Fatal(err)
		}
		if page.Total != len(entries) {
			t.Fatalf("page total=%d want=%d", page.Total, len(entries))
		}
		names := make([]string, len(page.Items))
		for i, item := range page.Items {
			names[i] = item.Title
		}
		return names
	}
	first := read(0)
	last := entries["Echo"]
	if _, err := service.UpdateNote(ctx, last.ID, last.Notes[0].ID, workspacepkg.NoteUpdate{
		Title: last.Notes[0].Title,
		Document: granularDocument(fmt.Sprintf("edited after first page: %s", last.ID)),
		Version: last.Notes[0].Version,
	}); err != nil {
		t.Fatal(err)
	}
	actual := append(append(first, read(2)...), read(4)...)
	want := []string{"Alpha", "Bravo", "Charlie", "Delta", "Echo"}
	if !reflect.DeepEqual(actual, want) {
		t.Fatalf("autosave changed category page membership: got=%q want=%q", actual, want)
	}
}
