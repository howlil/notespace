package planning

import (
	"context"
	"crypto/rand"
	"strings"
	"time"
)

func (s Service) CreateMilestone(ctx context.Context, workspaceID, title string) (Milestone, error) {
	title = strings.TrimSpace(title)
	if err := s.requireWorkspace(ctx, workspaceID); err != nil || !validTitle(title) {
		if err != nil {
			return Milestone{}, err
		}
		return Milestone{}, ErrInvalid
	}
	plan, err := s.store.GetPlan(ctx, workspaceID)
	if err != nil {
		return Milestone{}, err
	}
	if len(plan.Milestones) >= 100 {
		return Milestone{}, ErrInvalid
	}
	position := 0
	for _, item := range plan.Milestones {
		if item.Position >= position {
			position = item.Position + 1
		}
	}
	now := s.now().Format(time.RFC3339Nano)
	return s.store.CreateMilestone(ctx, Milestone{
		ID: rand.Text(), WorkspaceID: workspaceID, Title: title, Position: position,
		CreatedAt: now, UpdatedAt: now, Version: 1,
	})
}

func (s Service) UpdateMilestone(ctx context.Context, workspaceID, milestoneID string, patch MilestonePatch) (Milestone, error) {
	if patch.Version < 1 || strings.TrimSpace(milestoneID) == "" {
		return Milestone{}, ErrInvalid
	}
	plan, err := s.GetPlan(ctx, workspaceID)
	if err != nil {
		return Milestone{}, err
	}
	var current *Milestone
	for i := range plan.Milestones {
		if plan.Milestones[i].ID == milestoneID {
			current = &plan.Milestones[i]
			break
		}
	}
	if current == nil {
		return Milestone{}, ErrNotFound
	}
	if current.Version != patch.Version {
		return Milestone{}, ErrConflict
	}
	if patch.Title != nil {
		title := strings.TrimSpace(*patch.Title)
		if !validTitle(title) {
			return Milestone{}, ErrInvalid
		}
		current.Title = title
	}
	if patch.Completed != nil {
		if *patch.Completed && current.CompletedAt == nil {
			value := s.now().Format(time.RFC3339Nano)
			current.CompletedAt = &value
		}
		if !*patch.Completed {
			current.CompletedAt = nil
		}
	}
	current.UpdatedAt = s.now().Format(time.RFC3339Nano)
	return s.store.UpdateMilestone(ctx, *current)
}

func (s Service) DeleteMilestone(ctx context.Context, workspaceID, milestoneID string, version int) error {
	if version < 1 || strings.TrimSpace(milestoneID) == "" {
		return ErrInvalid
	}
	if err := s.requireWorkspace(ctx, workspaceID); err != nil {
		return err
	}
	return s.store.DeleteMilestone(ctx, workspaceID, milestoneID, version)
}
