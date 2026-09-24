package planning

import (
	"context"
	"errors"
	"testing"
	"time"
)

func TestApplyTaskPatchStateTransitions(t *testing.T) {
	const now = "2026-09-24T10:00:00Z"

	t.Run("complete incomplete task", func(t *testing.T) {
		current := validTaskFixture()
		next, err := applyTaskPatch(current, TaskPatch{Completed: boolPointerTest(true), Version: current.Version}, now)
		if err != nil {
			t.Fatal(err)
		}
		if next.CompletedAt == nil || *next.CompletedAt != now {
			t.Fatalf("completedAt = %#v", next.CompletedAt)
		}
	})
	t.Run("completing completed task preserves original timestamp", func(t *testing.T) {
		current := validTaskFixture()
		original := "2026-09-24T09:00:00Z"
		current.CompletedAt = &original
		next, err := applyTaskPatch(current, TaskPatch{Completed: boolPointerTest(true), Version: current.Version}, now)
		if err != nil {
			t.Fatal(err)
		}
		if next.CompletedAt == nil || *next.CompletedAt != original {
			t.Fatalf("completedAt = %#v", next.CompletedAt)
		}
	})
	t.Run("reopen completed task", func(t *testing.T) {
		current := validTaskFixture()
		current.CompletedAt = stringPointer("2026-09-24T09:00:00Z")
		next, err := applyTaskPatch(current, TaskPatch{Completed: boolPointerTest(false), Version: current.Version}, now)
		if err != nil {
			t.Fatal(err)
		}
		if next.CompletedAt != nil {
			t.Fatalf("completedAt = %#v, want nil", next.CompletedAt)
		}
	})
	t.Run("schedule and unschedule task", func(t *testing.T) {
		current := validTaskFixture()
		date := "2026-09-25"
		next, err := applyTaskPatch(current, TaskPatch{PlannedFor: &date, Version: current.Version}, now)
		if err != nil {
			t.Fatal(err)
		}
		if next.PlannedFor == nil || *next.PlannedFor != date {
			t.Fatalf("plannedFor = %#v", next.PlannedFor)
		}
		clear := ""
		next, err = applyTaskPatch(next, TaskPatch{PlannedFor: &clear, Version: next.Version}, now)
		if err != nil {
			t.Fatal(err)
		}
		if next.PlannedFor != nil {
			t.Fatalf("plannedFor = %#v, want nil", next.PlannedFor)
		}
	})
	t.Run("reject stale version", func(t *testing.T) {
		current := validTaskFixture()
		if _, err := applyTaskPatch(current, TaskPatch{Version: current.Version - 1}, now); !errors.Is(err, ErrConflict) {
			t.Fatalf("error = %v, want ErrConflict", err)
		}
	})
	t.Run("reject blank rename", func(t *testing.T) {
		current := validTaskFixture()
		title := " "
		if _, err := applyTaskPatch(current, TaskPatch{Title: &title, Version: current.Version}, now); !errors.Is(err, ErrInvalid) {
			t.Fatalf("error = %v, want ErrInvalid", err)
		}
	})
	t.Run("rename preserves unrelated state", func(t *testing.T) {
		current := validTaskFixture()
		title := "Renamed"
		next, err := applyTaskPatch(current, TaskPatch{Title: &title, Version: current.Version}, now)
		if err != nil {
			t.Fatal(err)
		}
		if next.ID != current.ID || next.WorkspaceID == nil || *next.WorkspaceID != *current.WorkspaceID ||
			next.MilestoneID == nil || *next.MilestoneID != *current.MilestoneID ||
			next.Description != current.Description || next.Position != current.Position || next.CreatedAt != current.CreatedAt {
			t.Fatalf("patch changed unrelated fields: before=%#v after=%#v", current, next)
		}
		if next.UpdatedAt != now {
			t.Fatalf("updatedAt = %q", next.UpdatedAt)
		}
	})
}

func TestCreateStandaloneTaskUsesDeterministicClockAndNormalizedInput(t *testing.T) {
	fixed := time.Date(2026, 9, 24, 10, 0, 0, 0, time.UTC)
	store := &planningTestStore{}
	service := NewService(store, &planningWorkspaceLookup{exists: true}, func() time.Time { return fixed })
	task, err := service.CreateStandaloneTask(context.Background(), "  Read paper  ", "")
	if err != nil {
		t.Fatal(err)
	}
	if task.ID == "" || task.Title != "Read paper" || task.PlannedFor != nil {
		t.Fatalf("task = %#v", task)
	}
	if task.CreatedAt != fixed.Format(time.RFC3339Nano) || task.UpdatedAt != fixed.Format(time.RFC3339Nano) {
		t.Fatalf("timestamps = %#v", task)
	}
}

func TestDeleteAnyTaskRejectsWorkspaceOwnedTask(t *testing.T) {
	store := &planningTestStore{task: validTaskFixture()}
	service := NewService(store, &planningWorkspaceLookup{exists: true}, nil)
	if err := service.DeleteAnyTask(context.Background(), store.task.ID, store.task.Version); !errors.Is(err, ErrInvalid) {
		t.Fatalf("error = %v, want ErrInvalid", err)
	}
	if store.deleteTaskID != "" {
		t.Fatal("workspace-owned task should not reach global delete")
	}
}
