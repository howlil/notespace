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

	// External task creation no longer allows an unowned Task.
	expect(t, call(t, api, http.MethodPost, "/api/tasks", map[string]string{"title": "Unowned"}), http.StatusBadRequest)
	service := planning.NewService(store, store, nil)
	task, err := service.CreateStandaloneTask(context.Background(), "Legacy Inbox task", "")
	if err != nil {
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

func TestPlanningAssignLegacyTaskAndAtomicTodayCreation(t *testing.T) {
	store, err := sqlite.Open(context.Background(), filepath.Join(t.TempDir(), "planning-assignment-http.db"))
	if err != nil {
		t.Fatal(err)
	}
	defer store.Close()
	api := newAPI(store)
	workspace := decodeWorkspace(t, call(t, api, http.MethodPost, "/api/workspaces", map[string]string{"title": "Destination"}))
	date := "2026-10-25"
	res := call(t, api, http.MethodPost, "/api/workspaces/"+workspace.ID+"/tasks", map[string]any{"title": "Scheduled at creation", "plannedFor": date})
	expect(t, res, http.StatusCreated)
	var owned planning.Task
	if err := json.Unmarshal(res.Body.Bytes(), &owned); err != nil {
		t.Fatal(err)
	}
	if owned.WorkspaceID == nil || *owned.WorkspaceID != workspace.ID || owned.PlannedFor == nil || *owned.PlannedFor != date || owned.Version != 1 {
		t.Fatalf("atomic create mismatch: %+v", owned)
	}
	service := planning.NewService(store, store, nil)
	legacy, err := service.CreateStandaloneTask(context.Background(), "Preserve identity", date)
	if err != nil {
		t.Fatal(err)
	}
	createdAt := legacy.CreatedAt
	description := "Legacy description with context"
	completed := true
	legacy, err = service.UpdateAnyTask(context.Background(), legacy.ID, planning.TaskPatch{
		Description: &description, Completed: &completed, Version: legacy.Version,
	})
	if err != nil {
		t.Fatal(err)
	}
	assign := map[string]any{"workspaceId": workspace.ID, "version": legacy.Version}
	first := call(t, api, http.MethodPost, "/api/tasks/"+legacy.ID+"/assign-workspace", assign)
	expect(t, first, http.StatusOK)
	var moved planning.Task
	if err := json.Unmarshal(first.Body.Bytes(), &moved); err != nil {
		t.Fatal(err)
	}
	if moved.ID != legacy.ID || moved.Version != legacy.Version+1 || moved.WorkspaceID == nil || *moved.WorkspaceID != workspace.ID || moved.PlannedFor == nil || *moved.PlannedFor != date || moved.CompletedAt == nil ||
		moved.CreatedAt != createdAt || moved.Description != description {
		t.Fatalf("migration changed task identity or dates: %+v", moved)
	}
	expect(t, call(t, api, http.MethodPost, "/api/tasks/"+legacy.ID+"/assign-workspace", assign), http.StatusOK)
	expect(t, call(t, api, http.MethodPost, "/api/tasks/"+legacy.ID+"/assign-workspace", map[string]any{"workspaceId": workspace.ID, "version": moved.Version}), http.StatusConflict)
	plan, err := store.GetPlan(context.Background(), workspace.ID)
	if err != nil {
		t.Fatal(err)
	}
	count := 0
	for _, task := range plan.Tasks {
		if task.ID == legacy.ID {
			count++
		}
	}
	if count != 1 {
		t.Fatalf("expected one migrated task, got %d", count)
	}
}
