package planning

import (
	"context"
	"errors"
	"testing"
	"time"
)

func TestCreateTaskRequiresWorkspaceAndBuildsCanonicalTask(t *testing.T) {
	fixed := time.Date(2026, 9, 24, 13, 0, 0, 0, time.UTC)
	store := &planningTestStore{}
	lookup := &planningWorkspaceLookup{exists: true}
	service := NewService(store, lookup, func() time.Time { return fixed })
	milestone := " milestone-1 "

	task, err := service.CreateTask(context.Background(), "workspace-1", &milestone, "  Ship tests  ")
	if err != nil {
		t.Fatal(err)
	}
	if lookup.seenID != "workspace-1" {
		t.Fatalf("workspace lookup = %q", lookup.seenID)
	}
	if task.ID == "" || task.WorkspaceID == nil || *task.WorkspaceID != "workspace-1" || task.Title != "Ship tests" || task.Version != 1 {
		t.Fatalf("task = %#v", task)
	}
	if task.MilestoneID == nil || *task.MilestoneID != "milestone-1" {
		t.Fatalf("milestone = %#v", task.MilestoneID)
	}
	wantTime := fixed.Format(time.RFC3339Nano)
	if task.CreatedAt != wantTime || task.UpdatedAt != wantTime {
		t.Fatalf("timestamps = %#v", task)
	}
}

func TestCreateTaskRejectsInvalidOrMissingWorkspaceBeforeStore(t *testing.T) {
	tests := []struct {
		name   string
		lookup *planningWorkspaceLookup
		id     string
		title  string
		want   error
	}{
		{"blank workspace", &planningWorkspaceLookup{exists: true}, " ", "Task", ErrInvalid},
		{"missing workspace", &planningWorkspaceLookup{exists: false}, "workspace-1", "Task", ErrNotFound},
		{"blank title", &planningWorkspaceLookup{exists: true}, "workspace-1", " ", ErrInvalid},
	}
	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			store := &planningTestStore{}
			_, err := NewService(store, tc.lookup, nil).CreateTask(context.Background(), tc.id, nil, tc.title)
			if !errors.Is(err, tc.want) {
				t.Fatalf("error = %v, want %v", err, tc.want)
			}
			if store.createTaskInput.ID != "" {
				t.Fatal("invalid create reached store")
			}
		})
	}

	want := errors.New("lookup failed")
	store := &planningTestStore{}
	_, err := NewService(store, &planningWorkspaceLookup{err: want}, nil).CreateTask(context.Background(), "workspace-1", nil, "Task")
	if !errors.Is(err, want) {
		t.Fatalf("lookup error = %v, want %v", err, want)
	}
}

func TestUpdateTaskLoadsWorkspacePlanAndForwardsMutation(t *testing.T) {
	fixed := time.Date(2026, 9, 24, 14, 0, 0, 0, time.UTC)
	current := validTaskFixture()
	store := &planningTestStore{
		plan: Plan{WorkspaceID: "workspace-1", Tasks: []Task{current}},
	}
	service := NewService(store, &planningWorkspaceLookup{exists: true}, func() time.Time { return fixed })
	title := " Updated "

	got, err := service.UpdateTask(context.Background(), "workspace-1", current.ID, TaskPatch{Title: &title, Version: current.Version})
	if err != nil {
		t.Fatal(err)
	}
	if store.updateTaskInput.Title != "Updated" || store.updateTaskInput.Version != current.Version {
		t.Fatalf("store update = %#v", store.updateTaskInput)
	}
	if got.Version != current.Version+1 {
		t.Fatalf("version = %d, want %d", got.Version, current.Version+1)
	}
}

func TestUpdateTaskRejectsMissingTaskAndPropagatesStoreFailure(t *testing.T) {
	service := NewService(
		&planningTestStore{plan: Plan{WorkspaceID: "workspace-1"}},
		&planningWorkspaceLookup{exists: true},
		nil,
	)
	if _, err := service.UpdateTask(context.Background(), "workspace-1", "missing", TaskPatch{Version: 1}); !errors.Is(err, ErrNotFound) {
		t.Fatalf("missing task error = %v", err)
	}

	want := errors.New("update failed")
	current := validTaskFixture()
	store := &planningTestStore{
		plan:          Plan{WorkspaceID: "workspace-1", Tasks: []Task{current}},
		updateTaskErr: want,
	}
	_, err := NewService(store, &planningWorkspaceLookup{exists: true}, nil).UpdateTask(
		context.Background(),
		"workspace-1",
		current.ID,
		TaskPatch{Version: current.Version},
	)
	if !errors.Is(err, want) {
		t.Fatalf("store error = %v, want %v", err, want)
	}
}

func TestDeleteTaskRequiresMembershipAndForwardsVersion(t *testing.T) {
	current := validTaskFixture()
	store := &planningTestStore{plan: Plan{WorkspaceID: "workspace-1", Tasks: []Task{current}}}
	service := NewService(store, &planningWorkspaceLookup{exists: true}, nil)

	if err := service.DeleteTask(context.Background(), "workspace-1", current.ID, current.Version); err != nil {
		t.Fatal(err)
	}
	if store.deleteTaskID != current.ID || store.deleteTaskVersion != current.Version {
		t.Fatalf("delete call = %q version=%d", store.deleteTaskID, store.deleteTaskVersion)
	}

	missing := &planningTestStore{plan: Plan{WorkspaceID: "workspace-1"}}
	err := NewService(missing, &planningWorkspaceLookup{exists: true}, nil).DeleteTask(context.Background(), "workspace-1", "missing", 1)
	if !errors.Is(err, ErrNotFound) {
		t.Fatalf("missing task error = %v", err)
	}
}
