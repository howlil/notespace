package planning

import (
	"context"
	"testing"
	"time"
)

func TestUpdateMilestoneCanReopenCompletedMilestone(t *testing.T) {
	fixed := time.Date(2026, 9, 25, 3, 0, 0, 0, time.UTC)
	current := validMilestoneFixture()
	completedAt := "2026-09-24T10:00:00Z"
	current.CompletedAt = &completedAt
	store := &planningTestStore{plan: Plan{WorkspaceID: current.WorkspaceID, Milestones: []Milestone{current}}}
	service := NewService(store, &planningWorkspaceLookup{exists: true}, func() time.Time { return fixed })

	updated, err := service.UpdateMilestone(context.Background(), current.WorkspaceID, current.ID, MilestonePatch{
		Completed: boolPointerTest(false),
		Version:   current.Version,
	})
	if err != nil {
		t.Fatal(err)
	}
	if store.updateMilestoneInput.CompletedAt != nil || updated.CompletedAt != nil {
		t.Fatalf("reopened milestone kept completion: input=%#v result=%#v", store.updateMilestoneInput.CompletedAt, updated.CompletedAt)
	}
}
