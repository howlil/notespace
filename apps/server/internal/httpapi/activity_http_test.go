package httpapi_test

import (
	"context"
	"testing"

	"encoding/json"
	"github.com/howlil/notespace/apps/server/internal/sqlite"
	"net/http"
	"path/filepath"
)

func TestActivitySessionsAreIdempotentAndHistorySurvivesWorkspaceDeletion(t *testing.T) {
	store, err := sqlite.Open(context.Background(), filepath.Join(t.TempDir(), "activity.db"))
	if err != nil {
		t.Fatal(err)
	}
	defer store.Close()
	api := newAPI(store)
	p := decodeWorkspace(t, call(t, api, "POST", "/api/workspaces", map[string]string{"title": "Backend Fundamentals"}))
	body := map[string]any{
		"activityDate":  "2026-09-03",
		"activeSeconds": 120,
		"finish":        false,
		"activityType":  "learn",
		"workspaceId":   p.ID,
	}
	path := "/api/activity/sessions/session-1:2026-09-03"
	expect(t, call(t, api, "PUT", path, body), 200)
	body["activeSeconds"] = 60
	expect(t, call(t, api, "PUT", path, body), 200)
	body["activeSeconds"] = 600
	expect(t, call(t, api, "PUT", path, body), 200)
	activity := call(t, api, "GET", "/api/activity?from=2026-09-03&to=2026-09-03", nil)
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
	expect(t, deleteWorkspaceRequest(t, api, "/api/workspaces/"+p.ID), 204)
	detail := call(t, api, "GET", "/api/activity/2026-09-03", nil)
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
	expect(t, deleteWorkspaceRequest(t, api, "/api/workspaces/"+workspace.ID), http.StatusNoContent)
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
