package sqlite

import (
	"context"
	"errors"
	"fmt"
	"path/filepath"
	"reflect"
	"testing"
	"time"

	workspacepkg "github.com/howlil/notespace/apps/server/internal/workspace"
)

func TestWorkspaceSnapshotTraversalDoesNotSkipOrRepeatOnConcurrentMutations(t *testing.T) {
	for _, sort := range []string{"", "notes", "name", "created"} {
		t.Run(fmt.Sprintf("sort=%q", sort), func(t *testing.T) {
			ctx := context.Background()
			store, err := Open(ctx, filepath.Join(t.TempDir(), "stable-pages.db"))
			if err != nil {
				t.Fatal(err)
			}
			defer store.Close()
			service := workspacepkg.NewService(store)

			entries := make([]workspacepkg.Workspace, 0, 6)
			for _, title := range []string{"Alpha", "Bravo", "Charlie", "Delta", "Echo", "Foxtrot"} {
				value, err := service.Create(ctx, title)
				if err != nil {
					t.Fatal(err)
				}
				entries = append(entries, value)
			}
			baseQuery := workspacepkg.WorkspaceQuery{Sort: sort, Limit: 100}
			initial, err := service.ListWorkspaces(ctx, baseQuery)
			if err != nil {
				t.Fatal(err)
			}
			expectedIDs := make([]string, len(initial.Items))
			for i, item := range initial.Items {
				expectedIDs[i] = item.ID
			}

			query := workspacepkg.WorkspaceQuery{Sort: sort, Limit: 2, Snapshot: "start"}
			first, err := service.ListWorkspaces(ctx, query)
			if err != nil {
				t.Fatal(err)
			}
			if first.Snapshot == "" || first.NextOffset == nil || first.Total != 6 {
				t.Fatalf("missing snapshot metadata: %+v", first)
			}
			// Edit an off-page Workspace in ways that change the live sort.
			oldest := entries[0]
			if _, err := service.UpdateNote(ctx, oldest.ID, oldest.Notes[0].ID, workspacepkg.NoteUpdate{
				Title:    oldest.Notes[0].Title,
				Document: granularDocument("autosaved"),
				Version:  oldest.Notes[0].Version,
			}); err != nil {
				t.Fatal(err)
			}
			if sort == "notes" {
				if _, err := service.CreateNote(ctx, oldest.ID, workspacepkg.NoteCreate{
					ID: "extra-note", Title: "New", Document: oldest.Document,
				}); err != nil {
					t.Fatal(err)
				}
			}
			if sort == "name" {
				if _, err := service.Rename(ctx, oldest.ID, "Zulu", oldest.Title); err != nil {
					t.Fatal(err)
				}
			}
			if _, err := service.Create(ctx, "New after snapshot"); err != nil {
				t.Fatal(err)
			}
			// Snapshot includes a deleted Workspace, as observed at the start.
			toDelete := entries[4]
			current, err := service.Get(ctx, toDelete.ID)
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
				page, err := service.ListWorkspaces(ctx, query)
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
			newPage, err := service.ListWorkspaces(ctx, baseQuery)
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
	service := workspacepkg.NewService(store)
	firstCategory, err := service.CreateCategory(ctx, "First")
	if err != nil {
		t.Fatal(err)
	}
	secondCategory, err := service.CreateCategory(ctx, "Second")
	if err != nil {
		t.Fatal(err)
	}
	if _, err := service.Create(ctx, "Owned", firstCategory.ID); err != nil {
		t.Fatal(err)
	}
	first, err := service.ListWorkspaces(ctx, workspacepkg.WorkspaceQuery{
		CategoryID: firstCategory.ID, Limit: 1, Snapshot: "start",
	})
	if err != nil {
		t.Fatal(err)
	}
	if first.Total != 1 || len(first.Items) != 1 {
		t.Fatalf("incorrect scoped result: %+v", first)
	}
	for _, invalid := range []workspacepkg.WorkspaceQuery{
		{CategoryID: secondCategory.ID, Limit: 1, Snapshot: first.Snapshot},
		{CategoryID: firstCategory.ID, Limit: 1, Sort: "notes", Snapshot: first.Snapshot},
		{CategoryID: firstCategory.ID, Limit: 1, HasCanvas: true, Snapshot: first.Snapshot},
		{CategoryID: firstCategory.ID, Limit: 1, Query: "different", Snapshot: first.Snapshot},
	} {
		if _, err := service.ListWorkspaces(ctx, invalid); !errors.Is(err, workspacepkg.ErrInvalid) {
			t.Fatalf("mismatched snapshot query returned %v, want invalid", err)
		}
	}
	store.pagingMu.Lock()
	session := store.pagingSnapshots[first.Snapshot]
	session.expiresAt = time.Now().Add(-time.Second)
	store.pagingSnapshots[first.Snapshot] = session
	store.pagingMu.Unlock()
	if _, err := service.ListWorkspaces(ctx, workspacepkg.WorkspaceQuery{
		CategoryID: firstCategory.ID, Limit: 1, Snapshot: first.Snapshot,
	}); !errors.Is(err, workspacepkg.ErrConflict) {
		t.Fatalf("expired snapshot error = %v, want conflict", err)
	}
}
