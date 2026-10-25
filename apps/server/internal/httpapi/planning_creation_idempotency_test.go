package httpapi_test

import (
	"bytes"
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"path/filepath"
	"sync"
	"testing"

	"github.com/howlil/notespace/apps/server/internal/planning"
	"github.com/howlil/notespace/apps/server/internal/sqlite"
)

func keyedPlanningPost(t *testing.T, api http.Handler, path, key string, body any) *httptest.ResponseRecorder {
	t.Helper()
	data, err := json.Marshal(body)
	if err != nil {
		t.Fatal(err)
	}
	return sendKeyedPlanningPost(api, path, key, data)
}

func sendKeyedPlanningPost(api http.Handler, path, key string, data []byte) *httptest.ResponseRecorder {
	req := httptest.NewRequest(http.MethodPost, path, bytes.NewReader(data))
	req.Header.Set("Content-Type", "application/json")
	if key != "" {
		req.Header.Set("Idempotency-Key", key)
	}
	out := httptest.NewRecorder()
	api.ServeHTTP(out, req)
	return out
}

func TestPlanningCreateIdempotencySurvivesLostResponseAndServerRestart(t *testing.T) {
	ctx := context.Background()
	path := filepath.Join(t.TempDir(), "planning-keyed-http.db")
	store, err := sqlite.Open(ctx, path)
	if err != nil {
		t.Fatal(err)
	}
	api := newAPI(store)
	workspace := decodeWorkspace(t, call(t, api, http.MethodPost, "/api/workspaces", map[string]string{"title": "Idempotent planning"}))
	milestoneURL := "/api/workspaces/"+workspace.ID+"/milestones"
	taskURL := "/api/workspaces/"+workspace.ID+"/tasks"

	milestoneBody := map[string]any{"title": " Milestone "}
	first := keyedPlanningPost(t, api, milestoneURL, "milestone-key", milestoneBody)
	expect(t, first, http.StatusCreated)
	var milestone planning.Milestone
	if err := json.Unmarshal(first.Body.Bytes(), &milestone); err != nil {
		t.Fatal(err)
	}

	taskBody := map[string]any{"title": "Task","milestoneId": milestone.ID,"plannedFor": "2026-10-26"}
	created := keyedPlanningPost(t, api, taskURL, "task-key", taskBody)
	expect(t, created, http.StatusCreated)
	var task planning.Task
	if err := json.Unmarshal(created.Body.Bytes(), &task); err != nil {
		t.Fatal(err)
	}

	// Both response bodies are dropped after persistence succeeds.
	if err := store.Close(); err != nil {
		t.Fatal(err)
	}
	reopened, err := sqlite.Open(ctx, path)
	if err != nil {
		t.Fatal(err)
	}
	defer reopened.Close()
	api = newAPI(reopened)
	milestoneReplay := keyedPlanningPost(t, api, milestoneURL, "milestone-key", map[string]any{"title": "Milestone"})
	expect(t, milestoneReplay, http.StatusCreated)
	var sameMilestone planning.Milestone
	if err := json.Unmarshal(milestoneReplay.Body.Bytes(), &sameMilestone); err != nil {
		t.Fatal(err)
	}
	if sameMilestone.ID != milestone.ID || sameMilestone.Version != milestone.Version {
		t.Fatalf("milestone replay generated another identity: %+v", sameMilestone)
	}
	taskReplay := keyedPlanningPost(t, api, taskURL, "task-key", taskBody)
	expect(t, taskReplay, http.StatusCreated)
	var sameTask planning.Task
	if err := json.Unmarshal(taskReplay.Body.Bytes(), &sameTask); err != nil {
		t.Fatal(err)
	}
	if sameTask.ID != task.ID || sameTask.Version != task.Version || sameTask.Position != task.Position {
		t.Fatalf("task replay generated another identity: %+v", sameTask)
	}

	// Same request identity cannot be reused to mutate the original intent.
	expect(t, keyedPlanningPost(t, api, milestoneURL, "milestone-key", map[string]any{"title": "Other"}), http.StatusConflict)
	expect(t, keyedPlanningPost(t, api, taskURL, "task-key", map[string]any{"title": "Other","milestoneId": milestone.ID,"plannedFor": "2026-10-26"}), http.StatusConflict)
	expect(t, keyedPlanningPost(t, api, taskURL, "task-key", map[string]any{"title": "Task","milestoneId": milestone.ID,"plannedFor": "2026-10-27"}), http.StatusConflict)

	// Distinct request identities are *not* deduplicated by equal titles.
	expect(t, keyedPlanningPost(t, api, taskURL, "second-task-key", taskBody), http.StatusCreated)
	expect(t, call(t, api, http.MethodPost, taskURL, taskBody), http.StatusCreated)
	expect(t, call(t, api, http.MethodPost, taskURL, taskBody), http.StatusCreated)

	plan, err := reopened.GetPlan(ctx, workspace.ID)
	if err != nil {
		t.Fatal(err)
	}
	if len(plan.Milestones) != 1 || len(plan.Tasks) != 4 {
		t.Fatalf("replays duplicated records or legacy create lost compatibility: %+v", plan)
	}
}

func TestPlanningCreateIdentityRejectsInvalidAndDeletedRecordReplay(t *testing.T) {
	ctx := context.Background()
	store, err := sqlite.Open(ctx, filepath.Join(t.TempDir(), "planning-tombstone.db"))
	if err != nil {
		t.Fatal(err)
	}
	defer store.Close()
	api := newAPI(store)
	workspace := decodeWorkspace(t, call(t, api, http.MethodPost, "/api/workspaces", map[string]string{"title": "Tombstone"}))
	url := "/api/workspaces/"+workspace.ID+"/tasks"
	body := map[string]string{"title": "Original"}
	expect(t, keyedPlanningPost(t, api, url, "bad key space", body), http.StatusBadRequest)
	created := keyedPlanningPost(t, api, url, "valid-delete-key", body)
	expect(t, created, http.StatusCreated)
	var item planning.Task
	if err := json.Unmarshal(created.Body.Bytes(), &item); err != nil {
		t.Fatal(err)
	}
	req := httptest.NewRequest(http.MethodDelete, url+"/"+item.ID, nil)
	req.Header.Set("If-Match", `"1"`)
	out := httptest.NewRecorder()
	api.ServeHTTP(out, req)
	expect(t, out, http.StatusNoContent)
	// A late arrival cannot resurrect a Task intentionally deleted by the user.
	expect(t, keyedPlanningPost(t, api, url, "valid-delete-key", body), http.StatusConflict)
}

func TestPlanningConcurrentDuplicatePostsPersistOnlyOneTaskAndMilestone(t *testing.T) {
	ctx := context.Background()
	store, err := sqlite.Open(ctx, filepath.Join(t.TempDir(), "planning-racing-post.db"))
	if err != nil {
		t.Fatal(err)
	}
	defer store.Close()
	api := newAPI(store)
	workspace := decodeWorkspace(t, call(t, api, http.MethodPost, "/api/workspaces", map[string]string{"title": "Concurrent creation"}))
	for _, kind := range []string{"milestones", "tasks"} {
		t.Run(kind, func(t *testing.T) {
			url := "/api/workspaces/"+workspace.ID+"/"+kind
			const count = 12
			results := make(chan *httptest.ResponseRecorder, count)
			start := make(chan struct{})
			var wg sync.WaitGroup
			data := []byte(`{"title": "Same logical request"}`)
			for i := 0; i < count; i++ {
				wg.Add(1)
				go func() {
					defer wg.Done()
					<-start
					results <- sendKeyedPlanningPost(api, url, "same-"+kind+"-key", data)
				}()
			}
			close(start)
			wg.Wait()
			close(results)
			id := ""
			for result := range results {
				expect(t, result, http.StatusCreated)
				var item struct {
				ID string `json:"id"`
			}
				if err := json.Unmarshal(result.Body.Bytes(), &item); err != nil {
					t.Fatal(err)
				}
				if id == "" {
					id = item.ID
				}
				if item.ID != id {
					t.Fatalf("concurrent duplicate created another ID: %q != %q", item.ID, id)
				}
			}
			plan, err := store.GetPlan(ctx, workspace.ID)
			if err != nil {
				t.Fatal(err)
			}
			if kind == "tasks" && len(plan.Tasks) != 1 {
				t.Fatalf("task count = %d, want one", len(plan.Tasks))
			}
			if kind == "milestones" && len(plan.Milestones) != 1 {
				t.Fatalf("milestone count = %d, want one", len(plan.Milestones))
			}
		})
	}
}
