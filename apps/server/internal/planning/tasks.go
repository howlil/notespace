package planning

import (
	"context"
	"crypto/rand"
	"strings"
	"time"
)

func (s Service) GetTask(ctx context.Context, taskID string) (Task, error) {
	if strings.TrimSpace(taskID) == "" {
		return Task{}, ErrInvalid
	}
	return s.store.GetTask(ctx, taskID)
}

func (s Service) CreateTask(ctx context.Context, workspaceID string, milestoneID *string, title string) (Task, error) {
	title = strings.TrimSpace(title)
	if err := s.requireWorkspace(ctx, workspaceID); err != nil || !validTitle(title) {
		if err != nil {
			return Task{}, err
		}
		return Task{}, ErrInvalid
	}
	plan, err := s.store.GetPlan(ctx, workspaceID)
	if err != nil {
		return Task{}, err
	}
	if len(plan.Tasks) >= 1000 {
		return Task{}, ErrInvalid
	}
	var normalizedMilestone *string
	if milestoneID != nil && strings.TrimSpace(*milestoneID) != "" {
		value := strings.TrimSpace(*milestoneID)
		found := false
		for _, milestone := range plan.Milestones {
			if milestone.ID == value {
				found = true
				break
			}
		}
		if !found {
			return Task{}, ErrInvalid
		}
		normalizedMilestone = &value
	}
	position := 0
	for _, item := range plan.Tasks {
		sameGroup := (item.MilestoneID == nil && normalizedMilestone == nil) ||
			(item.MilestoneID != nil && normalizedMilestone != nil && *item.MilestoneID == *normalizedMilestone)
		if sameGroup && item.Position >= position {
			position = item.Position + 1
		}
	}
	now := s.now().Format(time.RFC3339Nano)
	workspace := workspaceID
	return s.store.CreateTask(ctx, Task{
		ID: rand.Text(), WorkspaceID: &workspace, MilestoneID: normalizedMilestone,
		Title: title, Description: "", Position: position,
		CreatedAt: now, UpdatedAt: now, Version: 1,
	})
}

func (s Service) CreateStandaloneTask(ctx context.Context, title, plannedFor string) (Task, error) {
	title = strings.TrimSpace(title)
	if !validTitle(title) {
		return Task{}, ErrInvalid
	}
	date, err := normalizePlannedFor(plannedFor)
	if err != nil {
		return Task{}, err
	}
	position := 0
	if date != nil {
		today, err := s.store.ListToday(ctx, *date)
		if err != nil {
			return Task{}, err
		}
		for _, item := range today {
			if item.WorkspaceID == nil && item.Position >= position {
				position = item.Position + 1
			}
		}
	} else {
		inbox, err := s.store.ListInbox(ctx)
		if err != nil {
			return Task{}, err
		}
		for _, item := range inbox {
			if item.Position >= position {
				position = item.Position + 1
			}
		}
	}
	now := s.now().Format(time.RFC3339Nano)
	return s.store.CreateTask(ctx, Task{
		ID: rand.Text(), Title: title, Description: "", Position: position, PlannedFor: date,
		CreatedAt: now, UpdatedAt: now, Version: 1,
	})
}

func applyTaskPatch(current Task, patch TaskPatch, now string) (Task, error) {
	if current.Version != patch.Version {
		return Task{}, ErrConflict
	}
	if patch.Title != nil {
		title := strings.TrimSpace(*patch.Title)
		if !validTitle(title) {
			return Task{}, ErrInvalid
		}
		current.Title = title
	}
	if patch.Description != nil {
		if !validDescription(*patch.Description) {
			return Task{}, ErrInvalid
		}
		current.Description = *patch.Description
	}
	if patch.PlannedFor != nil {
		value, err := normalizePlannedFor(*patch.PlannedFor)
		if err != nil {
			return Task{}, err
		}
		current.PlannedFor = value
	}
	if patch.Completed != nil {
		if *patch.Completed && current.CompletedAt == nil {
			value := now
			current.CompletedAt = &value
		}
		if !*patch.Completed {
			current.CompletedAt = nil
		}
	}
	current.UpdatedAt = now
	return current, nil
}

func (s Service) UpdateTask(ctx context.Context, workspaceID, taskID string, patch TaskPatch) (Task, error) {
	if patch.Version < 1 || strings.TrimSpace(taskID) == "" {
		return Task{}, ErrInvalid
	}
	plan, err := s.GetPlan(ctx, workspaceID)
	if err != nil {
		return Task{}, err
	}
	var current *Task
	for i := range plan.Tasks {
		if plan.Tasks[i].ID == taskID {
			current = &plan.Tasks[i]
			break
		}
	}
	if current == nil {
		return Task{}, ErrNotFound
	}
	next, err := applyTaskPatch(*current, patch, s.now().Format(time.RFC3339Nano))
	if err != nil {
		return Task{}, err
	}
	return s.store.UpdateTask(ctx, next)
}

func (s Service) UpdateAnyTask(ctx context.Context, taskID string, patch TaskPatch) (Task, error) {
	if patch.Version < 1 || strings.TrimSpace(taskID) == "" {
		return Task{}, ErrInvalid
	}
	current, err := s.store.GetTask(ctx, taskID)
	if err != nil {
		return Task{}, err
	}
	next, err := applyTaskPatch(current, patch, s.now().Format(time.RFC3339Nano))
	if err != nil {
		return Task{}, err
	}
	return s.store.UpdateTask(ctx, next)
}

func (s Service) DeleteTask(ctx context.Context, workspaceID, taskID string, version int) error {
	if version < 1 || strings.TrimSpace(taskID) == "" {
		return ErrInvalid
	}
	plan, err := s.GetPlan(ctx, workspaceID)
	if err != nil {
		return err
	}
	found := false
	for _, task := range plan.Tasks {
		if task.ID == taskID {
			found = true
			break
		}
	}
	if !found {
		return ErrNotFound
	}
	return s.store.DeleteTask(ctx, taskID, version)
}

func (s Service) DeleteAnyTask(ctx context.Context, taskID string, version int) error {
	if version < 1 || strings.TrimSpace(taskID) == "" {
		return ErrInvalid
	}
	current, err := s.store.GetTask(ctx, taskID)
	if err != nil {
		return err
	}
	if current.WorkspaceID != nil {
		return ErrInvalid
	}
	if current.Version != version {
		return ErrConflict
	}
	return s.store.DeleteTask(ctx, taskID, version)
}
