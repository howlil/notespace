package httpapi_test

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"path/filepath"
	"strconv"
	"testing"

	"github.com/howlil/notespace/apps/server/internal/activity"
	"github.com/howlil/notespace/apps/server/internal/planning"
	"github.com/howlil/notespace/apps/server/internal/sqlite"
)

func TestActivityCannotAttributeUnassignedTaskToUnrelatedWorkspace(t *testing.T) {
	ctx := context.Background()
	store, err := sqlite.Open(ctx, filepath.Join(t.TempDir(), "unassigned-attribution.db"))
	if err != nil {
		t.Fatal(err)
	}
	defer store.Close()
	api := newAPI(store)

	workspace := decodeWorkspace(t, call(t, api, http.MethodPost, "/api/workspaces", map[string]string{"title": "Unrelated Workspace"}))
	legacy, err := planning.NewService(store, store, nil).CreateStandaloneTask(ctx, "Unassigned legacy Task", "")
	if err != nil {
		t.Fatal(err)
	}
	body := map[string]any{
		"activityDate":           "2026-10-26",
		"activeSeconds":          45,
		"activityType":           "build",
		"taskId":                 legacy.ID,
		"taskTitleSnapshot":      legacy.Title,
		"workspaceId":            workspace.ID,
		"workspaceTitleSnapshot": workspace.Title,
	}
	expect(t, call(t, api, http.MethodPut, "/api/activity/sessions/mismatched:2026-10-26", body), http.StatusBadRequest)
	sessions, err := store.ListActivitySessions(ctx, 10)
	if err != nil {
		t.Fatal(err)
	}
	if len(sessions) != 0 {
		t.Fatalf("rejected Task/Workspace mismatch still persisted an Activity: %+v", sessions)
	}

	// Legacy activities without a Workspace remain valid until the Task is assigned.
	delete(body, "workspaceId")
	delete(body, "workspaceTitleSnapshot")
	response := call(t, api, http.MethodPut, "/api/activity/sessions/legacy:2026-10-26", body)
	expect(t, response, http.StatusOK)
	var recorded activity.Session
	if err := json.Unmarshal(response.Body.Bytes(), &recorded); err != nil {
		t.Fatal(err)
	}
	if recorded.TaskID != legacy.ID || recorded.WorkspaceID != "" {
		t.Fatalf("unassigned Task changed its Activity owner: %+v", recorded)
	}
}

func TestActivityFinalizationSurvivesTaskCompletionAndDeletion(t *testing.T) {
	ctx := context.Background()
	store, err := sqlite.Open(ctx, filepath.Join(t.TempDir(), "task-lifecycle-activity.db"))
	if err != nil {
		t.Fatal(err)
	}
	defer store.Close()
	api := newAPI(store)
	workspace := decodeWorkspace(t, call(t, api, http.MethodPost, "/api/workspaces", map[string]string{"title": "Activity Workspace"}))

	taskResponse := call(t, api, http.MethodPost, "/api/workspaces/"+workspace.ID+"/tasks", map[string]string{"title": "Build integration tests"})
	expect(t, taskResponse, http.StatusCreated)
	var task planning.Task
	if err := json.Unmarshal(taskResponse.Body.Bytes(), &task); err != nil {
		t.Fatal(err)
	}

	path := "/api/activity/sessions/task-lifecycle:2026-10-26"
	body := map[string]any{
		"activityDate":           "2026-10-26",
		"activeSeconds":          60,
		"activityType":           "build",
		"title":                  "Build integration tests",
		"taskId":                 task.ID,
		"taskTitleSnapshot":      task.Title,
		"workspaceId":            workspace.ID,
		"workspaceTitleSnapshot": workspace.Title,
	}
	expect(t, call(t, api, http.MethodPut, path, body), http.StatusOK)

	// Completion does not terminate an already-running Activity.
	patched := call(t, api, http.MethodPatch, "/api/tasks/"+task.ID, map[string]any{
		"version": task.Version, "completed": true,
	})
	expect(t, patched, http.StatusOK)
	var completed planning.Task
	if err := json.Unmarshal(patched.Body.Bytes(), &completed); err != nil {
		t.Fatal(err)
	}
	if completed.CompletedAt == nil || completed.Version != task.Version+1 {
		t.Fatalf("Task completion did not persist: %+v", completed)
	}
	body["activeSeconds"] = 120
	expect(t, call(t, api, http.MethodPut, path, body), http.StatusOK)

	// Deleting the completed Task must not delete its running Activity or
	// prevent finalization with the snapshots held by the timer.
	deleteRequest := httptest.NewRequest(http.MethodDelete, "/api/workspaces/"+workspace.ID+"/tasks/"+task.ID, nil)
	deleteRequest.Header.Set("If-Match", `"`+strconv.Itoa(completed.Version)+`"`)
	deleted := httptest.NewRecorder()
	api.ServeHTTP(deleted, deleteRequest)
	expect(t, deleted, http.StatusNoContent)

	body["activeSeconds"] = 180
	body["finish"] = true
	final := call(t, api, http.MethodPut, path, body)
	expect(t, final, http.StatusOK)
	var finished activity.Session
	if err := json.Unmarshal(final.Body.Bytes(), &finished); err != nil {
		t.Fatal(err)
	}
	if finished.WorkspaceID != workspace.ID || finished.TaskID != task.ID ||
		finished.ActiveSeconds != 180 || finished.EndedAt == nil {
		t.Fatalf("Task deletion broke Activity finalization/attribution: %+v", finished)
	}
	expect(t, call(t, api, http.MethodGet, "/api/tasks/"+task.ID, nil), http.StatusNotFound)

	history := call(t, api, http.MethodGet, "/api/activity/sessions?limit=10", nil)
	expect(t, history, http.StatusOK)
	var sessions []activity.Session
	if err := json.Unmarshal(history.Body.Bytes(), &sessions); err != nil {
		t.Fatal(err)
	}
	if len(sessions) != 1 || sessions[0].ActiveSeconds != 180 ||
		sessions[0].TaskTitleSnapshot != task.Title || sessions[0].EndedAt == nil {
		t.Fatalf("Activity history lost its deleted Task snapshot: %+v", sessions)
	}
	stats := call(t, api, http.MethodGet, "/api/activity/stats?date=2026-10-26", nil)
	expect(t, stats, http.StatusOK)
	var total activity.WorkspaceStats
	if err := json.Unmarshal(stats.Body.Bytes(), &total); err != nil {
		t.Fatal(err)
	}
	if total.TodaySeconds != 180 || total.TotalSeconds != 180 {
		t.Fatalf("Task lifecycle changed Activity totals: %+v", total)
	}
}
