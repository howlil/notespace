package httpapi_test

import (
	"context"
	"encoding/json"
	"net/http"
	"path/filepath"
	"testing"

	"github.com/howlil/notespace/apps/server/internal/sqlite"
)

func TestWorkspaceMetadataStalePreconditionsRejectWithoutMutation(t *testing.T) {
	ctx := context.Background()
	store, err := sqlite.Open(ctx, filepath.Join(t.TempDir(), "metadata-stale-preconditions.db"))
	if err != nil {
		t.Fatal(err)
	}
	defer store.Close()
	api := newAPI(store)

	created := decodeWorkspace(t, call(t, api, http.MethodPost, "/api/workspaces", map[string]string{
		"title": "Original",
	}))
	titlePath := "/api/workspaces/" + created.ID + "/title"
	renamed := decodeWorkspace(t, call(t, api, http.MethodPatch, titlePath, map[string]string{
		"title": "Current", "expectedTitle": "Original",
	}))
	if renamed.Version != created.Version+1 {
		t.Fatalf("rename version=%d, want %d", renamed.Version, created.Version+1)
	}

	expect(t, call(t, api, http.MethodPatch, titlePath, map[string]string{
		"title": "Stale overwrite", "expectedTitle": "Original",
	}), http.StatusConflict)
	// Even a no-op cannot bypass a stale precondition.
	expect(t, call(t, api, http.MethodPatch, titlePath, map[string]string{
		"title": "Current", "expectedTitle": "Original",
	}), http.StatusConflict)

	makeCategory := func(title string) string {
		t.Helper()
		result := call(t, api, http.MethodPost, "/api/categories", map[string]string{"title": title})
		expect(t, result, http.StatusCreated)
		var category struct {
			ID string `json:"id"`
		}
		if err := json.Unmarshal(result.Body.Bytes(), &category); err != nil {
			t.Fatal(err)
		}
		return category.ID
	}
	destination := makeCategory("Destination")
	alternative := makeCategory("Alternative")
	categoryPath := "/api/workspaces/" + created.ID + "/category"
	moved := decodeWorkspace(t, call(t, api, http.MethodPatch, categoryPath, map[string]string{
		"categoryId": destination, "expectedCategoryId": created.CategoryID,
	}))
	if moved.CategoryID != destination || moved.Version != renamed.Version+1 {
		t.Fatalf("move result category=%q version=%d", moved.CategoryID, moved.Version)
	}

	expect(t, call(t, api, http.MethodPatch, categoryPath, map[string]string{
		"categoryId": alternative, "expectedCategoryId": created.CategoryID,
	}), http.StatusConflict)
	expect(t, call(t, api, http.MethodPatch, categoryPath, map[string]string{
		"categoryId": destination, "expectedCategoryId": created.CategoryID,
	}), http.StatusConflict)

	persisted := decodeWorkspace(t, call(t, api, http.MethodGet, "/api/workspaces/"+created.ID, nil))
	if persisted.Title != renamed.Title || persisted.CategoryID != destination || persisted.Version != moved.Version {
		t.Fatalf("stale metadata request mutated persisted workspace: %+v", persisted.Summary)
	}
	if len(persisted.Notes) != len(created.Notes) || persisted.Notes[0].ID != created.Notes[0].ID ||
		persisted.CanvasVersion != created.CanvasVersion {
		t.Fatal("stale metadata request modified authored state")
	}
}
