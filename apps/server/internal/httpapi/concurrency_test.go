package httpapi_test

import (
	"context"
	"net/http"
	"net/http/httptest"
	"path/filepath"
	"strconv"
	"testing"

	"github.com/howlil/notespace/apps/server/internal/sqlite"
	workspacepkg "github.com/howlil/notespace/apps/server/internal/workspace"
)

func TestWorkspaceDeleteIfMatchRejectsStaleView(t *testing.T) {
	ctx := context.Background()
	store, err := sqlite.Open(ctx, filepath.Join(t.TempDir(), "stale-delete-http.db"))
	if err != nil {
		t.Fatal(err)
	}
	defer store.Close()

	service := workspacepkg.Service{Store: store}
	workspace, err := service.Create(ctx, "Initial")
	if err != nil {
		t.Fatal(err)
	}
	updated, err := service.Update(ctx, workspace.ID, workspacepkg.Update{
		Title:      "Newer",
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

	api := newLibraryAPI(store)
	remove := func(version int) *httptest.ResponseRecorder {
		t.Helper()
		req := httptest.NewRequest(http.MethodDelete, "/api/workspaces/"+workspace.ID, nil)
		req.Header.Set("If-Match", `"`+strconv.Itoa(version)+`"`)
		res := httptest.NewRecorder()
		api.ServeHTTP(res, req)
		return res
	}

	expect(t, remove(workspace.Version), http.StatusConflict)
	if current, err := store.Get(ctx, workspace.ID); err != nil || current.Version != updated.Version {
		t.Fatalf("workspace after stale delete = %+v err=%v", current.Summary, err)
	}
	expect(t, remove(updated.Version), http.StatusNoContent)
}
