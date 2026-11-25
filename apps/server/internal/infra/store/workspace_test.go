package store

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"github.com/howlil/notespace/apps/server/internal/domain"
	"github.com/howlil/notespace/apps/server/internal/infra/store/paging"
	"path/filepath"
	"reflect"
	"strings"
	"testing"
	"time"
)

// --- merged from scene_test.go ---

func TestCreateWorkspaceWithIDAtomicIdempotencyAndCategoryListing(t *testing.T) {
	ctx := context.Background()
	store, err := Open(ctx, filepath.Join(t.TempDir(), "atomic-ws.db"))
	if err != nil {
		t.Fatal(err)
	}
	defer store.Close()

	first, err := store.CreateWorkspaceWithID(ctx, "ws-fixed", "Alpha", "")
	if err != nil {
		t.Fatal(err)
	}
	same, err := store.CreateWorkspaceWithID(ctx, "ws-fixed", "Alpha", "")
	if err != nil || same.ID != first.ID || same.Version != first.Version {
		t.Fatalf("idempotent create = (%+v, %v)", same, err)
	}
	if _, err := store.CreateWorkspaceWithID(ctx, "ws-fixed", "Different Title", ""); !errors.Is(err, domain.ErrWorkspaceConflict) {
		t.Fatalf("conflicting create error = %v, want ErrWorkspaceConflict", err)
	}
	if _, err := store.ListCategoryWorkspaces(ctx, "missing-category", domain.WorkspaceQuery{}); !errors.Is(err, domain.ErrWorkspaceNotFound) {
		t.Fatalf("missing category listing error = %v, want ErrWorkspaceNotFound", err)
	}
}

// --- merged from granular_state_test.go ---

func granularCanvas(id string) domain.CanvasSnapshot {
	data, _ := json.Marshal(map[string]any{
		"elements": []any{map[string]any{"id": id, "type": "rectangle"}},
		"appState": map[string]any{},
		"files":    map[string]any{},
	})
	return domain.CanvasSnapshot{Format: "excalidraw", Version: 1, Data: data}
}

func TestCanvasDeletionTombstonesDoNotAppearAsVisibleContent(t *testing.T) {
	ctx := context.Background()
	store, err := Open(ctx, filepath.Join(t.TempDir(), "canvas-visible.db"))
	if err != nil {
		t.Fatal(err)
	}
	defer store.Close()
	created, err := store.CreateWorkspace(ctx, "Delete the last visible shape")
	if err != nil {
		t.Fatal(err)
	}
	scene := granularCanvas("deleted-shape")
	scene.Data, _ = json.Marshal(map[string]any{
		"elements": []any{map[string]any{"id": "deleted-shape", "type": "rectangle", "isDeleted": true}},
		"appState": map[string]any{}, "files": map[string]any{},
	})
	if _, err := store.UpdateCanvas(ctx, created.ID, domain.CanvasUpdate{Canvas: scene, Version: created.CanvasVersion}); err != nil {
		t.Fatal(err)
	}
	page, err := store.ListWorkspaces(ctx, domain.WorkspaceQuery{Limit: 10, HasCanvas: true})
	if err != nil || page.Total != 0 {
		t.Fatalf("tombstone marked Canvas nonempty: total=%d err=%v", page.Total, err)
	}
}

// --- merged from canvas_query_ownership_test.go ---

func TestBorrowedCanvasQueriesRollBackEveryAggregateStage(t *testing.T) {
	for _, table := range []string{"projects", "workspace_search_meta"} {
		t.Run(table, func(t *testing.T) {
			ctx := context.Background()
			store, err := Open(ctx, filepath.Join(t.TempDir(), "atomic.db"))
			if err != nil {
				t.Fatal(err)
			}
			defer store.Close()
			created, err := store.CreateWorkspace(ctx, "Atomic")
			if err != nil {
				t.Fatal(err)
			}
			if _, err := store.Search(ctx, "Atomic"); err != nil {
				t.Fatal(err)
			}
			before, err := store.SnapshotLibrary(ctx)
			if err != nil {
				t.Fatal(err)
			}
			// Controlled table names only. Fail after the Canvas row was written, and
			// (for metadata) after the aggregate revision was written as well.
			if _, err := store.db.Writer().ExecContext(ctx, `CREATE TRIGGER reject_update BEFORE UPDATE ON `+table+` BEGIN SELECT RAISE(ABORT, 'injected query failure'); END`); err != nil {
				t.Fatal(err)
			}
			if _, err := store.UpdateCanvas(ctx, created.ID, domain.CanvasUpdate{Canvas: granularCanvas("must-roll-back"), Version: created.CanvasVersion}); err == nil || !strings.Contains(err.Error(), "injected query failure") {
				t.Fatalf("update error = %v", err)
			}
			after, err := store.SnapshotLibrary(ctx)
			if err != nil {
				t.Fatal(err)
			}
			before.GeneratedAt, after.GeneratedAt = "", ""
			if !reflect.DeepEqual(before, after) {
				t.Fatal("borrowed query escaped the facade transaction")
			}
			var revision int
			if err := store.db.Writer().QueryRowContext(ctx, `SELECT version FROM workspace_search_meta WHERE workspace_id=?`, created.ID).Scan(&revision); err != nil {
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
	created, err := store.CreateWorkspace(ctx, "Versioned")
	if err != nil {
		t.Fatal(err)
	}
	type result struct {
		state domain.CanvasState
		err   error
	}
	start := make(chan struct{})
	results := make(chan result, 2)
	for _, id := range []string{"first", "second"} {
		go func() {
			<-start
			state, err := store.UpdateCanvas(ctx, created.ID, domain.CanvasUpdate{Canvas: granularCanvas(id), Version: created.CanvasVersion})
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
		case errors.Is(r.err, domain.ErrWorkspaceConflict):
			conflicts++
		default:
			t.Fatal(r.err)
		}
	}
	if successes != 1 || conflicts != 1 {
		t.Fatalf("success=%d conflict=%d", successes, conflicts)
	}
	current, err := store.GetWorkspace(ctx, created.ID)
	if err != nil || current.Version != created.Version+1 {
		t.Fatalf("aggregate revision = %+v, %v", current, err)
	}
	if _, err := store.UpdateCanvas(ctx, "missing", domain.CanvasUpdate{Canvas: granularCanvas("none"), Version: 1}); !errors.Is(err, domain.ErrWorkspaceNotFound) {
		t.Fatalf("missing update = %v", err)
	}
}

// --- merged from workspace_queries_test.go ---

func TestWorkspaceAndCategorySearchTreatLikeMetacharactersLiterally(t *testing.T) {
	ctx := context.Background()
	store, err := Open(ctx, filepath.Join(t.TempDir(), "literal-search.db"))
	if err != nil {
		t.Fatal(err)
	}
	defer store.Close()
	percentWorkspace, err := store.CreateWorkspace(ctx, "100% ready")
	if err != nil {
		t.Fatal(err)
	}
	underscoreWorkspace, err := store.CreateWorkspace(ctx, "A_B")
	if err != nil {
		t.Fatal(err)
	}
	backslashWorkspace, err := store.CreateWorkspace(ctx, `A\B`)
	if err != nil {
		t.Fatal(err)
	}
	if _, err := store.CreateWorkspace(ctx, "plain workspace"); err != nil {
		t.Fatal(err)
	}
	percentCategory, err := store.CreateCategory(ctx, "100% category")
	if err != nil {
		t.Fatal(err)
	}
	if _, err := store.CreateCategory(ctx, "plain category"); err != nil {
		t.Fatal(err)
	}
	underscoreCategory, err := store.CreateCategory(ctx, "A_B category")
	if err != nil {
		t.Fatal(err)
	}

	page, err := store.ListWorkspaces(ctx, domain.WorkspaceQuery{Query: "%", Limit: 50})
	if err != nil {
		t.Fatal(err)
	}
	if len(page.Items) != 1 || page.Items[0].ID != percentWorkspace.ID {
		t.Fatalf("percent workspace search = %#v, want only %q", page.Items, percentWorkspace.ID)
	}

	page, err = store.ListWorkspaces(ctx, domain.WorkspaceQuery{Query: "_", Limit: 50})
	if err != nil {
		t.Fatal(err)
	}
	if len(page.Items) != 1 || page.Items[0].ID != underscoreWorkspace.ID {
		t.Fatalf("underscore workspace search = %#v, want only %q", page.Items, underscoreWorkspace.ID)
	}

	page, err = store.ListWorkspaces(ctx, domain.WorkspaceQuery{Query: `\`, Limit: 50})
	if err != nil {
		t.Fatal(err)
	}
	if len(page.Items) != 1 || page.Items[0].ID != backslashWorkspace.ID {
		t.Fatalf("backslash workspace search = %#v, want only %q", page.Items, backslashWorkspace.ID)
	}

	results, err := store.Search(ctx, "%")
	if err != nil {
		t.Fatal(err)
	}
	if len(results) != 1 || results[0].Type != "category" || results[0].CategoryID != percentCategory.ID {
		t.Fatalf("percent category search = %#v, want only category %q", results, percentCategory.ID)
	}
	results, err = store.Search(ctx, "_")
	if err != nil {
		t.Fatal(err)
	}
	if len(results) != 1 || results[0].Type != "category" || results[0].CategoryID != underscoreCategory.ID {
		t.Fatalf("underscore category search = %#v, want only category %q", results, underscoreCategory.ID)
	}
}

// --- merged from workspace_pagination_test.go ---

func TestWorkspaceSnapshotTraversalDoesNotSkipOrRepeatOnConcurrentMutations(t *testing.T) {
	for _, sort := range []string{"", "name", "created"} {
		t.Run(fmt.Sprintf("sort=%q", sort), func(t *testing.T) {
			ctx := context.Background()
			store, err := Open(ctx, filepath.Join(t.TempDir(), "stable-pages.db"))
			if err != nil {
				t.Fatal(err)
			}
			defer store.Close()

			entries := make([]domain.Workspace, 0, 6)
			for _, title := range []string{"Alpha", "Bravo", "Charlie", "Delta", "Echo", "Foxtrot"} {
				value, err := store.CreateWorkspace(ctx, title)
				if err != nil {
					t.Fatal(err)
				}
				entries = append(entries, value)
			}
			baseQuery := domain.WorkspaceQuery{Sort: sort, Limit: 100}
			initial, err := store.ListWorkspaces(ctx, baseQuery)
			if err != nil {
				t.Fatal(err)
			}
			expectedIDs := make([]string, len(initial.Items))
			for i, item := range initial.Items {
				expectedIDs[i] = item.ID
			}

			query := domain.WorkspaceQuery{Sort: sort, Limit: 2, Snapshot: "start"}
			first, err := store.ListWorkspaces(ctx, query)
			if err != nil {
				t.Fatal(err)
			}
			if first.Snapshot == "" || first.NextOffset == nil || first.Total != 6 {
				t.Fatalf("missing snapshot metadata: %+v", first)
			}
			// Edit an off-page Workspace in a way that changes the live sort.
			oldest := entries[0]
			if sort == "name" {
				if _, err := store.RenameWorkspace(ctx, oldest.ID, "Zulu", &oldest.Title); err != nil {
					t.Fatal(err)
				}
			}
			if _, err := store.CreateWorkspace(ctx, "New after snapshot"); err != nil {
				t.Fatal(err)
			}
			// Snapshot includes a deleted Workspace, as observed at the start.
			toDelete := entries[4]
			current, err := store.GetWorkspace(ctx, toDelete.ID)
			if err != nil {
				t.Fatal(err)
			}
			if err := store.TrashWorkspace(ctx, toDelete.ID, current.Version); err != nil {
				t.Fatal(err)
			}

			seen := make([]string, 0, first.Total)
			for _, item := range first.Items {
				seen = append(seen, item.ID)
			}
			for next := first.NextOffset; next != nil; {
				query.Offset, query.Snapshot = *next, first.Snapshot
				page, err := store.ListWorkspaces(ctx, query)
				if err != nil {
					t.Fatal(err)
				}
				if page.Total != first.Total || page.Snapshot != first.Snapshot {
					t.Fatalf("snapshot drifted at offset %d: %+v", query.Offset, page)
				}
				for _, item := range page.Items {
					seen = append(seen, item.ID)
				}
				next = page.NextOffset
			}
			if !reflect.DeepEqual(seen, expectedIDs) {
				t.Fatalf("snapshot membership/order drifted: got=%q want=%q", seen, expectedIDs)
			}
			newPage, err := store.ListWorkspaces(ctx, baseQuery)
			if err != nil {
				t.Fatal(err)
			}
			if newPage.Total != 6 {
				t.Fatalf("new traversal should see one create and one delete: %+v", newPage)
			}
			foundNew, foundDeleted := false, false
			for _, item := range newPage.Items {
				foundNew = foundNew || item.Title == "New after snapshot"
				foundDeleted = foundDeleted || item.ID == toDelete.ID
			}
			if !foundNew || foundDeleted {
				t.Fatal("fresh traversal did not reflect committed mutations")
			}
		})
	}
}

func TestWorkspaceSnapshotIsScopedToFiltersAndExpires(t *testing.T) {
	ctx := context.Background()
	store, err := Open(ctx, filepath.Join(t.TempDir(), "scoped-pages.db"))
	if err != nil {
		t.Fatal(err)
	}
	defer store.Close()
	firstCategory, err := store.CreateCategory(ctx, "First")
	if err != nil {
		t.Fatal(err)
	}
	secondCategory, err := store.CreateCategory(ctx, "Second")
	if err != nil {
		t.Fatal(err)
	}
	if _, err := store.CreateWorkspace(ctx, "Owned", firstCategory.ID); err != nil {
		t.Fatal(err)
	}
	first, err := store.ListWorkspaces(ctx, domain.WorkspaceQuery{
		CategoryID: firstCategory.ID, Limit: 1, Snapshot: "start",
	})
	if err != nil {
		t.Fatal(err)
	}
	if first.Total != 1 || len(first.Items) != 1 {
		t.Fatalf("incorrect scoped result: %+v", first)
	}
	for _, invalid := range []domain.WorkspaceQuery{
		{CategoryID: secondCategory.ID, Limit: 1, Snapshot: first.Snapshot},
		{CategoryID: firstCategory.ID, Limit: 1, HasCanvas: true, Snapshot: first.Snapshot},
		{CategoryID: firstCategory.ID, Limit: 1, Query: "different", Snapshot: first.Snapshot},
	} {
		if _, err := store.ListWorkspaces(ctx, invalid); !errors.Is(err, domain.ErrWorkspaceInvalid) {
			t.Fatalf("mismatched snapshot query returned %v, want invalid", err)
		}
	}
	future := time.Now().Add(paging.SnapshotLifetime + time.Second)
	store.pagination.SetClock(func() time.Time { return future })
	if _, err := store.ListWorkspaces(ctx, domain.WorkspaceQuery{
		CategoryID: firstCategory.ID, Limit: 1, Snapshot: first.Snapshot,
	}); !errors.Is(err, domain.ErrWorkspaceConflict) {
		t.Fatalf("expired snapshot error = %v, want conflict", err)
	}
}

// --- merged from workspace_recovery_pagination_proofs_test.go ---

// Category browsing uses a title-based ordering and remains stable across
// unrelated authored Canvas updates.
func TestCategoryWorkspacePaginationRemainsStableAcrossCanvasAutosave(t *testing.T) {
	ctx := context.Background()
	store, err := Open(ctx, filepath.Join(t.TempDir(), "category-autosave-pagination.db"))
	if err != nil {
		t.Fatal(err)
	}
	defer store.Close()
	category, err := store.CreateCategory(ctx, "Stable pages")
	if err != nil {
		t.Fatal(err)
	}
	entries := make(map[string]domain.Workspace)
	for _, name := range []string{"Alpha", "Bravo", "Charlie", "Delta", "Echo"} {
		created, err := store.CreateWorkspace(ctx, name, category.ID)
		if err != nil {
			t.Fatal(err)
		}
		entries[name] = created
	}
	read := func(offset int) []string {
		t.Helper()
		page, err := store.ListWorkspaces(ctx, domain.WorkspaceQuery{
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
	updatedCanvas, err := store.UpdateCanvas(ctx, last.ID, domain.CanvasUpdate{
		Canvas: granularCanvas("edited-after-first-page"), Version: last.CanvasVersion,
	})
	if err != nil || updatedCanvas.Version != last.CanvasVersion+1 {
		t.Fatalf("Canvas autosave failed: state=%+v err=%v", updatedCanvas, err)
	}
	actual := append(append(first, read(2)...), read(4)...)
	want := []string{"Alpha", "Bravo", "Charlie", "Delta", "Echo"}
	if !reflect.DeepEqual(actual, want) {
		t.Fatalf("autosave changed category page membership: got=%q want=%q", actual, want)
	}
}
