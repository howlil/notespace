package httpapi_test

import (
	"bytes"
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"path/filepath"
	"reflect"
	"strings"
	"testing"

	"github.com/howlil/notespace/apps/server/internal/httpapi"
	"github.com/howlil/notespace/apps/server/internal/persistence"
	"github.com/howlil/notespace/apps/server/internal/project"
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
func expect(t *testing.T, res *httptest.ResponseRecorder, status int) {
	t.Helper()
	if res.Code != status {
		t.Fatalf("status %d, want %d: %s", res.Code, status, res.Body.String())
	}
}
func decodeProject(t *testing.T, res *httptest.ResponseRecorder) project.Project {
	t.Helper()
	var p project.Project
	if err := json.Unmarshal(res.Body.Bytes(), &p); err != nil {
		t.Fatal(err)
	}
	return p
}

func decodeCategories(t *testing.T, res *httptest.ResponseRecorder) []project.CategorySummary {
	t.Helper()
	var categories []project.CategorySummary
	if err := json.Unmarshal(res.Body.Bytes(), &categories); err != nil {
		t.Fatal(err)
	}
	return categories
}

func TestCategoryGroupsWorkspaces(t *testing.T) {
	store, err := persistence.Open(context.Background(), filepath.Join(t.TempDir(), "test.db"))
	if err != nil {
		t.Fatal(err)
	}
	defer store.Close()
	api := httpapi.New(store, store.Healthy)
	createdCategory := call(t, api, "POST", "/api/categories", map[string]string{"title": "Computer Science"})
	expect(t, createdCategory, 201)
	var category project.CategorySummary
	if err := json.Unmarshal(createdCategory.Body.Bytes(), &category); err != nil {
		t.Fatal(err)
	}
	createdWorkspace := call(t, api, "POST", "/api/projects", map[string]string{"title": "Distributed Systems", "categoryId": category.ID})
	expect(t, createdWorkspace, 201)
	if workspace := decodeProject(t, createdWorkspace); workspace.CategoryID != category.ID {
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

func TestCategoryAndWorkspaceInlineManagement(t *testing.T) {
	ctx := context.Background()
	store, err := persistence.Open(ctx, filepath.Join(t.TempDir(), "management.db"))
	if err != nil {
		t.Fatal(err)
	}
	defer store.Close()
	api := httpapi.New(store, store.Healthy)

	createdCategory := call(t, api, "POST", "/api/categories", map[string]string{"title": "Backend"})
	expect(t, createdCategory, 201)
	var category project.CategorySummary
	if err := json.Unmarshal(createdCategory.Body.Bytes(), &category); err != nil {
		t.Fatal(err)
	}

	renameCategory := call(t, api, "PATCH", "/api/categories/"+category.ID, map[string]string{"title": "Backend Engineering"})
	expect(t, renameCategory, 200)
	if got := decodeCategories(t, call(t, api, "GET", "/api/categories", nil))[0].Title; got != "Backend Engineering" {
		t.Fatalf("category title = %q, want %q", got, "Backend Engineering")
	}

	workspace := decodeProject(t, call(t, api, "POST", "/api/projects", map[string]string{"title": "Go", "categoryId": category.ID}))
	renameWorkspace := call(t, api, "PATCH", "/api/projects/"+workspace.ID+"/title", map[string]string{"title": "Golang"})
	expect(t, renameWorkspace, 200)
	if got := decodeProject(t, renameWorkspace).Title; got != "Golang" {
		t.Fatalf("workspace title = %q, want %q", got, "Golang")
	}

	// Category deletion must not cascade into authored workspace data.
	expect(t, call(t, api, "DELETE", "/api/categories/"+category.ID, nil), 409)
	expect(t, call(t, api, "GET", "/api/projects/"+workspace.ID, nil), 200)
	expect(t, call(t, api, "DELETE", "/api/projects/"+workspace.ID, nil), 204)
	expect(t, call(t, api, "DELETE", "/api/categories/"+category.ID, nil), 204)
	for _, listed := range decodeCategories(t, call(t, api, "GET", "/api/categories", nil)) {
		if listed.ID == category.ID {
			t.Fatal("deleted category remains listed")
		}
	}
}

func TestWorkspaceSupportsMultipleNotes(t *testing.T) {
	ctx := context.Background()
	store, err := persistence.Open(ctx, filepath.Join(t.TempDir(), "notes.db"))
	if err != nil {
		t.Fatal(err)
	}
	defer store.Close()
	api := httpapi.New(store, store.Healthy)
	p := decodeProject(t, call(t, api, "POST", "/api/projects", map[string]string{"title": "Research"}))
	second := project.Note{ID: "note-second", Title: "References", Document: p.Document, CreatedAt: p.CreatedAt, UpdatedAt: p.UpdatedAt}
	update := project.Update{Title: p.Title, Document: p.Document, Canvas: p.Canvas, Notes: append(p.Notes, second), SplitRatio: p.SplitRatio, Version: p.Version}
	saved := call(t, api, "PATCH", "/api/projects/"+p.ID, update)
	expect(t, saved, 200)
	got := decodeProject(t, saved)
	if len(got.Notes) != 2 || got.Notes[1].Title != "References" {
		t.Fatalf("notes not persisted: %+v", got.Notes)
	}
	reloaded := decodeProject(t, call(t, api, "GET", "/api/projects/"+p.ID, nil))
	if len(reloaded.Notes) != 2 || reloaded.Notes[1].ID != "note-second" {
		t.Fatalf("notes not durable: %+v", reloaded.Notes)
	}
}

func TestProjectJourneyAndRestart(t *testing.T) {
	ctx := context.Background()
	dbPath := filepath.Join(t.TempDir(), "notespace.db")
	store, err := persistence.Open(ctx, dbPath)
	if err != nil {
		t.Fatal(err)
	}
	defer func() { _ = store.Close() }()
	api := httpapi.New(store, store.Healthy)
	empty := call(t, api, "GET", "/api/projects", nil)
	expect(t, empty, 200)
	if strings.TrimSpace(empty.Body.String()) != "[]" {
		t.Fatal(empty.Body.String())
	}
	created := call(t, api, "POST", "/api/projects", map[string]string{"title": "Distributed Systems"})
	expect(t, created, 201)
	p := decodeProject(t, created)
	update := project.Update{Title: p.Title, Version: p.Version, SplitRatio: .6,
		Document:   project.Snapshot{Format: "tiptap", Version: 1, Data: json.RawMessage(`{"type":"doc","content":[{"type":"heading","attrs":{"level":2},"content":[{"type":"text","text":"Consensus"}]},{"type":"bulletList","content":[{"type":"listItem","content":[{"type":"paragraph","content":[{"type":"text","text":"Raft"}]}]}]}]}`)},
		Canvas:     project.Snapshot{Format: "excalidraw", Version: 1, Data: json.RawMessage(`{"elements":[{"id":"client","type":"rectangle","x":20,"y":30}],"appState":{"scrollX":12,"scrollY":20,"zoom":{"value":1.2}},"files":{}}`)},
		References: []project.Reference{{ID: "consensus-client", BlockID: "consensus", ElementID: "client"}},
	}
	saved := call(t, api, "PATCH", "/api/projects/"+p.ID, update)
	expect(t, saved, 200)
	expected := decodeProject(t, saved)
	if expected.Version != 2 {
		t.Fatalf("version %d", expected.Version)
	}
	// A stale tab must not overwrite either surface.
	expect(t, call(t, api, "PATCH", "/api/projects/"+p.ID, update), 409)
	if err := store.Close(); err != nil {
		t.Fatal(err)
	}
	store, err = persistence.Open(ctx, dbPath)
	if err != nil {
		t.Fatal(err)
	}
	api = httpapi.New(store, store.Healthy)
	restored := call(t, api, "GET", "/api/projects/"+p.ID, nil)
	expect(t, restored, 200)
	got := decodeProject(t, restored)
	if got.Title != expected.Title || got.SplitRatio != expected.SplitRatio || got.Version != expected.Version || string(got.Document.Data) != string(expected.Document.Data) || string(got.Canvas.Data) != string(expected.Canvas.Data) || !reflect.DeepEqual(got.References, expected.References) {
		t.Fatalf("restart changed content: %+v", got)
	}
	second := call(t, api, "POST", "/api/projects", map[string]string{"title": "Networking"})
	expect(t, second, 201)
	if other := decodeProject(t, second); other.ID == p.ID || strings.Contains(string(other.Document.Data), "Consensus") {
		t.Fatal("project content leaked")
	}
	expect(t, call(t, api, "DELETE", "/api/projects/"+p.ID, nil), 204)
	expect(t, call(t, api, "GET", "/api/projects/"+p.ID, nil), 404)
	expect(t, call(t, api, "DELETE", "/api/projects/"+p.ID, nil), 404)
	expect(t, call(t, api, "GET", "/api/health", nil), 200)
}

func TestInvalidRequestsDoNotCreateProjects(t *testing.T) {
	store, err := persistence.Open(context.Background(), filepath.Join(t.TempDir(), "test.db"))
	if err != nil {
		t.Fatal(err)
	}
	defer store.Close()
	api := httpapi.New(store, store.Healthy)
	for _, title := range []string{"", "   ", strings.Repeat("a", 161)} {
		expect(t, call(t, api, "POST", "/api/projects", map[string]string{"title": title}), 400)
	}
	for _, body := range []string{`{"title":"ok","extra":true}`, `{"title":"ok"} {}`, `null`, strings.Repeat(" ", 10<<20) + `{}`} {
		req := httptest.NewRequest("POST", "/api/projects", strings.NewReader(body))
		req.Header.Set("Content-Type", "application/json")
		res := httptest.NewRecorder()
		api.ServeHTTP(res, req)
		if res.Code != 400 && res.Code != 413 {
			t.Fatalf("malformed body accepted: %d", res.Code)
		}
	}
	req := httptest.NewRequest("POST", "/api/projects", strings.NewReader(`{"title":"cross-origin"}`))
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Origin", "https://untrusted.example")
	res := httptest.NewRecorder()
	api.ServeHTTP(res, req)
	expect(t, res, 403)
	req = httptest.NewRequest("POST", "/api/projects", strings.NewReader(`{"title":"wrong media"}`))
	res = httptest.NewRecorder()
	api.ServeHTTP(res, req)
	expect(t, res, 415)
	list := call(t, api, "GET", "/api/projects", nil)
	if strings.TrimSpace(list.Body.String()) != "[]" {
		t.Fatal(list.Body.String())
	}
}

func TestInvalidSnapshotAndStorageFailure(t *testing.T) {
	store, err := persistence.Open(context.Background(), filepath.Join(t.TempDir(), "test.db"))
	if err != nil {
		t.Fatal(err)
	}
	api := httpapi.New(store, store.Healthy)
	p := decodeProject(t, call(t, api, "POST", "/api/projects", map[string]string{"title": "Keep me"}))
	update := project.Update{Title: p.Title, Version: 1, SplitRatio: .45, Document: p.Document, Canvas: p.Canvas}
	update.Document.Format = "unknown"
	expect(t, call(t, api, "PATCH", "/api/projects/"+p.ID, update), 400)
	update.Document = p.Document
	update.Canvas.Data = json.RawMessage(`{"elements":null}`)
	expect(t, call(t, api, "PATCH", "/api/projects/"+p.ID, update), 400)
	update.Canvas = p.Canvas
	update.SplitRatio = .99
	expect(t, call(t, api, "PATCH", "/api/projects/"+p.ID, update), 400)
	if err := store.Close(); err != nil {
		t.Fatal(err)
	}
	failure := call(t, api, "GET", "/api/projects", nil)
	expect(t, failure, 500)
	if strings.Contains(failure.Body.String(), "sql:") {
		t.Fatal("storage internals leaked")
	}
}

func TestStudySessionsAreIdempotentAndHistorySurvivesWorkspaceDeletion(t *testing.T) {
	store, err := persistence.Open(context.Background(), filepath.Join(t.TempDir(), "study.db"))
	if err != nil { t.Fatal(err) }
	defer store.Close()
	api := httpapi.New(store, store.Healthy)
	p := decodeProject(t, call(t, api, "POST", "/api/projects", map[string]string{"title": "Backend Fundamentals"}))
	body := map[string]any{"activityDate": "2026-09-03", "activeSeconds": 120, "finish": false}
	path := "/api/workspaces/" + p.ID + "/study-sessions/session-1"
	expect(t, call(t, api, "PUT", path, body), 200)
	body["activeSeconds"] = 60
	expect(t, call(t, api, "PUT", path, body), 200)
	body["activeSeconds"] = 600
	expect(t, call(t, api, "PUT", path, body), 200)
	activity := call(t, api, "GET", "/api/study/activity?from=2026-09-03&to=2026-09-03", nil)
	expect(t, activity, 200)
	var summary struct { TodaySeconds int64 `json:"todaySeconds"`; Days []struct { ActiveSeconds int64 `json:"activeSeconds"` } `json:"days"` }
	if err := json.Unmarshal(activity.Body.Bytes(), &summary); err != nil { t.Fatal(err) }
	if summary.TodaySeconds != 600 || len(summary.Days) != 1 || summary.Days[0].ActiveSeconds != 600 { t.Fatalf("unexpected activity: %+v", summary) }
	expect(t, call(t, api, "DELETE", "/api/projects/"+p.ID, nil), 204)
	detail := call(t, api, "GET", "/api/study/activity/2026-09-03", nil)
	expect(t, detail, 200)
	var day struct { Workspaces []struct { Title string `json:"title"`; Deleted bool `json:"deleted"`; ActiveSeconds int64 `json:"activeSeconds"` } `json:"workspaces"` }
	if err := json.Unmarshal(detail.Body.Bytes(), &day); err != nil { t.Fatal(err) }
	if len(day.Workspaces) != 1 || day.Workspaces[0].Title != "Backend Fundamentals" || !day.Workspaces[0].Deleted || day.Workspaces[0].ActiveSeconds != 600 { t.Fatalf("history lost: %+v", day.Workspaces) }
}
