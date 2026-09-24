package sqlite

import (
	"context"
	"path/filepath"
	"testing"

	workspacepkg "github.com/howlil/notespace/apps/server/internal/workspace"
)

func TestWorkspaceAndCategorySearchTreatLikeMetacharactersLiterally(t *testing.T) {
	ctx := context.Background()
	store, err := Open(ctx, filepath.Join(t.TempDir(), "literal-search.db"))
	if err != nil {
		t.Fatal(err)
	}
	defer store.Close()

	service := workspacepkg.NewService(store)
	percentWorkspace, err := service.Create(ctx, "100% ready")
	if err != nil {
		t.Fatal(err)
	}
	underscoreWorkspace, err := service.Create(ctx, "A_B")
	if err != nil {
		t.Fatal(err)
	}
	backslashWorkspace, err := service.Create(ctx, `A\B`)
	if err != nil {
		t.Fatal(err)
	}
	if _, err := service.Create(ctx, "plain workspace"); err != nil {
		t.Fatal(err)
	}
	percentCategory, err := service.CreateCategory(ctx, "100% category")
	if err != nil {
		t.Fatal(err)
	}
	if _, err := service.CreateCategory(ctx, "plain category"); err != nil {
		t.Fatal(err)
	}
	underscoreCategory, err := service.CreateCategory(ctx, "A_B category")
	if err != nil {
		t.Fatal(err)
	}

	page, err := service.ListWorkspaces(ctx, workspacepkg.WorkspaceQuery{Query: "%", Limit: 50})
	if err != nil {
		t.Fatal(err)
	}
	if len(page.Items) != 1 || page.Items[0].ID != percentWorkspace.ID {
		t.Fatalf("percent workspace search = %#v, want only %q", page.Items, percentWorkspace.ID)
	}

	page, err = service.ListWorkspaces(ctx, workspacepkg.WorkspaceQuery{Query: "_", Limit: 50})
	if err != nil {
		t.Fatal(err)
	}
	if len(page.Items) != 1 || page.Items[0].ID != underscoreWorkspace.ID {
		t.Fatalf("underscore workspace search = %#v, want only %q", page.Items, underscoreWorkspace.ID)
	}

	page, err = service.ListWorkspaces(ctx, workspacepkg.WorkspaceQuery{Query: `\`, Limit: 50})
	if err != nil {
		t.Fatal(err)
	}
	if len(page.Items) != 1 || page.Items[0].ID != backslashWorkspace.ID {
		t.Fatalf("backslash workspace search = %#v, want only %q", page.Items, backslashWorkspace.ID)
	}

	results, err := store.SearchIndexed(ctx, "%")
	if err != nil {
		t.Fatal(err)
	}
	if len(results) != 1 || results[0].Type != "category" || results[0].CategoryID != percentCategory.ID {
		t.Fatalf("percent category search = %#v, want only category %q", results, percentCategory.ID)
	}
	results, err = store.SearchIndexed(ctx, "_")
	if err != nil {
		t.Fatal(err)
	}
	if len(results) != 1 || results[0].Type != "category" || results[0].CategoryID != underscoreCategory.ID {
		t.Fatalf("underscore category search = %#v, want only category %q", results, underscoreCategory.ID)
	}
}
