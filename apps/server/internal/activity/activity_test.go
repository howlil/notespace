package activity

import (
	"context"
	"errors"
	"testing"
)

func TestCalculateStreakUsesTenMinuteStudyDays(t *testing.T) {
	days := []DayActivity{
		{Date: "2026-08-29", ActiveSeconds: 48 * 60},
		{Date: "2026-08-30", ActiveSeconds: 72 * 60},
		{Date: "2026-08-31", ActiveSeconds: 21 * 60},
		{Date: "2026-09-01", ActiveSeconds: 43 * 60},
		{Date: "2026-09-02", ActiveSeconds: 35 * 60},
		{Date: "2026-09-03", ActiveSeconds: 18 * 60},
	}
	if got := CalculateStreak(days, "2026-09-03"); got != 6 {
		t.Fatalf("streak = %d, want 6", got)
	}
	days[5].ActiveSeconds = 9 * 60
	if got := CalculateStreak(days, "2026-09-03"); got != 5 {
		t.Fatalf("streak after below-threshold today = %d, want 5", got)
	}
}

func TestCalculateStreakStopsAtMissingDay(t *testing.T) {
	days := []DayActivity{{Date: "2026-09-01", ActiveSeconds: 600}, {Date: "2026-09-03", ActiveSeconds: 600}}
	if got := CalculateStreak(days, "2026-09-03"); got != 1 {
		t.Fatalf("streak = %d, want 1", got)
	}
}

type referenceFixture struct {
	tasks      map[string]TaskRef
	workspaces map[string]WorkspaceRef
}

func (f referenceFixture) LookupTask(_ context.Context, id string) (TaskRef, bool, error) {
	value, ok := f.tasks[id]
	return value, ok, nil
}

func (f referenceFixture) LookupWorkspace(_ context.Context, id string) (WorkspaceRef, bool, error) {
	value, ok := f.workspaces[id]
	return value, ok, nil
}

func TestResolveReferencesUsesTaskThenWorkspace(t *testing.T) {
	workspaceID := "workspace-1"
	service := Service{references: referenceFixture{
		tasks: map[string]TaskRef{
			"task-1": {Title: "Task title", WorkspaceID: &workspaceID},
		},
		workspaces: map[string]WorkspaceRef{
			workspaceID: {Title: "Workspace title"},
		},
	}}
	input := ActivityHeartbeat{TaskID: "task-1", ActivityType: "build"}

	if err := service.resolveReferences(context.Background(), &input); err != nil {
		t.Fatal(err)
	}
	if input.TaskTitleSnapshot != "Task title" {
		t.Fatalf("task snapshot = %q", input.TaskTitleSnapshot)
	}
	if input.WorkspaceID != workspaceID || input.WorkspaceTitleSnapshot != "Workspace title" {
		t.Fatalf("workspace resolution = %#v", input)
	}
	if input.Title != "Task title" {
		t.Fatalf("title = %q, want task title", input.Title)
	}
}

func TestResolveReferencesPreservesExplicitTitle(t *testing.T) {
	workspaceID := "workspace-1"
	service := Service{references: referenceFixture{
		tasks: map[string]TaskRef{
			"task-1": {Title: "Task title", WorkspaceID: &workspaceID},
		},
		workspaces: map[string]WorkspaceRef{
			workspaceID: {Title: "Workspace title"},
		},
	}}
	input := ActivityHeartbeat{TaskID: "task-1", Title: "Explicit title", ActivityType: "build"}

	if err := service.resolveReferences(context.Background(), &input); err != nil {
		t.Fatal(err)
	}
	if input.Title != "Explicit title" {
		t.Fatalf("title = %q, want explicit title", input.Title)
	}
}

func TestResolveReferencesUsesDeletedTaskSnapshot(t *testing.T) {
	service := Service{references: referenceFixture{tasks: map[string]TaskRef{}, workspaces: map[string]WorkspaceRef{}}}
	input := ActivityHeartbeat{TaskID: "deleted-task", TaskTitleSnapshot: "Deleted task", ActivityType: "build"}

	if err := service.resolveReferences(context.Background(), &input); err != nil {
		t.Fatal(err)
	}
	if input.Title != "Deleted task" {
		t.Fatalf("title = %q, want deleted task snapshot", input.Title)
	}
}

func TestResolveReferencesRejectsMissingTaskWithoutSnapshot(t *testing.T) {
	service := Service{references: referenceFixture{tasks: map[string]TaskRef{}, workspaces: map[string]WorkspaceRef{}}}
	input := ActivityHeartbeat{TaskID: "missing-task", ActivityType: "build"}

	err := service.resolveReferences(context.Background(), &input)
	if !errors.Is(err, ErrTaskNotFound) {
		t.Fatalf("error = %v, want task not found", err)
	}
}

func TestResolveReferencesRejectsTaskWorkspaceMismatch(t *testing.T) {
	taskWorkspaceID := "workspace-1"
	service := Service{references: referenceFixture{
		tasks: map[string]TaskRef{
			"task-1": {Title: "Task", WorkspaceID: &taskWorkspaceID},
		},
		workspaces: map[string]WorkspaceRef{},
	}}
	input := ActivityHeartbeat{TaskID: "task-1", WorkspaceID: "workspace-2", ActivityType: "build"}

	err := service.resolveReferences(context.Background(), &input)
	if !errors.Is(err, ErrTaskWorkspaceMismatch) {
		t.Fatalf("error = %v, want task/workspace mismatch", err)
	}
}

func TestResolveReferencesUsesDeletedWorkspaceSnapshot(t *testing.T) {
	service := Service{references: referenceFixture{tasks: map[string]TaskRef{}, workspaces: map[string]WorkspaceRef{}}}
	input := ActivityHeartbeat{
		WorkspaceID:            "deleted-workspace",
		WorkspaceTitleSnapshot: "Deleted workspace",
		ActivityType:           "build",
	}

	if err := service.resolveReferences(context.Background(), &input); err != nil {
		t.Fatal(err)
	}
	if input.Title != "Deleted workspace" {
		t.Fatalf("title = %q, want workspace snapshot", input.Title)
	}
}
