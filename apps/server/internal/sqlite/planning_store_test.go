package sqlite

import (
	"context"
	"errors"
	"path/filepath"
	"testing"
	"time"

	"github.com/howlil/notespace/apps/server/internal/planning"
	workspacepkg "github.com/howlil/notespace/apps/server/internal/workspace"
)

func TestWorkspacePlanningSurvivesTrashRestore(t *testing.T) {
	ctx := context.Background()
	store, err := Open(ctx, filepath.Join(t.TempDir(), "planning.db"))
	if err != nil {
		t.Fatal(err)
	}
	defer store.Close()

	workspace, err := (workspacepkg.Service{Store: store}).Create(ctx, "Planning durability")
	if err != nil {
		t.Fatal(err)
	}
	now := time.Date(2026, 9, 21, 7, 0, 0, 0, time.UTC)
	service := planning.NewService(store, store, func() time.Time { return now })

	milestone, err := service.CreateMilestone(ctx, workspace.ID, "Ship MVP")
	if err != nil {
		t.Fatal(err)
	}
	task, err := service.CreateTask(ctx, workspace.ID, &milestone.ID, "Finish planning flow")
	if err != nil {
		t.Fatal(err)
	}
	task, err = service.UpdateTask(ctx, workspace.ID, task.ID, planning.TaskPatch{
		Completed: boolPointer(true),
		Version:   task.Version,
	})
	if err != nil {
		t.Fatal(err)
	}

	if err := store.TrashWorkspaceAtomic(ctx, workspace.ID); err != nil {
		t.Fatal(err)
	}
	if _, err := store.RestoreTrashedWorkspaceAtomic(ctx, workspace.ID); err != nil {
		t.Fatal(err)
	}

	restored, err := service.GetPlan(ctx, workspace.ID)
	if err != nil {
		t.Fatal(err)
	}
	if len(restored.Milestones) != 1 || restored.Milestones[0].Title != "Ship MVP" {
		t.Fatalf("restored milestones mismatch: %#v", restored.Milestones)
	}
	if len(restored.Tasks) != 1 || restored.Tasks[0].Title != "Finish planning flow" || restored.Tasks[0].CompletedAt == nil {
		t.Fatalf("restored tasks mismatch: %#v", restored.Tasks)
	}

	if err := service.DeleteMilestone(ctx, workspace.ID, restored.Milestones[0].ID, restored.Milestones[0].Version); err != nil {
		t.Fatal(err)
	}
	afterDelete, err := service.GetPlan(ctx, workspace.ID)
	if err != nil {
		t.Fatal(err)
	}
	if len(afterDelete.Milestones) != 0 || len(afterDelete.Tasks) != 1 || afterDelete.Tasks[0].MilestoneID != nil {
		t.Fatalf("milestone deletion should preserve a loose task: %#v", afterDelete)
	}
}

func TestPlanningRejectsStaleTaskUpdate(t *testing.T) {
	ctx := context.Background()
	store, err := Open(ctx, filepath.Join(t.TempDir(), "planning-conflict.db"))
	if err != nil {
		t.Fatal(err)
	}
	defer store.Close()

	workspace, err := (workspacepkg.Service{Store: store}).Create(ctx, "Planning conflict")
	if err != nil {
		t.Fatal(err)
	}
	service := planning.NewService(store, store, nil)
	task, err := service.CreateTask(ctx, workspace.ID, nil, "First title")
	if err != nil {
		t.Fatal(err)
	}
	title := "Updated title"
	updated, err := service.UpdateTask(ctx, workspace.ID, task.ID, planning.TaskPatch{Title: &title, Version: task.Version})
	if err != nil {
		t.Fatal(err)
	}
	if updated.Version != task.Version+1 {
		t.Fatalf("version = %d, want %d", updated.Version, task.Version+1)
	}
	staleTitle := "Stale update"
	_, err = service.UpdateTask(ctx, workspace.ID, task.ID, planning.TaskPatch{Title: &staleTitle, Version: task.Version})
	if !errors.Is(err, planning.ErrConflict) {
		t.Fatalf("stale update error = %v, want planning conflict", err)
	}
}

func boolPointer(value bool) *bool { return &value }

func TestTodayProjectsWorkspaceAndStandaloneTasks(t *testing.T) {
	ctx := context.Background()
	store, err := Open(ctx, filepath.Join(t.TempDir(), "today.db"))
	if err != nil {
		t.Fatal(err)
	}
	defer store.Close()

	workspace, err := (workspacepkg.Service{Store: store}).Create(ctx, "Today workspace")
	if err != nil {
		t.Fatal(err)
	}
	service := planning.NewService(store, store, nil)
	workspaceTask, err := service.CreateTask(ctx, workspace.ID, nil, "Workspace action")
	if err != nil {
		t.Fatal(err)
	}
	date := "2026-09-21"
	workspaceTask, err = service.UpdateTask(ctx, workspace.ID, workspaceTask.ID, planning.TaskPatch{
		PlannedFor: &date,
		Version:    workspaceTask.Version,
	})
	if err != nil {
		t.Fatal(err)
	}
	standalone, err := service.CreateStandaloneTask(ctx, "Standalone action", date)
	if err != nil {
		t.Fatal(err)
	}
	carryover, err := service.CreateStandaloneTask(ctx, "Carry unfinished work", "2026-09-20")
	if err != nil {
		t.Fatal(err)
	}
	inboxTask, err := service.CreateStandaloneTask(ctx, "Capture without scheduling", "")
	if err != nil {
		t.Fatal(err)
	}
	if inboxTask.PlannedFor != nil {
		t.Fatalf("inbox task plannedFor = %#v, want nil", inboxTask.PlannedFor)
	}
	if err := service.DeleteAnyTask(ctx, workspaceTask.ID, workspaceTask.Version); !errors.Is(err, planning.ErrInvalid) {
		t.Fatalf("global delete workspace task error = %v, want invalid", err)
	}

	today, err := service.Today(ctx, date)
	if err != nil {
		t.Fatal(err)
	}
	if len(today.Tasks) != 3 {
		t.Fatalf("today tasks = %d, want 3: %#v", len(today.Tasks), today.Tasks)
	}
	var sawWorkspace, sawStandalone, sawCarryover bool
	for _, task := range today.Tasks {
		switch task.ID {
		case workspaceTask.ID:
			sawWorkspace = task.WorkspaceID != nil && task.WorkspaceTitle != nil && *task.WorkspaceTitle == "Today workspace"
		case standalone.ID:
			sawStandalone = task.WorkspaceID == nil && task.WorkspaceTitle == nil
		case carryover.ID:
			sawCarryover = task.PlannedFor != nil && *task.PlannedFor == "2026-09-20"
		}
	}
	if !sawWorkspace || !sawStandalone || !sawCarryover {
		t.Fatalf("projection lost task ownership or carryover: %#v", today.Tasks)
	}

	inbox, err := service.Inbox(ctx)
	if err != nil {
		t.Fatal(err)
	}
	if len(inbox.Tasks) != 1 || inbox.Tasks[0].ID != inboxTask.ID {
		t.Fatalf("initial inbox = %#v, want only unplanned standalone task", inbox.Tasks)
	}

	clearStandalone := ""
	standalone, err = service.UpdateAnyTask(ctx, standalone.ID, planning.TaskPatch{
		PlannedFor: &clearStandalone,
		Version:    standalone.Version,
	})
	if err != nil {
		t.Fatal(err)
	}
	if standalone.PlannedFor != nil {
		t.Fatalf("cleared standalone plannedFor = %#v, want nil", standalone.PlannedFor)
	}
	inbox, err = service.Inbox(ctx)
	if err != nil {
		t.Fatal(err)
	}
	if len(inbox.Tasks) != 2 {
		t.Fatalf("inbox after unscheduling = %#v, want 2 tasks", inbox.Tasks)
	}
	today, err = service.Today(ctx, date)
	if err != nil {
		t.Fatal(err)
	}
	if len(today.Tasks) != 2 {
		t.Fatalf("today after standalone moved to inbox = %#v, want 2 tasks", today.Tasks)
	}

	clear := ""
	updated, err := service.UpdateAnyTask(ctx, workspaceTask.ID, planning.TaskPatch{
		PlannedFor: &clear,
		Version:    workspaceTask.Version,
	})
	if err != nil {
		t.Fatal(err)
	}
	if updated.PlannedFor != nil {
		t.Fatalf("plannedFor = %#v, want nil", updated.PlannedFor)
	}
	today, err = service.Today(ctx, date)
	if err != nil {
		t.Fatal(err)
	}
	if len(today.Tasks) != 1 {
		t.Fatalf("today after removal = %#v", today.Tasks)
	}
}
