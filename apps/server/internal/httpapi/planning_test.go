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

func TestUnassignedTaskInventoryPreservesScheduledAndCompletedHistory(t *testing.T) {
 ctx := context.Background()
 store, err := sqlite.Open(ctx, filepath.Join(t.TempDir(), "unassigned-http.db"))
 if err != nil { t.Fatal(err) }
 defer store.Close()
 api := newAPI(store)
 service := planning.NewService(store, store, nil)
 unscheduled, err := service.CreateStandaloneTask(ctx, "Unscheduled history", "")
 if err != nil { t.Fatal(err) }
 scheduled, err := service.CreateStandaloneTask(ctx, "Scheduled history", "2026-10-25")
 if err != nil { t.Fatal(err) }
 completed, err := service.CreateStandaloneTask(ctx, "Completed history", "")
 if err != nil { t.Fatal(err) }
 done := true
 completed, err = service.UpdateAnyTask(ctx, completed.ID, planning.TaskPatch{Completed: &done, Version: completed.Version})
 if err != nil { t.Fatal(err) }
 response := call(t, api, http.MethodGet, "/api/tasks/unassigned", nil)
 expect(t, response, http.StatusOK)
 var all planning.Inbox
 if err := json.Unmarshal(response.Body.Bytes(), &all); err != nil { t.Fatal(err) }
 if len(all.Tasks) != 3 { t.Fatalf("inventory = %#v, want 3", all.Tasks) }
 found := make(map[string]planning.Task)
 for _, task := range all.Tasks { found[task.ID] = task }
 if found[unscheduled.ID].ID == "" || found[scheduled.ID].PlannedFor == nil || found[completed.ID].CompletedAt == nil {
   t.Fatalf("historical status lost: %#v", found)
 }
 inbox := call(t, api, http.MethodGet, "/api/tasks/inbox", nil)
 expect(t, inbox, http.StatusOK)
 var active planning.Inbox
 if err := json.Unmarshal(inbox.Body.Bytes(), &active); err != nil { t.Fatal(err) }
 if len(active.Tasks) != 1 || active.Tasks[0].ID != unscheduled.ID {
   t.Fatalf("existing inbox behavior regressed: %#v", active.Tasks)
 }
 workspace := decodeWorkspace(t, call(t, api, http.MethodPost, "/api/workspaces", map[string]string{"title": "Migration target"}))
 moved := call(t, api, http.MethodPost, "/api/tasks/"+completed.ID+"/assign-workspace", map[string]any{"workspaceId": workspace.ID, "version": completed.Version})
 expect(t, moved, http.StatusOK)
 after := call(t, api, http.MethodGet, "/api/tasks/unassigned", nil)
 expect(t, after, http.StatusOK)
 var remaining planning.Inbox
 if err := json.Unmarshal(after.Body.Bytes(), &remaining); err != nil { t.Fatal(err) }
 if len(remaining.Tasks) != 2 { t.Fatalf("remaining historical tasks = %#v", remaining.Tasks) }
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

func TestUnassignedTaskInventoryIncludesScheduledAndCompletedHistory(t *testing.T) {
	ctx := context.Background()
	store, err := sqlite.Open(ctx, filepath.Join(t.TempDir(), "unassigned-inventory.db"))
	if err != nil {
		t.Fatal(err)
	}
	defer store.Close()
	api := newAPI(store)
	service := planning.NewService(store, store, nil)

	unscheduled, err := service.CreateStandaloneTask(ctx, "Unscheduled", "")
	if err != nil {
		t.Fatal(err)
	}
	scheduled, err := service.CreateStandaloneTask(ctx, "Scheduled", "2026-10-25")
	if err != nil {
		t.Fatal(err)
	}
	completed, err := service.CreateStandaloneTask(ctx, "Completed without date", "")
	if err != nil {
		t.Fatal(err)
	}
	done := true
	completed, err = service.UpdateAnyTask(ctx, completed.ID, planning.TaskPatch{
		Version: completed.Version, Completed: &done,
	})
	if err != nil {
		t.Fatal(err)
	}

	response := call(t, api, http.MethodGet, "/api/tasks/unassigned", nil)
	expect(t, response, http.StatusOK)
	var projection planning.Inbox
	if err := json.Unmarshal(response.Body.Bytes(), &projection); err != nil {
		t.Fatal(err)
	}
	seen := map[string]planning.Task{}
	for _, task := range projection.Tasks {
		seen[task.ID] = task
	}
	if len(seen) != 3 || seen[unscheduled.ID].ID != unscheduled.ID ||
		seen[scheduled.ID].PlannedFor == nil || seen[completed.ID].CompletedAt == nil {
		t.Fatalf("historical Task inventory incomplete: %#v", projection.Tasks)
	}
	legacyInbox := call(t, api, http.MethodGet, "/api/tasks/inbox", nil)
	expect(t, legacyInbox, http.StatusOK)
	var inbox planning.Inbox
	if err := json.Unmarshal(legacyInbox.Body.Bytes(), &inbox); err != nil {
		t.Fatal(err)
	}
	if len(inbox.Tasks) != 1 || inbox.Tasks[0].ID != unscheduled.ID {
		t.Fatalf("original Inbox contract changed: %#v", inbox.Tasks)
	}

	workspace := decodeWorkspace(t, call(t, api, http.MethodPost, "/api/workspaces", map[string]string{"title": "Inventory destination"}))
	assignment := call(t, api, http.MethodPost, "/api/tasks/"+completed.ID+"/assign-workspace",
		map[string]any{"workspaceId": workspace.ID, "version": completed.Version})
	expect(t, assignment, http.StatusOK)
	var moved planning.Task
	if err := json.Unmarshal(assignment.Body.Bytes(), &moved); err != nil {
		t.Fatal(err)
	}
	if moved.ID != completed.ID || moved.CompletedAt == nil || moved.WorkspaceID == nil ||
		*moved.WorkspaceID != workspace.ID {
		t.Fatalf("assignment lost completed Task identity: %#v", moved)
	}
	response = call(t, api, http.MethodGet, "/api/tasks/unassigned", nil)
	expect(t, response, http.StatusOK)
	if err := json.Unmarshal(response.Body.Bytes(), &projection); err != nil {
		t.Fatal(err)
	}
	for _, task := range projection.Tasks {
		if task.ID == completed.ID {
			t.Fatalf("moved Task still in inventory: %#v", projection.Tasks)
		}
	}
}
