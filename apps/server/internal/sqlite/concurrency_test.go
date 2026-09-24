package sqlite

import (
	"context"
	"errors"
	"path/filepath"
	"testing"

	workspacepkg "github.com/howlil/notespace/apps/server/internal/workspace"
)

func TestVersionedTrashRejectsStaleDelete(t *testing.T) {
	ctx := context.Background()
	store, err := Open(ctx, filepath.Join(t.TempDir(), "stale-delete.db"))
	if err != nil {
		t.Fatal(err)
	}
	defer store.Close()

	service := workspacepkg.NewService(store)
	workspace, err := service.Create(ctx, "Initial")
	if err != nil {
		t.Fatal(err)
	}
	updated, err := service.Update(ctx, workspace.ID, workspacepkg.Update{
		Title:      "Newer acknowledged state",
		Document:   workspace.Document,
		Notes:      workspace.Notes,
		Canvas:     workspace.Canvas,
		References: workspace.References,
		SplitRatio: workspace.SplitRatio,
		Version:    workspace.Version,
	})
	if err != nil {
		t.Fatal(err)
	}

	staleVersion := workspace.Version
	if err := store.TrashWorkspace(ctx, workspace.ID, staleVersion); !errors.Is(err, workspacepkg.ErrConflict) {
		t.Fatalf("stale delete error = %v, want conflict", err)
	}
	current, err := store.Get(ctx, workspace.ID)
	if err != nil {
		t.Fatalf("workspace disappeared after stale delete: %v", err)
	}
	if current.Version != updated.Version || current.Title != updated.Title {
		t.Fatalf("workspace after stale delete = %+v, want version %d title %q", current.Summary, updated.Version, updated.Title)
	}
	var trashCount int
	if err := store.db.QueryRowContext(ctx, `SELECT COUNT(*) FROM workspace_trash WHERE id=?`, workspace.ID).Scan(&trashCount); err != nil {
		t.Fatal(err)
	}
	if trashCount != 0 {
		t.Fatalf("stale delete created %d trash rows, want 0", trashCount)
	}

	currentVersion := updated.Version
	if err := store.TrashWorkspace(ctx, workspace.ID, currentVersion); err != nil {
		t.Fatal(err)
	}
	if _, err := store.Get(ctx, workspace.ID); !errors.Is(err, workspacepkg.ErrNotFound) {
		t.Fatalf("current delete get error = %v, want not found", err)
	}
}

func TestDeleteCategoryRejectsTrashedWorkspace(t *testing.T) {
	ctx := context.Background()
	store, err := Open(ctx, filepath.Join(t.TempDir(), "category-trash.db"))
	if err != nil {
		t.Fatal(err)
	}
	defer store.Close()

	service := workspacepkg.NewService(store)
	category, err := service.CreateCategory(ctx, "Concurrency")
	if err != nil {
		t.Fatal(err)
	}
	workspace, err := service.Create(ctx, "Owned workspace", category.ID)
	if err != nil {
		t.Fatal(err)
	}
	if err := store.TrashWorkspace(ctx, workspace.ID, workspace.Version); err != nil {
		t.Fatal(err)
	}

	if err := store.DeleteCategory(ctx, category.ID); !errors.Is(err, workspacepkg.ErrNotEmpty) {
		t.Fatalf("category delete error = %v, want not empty", err)
	}
	var count int
	if err := store.db.QueryRowContext(ctx, `SELECT COUNT(*) FROM categories WHERE id=?`, category.ID).Scan(&count); err != nil {
		t.Fatal(err)
	}
	if count != 1 {
		t.Fatalf("category count = %d, want 1", count)
	}
}

func TestRestoreAndPurgeTrashHaveSingleWinner(t *testing.T) {
	ctx := context.Background()
	store, err := Open(ctx, filepath.Join(t.TempDir(), "restore-purge.db"))
	if err != nil {
		t.Fatal(err)
	}
	defer store.Close()

	workspace, err := workspacepkg.NewService(store).Create(ctx, "Race")
	if err != nil {
		t.Fatal(err)
	}
	if err := store.TrashWorkspace(ctx, workspace.ID, workspace.Version); err != nil {
		t.Fatal(err)
	}

	type result struct {
		op  string
		err error
	}
	start := make(chan struct{})
	results := make(chan result, 2)
	go func() {
		<-start
		_, err := store.RestoreTrashedWorkspace(ctx, workspace.ID)
		results <- result{op: "restore", err: err}
	}()
	go func() {
		<-start
		results <- result{op: "purge", err: store.DeleteTrashedWorkspace(ctx, workspace.ID)}
	}()
	close(start)

	var winner string
	successes, misses := 0, 0
	for range 2 {
		outcome := <-results
		switch {
		case outcome.err == nil:
			successes++
			winner = outcome.op
		case errors.Is(outcome.err, workspacepkg.ErrNotFound):
			misses++
		default:
			t.Fatalf("%s error = %v", outcome.op, outcome.err)
		}
	}
	if successes != 1 || misses != 1 {
		t.Fatalf("successes=%d misses=%d, want one winner and one not-found", successes, misses)
	}

	_, err = store.Get(ctx, workspace.ID)
	if winner == "restore" && err != nil {
		t.Fatalf("restored winner workspace missing: %v", err)
	}
	if winner == "purge" && !errors.Is(err, workspacepkg.ErrNotFound) {
		t.Fatalf("purged winner workspace error = %v, want not found", err)
	}
}
