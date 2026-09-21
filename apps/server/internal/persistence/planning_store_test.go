package persistence

import (
	"context"
	"errors"
	"path/filepath"
	"testing"
	"time"

	"github.com/howlil/notespace/apps/server/internal/planning"
	"github.com/howlil/notespace/apps/server/internal/project"
)

func TestWorkspacePlanningSurvivesTrashRestore(t *testing.T) {
	ctx := context.Background()
	store, err := Open(ctx, filepath.Join(t.TempDir(), "planning.db"))
	if err != nil {
		t.Fatal(err)
	}
	defer store.Close()

	workspace, err := (project.Service{Store: store}).Create(ctx, "Planning durability")
	if err != nil {
		t.Fatal(err)
	}
	now := time.Date(2026, 9, 21, 7, 0, 0, 0, time.UTC)
	service := planning.Service{Store: store, Now: func() time.Time { return now }}

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
	if _, err := store.RestoreTrashedWorkspace(ctx, workspace.ID); err != nil {
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

	workspace, err := (project.Service{Store: store}).Create(ctx, "Planning conflict")
	if err != nil {
		t.Fatal(err)
	}
	service := planning.Service{Store: store}
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
