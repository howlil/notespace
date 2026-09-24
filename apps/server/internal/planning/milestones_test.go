package planning

import (
	"context"
	"errors"
	"testing"
	"time"
)

func TestCreateMilestoneNormalizesInputAndUsesClock(t *testing.T) {
	fixed := time.Date(2026, 9, 24, 11, 0, 0, 0, time.UTC)
	store := &planningTestStore{}
	lookup := &planningWorkspaceLookup{exists: true}
	milestone, err := NewService(store, lookup, func() time.Time { return fixed }).CreateMilestone(context.Background(), "workspace-1", "  Ship MVP  ")
	if err != nil {
		t.Fatal(err)
	}
	if lookup.seenID != "workspace-1" {
		t.Fatalf("workspace lookup id = %q", lookup.seenID)
	}
	if milestone.ID == "" || milestone.Title != "Ship MVP" || milestone.WorkspaceID != "workspace-1" || milestone.Version != 1 {
		t.Fatalf("milestone = %#v", milestone)
	}
	if milestone.CreatedAt != fixed.Format(time.RFC3339Nano) || milestone.UpdatedAt != fixed.Format(time.RFC3339Nano) {
		t.Fatalf("timestamps = %#v", milestone)
	}
}

func TestUpdateMilestoneOwnsStateTransitionAndVersionGuard(t *testing.T) {
	fixed := time.Date(2026, 9, 24, 12, 0, 0, 0, time.UTC)
	current := validMilestoneFixture()
	store := &planningTestStore{plan: Plan{WorkspaceID: current.WorkspaceID, Milestones: []Milestone{current}}}
	service := NewService(store, &planningWorkspaceLookup{exists: true}, func() time.Time { return fixed })
	title := "  Launch  "
	updated, err := service.UpdateMilestone(context.Background(), current.WorkspaceID, current.ID, MilestonePatch{Title: &title, Completed: boolPointerTest(true), Version: current.Version})
	if err != nil {
		t.Fatal(err)
	}
	if store.updateMilestoneInput.Title != "Launch" || store.updateMilestoneInput.CompletedAt == nil || *store.updateMilestoneInput.CompletedAt != fixed.Format(time.RFC3339Nano) {
		t.Fatalf("update input = %#v", store.updateMilestoneInput)
	}
	if updated.Version != current.Version+1 {
		t.Fatalf("version = %d", updated.Version)
	}
	if _, err := service.UpdateMilestone(context.Background(), current.WorkspaceID, current.ID, MilestonePatch{Version: current.Version - 1}); !errors.Is(err, ErrConflict) {
		t.Fatalf("stale update error = %v", err)
	}
}

func TestDeleteMilestoneRequiresWorkspaceAndDelegatesVersion(t *testing.T) {
	store := &planningTestStore{}
	service := NewService(store, &planningWorkspaceLookup{exists: true}, nil)
	if err := service.DeleteMilestone(context.Background(), "workspace-1", "milestone-1", 3); err != nil {
		t.Fatal(err)
	}
	if store.deleteMilestoneWorkspaceID != "workspace-1" || store.deleteMilestoneID != "milestone-1" || store.deleteMilestoneVersion != 3 {
		t.Fatalf("delete call = %q %q %d", store.deleteMilestoneWorkspaceID, store.deleteMilestoneID, store.deleteMilestoneVersion)
	}
}
