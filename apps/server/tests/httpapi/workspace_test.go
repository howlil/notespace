package httpapi_test

import (
	"bytes"
	"context"
	"encoding/json"
	"github.com/howlil/notespace/apps/server/internal/domain"
	"github.com/howlil/notespace/apps/server/internal/httpapi"
	"github.com/howlil/notespace/apps/server/internal/infra/store"
	"net/http"
	"net/http/httptest"
	"net/url"
	"path/filepath"
	"reflect"
	"strconv"
	"strings"
	"sync"
	"testing"
)

// --- merged from workspace_http_test.go ---

func TestCategoryGroupsWorkspaces(t *testing.T) {
	store, err := store.Open(context.Background(), filepath.Join(t.TempDir(), "test.db"))
	if err != nil {
		t.Fatal(err)
	}
	defer store.Close()
	api := newAPI(store)
	createdCategory := call(t, api, "POST", "/api/categories", map[string]string{"title": "Computer Science"})
	expect(t, createdCategory, 201)
	var category domain.CategorySummary
	if err := json.Unmarshal(createdCategory.Body.Bytes(), &category); err != nil {
		t.Fatal(err)
	}
	createdWorkspace := call(t, api, "POST", "/api/workspaces", map[string]string{"title": "Distributed Systems", "categoryId": category.ID})
	expect(t, createdWorkspace, 201)
	if workspace := decodeWorkspace(t, createdWorkspace); workspace.CategoryID != category.ID {
		t.Fatalf("workspace category = %q, want %q", workspace.CategoryID, category.ID)
	}
	categories := decodeCategories(t, call(t, api, "GET", "/api/categories", nil))
	for _, listed := range categories {
		if listed.ID == category.ID && listed.WorkspaceCount == 1 {
			return
		}
	}
	t.Fatalf("category count missing from %#v", categories)
}

func TestWorkspaceCreateDefaultsToUncategorized(t *testing.T) {
	store, err := store.Open(context.Background(), filepath.Join(t.TempDir(), "uncategorized.db"))
	if err != nil {
		t.Fatal(err)
	}
	defer store.Close()
	api := newAPI(store)

	workspace := decodeWorkspace(t, call(t, api, "POST", "/api/workspaces", map[string]string{"title": "Root workspace"}))
	if workspace.CategoryID != domain.UncategorizedCategoryID {
		t.Fatalf("root workspace category = %q, want %q", workspace.CategoryID, domain.UncategorizedCategoryID)
	}
}

func TestCategoryWorkspaceBrowserSupportsScopedQueryAndPagination(t *testing.T) {
	store, err := store.Open(context.Background(), filepath.Join(t.TempDir(), "category-browser.db"))
	if err != nil {
		t.Fatal(err)
	}
	defer store.Close()
	api := newAPI(store)
	createdCategory := call(t, api, "POST", "/api/categories", map[string]string{"title": "Backend"})
	expect(t, createdCategory, 201)
	var category domain.CategorySummary
	if err := json.Unmarshal(createdCategory.Body.Bytes(), &category); err != nil {
		t.Fatal(err)
	}
	for _, title := range []string{"Redis", "Postgres", "Go"} {
		expect(t, call(t, api, "POST", "/api/workspaces", map[string]string{"title": title, "categoryId": category.ID}), 201)
	}
	for i := 0; i < 100; i++ {
		expect(t, call(t, api, "POST", "/api/workspaces", map[string]string{"title": "Workspace " + strconv.Itoa(i), "categoryId": category.ID}), 201)
	}
	page := call(t, api, "GET", "/api/categories/"+category.ID+"/workspaces?q=go&limit=1", nil)
	expect(t, page, 200)
	var result struct {
		Items      []domain.WorkspaceSummary `json:"items"`
		Total      int                       `json:"total"`
		NextOffset *int                      `json:"nextOffset"`
	}
	if err := json.Unmarshal(page.Body.Bytes(), &result); err != nil {
		t.Fatal(err)
	}
	if result.Total != 1 || len(result.Items) != 1 || result.Items[0].Title != "Go" || result.NextOffset != nil {
		t.Fatalf("scoped browser result = %+v", result)
	}
	all := call(t, api, "GET", "/api/categories/"+category.ID+"/workspaces?sort=name&limit=50", nil)
	expect(t, all, 200)
	if !strings.Contains(all.Body.String(), `"total":103`) || !strings.Contains(all.Body.String(), `"nextOffset":50`) {
		t.Fatalf("pagination metadata missing: %s", all.Body.String())
	}
}

func TestCategoryAndWorkspaceInlineManagement(t *testing.T) {
	ctx := context.Background()
	store, err := store.Open(ctx, filepath.Join(t.TempDir(), "management.db"))
	if err != nil {
		t.Fatal(err)
	}
	defer store.Close()
	api := newAPI(store)

	createdCategory := call(t, api, "POST", "/api/categories", map[string]string{"title": "Backend"})
	expect(t, createdCategory, 201)
	var category domain.CategorySummary
	if err := json.Unmarshal(createdCategory.Body.Bytes(), &category); err != nil {
		t.Fatal(err)
	}

	renameCategory := call(t, api, "PATCH", "/api/categories/"+category.ID, map[string]string{"title": "Backend Engineering"})
	expect(t, renameCategory, 200)
	if got := decodeCategories(t, call(t, api, "GET", "/api/categories", nil))[0].Title; got != "Backend Engineering" {
		t.Fatalf("category title = %q, want %q", got, "Backend Engineering")
	}

	workspace := decodeWorkspace(t, call(t, api, "POST", "/api/workspaces", map[string]string{"title": "Go", "categoryId": category.ID}))
	renameWorkspace := call(t, api, "PATCH", "/api/workspaces/"+workspace.ID+"/title", map[string]string{"title": "Golang"})
	expect(t, renameWorkspace, 200)
	if got := decodeWorkspace(t, renameWorkspace).Title; got != "Golang" {
		t.Fatalf("workspace title = %q, want %q", got, "Golang")
	}

	// Category deletion must not cascade into active or recoverable workspace data.
	expect(t, call(t, api, "DELETE", "/api/categories/"+category.ID, nil), 409)
	expect(t, call(t, api, "GET", "/api/workspaces/"+workspace.ID, nil), 200)
	expect(t, deleteWorkspaceRequest(t, api, "/api/workspaces/"+workspace.ID), 204)
	expect(t, call(t, api, "DELETE", "/api/categories/"+category.ID, nil), 409)
	expect(t, call(t, api, "DELETE", "/api/trash/"+workspace.ID, nil), 204)
	expect(t, call(t, api, "DELETE", "/api/categories/"+category.ID, nil), 204)
	for _, listed := range decodeCategories(t, call(t, api, "GET", "/api/categories", nil)) {
		if listed.ID == category.ID {
			t.Fatal("deleted category remains listed")
		}
	}
}

func TestWorkspaceMoveAndBoundedLibraryEndpoints(t *testing.T) {
	ctx := context.Background()
	store, err := store.Open(ctx, filepath.Join(t.TempDir(), "library.db"))
	if err != nil {
		t.Fatal(err)
	}
	defer store.Close()
	api := newAPI(store)

	var firstCategory, secondCategory domain.CategorySummary
	if err := json.Unmarshal(call(t, api, "POST", "/api/categories", map[string]string{"title": "Learning"}).Body.Bytes(), &firstCategory); err != nil {
		t.Fatal(err)
	}
	if err := json.Unmarshal(call(t, api, "POST", "/api/categories", map[string]string{"title": "Career"}).Body.Bytes(), &secondCategory); err != nil {
		t.Fatal(err)
	}
	workspace := decodeWorkspace(t, call(t, api, "POST", "/api/workspaces", map[string]string{"title": "Distributed Systems", "categoryId": firstCategory.ID}))

	moved := call(t, api, "PATCH", "/api/workspaces/"+workspace.ID+"/category", map[string]string{"categoryId": secondCategory.ID})
	expect(t, moved, 200)
	if got := decodeWorkspace(t, moved).CategoryID; got != secondCategory.ID {
		t.Fatalf("moved workspace category = %q, want %q", got, secondCategory.ID)
	}

	all := call(t, api, "GET", "/api/workspaces?limit=1", nil)
	expect(t, all, 200)
	var page struct {
		Items      []domain.WorkspaceSummary `json:"items"`
		Total      int                       `json:"total"`
		NextOffset *int                      `json:"nextOffset"`
	}
	if err := json.Unmarshal(all.Body.Bytes(), &page); err != nil {
		t.Fatal(err)
	}
	if page.Total != 1 || len(page.Items) != 1 || page.Items[0].ID != workspace.ID || page.NextOffset != nil {
		t.Fatalf("bounded library page = %+v", page)
	}

	oldCategory := call(t, api, "GET", "/api/categories/"+firstCategory.ID+"/workspaces?limit=5", nil)
	expect(t, oldCategory, 200)
	if strings.Contains(oldCategory.Body.String(), workspace.ID) {
		t.Fatalf("moved workspace still appears in source category: %s", oldCategory.Body.String())
	}
}

func TestWorkspaceHasNoNoteState(t *testing.T) {
	ctx := context.Background()
	store, err := store.Open(ctx, filepath.Join(t.TempDir(), "canvas-only.db"))
	if err != nil {
		t.Fatal(err)
	}
	defer store.Close()
	api := newAPI(store)
	p := decodeWorkspace(t, call(t, api, "POST", "/api/workspaces", map[string]string{"title": "Canvas only"}))
	expect(t, call(t, api, "GET", "/api/workspaces/"+p.ID+"/notes", nil), http.StatusNotFound)
}

func TestProjectJourneyAndRestart(t *testing.T) {
	ctx := context.Background()
	dbPath := filepath.Join(t.TempDir(), "notespace.db")
	st, err := store.Open(ctx, dbPath)
	if err != nil {
		t.Fatal(err)
	}
	defer func() { _ = st.Close() }()
	api := newAPI(st)
	empty := call(t, api, "GET", "/api/workspaces", nil)
	expect(t, empty, 200)
	if !strings.Contains(empty.Body.String(), `"items":[]`) {
		t.Fatal(empty.Body.String())
	}
	created := call(t, api, "POST", "/api/workspaces", map[string]string{"title": "Distributed Systems"})
	expect(t, created, 201)
	p := decodeWorkspace(t, created)
	canvasUpdate := domain.CanvasUpdate{
		Version: p.CanvasVersion,
		Canvas:  domain.CanvasSnapshot{Format: "excalidraw", Version: 1, Data: json.RawMessage(`{"elements":[{"id":"client","type":"rectangle","x":20,"y":30}],"appState":{"scrollX":12,"scrollY":20,"zoom":{"value":1.2}},"files":{}}`)},
	}
	saved := call(t, api, "PATCH", "/api/workspaces/"+p.ID+"/canvas", canvasUpdate)
	expect(t, saved, 200)
	var expected domain.CanvasState
	if err := json.Unmarshal(saved.Body.Bytes(), &expected); err != nil {
		t.Fatal(err)
	}
	if expected.Version != 2 {
		t.Fatalf("version %d", expected.Version)
	}
	// A stale tab must not overwrite the canvas surface.
	expect(t, call(t, api, "PATCH", "/api/workspaces/"+p.ID+"/canvas", canvasUpdate), 409)
	if err := st.Close(); err != nil {
		t.Fatal(err)
	}
	st, err = store.Open(ctx, dbPath)
	if err != nil {
		t.Fatal(err)
	}
	api = newAPI(st)
	restored := call(t, api, "GET", "/api/workspaces/"+p.ID, nil)
	expect(t, restored, 200)
	got := decodeWorkspace(t, restored)
	if got.Title != p.Title || got.CanvasVersion != expected.Version || !reflect.DeepEqual(got.Canvas.Data, expected.Canvas.Data) {
		t.Fatalf("restart changed content: %+v", got)
	}
	second := call(t, api, "POST", "/api/workspaces", map[string]string{"title": "Networking"})
	expect(t, second, 201)
	if other := decodeWorkspace(t, second); other.ID == p.ID || strings.Contains(string(other.Canvas.Data), "client") {
		t.Fatal("project content leaked")
	}
	expect(t, deleteWorkspaceRequest(t, api, "/api/workspaces/"+p.ID), 204)
	expect(t, call(t, api, "GET", "/api/workspaces/"+p.ID, nil), 404)
	expect(t, deleteWorkspaceRequest(t, api, "/api/workspaces/"+p.ID), 404)
	expect(t, call(t, api, "GET", "/api/health", nil), 200)
}

func TestInvalidRequestsDoNotCreateProjects(t *testing.T) {
	store, err := store.Open(context.Background(), filepath.Join(t.TempDir(), "test.db"))
	if err != nil {
		t.Fatal(err)
	}
	defer store.Close()
	api := newAPI(store)
	for _, title := range []string{"", "   ", strings.Repeat("a", 161)} {
		expect(t, call(t, api, "POST", "/api/workspaces", map[string]string{"title": title}), 400)
	}
	for _, body := range []string{`{"title":"ok","extra":true}`, `{"title":"ok"} {}`, `null`, strings.Repeat(" ", 10<<20) + `{}`} {
		req := httptest.NewRequest("POST", "/api/workspaces", strings.NewReader(body))
		req.Header.Set("Content-Type", "application/json")
		res := httptest.NewRecorder()
		api.ServeHTTP(res, req)
		if res.Code != 400 && res.Code != 413 {
			t.Fatalf("malformed body accepted: %d", res.Code)
		}
	}
	req := httptest.NewRequest("POST", "/api/workspaces", strings.NewReader(`{"title":"cross-origin"}`))
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Origin", "https://untrusted.example")
	res := httptest.NewRecorder()
	api.ServeHTTP(res, req)
	expect(t, res, 403)
	req = httptest.NewRequest("POST", "/api/workspaces", strings.NewReader(`{"title":"wrong media"}`))
	res = httptest.NewRecorder()
	api.ServeHTTP(res, req)
	expect(t, res, 415)
	list := call(t, api, "GET", "/api/workspaces", nil)
	if !strings.Contains(list.Body.String(), `"items":[]`) {
		t.Fatal(list.Body.String())
	}
}

func TestWorkspaceQueryRejectsInvalidBoundaryValues(t *testing.T) {
	store, err := store.Open(context.Background(), filepath.Join(t.TempDir(), "query-boundary.db"))
	if err != nil {
		t.Fatal(err)
	}
	defer store.Close()
	api := newAPI(store)

	for _, query := range []string{
		"?limit=not-a-number",
		"?limit=0",
		"?limit=101",
		"?offset=-1",
		"?sort=unsupported",
		"?hasCanvas=maybe",
	} {
		expect(t, call(t, api, "GET", "/api/workspaces"+query, nil), 400)
	}
}

func TestLibraryMutationsUseComposedSameOriginBoundary(t *testing.T) {
	store, err := store.Open(context.Background(), filepath.Join(t.TempDir(), "library-origin.db"))
	if err != nil {
		t.Fatal(err)
	}
	defer store.Close()

	workspace := decodeWorkspace(t, call(t, newAPI(store), "POST", "/api/workspaces", map[string]string{"title": "Protected workspace"}))
	composed := httpapi.WithSameOriginMutations(httpapi.New(apiDependencies(store)))
	req := httptest.NewRequest(http.MethodDelete, "/api/workspaces/"+workspace.ID, nil)
	req.Header.Set("Origin", "https://untrusted.example")
	res := httptest.NewRecorder()
	composed.ServeHTTP(res, req)
	expect(t, res, 403)
	expect(t, call(t, newAPI(store), "GET", "/api/workspaces/"+workspace.ID, nil), 200)
}

func TestInvalidSnapshotAndStorageFailure(t *testing.T) {
	store, err := store.Open(context.Background(), filepath.Join(t.TempDir(), "test.db"))
	if err != nil {
		t.Fatal(err)
	}
	api := newAPI(store)
	p := decodeWorkspace(t, call(t, api, "POST", "/api/workspaces", map[string]string{"title": "Keep me"}))
	update := domain.CanvasUpdate{Version: 1, Canvas: p.Canvas}
	update.Canvas.Format = "unknown"
	expect(t, call(t, api, "PATCH", "/api/workspaces/"+p.ID+"/canvas", update), 400)
	update.Canvas = p.Canvas
	update.Canvas.Data = json.RawMessage(`{"elements":null}`)
	expect(t, call(t, api, "PATCH", "/api/workspaces/"+p.ID+"/canvas", update), 400)
	if err := store.Close(); err != nil {
		t.Fatal(err)
	}
	failure := call(t, api, "GET", "/api/workspaces", nil)
	expect(t, failure, 500)
	if strings.Contains(failure.Body.String(), "sql:") {
		t.Fatal("storage internals leaked")
	}
}

func TestCanvasEndpointReturnsGranularStateOnly(t *testing.T) {
	ctx := context.Background()
	store, err := store.Open(ctx, filepath.Join(t.TempDir(), "canvas-state.db"))
	if err != nil {
		t.Fatal(err)
	}
	defer store.Close()
	api := newAPI(store)
	workspace := decodeWorkspace(t, call(t, api, "POST", "/api/workspaces", map[string]string{"title": "Canvas state"}))

	response := call(t, api, "GET", "/api/workspaces/"+workspace.ID+"/canvas", nil)
	expect(t, response, http.StatusOK)
	var state domain.CanvasState
	if err := json.Unmarshal(response.Body.Bytes(), &state); err != nil {
		t.Fatal(err)
	}
	if state.Version != workspace.CanvasVersion || string(state.Canvas.Data) != string(workspace.Canvas.Data) {
		t.Fatalf("canvas state = %+v, workspace version=%d", state, workspace.CanvasVersion)
	}
	if strings.Contains(response.Body.String(), `"notes"`) || strings.Contains(response.Body.String(), `"title"`) {
		t.Fatalf("canvas endpoint leaked aggregate workspace payload: %s", response.Body.String())
	}
}

// --- merged from workspace_integration_test.go ---

func TestInvalidWorkspaceMutationsPreserveDurableAggregate(t *testing.T) {
	ctx := context.Background()
	store, err := store.Open(ctx, filepath.Join(t.TempDir(), "workspace-invalid.db"))
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = store.Close() })
	api := newAPI(store)
	created := decodeWorkspace(t, call(t, api, http.MethodPost, "/api/workspaces", map[string]string{"title": "Stable state"}))
	before := decodeWorkspace(t, call(t, api, http.MethodGet, "/api/workspaces/"+created.ID, nil))

	expect(t, call(t, api, http.MethodPatch, "/api/workspaces/"+created.ID+"/title", map[string]string{"title": ""}), http.StatusBadRequest)

	invalidCanvas := domain.CanvasUpdate{
		Canvas: domain.CanvasSnapshot{
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
	store, err := store.Open(ctx, filepath.Join(t.TempDir(), "workspace-create-retry.db"))
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
	page, err := store.ListWorkspaces(ctx, domain.WorkspaceQuery{Limit: 10})
	if err != nil || page.Total != 1 {
		t.Fatalf("duplicate workspace created: total=%d error=%v", page.Total, err)
	}
}

// --- merged from workspace_metadata_conflict_proofs_test.go ---

func TestWorkspaceMetadataStalePreconditionsRejectWithoutMutation(t *testing.T) {
	ctx := context.Background()
	store, err := store.Open(ctx, filepath.Join(t.TempDir(), "metadata-stale-preconditions.db"))
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
		t.Fatalf("stale metadata request mutated persisted workspace: %+v", persisted.WorkspaceSummary)
	}
	if persisted.CanvasVersion != created.CanvasVersion {
		t.Fatal("stale metadata request modified authored state")
	}
}

// --- merged from workspace_pagination_test.go ---

func TestWorkspaceSnapshotHTTPKeepsStablePagesAndRejectsDifferentFilters(t *testing.T) {
	ctx := context.Background()
	store, err := store.Open(ctx, filepath.Join(t.TempDir(), "snapshot-http.db"))
	if err != nil {
		t.Fatal(err)
	}
	defer store.Close()
	api := newAPI(store)
	for _, title := range []string{"A", "B", "C", "D"} {
		expect(t, call(t, api, http.MethodPost, "/api/workspaces", map[string]string{"title": title}), http.StatusCreated)
	}
	decodePage := func(path string) domain.WorkspacePage {
		t.Helper()
		response := call(t, api, http.MethodGet, path, nil)
		expect(t, response, http.StatusOK)
		var page domain.WorkspacePage
		if err := json.Unmarshal(response.Body.Bytes(), &page); err != nil {
			t.Fatal(err)
		}
		return page
	}
	first := decodePage("/api/workspaces?limit=2&snapshot=start")
	if first.Total != 4 || len(first.Items) != 2 || first.Snapshot == "" || first.NextOffset == nil {
		t.Fatalf("invalid first page: %+v", first)
	}
	target := first.Items[1] // The old first-page receipt remains stable after rename.
	updated := decodeWorkspace(t, call(t, api, http.MethodGet, "/api/workspaces/"+target.ID, nil))
	expect(t, call(t, api, http.MethodPatch, "/api/workspaces/"+target.ID+"/title", map[string]string{
		"title": "Changed after snapshot", "expectedTitle": updated.Title,
	}), http.StatusOK)
	pageURL := "/api/workspaces?limit=2&offset=2&snapshot=" + url.QueryEscape(first.Snapshot)
	next := decodePage(pageURL)
	if next.Total != 4 || len(next.Items) != 2 ||
		next.Items[0].ID == first.Items[0].ID || next.Items[0].ID == first.Items[1].ID ||
		next.Items[1].ID == first.Items[0].ID || next.Items[1].ID == first.Items[1].ID {
		t.Fatalf("snapshot yielded overlapping page: first=%+v next=%+v", first.Items, next.Items)
	}
	expect(t, call(t, api, http.MethodGet,
		"/api/workspaces?limit=2&sort=notes&offset=2&snapshot="+url.QueryEscape(first.Snapshot), nil),
		http.StatusBadRequest)
	expect(t, call(t, api, http.MethodGet, "/api/workspaces?limit=2&offset=2&snapshot=start", nil),
		http.StatusBadRequest)
	legacy := decodePage("/api/workspaces?limit=2")
	if legacy.Snapshot != "" {
		t.Fatal("legacy offset endpoint unexpectedly started a snapshot session")
	}
}

// --- merged from workspace_proofs_test.go ---

// Proves idempotency across overlapping requests, not just two sequential POSTs.
// Both handlers can observe the same missing ID before either INSERT commits.
func TestConcurrentWorkspaceCreateWithSameIdentityHasOneDurableEffect(t *testing.T) {
	ctx := context.Background()
	store, err := store.Open(ctx, filepath.Join(t.TempDir(), "concurrent-create.db"))
	if err != nil {
		t.Fatal(err)
	}
	defer store.Close()
	api := newAPI(store)

	payload, err := json.Marshal(map[string]string{"id": "same-client-command", "title": "Same intent"})
	if err != nil {
		t.Fatal(err)
	}
	const callers = 8
	var wg sync.WaitGroup
	start := make(chan struct{})
	responses := make(chan *httptest.ResponseRecorder, callers)
	for i := 0; i < callers; i++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			<-start
			request := httptest.NewRequest(http.MethodPost, "/api/workspaces", bytes.NewReader(payload))
			request.Header.Set("Content-Type", "application/json")
			response := httptest.NewRecorder()
			api.ServeHTTP(response, request)
			responses <- response
		}()
	}
	close(start)
	wg.Wait()
	close(responses)

	for response := range responses {
		if response.Code != http.StatusCreated {
			t.Fatalf("concurrent replay status %d: %s", response.Code, response.Body.String())
		}
		var created domain.Workspace
		if err := json.Unmarshal(response.Body.Bytes(), &created); err != nil {
			t.Fatal(err)
		}
		if created.ID != "same-client-command" {
			t.Fatalf("unexpected replay receipt: %+v", created.WorkspaceSummary)
		}
	}
	page, err := store.ListWorkspaces(ctx, domain.WorkspaceQuery{Limit: 10})
	if err != nil || page.Total != 1 {
		t.Fatalf("concurrent CREATE produced total=%d, err=%v", page.Total, err)
	}
}

func TestWorkspaceCreateIdentityRejectsConcurrentDifferentPayloads(t *testing.T) {
	ctx := context.Background()
	store, err := store.Open(ctx, filepath.Join(t.TempDir(), "concurrent-different-intents.db"))
	if err != nil {
		t.Fatal(err)
	}
	defer store.Close()
	api := newAPI(store)

	start := make(chan struct{})
	type outcome struct {
		title    string
		response *httptest.ResponseRecorder
	}
	results := make(chan outcome, 2)
	var wg sync.WaitGroup
	for _, title := range []string{"First intention", "Second intention"} {
		wg.Add(1)
		go func(title string) {
			defer wg.Done()
			payload, _ := json.Marshal(map[string]string{"id": "reused-id", "title": title})
			<-start
			request := httptest.NewRequest(http.MethodPost, "/api/workspaces", bytes.NewReader(payload))
			request.Header.Set("Content-Type", "application/json")
			response := httptest.NewRecorder()
			api.ServeHTTP(response, request)
			results <- outcome{title, response}
		}(title)
	}
	close(start)
	wg.Wait()
	close(results)

	successes, conflicts := 0, 0
	var winner string
	for result := range results {
		switch result.response.Code {
		case http.StatusCreated:
			successes++
			winner = result.title
		case http.StatusConflict:
			conflicts++
		default:
			t.Fatalf("%q returned %d: %s", result.title, result.response.Code, result.response.Body.String())
		}
	}
	if successes != 1 || conflicts != 1 {
		t.Fatalf("expected one winner and one conflict, got successes=%d conflicts=%d", successes, conflicts)
	}
	persisted := decodeWorkspace(t, call(t, api, http.MethodGet, "/api/workspaces/reused-id", nil))
	if persisted.Title != winner {
		t.Fatalf("winner %q, persisted %q", winner, persisted.Title)
	}
	page, err := store.ListWorkspaces(ctx, domain.WorkspaceQuery{Limit: 10})
	if err != nil || page.Total != 1 {
		t.Fatalf("unexpected workspace count %d: %v", page.Total, err)
	}
}

func TestWorkspaceMetadataNoopsDoNotIncrementVersionOrInvalidateSnapshots(t *testing.T) {
	ctx := context.Background()
	store, err := store.Open(ctx, filepath.Join(t.TempDir(), "metadata-noop.db"))
	if err != nil {
		t.Fatal(err)
	}
	defer store.Close()
	api := newAPI(store)
	before := decodeWorkspace(t, call(t, api, http.MethodPost, "/api/workspaces", map[string]string{"title": "Unchanged"}))
	rename := decodeWorkspace(t, call(t, api, http.MethodPatch, "/api/workspaces/"+before.ID+"/title", map[string]string{
		"title": before.Title, "expectedTitle": before.Title,
	}))
	move := decodeWorkspace(t, call(t, api, http.MethodPatch, "/api/workspaces/"+before.ID+"/category", map[string]string{
		"categoryId": before.CategoryID, "expectedCategoryId": before.CategoryID,
	}))
	after := decodeWorkspace(t, call(t, api, http.MethodGet, "/api/workspaces/"+before.ID, nil))
	if rename.Version != before.Version || move.Version != before.Version || after.Version != before.Version {
		t.Fatalf("no-op metadata mutation advanced version: before=%d rename=%d move=%d after=%d", before.Version, rename.Version, move.Version, after.Version)
	}
	if after.CanvasVersion != before.CanvasVersion {
		t.Fatal("no-op metadata mutation replaced authored state")
	}
}

// --- merged from compatibility_http_test.go ---

func TestRemovedStudyAndHistoryCompatibilityRoutesStayUnavailable(t *testing.T) {
	store, err := store.Open(context.Background(), filepath.Join(t.TempDir(), "removed-compat-routes.db"))
	if err != nil {
		t.Fatal(err)
	}
	defer store.Close()
	api := newAPI(store)
	p := decodeWorkspace(t, call(t, api, "POST", "/api/workspaces", map[string]string{"title": "Compatibility boundary"}))

	for _, path := range []string{
		"/api/projects",
		"/api/projects/" + p.ID,
		"/api/workspaces/" + p.ID + "/history",
		"/api/projects/" + p.ID + "/history",
		"/api/workspaces/" + p.ID + "/study",
		"/api/workspaces/" + p.ID + "/study-sessions",
		"/api/study/activity?from=2026-09-03&to=2026-09-03",
		"/api/workspaces/" + p.ID + "/plan",
		"/api/tasks/today",
		"/api/captures",
		"/api/activity",
		"/api/notes/n1/backlinks",
	} {
		expect(t, call(t, api, "GET", path, nil), http.StatusNotFound)
	}
}

// --- merged from concurrency_test.go ---

func TestWorkspaceDeleteIfMatchRejectsStaleView(t *testing.T) {
	ctx := context.Background()
	store, err := store.Open(ctx, filepath.Join(t.TempDir(), "stale-delete-http.db"))
	if err != nil {
		t.Fatal(err)
	}
	defer store.Close()

	workspace, err := store.CreateWorkspace(ctx, "Initial")
	if err != nil {
		t.Fatal(err)
	}
	updated, err := store.RenameWorkspace(ctx, workspace.ID, "Newer", &workspace.Title)
	if err != nil {
		t.Fatal(err)
	}

	api := newAPI(store)
	remove := func(version int) *httptest.ResponseRecorder {
		t.Helper()
		req := httptest.NewRequest(http.MethodDelete, "/api/workspaces/"+workspace.ID, nil)
		req.Header.Set("If-Match", `"`+strconv.Itoa(version)+`"`)
		res := httptest.NewRecorder()
		api.ServeHTTP(res, req)
		return res
	}

	expect(t, remove(workspace.Version), http.StatusConflict)
	if current, err := store.GetWorkspace(ctx, workspace.ID); err != nil || current.Version != updated.Version {
		t.Fatalf("workspace after stale delete = %+v err=%v", current.WorkspaceSummary, err)
	}
	expect(t, remove(updated.Version), http.StatusNoContent)
}

func TestWorkspaceDeleteRequiresIfMatch(t *testing.T) {
	ctx := context.Background()
	store, err := store.Open(ctx, filepath.Join(t.TempDir(), "delete-precondition-http.db"))
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = store.Close() })

	workspace, err := store.CreateWorkspace(ctx, "Protected delete")
	if err != nil {
		t.Fatal(err)
	}
	api := newAPI(store)
	req := httptest.NewRequest(http.MethodDelete, "/api/workspaces/"+workspace.ID, nil)
	res := httptest.NewRecorder()
	api.ServeHTTP(res, req)
	expect(t, res, http.StatusBadRequest)

	current, err := store.GetWorkspace(ctx, workspace.ID)
	if err != nil || current.Version != workspace.Version {
		t.Fatalf("workspace changed after missing precondition: %+v err=%v", current.WorkspaceSummary, err)
	}
}
