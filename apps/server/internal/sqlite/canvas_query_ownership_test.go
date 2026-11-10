package sqlite

import (
	"context"
	"errors"
	"path/filepath"
	"reflect"
	"strings"
	"testing"

	workspacepkg "github.com/howlil/notespace/apps/server/internal/workspace"
)

func TestBorrowedCanvasQueriesRollBackEveryAggregateStage(t *testing.T) {
	for _, table := range []string{"projects", "workspace_search_meta"} {
		t.Run(table, func(t *testing.T) {
			ctx := context.Background()
			store, err := Open(ctx, filepath.Join(t.TempDir(), "atomic.db"))
			if err != nil {
				t.Fatal(err)
			}
			defer store.Close()
			service := workspacepkg.NewService(store)
			created, err := service.Create(ctx, "Atomic")
			if err != nil {
				t.Fatal(err)
			}
			if _, err := store.SearchIndexed(ctx, "Atomic"); err != nil {
				t.Fatal(err)
			}
			before, err := store.libraryBackupAtomic(ctx)
			if err != nil {
				t.Fatal(err)
			}
			// Controlled table names only. Fail after the Canvas row was written, and
			// (for metadata) after the aggregate revision was written as well.
			if _, err := store.db.ExecContext(ctx, `CREATE TRIGGER reject_update BEFORE UPDATE ON `+table+` BEGIN SELECT RAISE(ABORT, 'injected query failure'); END`); err != nil {
				t.Fatal(err)
			}
			if _, err := service.UpdateCanvas(ctx, created.ID, workspacepkg.CanvasUpdate{Canvas: granularCanvas("must-roll-back"), Version: created.CanvasVersion}); err == nil || !strings.Contains(err.Error(), "injected query failure") {
				t.Fatalf("update error = %v", err)
			}
			after, err := store.libraryBackupAtomic(ctx)
			if err != nil {
				t.Fatal(err)
			}
			before.GeneratedAt, after.GeneratedAt = "", ""
			if !reflect.DeepEqual(before, after) {
				t.Fatal("borrowed query escaped the facade transaction")
			}
			var revision int
			if err := store.db.QueryRowContext(ctx, `SELECT version FROM workspace_search_meta WHERE workspace_id=?`, created.ID).Scan(&revision); err != nil {
				t.Fatal(err)
			}
			if revision != created.Version {
				t.Fatalf("projection revision=%d, want %d", revision, created.Version)
			}
		})
	}
}

func TestBorrowedCanvasVersionFenceHasOneConcurrentWinner(t *testing.T) {
	ctx := context.Background()
	store, err := Open(ctx, filepath.Join(t.TempDir(), "version.db"))
	if err != nil {
		t.Fatal(err)
	}
	defer store.Close()
	service := workspacepkg.NewService(store)
	created, err := service.Create(ctx, "Versioned")
	if err != nil {
		t.Fatal(err)
	}
	type result struct {
		state workspacepkg.CanvasState
		err   error
	}
	start := make(chan struct{})
	results := make(chan result, 2)
	for _, id := range []string{"first", "second"} {
		go func() {
			<-start
			state, err := service.UpdateCanvas(ctx, created.ID, workspacepkg.CanvasUpdate{Canvas: granularCanvas(id), Version: created.CanvasVersion})
			results <- result{state, err}
		}()
	}
	close(start)
	successes, conflicts := 0, 0
	for range 2 {
		r := <-results
		switch {
		case r.err == nil:
			successes++
			if r.state.Version != created.CanvasVersion+1 {
				t.Fatalf("Canvas version = %d", r.state.Version)
			}
		case errors.Is(r.err, workspacepkg.ErrConflict):
			conflicts++
		default:
			t.Fatal(r.err)
		}
	}
	if successes != 1 || conflicts != 1 {
		t.Fatalf("success=%d conflict=%d", successes, conflicts)
	}
	current, err := store.Get(ctx, created.ID)
	if err != nil || current.Version != created.Version+1 {
		t.Fatalf("aggregate revision = %+v, %v", current, err)
	}
	if _, err := service.UpdateCanvas(ctx, "missing", workspacepkg.CanvasUpdate{Canvas: granularCanvas("none"), Version: 1}); !errors.Is(err, workspacepkg.ErrNotFound) {
		t.Fatalf("missing update = %v", err)
	}
}
