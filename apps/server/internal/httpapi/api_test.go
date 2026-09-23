package httpapi_test

import (
	"bytes"
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"path/filepath"
	"reflect"
	"strconv"
	"strings"
	"testing"

	"github.com/howlil/notespace/apps/server/internal/activity"
	"github.com/howlil/notespace/apps/server/internal/asset"
	"github.com/howlil/notespace/apps/server/internal/httpapi"
	"github.com/howlil/notespace/apps/server/internal/icon"
	"github.com/howlil/notespace/apps/server/internal/library"
	"github.com/howlil/notespace/apps/server/internal/planning"
	"github.com/howlil/notespace/apps/server/internal/sqlite"
	workspacepkg "github.com/howlil/notespace/apps/server/internal/workspace"
)

func call(t *testing.T, api http.Handler, method, path string, body any) *httptest.ResponseRecorder {
	t.Helper()
	data, err := json.Marshal(body)
	if err != nil {
		t.Fatal(err)
	}
	req := httptest.NewRequest(method, path, bytes.NewReader(data))
	req.Header.Set("Content-Type", "application/json")
	res := httptest.NewRecorder()
	api.ServeHTTP(res, req)
	return res
}

type testIconSource struct{}

func (testIconSource) Fetch(context.Context, string) (icon.Entry, error) {
	return icon.Entry{}, icon.ErrNotFound
}

func apiDependencies(store *sqlite.Store) httpapi.Dependencies {
	workspaceService := workspacepkg.NewService(store)
	planningService := planning.NewService(store, store, nil)
	activityService := activity.NewService(store, store, nil)
	assetService := asset.NewService(store, store)
	libraryService := library.NewService(store)
	return httpapi.Dependencies{
		Workspace: &workspaceService,
		Planning:  &planningService,
		Activity:  &activityService,
		Assets:    &assetService,
		Library:   &libraryService,
		Icons:     testIconSource{},
		Health:    store.Healthy,
	}
}

func newAPI(store *sqlite.Store) http.Handler {
	return httpapi.WithSameOriginMutations(httpapi.New(apiDependencies(store)))
}

func newLibraryAPI(store *sqlite.Store) http.Handler {
	return newAPI(store)
}

func expect(t *testing.T, res *httptest.ResponseRecorder, status int) {
	t.Helper()
	if res.Code != status {
		t.Fatalf("status %d, want %d: %s", res.Code, status, res.Body.String())
	}
}

func decodeWorkspace(t *testing.T, res *httptest.ResponseRecorder) workspacepkg.Workspace {
	t.Helper()
	var p workspacepkg.Workspace
	if err := json.Unmarshal(res.Body.Bytes(), &p); err != nil {
		t.Fatal(err)
	}
	return p
}

func decodeCategories(t *testing.T, res *httptest.ResponseRecorder) []workspacepkg.CategorySummary {
	t.Helper()
	var categories []workspacepkg.CategorySummary
	if err := json.Unmarshal(res.Body.Bytes(), &categories); err != nil {
		t.Fatal(err)
	}
	return categories
}

func TestLegacyProjectRoutesRemainCompatibleAndAdvertiseSuccessor(t *testing.T) {
	store, err := sqlite.Open(context.Background(), filepath.Join(t.TempDir(), "compat.db"))
	if err != nil {
		t.Fatal(err)
	}
	defer store.Close()
	api := newLibraryAPI(store)

	created := call(t, api, "POST", "/api/projects", map[string]string{"title": "Legacy client"})
	expect(t, created, http.StatusCreated)
	if created.Header().Get("Deprecation") != "true" || created.Header().Get("Link") == "" {
		t.Fatalf("legacy headers = deprecation=%q link=%q", created.Header().Get("Deprecation"), created.Header().Get("Link"))
	}
	workspace := decodeWorkspace(t, created)
	if got := created.Header().Get("Location"); got != "/api/projects/"+workspace.ID {
		t.Fatalf("legacy location = %q", got)
	}
	expect(t, call(t, api, "GET", "/api/projects/"+workspace.ID, nil), http.StatusOK)
	expect(t, call(t, api, "DELETE", "/api/projects/"+workspace.ID, nil), http.StatusNoContent)
}

func TestCategoryGroupsWorkspaces(t *testing.T) {
	store, err := sqlite.Open(context.Background(), filepath.Join(t.TempDir(), "test.db"))
	if err != nil {
		t.Fatal(err)
	}
	defer store.Close()
	api := newAPI(store)
	createdCategory := call(t, api, "POST", "/api/categories", map[string]string{"title": "Computer Science"})
	expect(t, createdCategory, 201)
	var category workspacepkg.CategorySummary
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
	store, err := sqlite.Open(context.Background(), filepath.Join(t.TempDir(), "uncategorized.db"))
	if err != nil {
		t.Fatal(err)
	}
	defer store.Close()
	api := newAPI(store)

	workspace := decodeWorkspace(t, call(t, api, "POST", "/api/workspaces", map[string]string{"title": "Root workspace"}))
	if workspace.CategoryID != workspacepkg.UncategorizedCategoryID {
		t.Fatalf("root workspace category = %q, want %q", workspace.CategoryID, workspacepkg.UncategorizedCategoryID)
	}
}

func TestCategoryWorkspaceBrowserSupportsScopedQueryAndPagination(t *testing.T) {
	store, err := sqlite.Open(context.Background(), filepath.Join(t.TempDir(), "category-browser.db"))
	if err != nil {
		t.Fatal(err)
	}
	defer store.Close()
	api := newAPI(store)
	createdCategory := call(t, api, "POST", "/api/categories", map[string]string{"title": "Backend"})
	expect(t, createdCategory, 201)
	var category workspacepkg.CategorySummary
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
		Items      []workspacepkg.Summary `json:"items"`
		Total      int                    `json:"total"`
		NextOffset *int                   `json:"nextOffset"`
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
	store, err := sqlite.Open(ctx, filepath.Join(t.TempDir(), "management.db"))
	if err != nil {
		t.Fatal(err)
	}
	defer store.Close()
	api := newAPI(store)

	createdCategory := call(t, api, "POST", "/api/categories", map[string]string{"title": "Backend"})
	expect(t, createdCategory, 201)
	var category workspacepkg.CategorySummary
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

	// Category deletion must not cascade into authored workspace data.
	expect(t, call(t, api, "DELETE", "/api/categories/"+category.ID, nil), 409)
	expect(t, call(t, api, "GET", "/api/workspaces/"+workspace.ID, nil), 200)
	expect(t, call(t, api, "DELETE", "/api/workspaces/"+workspace.ID, nil), 204)
	expect(t, call(t, api, "DELETE", "/api/categories/"+category.ID, nil), 204)
	for _, listed := range decodeCategories(t, call(t, api, "GET", "/api/categories", nil)) {
		if listed.ID == category.ID {
			t.Fatal("deleted category remains listed")
		}
	}
}

func TestWorkspaceMoveAndBoundedLibraryEndpoints(t *testing.T) {
	ctx := context.Background()
	store, err := sqlite.Open(ctx, filepath.Join(t.TempDir(), "library.db"))
	if err != nil {
		t.Fatal(err)
	}
	defer store.Close()
	api := newAPI(store)

	var firstCategory, secondCategory workspacepkg.CategorySummary
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
		Items      []workspacepkg.Summary `json:"items"`
		Total      int                    `json:"total"`
		NextOffset *int                   `json:"nextOffset"`
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

func TestWorkspaceSupportsMultipleNotes(t *testing.T) {
	ctx := context.Background()
	store, err := sqlite.Open(ctx, filepath.Join(t.TempDir(), "notes.db"))
	if err != nil {
		t.Fatal(err)
	}
	defer store.Close()
	api := newAPI(store)
	p := decodeWorkspace(t, call(t, api, "POST", "/api/workspaces", map[string]string{"title": "Research"}))
	second := workspacepkg.Note{ID: "note-second", Title: "References", Document: p.Document, CreatedAt: p.CreatedAt, UpdatedAt: p.UpdatedAt}
	update := workspacepkg.Update{Title: p.Title, Document: p.Document, Canvas: p.Canvas, Notes: append(p.Notes, second), SplitRatio: p.SplitRatio, Version: p.Version}
	saved := call(t, api, "PATCH", "/api/workspaces/"+p.ID, update)
	expect(t, saved, 200)
	got := decodeWorkspace(t, saved)
	if len(got.Notes) != 2 || got.Notes[1].Title != "References" {
		t.Fatalf("notes not persisted: %+v", got.Notes)
	}
	reloaded := decodeWorkspace(t, call(t, api, "GET", "/api/workspaces/"+p.ID, nil))
	if len(reloaded.Notes) != 2 || reloaded.Notes[1].ID != "note-second" {
		t.Fatalf("notes not durable: %+v", reloaded.Notes)
	}
}

func TestNoteHighlightAndReferenceMappingRoundTrip(t *testing.T) {
	ctx := context.Background()
	store, err := sqlite.Open(ctx, filepath.Join(t.TempDir(), "note-actions.db"))
	if err != nil {
		t.Fatal(err)
	}
	defer store.Close()
	api := newAPI(store)
	p := decodeWorkspace(t, call(t, api, "POST", "/api/workspaces", map[string]string{"title": "Note actions"}))
	note := p.Notes[0]
	note.Document = workspacepkg.Snapshot{
		Format:  "tiptap",
		Version: 1,
		Data:    json.RawMessage(`{"type":"doc","content":[{"type":"paragraph","attrs":{"blockId":"highlight-block"},"content":[{"type":"text","text":"Marked","marks":[{"type":"highlight"}]}]}]}`),
	}
	canvas := workspacepkg.Snapshot{
		Format:  "excalidraw",
		Version: 1,
		Data:    json.RawMessage(`{"elements":[{"id":"linked-element","type":"rectangle"}],"appState":{},"files":{}}`),
	}
	update := workspacepkg.Update{
		Title:      p.Title,
		Version:    p.Version,
		Document:   note.Document,
		Notes:      []workspacepkg.Note{note},
		Canvas:     canvas,
		References: []workspacepkg.Reference{{ID: "highlight-link", NoteID: note.ID, BlockID: "highlight-block", ElementID: "linked-element"}},
		SplitRatio: p.SplitRatio,
	}
	saved := call(t, api, "PATCH", "/api/workspaces/"+p.ID, update)
	expect(t, saved, 200)
	reloaded := decodeWorkspace(t, call(t, api, "GET", "/api/workspaces/"+p.ID, nil))
	if len(reloaded.Notes) != 1 || string(reloaded.Notes[0].Document.Data) != string(note.Document.Data) {
		t.Fatalf("highlighted note was not persisted: %+v", reloaded.Notes)
	}
	if !reflect.DeepEqual(reloaded.References, update.References) {
		t.Fatalf("reference mapping was not persisted: %+v", reloaded.References)
	}

	second := workspacepkg.Note{ID: "note-keep", Title: "Keep this note", Document: p.Document, CreatedAt: p.CreatedAt, UpdatedAt: p.UpdatedAt}
	deleted := update
	deleted.Version = reloaded.Version
	deleted.Document = second.Document
	deleted.Notes = []workspacepkg.Note{second}
	deleted.References = []workspacepkg.Reference{}
	expect(t, call(t, api, "PATCH", "/api/workspaces/"+p.ID, deleted), 200)
	afterDelete := decodeWorkspace(t, call(t, api, "GET", "/api/workspaces/"+p.ID, nil))
	if len(afterDelete.Notes) != 1 || afterDelete.Notes[0].ID != second.ID || len(afterDelete.References) != 0 {
		t.Fatalf("note deletion mapping was not persisted: notes=%+v references=%+v", afterDelete.Notes, afterDelete.References)
	}
}

func TestProjectJourneyAndRestart(t *testing.T) {
	ctx := context.Background()
	dbPath := filepath.Join(t.TempDir(), "notespace.db")
	store, err := sqlite.Open(ctx, dbPath)
	if err != nil {
		t.Fatal(err)
	}
	defer func() { _ = store.Close() }()
	api := newAPI(store)
	empty := call(t, api, "GET", "/api/workspaces", nil)
	expect(t, empty, 200)
	if !strings.Contains(empty.Body.String(), `"items":[]`) {
		t.Fatal(empty.Body.String())
	}
	created := call(t, api, "POST", "/api/workspaces", map[string]string{"title": "Distributed Systems"})
	expect(t, created, 201)
	p := decodeWorkspace(t, created)
	update := workspacepkg.Update{Title: p.Title, Version: p.Version, SplitRatio: .6,
		Document:   workspacepkg.Snapshot{Format: "tiptap", Version: 1, Data: json.RawMessage(`{"type":"doc","content":[{"type":"heading","attrs":{"level":2},"content":[{"type":"text","text":"Consensus"}]},{"type":"bulletList","content":[{"type":"listItem","content":[{"type":"paragraph","content":[{"type":"text","text":"Raft"}]}]}]}]}`)},
		Canvas:     workspacepkg.Snapshot{Format: "excalidraw", Version: 1, Data: json.RawMessage(`{"elements":[{"id":"client","type":"rectangle","x":20,"y":30}],"appState":{"scrollX":12,"scrollY":20,"zoom":{"value":1.2}},"files":{}}`)},
		References: []workspacepkg.Reference{{ID: "consensus-client", BlockID: "consensus", ElementID: "client"}},
	}
	saved := call(t, api, "PATCH", "/api/workspaces/"+p.ID, update)
	expect(t, saved, 200)
	expected := decodeWorkspace(t, saved)
	if expected.Version != 2 {
		t.Fatalf("version %d", expected.Version)
	}
	// A stale tab must not overwrite either surface.
	expect(t, call(t, api, "PATCH", "/api/workspaces/"+p.ID, update), 409)
	if err := store.Close(); err != nil {
		t.Fatal(err)
	}
	store, err = sqlite.Open(ctx, dbPath)
	if err != nil {
		t.Fatal(err)
	}
	api = newAPI(store)
	restored := call(t, api, "GET", "/api/workspaces/"+p.ID, nil)
	expect(t, restored, 200)
	got := decodeWorkspace(t, restored)
	if got.Title != expected.Title || got.SplitRatio != expected.SplitRatio || got.Version != expected.Version || string(got.Document.Data) != string(expected.Document.Data) || string(got.Canvas.Data) != string(expected.Canvas.Data) || !reflect.DeepEqual(got.References, expected.References) {
		t.Fatalf("restart changed content: %+v", got)
	}
	second := call(t, api, "POST", "/api/workspaces", map[string]string{"title": "Networking"})
	expect(t, second, 201)
	if other := decodeWorkspace(t, second); other.ID == p.ID || strings.Contains(string(other.Document.Data), "Consensus") {
		t.Fatal("project content leaked")
	}
	expect(t, call(t, api, "DELETE", "/api/workspaces/"+p.ID, nil), 204)
	expect(t, call(t, api, "GET", "/api/workspaces/"+p.ID, nil), 404)
	expect(t, call(t, api, "DELETE", "/api/workspaces/"+p.ID, nil), 404)
	expect(t, call(t, api, "GET", "/api/health", nil), 200)
}

func TestInvalidRequestsDoNotCreateProjects(t *testing.T) {
	store, err := sqlite.Open(context.Background(), filepath.Join(t.TempDir(), "test.db"))
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
	store, err := sqlite.Open(context.Background(), filepath.Join(t.TempDir(), "query-boundary.db"))
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
		"?hasNotes=maybe",
	} {
		expect(t, call(t, api, "GET", "/api/workspaces"+query, nil), 400)
	}
}

func TestLibraryMutationsUseComposedSameOriginBoundary(t *testing.T) {
	store, err := sqlite.Open(context.Background(), filepath.Join(t.TempDir(), "library-origin.db"))
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
	store, err := sqlite.Open(context.Background(), filepath.Join(t.TempDir(), "test.db"))
	if err != nil {
		t.Fatal(err)
	}
	api := newAPI(store)
	p := decodeWorkspace(t, call(t, api, "POST", "/api/workspaces", map[string]string{"title": "Keep me"}))
	update := workspacepkg.Update{Title: p.Title, Version: 1, SplitRatio: .45, Document: p.Document, Canvas: p.Canvas}
	update.Document.Format = "unknown"
	expect(t, call(t, api, "PATCH", "/api/workspaces/"+p.ID, update), 400)
	update.Document = p.Document
	update.Canvas.Data = json.RawMessage(`{"elements":null}`)
	expect(t, call(t, api, "PATCH", "/api/workspaces/"+p.ID, update), 400)
	update.Canvas = p.Canvas
	update.SplitRatio = .99
	expect(t, call(t, api, "PATCH", "/api/workspaces/"+p.ID, update), 400)
	if err := store.Close(); err != nil {
		t.Fatal(err)
	}
	failure := call(t, api, "GET", "/api/workspaces", nil)
	expect(t, failure, 500)
	if strings.Contains(failure.Body.String(), "sql:") {
		t.Fatal("storage internals leaked")
	}
}

func TestStudySessionsAreIdempotentAndHistorySurvivesWorkspaceDeletion(t *testing.T) {
	store, err := sqlite.Open(context.Background(), filepath.Join(t.TempDir(), "study.db"))
	if err != nil {
		t.Fatal(err)
	}
	defer store.Close()
	api := newAPI(store)
	p := decodeWorkspace(t, call(t, api, "POST", "/api/workspaces", map[string]string{"title": "Backend Fundamentals"}))
	body := map[string]any{"activityDate": "2026-09-03", "activeSeconds": 120, "finish": false}
	path := "/api/workspaces/" + p.ID + "/study-sessions/session-1"
	expect(t, call(t, api, "PUT", path, body), 200)
	body["activeSeconds"] = 60
	expect(t, call(t, api, "PUT", path, body), 200)
	body["activeSeconds"] = 600
	expect(t, call(t, api, "PUT", path, body), 200)
	activity := call(t, api, "GET", "/api/study/activity?from=2026-09-03&to=2026-09-03", nil)
	expect(t, activity, 200)
	var summary struct {
		TodaySeconds int64 `json:"todaySeconds"`
		Days         []struct {
			ActiveSeconds int64 `json:"activeSeconds"`
		} `json:"days"`
	}
	if err := json.Unmarshal(activity.Body.Bytes(), &summary); err != nil {
		t.Fatal(err)
	}
	if summary.TodaySeconds != 600 || len(summary.Days) != 1 || summary.Days[0].ActiveSeconds != 600 {
		t.Fatalf("unexpected activity: %+v", summary)
	}
	expect(t, call(t, api, "DELETE", "/api/workspaces/"+p.ID, nil), 204)
	detail := call(t, api, "GET", "/api/study/activity/2026-09-03", nil)
	expect(t, detail, 200)
	var day struct {
		Workspaces []struct {
			Title         string `json:"title"`
			Deleted       bool   `json:"deleted"`
			ActiveSeconds int64  `json:"activeSeconds"`
		} `json:"workspaces"`
	}
	if err := json.Unmarshal(detail.Body.Bytes(), &day); err != nil {
		t.Fatal(err)
	}
	if len(day.Workspaces) != 1 || day.Workspaces[0].Title != "Backend Fundamentals" || !day.Workspaces[0].Deleted || day.Workspaces[0].ActiveSeconds != 600 {
		t.Fatalf("history lost: %+v", day.Workspaces)
	}
}

func TestActivitySessionsSupportStandaloneAndTaskContext(t *testing.T) {
	store, err := sqlite.Open(context.Background(), filepath.Join(t.TempDir(), "activity.db"))
	if err != nil {
		t.Fatal(err)
	}
	defer store.Close()
	api := newAPI(store)

	workspace := decodeWorkspace(t, call(t, api, "POST", "/api/workspaces", map[string]string{"title": "WhoBack"}))
	taskResponse := call(t, api, "POST", "/api/workspaces/"+workspace.ID+"/tasks", map[string]string{"title": "Ship extension release"})
	expect(t, taskResponse, http.StatusCreated)
	var task struct {
		ID string `json:"id"`
	}
	if err := json.Unmarshal(taskResponse.Body.Bytes(), &task); err != nil {
		t.Fatal(err)
	}

	taskActivity := call(t, api, "PUT", "/api/activity/sessions/task-session:2026-09-21", map[string]any{
		"activityDate":  "2026-09-21",
		"activeSeconds": 900,
		"finish":        false,
		"title":         "",
		"activityType":  "build",
		"taskId":        task.ID,
	})
	expect(t, taskActivity, http.StatusOK)
	var taskSession struct {
		WorkspaceID  string `json:"workspaceId"`
		TaskID       string `json:"taskId"`
		Title        string `json:"title"`
		ActivityType string `json:"activityType"`
	}
	if err := json.Unmarshal(taskActivity.Body.Bytes(), &taskSession); err != nil {
		t.Fatal(err)
	}
	if taskSession.WorkspaceID != workspace.ID || taskSession.TaskID != task.ID || taskSession.Title != "Ship extension release" || taskSession.ActivityType != "build" {
		t.Fatalf("task activity context = %+v", taskSession)
	}

	// An active timer must keep accepting heartbeats after its source context
	// disappears. The client carries snapshots specifically for this case.
	expect(t, call(t, api, "DELETE", "/api/workspaces/"+workspace.ID, nil), http.StatusNoContent)
	finishedTaskActivity := call(t, api, "PUT", "/api/activity/sessions/task-session:2026-09-21", map[string]any{
		"activityDate":           "2026-09-21",
		"activeSeconds":          1200,
		"finish":                 true,
		"title":                  "Ship extension release",
		"activityType":           "build",
		"workspaceId":            workspace.ID,
		"workspaceTitleSnapshot": workspace.Title,
		"taskId":                 task.ID,
		"taskTitleSnapshot":      "Ship extension release",
	})
	expect(t, finishedTaskActivity, http.StatusOK)

	standalone := call(t, api, "PUT", "/api/activity/sessions/read-session:2026-09-21", map[string]any{
		"activityDate":  "2026-09-21",
		"activeSeconds": 300,
		"finish":        true,
		"title":         "Read database paper",
		"activityType":  "read",
	})
	expect(t, standalone, http.StatusOK)

	stats := call(t, api, "GET", "/api/activity/stats?date=2026-09-21", nil)
	expect(t, stats, http.StatusOK)
	var totals struct {
		TodaySeconds int64 `json:"todaySeconds"`
		TotalSeconds int64 `json:"totalSeconds"`
	}
	if err := json.Unmarshal(stats.Body.Bytes(), &totals); err != nil {
		t.Fatal(err)
	}
	if totals.TodaySeconds != 1500 || totals.TotalSeconds != 1500 {
		t.Fatalf("activity totals = %+v, want 1500/1500", totals)
	}

	history := call(t, api, "GET", "/api/activity/sessions?limit=10", nil)
	expect(t, history, http.StatusOK)
	var sessions []struct {
		ID           string `json:"id"`
		WorkspaceID  string `json:"workspaceId"`
		TaskID       string `json:"taskId"`
		ActivityType string `json:"activityType"`
	}
	if err := json.Unmarshal(history.Body.Bytes(), &sessions); err != nil {
		t.Fatal(err)
	}
	if len(sessions) != 2 {
		t.Fatalf("activity sessions = %+v, want 2 logical sessions", sessions)
	}

	expect(t, call(t, api, "DELETE", "/api/activity/sessions/read-session", nil), http.StatusNoContent)
	expect(t, call(t, api, "DELETE", "/api/activity/sessions/read-session", nil), http.StatusNotFound)
}

func TestSearchReturnsExactParentBlockContext(t *testing.T) {
	store, err := sqlite.Open(context.Background(), filepath.Join(t.TempDir(), "search.db"))
	if err != nil {
		t.Fatal(err)
	}
	defer store.Close()
	api := newAPI(store)
	p := decodeWorkspace(t, call(t, api, "POST", "/api/workspaces", map[string]string{"title": "Search workspace"}))
	p.Document = workspacepkg.Snapshot{Format: "tiptap", Version: 1, Data: json.RawMessage(`{"type":"doc","content":[{"type":"paragraph","attrs":{"blockId":"block-raft"},"content":[{"type":"text","text":"Raft consensus"}]}]}`)}
	p.Notes[0].Document = p.Document
	saved := call(t, api, "PATCH", "/api/workspaces/"+p.ID, workspacepkg.Update{Title: p.Title, Version: p.Version, Document: p.Document, Notes: p.Notes, Canvas: p.Canvas, References: p.References, SplitRatio: p.SplitRatio})
	expect(t, saved, 200)
	results := call(t, api, "GET", "/api/search?q=consensus", nil)
	expect(t, results, 200)
	var got []workspacepkg.SearchResult
	if err := json.Unmarshal(results.Body.Bytes(), &got); err != nil {
		t.Fatal(err)
	}
	if len(got) != 1 || got[0].BlockID != "block-raft" || got[0].NoteID != p.Notes[0].ID {
		t.Fatalf("search context = %+v", got)
	}
}

func TestHistoryStartsAtWorkspaceCreation(t *testing.T) {
	store, err := sqlite.Open(context.Background(), filepath.Join(t.TempDir(), "history.db"))
	if err != nil {
		t.Fatal(err)
	}
	defer store.Close()
	api := newAPI(store)
	p := decodeWorkspace(t, call(t, api, "POST", "/api/workspaces", map[string]string{"title": "Portable workspace"}))
	history := call(t, api, "GET", "/api/workspaces/"+p.ID+"/history", nil)
	expect(t, history, 200)
	var entries []workspacepkg.HistoryEntry
	if err := json.Unmarshal(history.Body.Bytes(), &entries); err != nil {
		t.Fatal(err)
	}
	if len(entries) != 1 || entries[0].Version != p.Version {
		t.Fatalf("initial history = %+v", entries)
	}
	expect(t, call(t, api, "GET", "/api/workspaces/"+p.ID+"/export", nil), http.StatusNotFound)
}

func TestHistoryRestoreReturnsPreviousWorkspaceState(t *testing.T) {
	store, err := sqlite.Open(context.Background(), filepath.Join(t.TempDir(), "restore.db"))
	if err != nil {
		t.Fatal(err)
	}
	defer store.Close()
	api := newAPI(store)
	p := decodeWorkspace(t, call(t, api, "POST", "/api/workspaces", map[string]string{"title": "History"}))
	first := p.Document
	first.Data = json.RawMessage(`{"type":"doc","content":[{"type":"paragraph","attrs":{"blockId":"first"},"content":[{"type":"text","text":"first"}]}]}`)
	saved := decodeWorkspace(t, call(t, api, "PATCH", "/api/workspaces/"+p.ID, workspacepkg.Update{Title: p.Title, Version: p.Version, Document: first, Notes: p.Notes, Canvas: p.Canvas, References: p.References, SplitRatio: p.SplitRatio}))
	second := saved.Document
	second.Data = json.RawMessage(`{"type":"doc","content":[{"type":"paragraph","attrs":{"blockId":"second"},"content":[{"type":"text","text":"second"}]}]}`)
	updated := call(t, api, "PATCH", "/api/workspaces/"+p.ID, workspacepkg.Update{Title: p.Title, Version: saved.Version, Document: second, Notes: p.Notes, Canvas: p.Canvas, References: p.References, SplitRatio: p.SplitRatio})
	expect(t, updated, 200)
	history := call(t, api, "GET", "/api/workspaces/"+p.ID+"/history", nil)
	expect(t, history, 200)
	var entries []workspacepkg.HistoryEntry
	if err := json.Unmarshal(history.Body.Bytes(), &entries); err != nil {
		t.Fatal(err)
	}
	if len(entries) != 1 {
		t.Fatalf("history entries = %d, want initial checkpoint only", len(entries))
	}
	restore := call(t, api, "POST", "/api/workspaces/"+p.ID+"/history/"+entries[0].ID+"/restore", nil)
	expect(t, restore, 200)
	if got := decodeWorkspace(t, restore); string(got.Document.Data) != string(p.Document.Data) {
		t.Fatalf("restored document = %s, want %s", got.Document.Data, p.Document.Data)
	}
}

func TestCanvasEndpointReturnsGranularStateOnly(t *testing.T) {
	ctx := context.Background()
	store, err := sqlite.Open(ctx, filepath.Join(t.TempDir(), "canvas-state.db"))
	if err != nil {
		t.Fatal(err)
	}
	defer store.Close()
	api := newAPI(store)
	workspace := decodeWorkspace(t, call(t, api, "POST", "/api/workspaces", map[string]string{"title": "Canvas state"}))

	response := call(t, api, "GET", "/api/workspaces/"+workspace.ID+"/canvas", nil)
	expect(t, response, http.StatusOK)
	var state workspacepkg.CanvasState
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
