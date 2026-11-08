package httpapi_test

import (
	"context"
	"encoding/json"
	"net/http"
	"path/filepath"
	"reflect"
	"testing"

	"github.com/howlil/notespace/apps/server/internal/sqlite"
	workspacepkg "github.com/howlil/notespace/apps/server/internal/workspace"
)

func TestInvalidWorkspaceMutationsPreserveDurableAggregate(t *testing.T) {
	ctx := context.Background()
	store, err := sqlite.Open(ctx, filepath.Join(t.TempDir(), "workspace-invalid.db"))
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = store.Close() })
	api := newAPI(store)
	created := decodeWorkspace(t, call(t, api, http.MethodPost, "/api/workspaces", map[string]string{"title": "Stable state"}))
	before := decodeWorkspace(t, call(t, api, http.MethodGet, "/api/workspaces/"+created.ID, nil))

	invalidAggregate := workspacepkg.Update{
		Title:      "",
		Document:   before.Document,
		Notes:      before.Notes,
		Canvas:     before.Canvas,
		References: before.References,
		SplitRatio: before.SplitRatio,
		Version:    before.Version,
	}
	expect(t, call(t, api, http.MethodPatch, "/api/workspaces/"+created.ID, invalidAggregate), http.StatusBadRequest)

	invalidCanvas := workspacepkg.CanvasUpdate{
		Canvas: workspacepkg.Snapshot{
			Format:  "excalidraw",
			Version: 1,
			Data:    json.RawMessage(`{"elements":null,"appState":{},"files":{}}`),
		},
		Version: before.CanvasVersion,
	}
	expect(t, call(t, api, http.MethodPatch, "/api/workspaces/"+created.ID+"/canvas", invalidCanvas), http.StatusBadRequest)

	after := decodeWorkspace(t, call(t, api, http.MethodGet, "/api/workspaces/"+created.ID, nil))
	if !reflect.DeepEqual(after, before) {
		t.Fatalf("invalid mutation changed durable workspace:\nbefore=%+v\nafter=%+v", before, after)
	}
}

func TestClientWorkspaceCreateIdentityIsIdempotent(t *testing.T) {
	ctx := context.Background()
	store, err := sqlite.Open(ctx, filepath.Join(t.TempDir(), "workspace-create-retry.db"))
	if err != nil {
		t.Fatal(err)
	}
	defer store.Close()
	api := newAPI(store)
	input := map[string]string{"id": "client-generated-workspace-1", "title": "Retry durable creation"}
	first := call(t, api, http.MethodPost, "/api/workspaces", input)
	expect(t, first, http.StatusCreated)
	created := decodeWorkspace(t, first)
	retry := call(t, api, http.MethodPost, "/api/workspaces", input)
	expect(t, retry, http.StatusCreated)
	if got := decodeWorkspace(t, retry); got.ID != created.ID {
		t.Fatalf("idempotent retry changed identity: %#v", got)
	}
	expect(t, call(t, api, http.MethodPost, "/api/workspaces", map[string]string{
		"id": created.ID, "title": "Different command",
	}), http.StatusConflict)
	page, err := workspacepkg.NewService(store).ListWorkspaces(ctx, workspacepkg.WorkspaceQuery{Limit: 10})
	if err != nil || page.Total != 1 {
		t.Fatalf("duplicate workspace created: total=%d error=%v", page.Total, err)
	}
}
