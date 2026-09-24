package httpapi_test

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"path/filepath"
	"strconv"
	"testing"

	"github.com/howlil/notespace/apps/server/internal/planning"
	"github.com/howlil/notespace/apps/server/internal/sqlite"
)

func TestPlanningHTTPContract(t *testing.T) {
	ctx := context.Background()
	store, err := sqlite.Open(ctx, filepath.Join(t.TempDir(), "planning-http.db"))
	if err != nil {
		t.Fatal(err)
	}
	defer store.Close()
	api := newAPI(store)

	workspace := decodeWorkspace(t, call(t, api, http.MethodPost, "/api/workspaces", map[string]string{"title": "Planning HTTP"}))

	milestoneResponse := call(t, api, http.MethodPost, "/api/workspaces/"+workspace.ID+"/milestones", map[string]string{"title": "MVP"})
	expect(t, milestoneResponse, http.StatusCreated)
	var milestone planning.Milestone
	if err := json.Unmarshal(milestoneResponse.Body.Bytes(), &milestone); err != nil {
		t.Fatal(err)
	}

	taskResponse := call(t, api, http.MethodPost, "/api/workspaces/"+workspace.ID+"/tasks", map[string]any{
		"title":       "Ship backend",
		"milestoneId": milestone.ID,
	})
	expect(t, taskResponse, http.StatusCreated)
	var task planning.Task
	if err := json.Unmarshal(taskResponse.Body.Bytes(), &task); err != nil {
		t.Fatal(err)
	}

	updateResponse := call(t, api, http.MethodPatch, "/api/workspaces/"+workspace.ID+"/tasks/"+task.ID, map[string]any{
		"title":   "Ship backend safely",
		"version": task.Version,
	})
	expect(t, updateResponse, http.StatusOK)
	var updated planning.Task
	if err := json.Unmarshal(updateResponse.Body.Bytes(), &updated); err != nil {
		t.Fatal(err)
	}

	stale := call(t, api, http.MethodPatch, "/api/workspaces/"+workspace.ID+"/tasks/"+task.ID, map[string]any{
		"title":   "Stale write",
		"version": task.Version,
	})
	expect(t, stale, http.StatusConflict)
	var conflict struct {
		Code string `json:"code"`
	}
	if err := json.Unmarshal(stale.Body.Bytes(), &conflict); err != nil {
		t.Fatal(err)
	}
	if conflict.Code != "planning_conflict" {
		t.Fatalf("conflict code = %q", conflict.Code)
	}

	expect(t, call(t, api, http.MethodDelete, "/api/workspaces/"+workspace.ID+"/tasks/"+task.ID, nil), http.StatusBadRequest)

	req := httptest.NewRequest(http.MethodDelete, "/api/workspaces/"+workspace.ID+"/tasks/"+task.ID, nil)
	req.Header.Set("If-Match", `"`+strconv.Itoa(updated.Version)+`"`)
	res := httptest.NewRecorder()
	api.ServeHTTP(res, req)
	expect(t, res, http.StatusNoContent)
}

func TestPlanningTodayAndStandaloneHTTPContract(t *testing.T) {
	store, err := sqlite.Open(context.Background(), filepath.Join(t.TempDir(), "planning-projection-http.db"))
	if err != nil {
		t.Fatal(err)
	}
	defer store.Close()
	api := newAPI(store)

	expect(t, call(t, api, http.MethodGet, "/api/tasks/today?date=2026-02-30", nil), http.StatusBadRequest)
	expect(t, call(t, api, http.MethodGet, "/api/tasks/today?date=2026-09-25", nil), http.StatusOK)

	created := call(t, api, http.MethodPost, "/api/tasks", map[string]string{"title": "Inbox task"})
	expect(t, created, http.StatusCreated)
	var task planning.Task
	if err := json.Unmarshal(created.Body.Bytes(), &task); err != nil {
		t.Fatal(err)
	}

	expect(t, call(t, api, http.MethodGet, "/api/tasks/"+task.ID, nil), http.StatusOK)
	inbox := call(t, api, http.MethodGet, "/api/tasks/inbox", nil)
	expect(t, inbox, http.StatusOK)
	var projection planning.Inbox
	if err := json.Unmarshal(inbox.Body.Bytes(), &projection); err != nil {
		t.Fatal(err)
	}
	if len(projection.Tasks) != 1 || projection.Tasks[0].ID != task.ID {
		t.Fatalf("inbox = %#v", projection.Tasks)
	}

	expect(t, call(t, api, http.MethodDelete, "/api/tasks/"+task.ID, nil), http.StatusBadRequest)
	req := httptest.NewRequest(http.MethodDelete, "/api/tasks/"+task.ID, nil)
	req.Header.Set("If-Match", `"`+strconv.Itoa(task.Version)+`"`)
	res := httptest.NewRecorder()
	api.ServeHTTP(res, req)
	expect(t, res, http.StatusNoContent)
}
