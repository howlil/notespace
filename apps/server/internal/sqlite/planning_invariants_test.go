package sqlite

import (
	"context"
	"errors"
	"fmt"
	"path/filepath"
	"sync"
	"testing"
	"time"

	"github.com/howlil/notespace/apps/server/internal/planning"
	workspacepkg "github.com/howlil/notespace/apps/server/internal/workspace"
)

func TestConcurrentMilestoneCreatesUseUniquePositions(t *testing.T) {
	ctx := context.Background()
	store, err := Open(ctx, filepath.Join(t.TempDir(), "milestone-concurrency.db"))
	if err != nil {
		t.Fatal(err)
	}
	defer store.Close()

	workspace, err := workspacepkg.NewService(store).Create(ctx, "Concurrent milestones")
	if err != nil {
		t.Fatal(err)
	}
	service := planning.NewService(store, store, nil)

	const count = 12
	var wg sync.WaitGroup
	errs := make(chan error, count)
	for i := 0; i < count; i++ {
		wg.Add(1)
		go func(index int) {
			defer wg.Done()
			_, err := service.CreateMilestone(ctx, workspace.ID, fmt.Sprintf("Milestone %d", index))
			errs <- err
		}(i)
	}
	wg.Wait()
	close(errs)
	for err := range errs {
		if err != nil {
			t.Fatalf("concurrent milestone create: %v", err)
		}
	}

	plan, err := service.GetPlan(ctx, workspace.ID)
	if err != nil {
		t.Fatal(err)
	}
	if len(plan.Milestones) != count {
		t.Fatalf("milestone count = %d, want %d", len(plan.Milestones), count)
	}
	seen := make(map[int]bool, count)
	for _, milestone := range plan.Milestones {
		if seen[milestone.Position] {
			t.Fatalf("duplicate milestone position %d", milestone.Position)
		}
		seen[milestone.Position] = true
	}
	for position := 0; position < count; position++ {
		if !seen[position] {
			t.Fatalf("missing milestone position %d", position)
		}
	}
}

func TestMilestoneLimitIsEnforcedAtPersistenceBoundary(t *testing.T) {
	ctx := context.Background()
	store, err := Open(ctx, filepath.Join(t.TempDir(), "milestone-limit.db"))
	if err != nil {
		t.Fatal(err)
	}
	defer store.Close()

	workspace, err := workspacepkg.NewService(store).Create(ctx, "Milestone limits")
	if err != nil {
		t.Fatal(err)
	}
	service := planning.NewService(store, store, nil)
	for i := 0; i < planning.MaxMilestonesPerWorkspace; i++ {
		if _, err := service.CreateMilestone(ctx, workspace.ID, fmt.Sprintf("Milestone %d", i)); err != nil {
			t.Fatalf("create milestone %d: %v", i, err)
		}
	}
	if _, err := service.CreateMilestone(ctx, workspace.ID, "Too many"); !errors.Is(err, planning.ErrInvalid) {
		t.Fatalf("overflow error = %v, want ErrInvalid", err)
	}
}

func TestTaskLimitIsEnforcedAtPersistenceBoundary(t *testing.T) {
	ctx := context.Background()
	store, err := Open(ctx, filepath.Join(t.TempDir(), "task-limit.db"))
	if err != nil {
		t.Fatal(err)
	}
	defer store.Close()

	workspace, err := workspacepkg.NewService(store).Create(ctx, "Task limits")
	if err != nil {
		t.Fatal(err)
	}

	tx, err := store.db.BeginTx(ctx, nil)
	if err != nil {
		t.Fatal(err)
	}
	now := time.Date(2026, 9, 25, 4, 0, 0, 0, time.UTC).Format(time.RFC3339Nano)
	statement := "INSERT INTO planning_tasks(id,workspace_id,milestone_id,title,description,position,planned_for,completed_at,created_at,updated_at,version) VALUES (?,?,?,?,?,?,?,?,?,?,?)"
	for i := 0; i < planning.MaxTasksPerWorkspace-1; i++ {
		if _, err := tx.ExecContext(ctx, statement,
			fmt.Sprintf("seed-task-%d", i), workspace.ID, nil, "Seed", "", i, nil, nil, now, now, 1,
		); err != nil {
			_ = tx.Rollback()
			t.Fatalf("seed task %d: %v", i, err)
		}
	}
	if err := tx.Commit(); err != nil {
		t.Fatal(err)
	}

	service := planning.NewService(store, store, func() time.Time {
		return time.Date(2026, 9, 25, 4, 1, 0, 0, time.UTC)
	})
	if _, err := service.CreateTask(ctx, workspace.ID, nil, "Task 1000"); err != nil {
		t.Fatalf("1000th task rejected: %v", err)
	}
	if _, err := service.CreateTask(ctx, workspace.ID, nil, "Task 1001"); !errors.Is(err, planning.ErrInvalid) {
		t.Fatalf("overflow error = %v, want ErrInvalid", err)
	}
}
