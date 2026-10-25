package sqlite

import (
	"context"
	"errors"
	"path/filepath"
	"sync"
	"testing"

	"github.com/howlil/notespace/apps/server/internal/planning"
	workspacepkg "github.com/howlil/notespace/apps/server/internal/workspace"
)

func TestConcurrentStandaloneTaskAssignmentIsIdempotentForSameDestination(t *testing.T) {
	ctx := context.Background()
	store, err := Open(ctx, filepath.Join(t.TempDir(), "planning-assignment-same.db"))
	if err != nil {
		t.Fatal(err)
	}
	defer store.Close()
	workspaces := workspacepkg.NewService(store)
	destination, err := workspaces.Create(ctx, "Destination")
	if err != nil {
		t.Fatal(err)
	}
	service := planning.NewService(store, store, nil)
	task, err := service.CreateStandaloneTask(ctx, "Preserve identity", "2026-10-26")
	if err != nil {
		t.Fatal(err)
	}
	results := make(chan struct {
		task planning.Task
		err  error
	}, 2)
	start := make(chan struct{})
	var wg sync.WaitGroup
	for i := 0; i < 2; i++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			<-start
			moved, err := service.AssignStandaloneTask(ctx, task.ID, destination.ID, task.Version)
			results <- struct {
				task planning.Task
				err  error
			}{moved, err}
		}()
	}
	close(start)
	wg.Wait()
	close(results)
	for result := range results {
		if result.err != nil {
			t.Fatalf("same-destination retry failed: %v", result.err)
		}
		moved := result.task
		if moved.ID != task.ID || moved.Version != task.Version+1 ||
			moved.WorkspaceID == nil || *moved.WorkspaceID != destination.ID ||
			moved.CreatedAt != task.CreatedAt || moved.PlannedFor == nil || *moved.PlannedFor != "2026-10-26" {
			t.Fatalf("duplicate request changed task identity or planning state: %+v", moved)
		}
	}
	plan, err := service.GetPlan(ctx, destination.ID)
	if err != nil {
		t.Fatal(err)
	}
	if len(plan.Tasks) != 1 || plan.Tasks[0].ID != task.ID {
		t.Fatalf("duplicate requests created extra Tasks: %+v", plan)
	}
	unassigned, err := service.Unassigned(ctx)
	if err != nil {
		t.Fatal(err)
	}
	if len(unassigned.Tasks) != 0 {
		t.Fatalf("assigned task remained unassigned: %+v", unassigned.Tasks)
	}
}

func TestConcurrentStandaloneTaskAssignmentToDifferentWorkspacesHasOneWinner(t *testing.T) {
	ctx := context.Background()
	store, err := Open(ctx, filepath.Join(t.TempDir(), "planning-assignment-conflict.db"))
	if err != nil {
		t.Fatal(err)
	}
	defer store.Close()
	workspaces := workspacepkg.NewService(store)
	first, err := workspaces.Create(ctx, "First destination")
	if err != nil {
		t.Fatal(err)
	}
	second, err := workspaces.Create(ctx, "Second destination")
	if err != nil {
		t.Fatal(err)
	}
	service := planning.NewService(store, store, nil)
	task, err := service.CreateStandaloneTask(ctx, "Assign once", "")
	if err != nil {
		t.Fatal(err)
	}
	type outcome struct {
		workspaceID string
		moved       planning.Task
		err         error
	}
	start := make(chan struct{})
	results := make(chan outcome, 2)
	var wg sync.WaitGroup
	for _, workspaceID := range []string{first.ID, second.ID} {
		wg.Add(1)
		go func(destination string) {
			defer wg.Done()
			<-start
			moved, err := service.AssignStandaloneTask(ctx, task.ID, destination, task.Version)
			results <- outcome{workspaceID: destination, moved: moved, err: err}
		}(workspaceID)
	}
	close(start)
	wg.Wait()
	close(results)

	winner, succeeded, conflicts := "", 0, 0
	for result := range results {
		switch {
		case result.err == nil:
			succeeded++
			winner = result.workspaceID
			if result.moved.WorkspaceID == nil || *result.moved.WorkspaceID != winner {
				t.Fatalf("success response has wrong owner: %+v", result.moved)
			}
		case errors.Is(result.err, planning.ErrConflict):
			conflicts++
		default:
			t.Fatalf("unexpected competing assignment error: %v", result.err)
		}
	}
	if succeeded != 1 || conflicts != 1 {
		t.Fatalf("expected one assignment and one conflict; got success=%d conflict=%d", succeeded, conflicts)
	}
	saved, err := service.GetTask(ctx, task.ID)
	if err != nil {
		t.Fatal(err)
	}
	if saved.WorkspaceID == nil || *saved.WorkspaceID != winner || saved.Version != task.Version+1 {
		t.Fatalf("persisted Task lost winner or CAS version: %+v", saved)
	}
	for _, dest := range []string{first.ID, second.ID} {
		plan, err := service.GetPlan(ctx, dest)
		if err != nil {
			t.Fatal(err)
		}
		if dest == winner && (len(plan.Tasks) != 1 || plan.Tasks[0].ID != task.ID) {
			t.Fatalf("winning destination missing Task: %+v", plan.Tasks)
		}
		if dest != winner && len(plan.Tasks) != 0 {
			t.Fatalf("losing destination contains Task: %+v", plan.Tasks)
		}
	}
}
