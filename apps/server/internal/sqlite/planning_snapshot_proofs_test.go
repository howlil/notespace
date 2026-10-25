package sqlite

import (
	"context"
	"database/sql"
	"fmt"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"github.com/howlil/notespace/apps/server/internal/planning"
	workspacepkg "github.com/howlil/notespace/apps/server/internal/workspace"
)

// planningMutationBetweenQueries runs a real SQLite write only after the
// milestone result has been consumed, immediately before the task query.
type planningMutationBetweenQueries struct {
	planningQueryer
	beforeTaskQuery func() error
	injected        bool
}

func (q *planningMutationBetweenQueries) QueryContext(ctx context.Context, query string, args ...any) (*sql.Rows, error) {
	if strings.Contains(query, "FROM planning_tasks") && !q.injected {
		q.injected = true
		if err := q.beforeTaskQuery(); err != nil {
			return nil, err
		}
	}
	return q.planningQueryer.QueryContext(ctx, query, args...)
}

func TestPlanReadKeepsMilestoneAndTaskMembershipFromOneSQLiteSnapshot(t *testing.T) {
	ctx := context.Background()
	path := filepath.Join(t.TempDir(), "planning-read-snapshot.db")
	reader, err := Open(ctx, path)
	if err != nil {
		t.Fatal(err)
	}
	defer reader.Close()
	// A separate connection is required to commit writes while the reader's
	// WAL snapshot remains open. No database semantics are mocked.
	writer, err := Open(ctx, path)
	if err != nil {
		t.Fatal(err)
	}
	defer writer.Close()

	workspace, err := workspacepkg.NewService(reader).Create(ctx, "Plan snapshot")
	if err != nil {
		t.Fatal(err)
	}
	service := planning.NewService(writer, writer, func() time.Time {
		return time.Date(2026, 10, 26, 2, 0, 0, 0, time.UTC)
	})
	originalMilestone, err := service.CreateMilestone(ctx, workspace.ID, "Existing milestone")
	if err != nil {
		t.Fatal(err)
	}
	originalTask, err := service.CreateTask(ctx, workspace.ID, &originalMilestone.ID, "Existing task")
	if err != nil {
		t.Fatal(err)
	}

	tx, err := reader.db.BeginTx(ctx, &sql.TxOptions{ReadOnly: true})
	if err != nil {
		t.Fatal(err)
	}
	defer tx.Rollback()
	var createdMilestone planning.Milestone
	var createdTask planning.Task
	hook := &planningMutationBetweenQueries{
		planningQueryer: tx,
		beforeTaskQuery: func() error {
			var createErr error
			createdMilestone, createErr = service.CreateMilestone(ctx, workspace.ID, "Concurrent milestone")
			if createErr != nil {
				return createErr
			}
			createdTask, createErr = service.CreateTask(ctx, workspace.ID, &createdMilestone.ID, "Concurrent task")
			return createErr
		},
	}
	plan, err := readPlan(ctx, hook, workspace.ID)
	if err != nil {
		t.Fatal(err)
	}
	if !hook.injected {
		t.Fatal("fixture failed to commit between Milestone and Task queries")
	}
	if len(plan.Milestones) != 1 || len(plan.Tasks) != 1 ||
		plan.Milestones[0].ID != originalMilestone.ID || plan.Tasks[0].ID != originalTask.ID {
		t.Fatalf("reader mixed revisions from two commits: %+v", plan)
	}
	if err := planning.ValidatePlan(plan, workspace.ID); err != nil {
		t.Fatalf("snapshot violated plan references: %v", err)
	}
	if err := tx.Commit(); err != nil {
		t.Fatal(err)
	}

	fresh, err := planning.NewService(reader, reader, nil).GetPlan(ctx, workspace.ID)
	if err != nil {
		t.Fatal(err)
	}
	if len(fresh.Milestones) != 2 || len(fresh.Tasks) != 2 {
		t.Fatalf("fresh GetPlan did not see both committed additions: %+v", fresh)
	}
	if err := planning.ValidatePlan(fresh, workspace.ID); err != nil {
		t.Fatalf("fresh plan contains invalid milestone references: %v", err)
	}
	foundMilestone, foundTask := false, false
	for _, milestone := range fresh.Milestones {
		foundMilestone = foundMilestone || milestone.ID == createdMilestone.ID
	}
	for _, task := range fresh.Tasks {
		foundTask = foundTask || task.ID == createdTask.ID
	}
	if !foundMilestone || !foundTask {
		t.Fatal("fresh plan omitted concurrent milestone or Task")
	}
}

func TestPlanReadDoesNotExposePartialMilestoneAndTaskPairsUnderConcurrentCreates(t *testing.T) {
	ctx := context.Background()
	path := filepath.Join(t.TempDir(), "planning-snapshot-loop.db")
	store, err := Open(ctx, path)
	if err != nil {
		t.Fatal(err)
	}
	defer store.Close()
	workspace, err := workspacepkg.NewService(store).Create(ctx, "Concurrent planning")
	if err != nil {
		t.Fatal(err)
	}
	service := planning.NewService(store, store, nil)
	writerDone := make(chan error, 1)
	go func() {
		for i := 0; i < 16; i++ {
			milestone, err := service.CreateMilestone(ctx, workspace.ID, fmt.Sprintf("Milestone %d", i))
			if err != nil {
				writerDone <- err
				return
			}
			if _, err := service.CreateTask(ctx, workspace.ID, &milestone.ID, fmt.Sprintf("Task %d", i)); err != nil {
				writerDone <- err
				return
			}
		}
		writerDone <- nil
	}()
	for i := 0; i < 48; i++ {
		plan, err := service.GetPlan(ctx, workspace.ID)
		if err != nil {
			t.Fatal(err)
		}
		if err := planning.ValidatePlan(plan, workspace.ID); err != nil {
			t.Fatalf("GetPlan returned mixed revisions: %v; plan=%+v", err, plan)
		}
	}
	if err := <-writerDone; err != nil {
		t.Fatal(err)
	}
	final, err := service.GetPlan(ctx, workspace.ID)
	if err != nil {
		t.Fatal(err)
	}
	if len(final.Milestones) != 16 || len(final.Tasks) != 16 {
		t.Fatalf("concurrent create lost planning records: %+v", final)
	}
}
