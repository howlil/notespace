package planning

import (
	"context"
	"errors"
	"testing"
	"time"
)

func standaloneTaskFixture() Task {
	task := validTaskFixture()
	task.WorkspaceID = nil
	task.MilestoneID = nil
	return task
}

func TestUpdateAnyTaskLoadsGlobalTaskAndAppliesPatch(t *testing.T) {
	fixed := time.Date(2026, 9, 25, 2, 0, 0, 0, time.UTC)
	current := standaloneTaskFixture()
	store := &planningTestStore{task: current}
	title := " Updated standalone "

	got, err := NewService(store, &planningWorkspaceLookup{exists: true}, func() time.Time { return fixed }).
		UpdateAnyTask(context.Background(), current.ID, TaskPatch{Title: &title, Version: current.Version})
	if err != nil {
		t.Fatal(err)
	}
	if store.updateTaskInput.Title != "Updated standalone" || store.updateTaskInput.ID != current.ID {
		t.Fatalf("update input = %#v", store.updateTaskInput)
	}
	if got.Version != current.Version+1 {
		t.Fatalf("version = %d, want %d", got.Version, current.Version+1)
	}
}

func TestUpdateAnyTaskValidatesAndPropagatesGetFailure(t *testing.T) {
	store := &planningTestStore{}
	service := NewService(store, &planningWorkspaceLookup{exists: true}, nil)
	if _, err := service.UpdateAnyTask(context.Background(), "", TaskPatch{Version: 1}); !errors.Is(err, ErrInvalid) {
		t.Fatalf("blank task error = %v, want ErrInvalid", err)
	}
	if _, err := service.UpdateAnyTask(context.Background(), "task-1", TaskPatch{Version: 0}); !errors.Is(err, ErrInvalid) {
		t.Fatalf("zero version error = %v, want ErrInvalid", err)
	}

	want := errors.New("get failed")
	store.getTaskErr = want
	if _, err := service.UpdateAnyTask(context.Background(), "task-1", TaskPatch{Version: 1}); !errors.Is(err, want) {
		t.Fatalf("get error = %v, want %v", err, want)
	}
}

func TestDeleteAnyTaskOwnsStandaloneVersionGuard(t *testing.T) {
	current := standaloneTaskFixture()

	t.Run("success", func(t *testing.T) {
		store := &planningTestStore{task: current}
		err := NewService(store, &planningWorkspaceLookup{exists: true}, nil).
			DeleteAnyTask(context.Background(), current.ID, current.Version)
		if err != nil {
			t.Fatal(err)
		}
		if store.deleteTaskID != current.ID || store.deleteTaskVersion != current.Version {
			t.Fatalf("delete call = %q version=%d", store.deleteTaskID, store.deleteTaskVersion)
		}
	})

	t.Run("stale version", func(t *testing.T) {
		store := &planningTestStore{task: current}
		err := NewService(store, &planningWorkspaceLookup{exists: true}, nil).
			DeleteAnyTask(context.Background(), current.ID, current.Version-1)
		if !errors.Is(err, ErrConflict) {
			t.Fatalf("error = %v, want ErrConflict", err)
		}
		if store.deleteTaskID != "" {
			t.Fatal("stale delete reached store.DeleteTask")
		}
	})

	t.Run("missing task", func(t *testing.T) {
		store := &planningTestStore{getTaskErr: ErrNotFound}
		err := NewService(store, &planningWorkspaceLookup{exists: true}, nil).
			DeleteAnyTask(context.Background(), "missing", 1)
		if !errors.Is(err, ErrNotFound) {
			t.Fatalf("error = %v, want ErrNotFound", err)
		}
	})
}
