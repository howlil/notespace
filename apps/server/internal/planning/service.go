package planning

import (
	"context"
	"crypto/rand"
	"strings"
	"time"
)

type Service struct {
	Store      Store
	Workspaces WorkspaceLookup
	Now        func() time.Time
}

func NewService(store Store, workspaces WorkspaceLookup, now func() time.Time) Service {
	if store == nil {
		panic("planning: store is required")
	}
	if workspaces == nil {
		panic("planning: workspace lookup is required")
	}
	return Service{Store: store, Workspaces: workspaces, Now: now}
}

func (s Service) now() time.Time {
	if s.Now != nil {
		return s.Now().UTC()
	}
	return time.Now().UTC()
}

func (s Service) requireWorkspace(ctx context.Context, workspaceID string) error {
	if strings.TrimSpace(workspaceID) == "" {
		return ErrInvalid
	}
	exists, err := s.Workspaces.WorkspaceExists(ctx, workspaceID)
	if err != nil {
		return err
	}
	if !exists {
		return ErrNotFound
	}
	return nil
}

func (s Service) GetPlan(ctx context.Context, workspaceID string) (Plan, error) {
	if err := s.requireWorkspace(ctx, workspaceID); err != nil {
		return Plan{}, err
	}
	return s.Store.GetPlan(ctx, workspaceID)
}

func (s Service) GetTask(ctx context.Context, taskID string) (Task, error) {
	if strings.TrimSpace(taskID) == "" {
		return Task{}, ErrInvalid
	}
	return s.Store.GetTask(ctx, taskID)
}

func (s Service) Today(ctx context.Context, date string) (Today, error) {
	if !validDateKey(date) {
		return Today{}, ErrInvalid
	}
	tasks, err := s.Store.ListToday(ctx, date)
	if err != nil {
		return Today{}, err
	}
	return Today{Date: date, Tasks: tasks}, nil
}

func (s Service) Inbox(ctx context.Context) (Inbox, error) {
	tasks, err := s.Store.ListInbox(ctx)
	if err != nil {
		return Inbox{}, err
	}
	return Inbox{Tasks: tasks}, nil
}

func (s Service) CreateMilestone(ctx context.Context, workspaceID, title string) (Milestone, error) {
	title = strings.TrimSpace(title)
	if err := s.requireWorkspace(ctx, workspaceID); err != nil || !validTitle(title) {
		if err != nil {
			return Milestone{}, err
		}
		return Milestone{}, ErrInvalid
	}
	plan, err := s.Store.GetPlan(ctx, workspaceID)
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
	return s.Store.CreateMilestone(ctx, Milestone{
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
	return s.Store.UpdateMilestone(ctx, *current)
}

func (s Service) DeleteMilestone(ctx context.Context, workspaceID, milestoneID string, version int) error {
	if version < 1 || strings.TrimSpace(milestoneID) == "" {
		return ErrInvalid
	}
	if err := s.requireWorkspace(ctx, workspaceID); err != nil {
		return err
	}
	return s.Store.DeleteMilestone(ctx, workspaceID, milestoneID, version)
}

func (s Service) CreateTask(ctx context.Context, workspaceID string, milestoneID *string, title string) (Task, error) {
	title = strings.TrimSpace(title)
	if err := s.requireWorkspace(ctx, workspaceID); err != nil || !validTitle(title) {
		if err != nil {
			return Task{}, err
		}
		return Task{}, ErrInvalid
	}
	plan, err := s.Store.GetPlan(ctx, workspaceID)
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
	return s.Store.CreateTask(ctx, Task{
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
		today, err := s.Store.ListToday(ctx, *date)
		if err != nil {
			return Task{}, err
		}
		for _, item := range today {
			if item.WorkspaceID == nil && item.Position >= position {
				position = item.Position + 1
			}
		}
	} else {
		inbox, err := s.Store.ListInbox(ctx)
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
	return s.Store.CreateTask(ctx, Task{
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
	return s.Store.UpdateTask(ctx, next)
}

func (s Service) UpdateAnyTask(ctx context.Context, taskID string, patch TaskPatch) (Task, error) {
	if patch.Version < 1 || strings.TrimSpace(taskID) == "" {
		return Task{}, ErrInvalid
	}
	current, err := s.Store.GetTask(ctx, taskID)
	if err != nil {
		return Task{}, err
	}
	next, err := applyTaskPatch(current, patch, s.now().Format(time.RFC3339Nano))
	if err != nil {
		return Task{}, err
	}
	return s.Store.UpdateTask(ctx, next)
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
	return s.Store.DeleteTask(ctx, taskID, version)
}

func (s Service) DeleteAnyTask(ctx context.Context, taskID string, version int) error {
	if version < 1 || strings.TrimSpace(taskID) == "" {
		return ErrInvalid
	}
	current, err := s.Store.GetTask(ctx, taskID)
	if err != nil {
		return err
	}
	if current.WorkspaceID != nil {
		return ErrInvalid
	}
	if current.Version != version {
		return ErrConflict
	}
	return s.Store.DeleteTask(ctx, taskID, version)
}
