package sqlite

import (
	"context"
	workspacepkg "github.com/howlil/notespace/apps/server/internal/workspace"
	"path/filepath"
	"reflect"
	"testing"
)

// Category browsing uses a title-based ordering and remains stable across
// unrelated authored Canvas updates.
func TestCategoryWorkspacePaginationRemainsStableAcrossCanvasAutosave(t *testing.T) {
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
	updatedCanvas, err := service.UpdateCanvas(ctx, last.ID, workspacepkg.CanvasUpdate{
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
