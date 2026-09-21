package planning

import (
	"context"
	"crypto/rand"
	"errors"
	"strings"
	"time"
	"unicode/utf8"
)

var (
	ErrNotFound = errors.New("planning item not found")
	ErrInvalid  = errors.New("invalid planning input")
	ErrConflict = errors.New("planning item changed in another session")
)

type Milestone struct {
	ID          string  `json:"id"`
	WorkspaceID string  `json:"workspaceId"`
	Title       string  `json:"title"`
	Position    int     `json:"position"`
	CompletedAt *string `json:"completedAt"`
	CreatedAt   string  `json:"createdAt"`
	UpdatedAt   string  `json:"updatedAt"`
	Version     int     `json:"version"`
}

type Task struct {
	ID          string  `json:"id"`
	WorkspaceID string  `json:"workspaceId"`
	MilestoneID *string `json:"milestoneId,omitempty"`
	Title       string  `json:"title"`
	Description string  `json:"description"`
	Position    int     `json:"position"`
	CompletedAt *string `json:"completedAt"`
	CreatedAt   string  `json:"createdAt"`
	UpdatedAt   string  `json:"updatedAt"`
	Version     int     `json:"version"`
}

type Plan struct {
	WorkspaceID string      `json:"workspaceId"`
	Milestones  []Milestone `json:"milestones"`
	Tasks       []Task      `json:"tasks"`
}

type MilestonePatch struct {
	Title     *string `json:"title"`
	Completed *bool   `json:"completed"`
	Version   int     `json:"version"`
}

type TaskPatch struct {
	Title       *string `json:"title"`
	Description *string `json:"description"`
	Completed   *bool   `json:"completed"`
	Version     int     `json:"version"`
}

type Store interface {
	WorkspaceExists(context.Context, string) (bool, error)
	GetPlan(context.Context, string) (Plan, error)
	CreateMilestone(context.Context, Milestone) (Milestone, error)
	UpdateMilestone(context.Context, Milestone) (Milestone, error)
	DeleteMilestone(context.Context, string, string, int) error
	CreateTask(context.Context, Task) (Task, error)
	UpdateTask(context.Context, Task) (Task, error)
	DeleteTask(context.Context, string, string, int) error
}

type Service struct {
	Store Store
	Now   func() time.Time
}

func (s Service) now() time.Time {
	if s.Now != nil {
		return s.Now().UTC()
	}
	return time.Now().UTC()
}

func validTitle(value string) bool {
	value = strings.TrimSpace(value)
	return value != "" && utf8.RuneCountInString(value) <= 160
}

func validDescription(value string) bool {
	return utf8.RuneCountInString(value) <= 4000
}

func (s Service) requireWorkspace(ctx context.Context, workspaceID string) error {
	if strings.TrimSpace(workspaceID) == "" {
		return ErrInvalid
	}
	exists, err := s.Store.WorkspaceExists(ctx, workspaceID)
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
	return s.Store.CreateTask(ctx, Task{
		ID: rand.Text(), WorkspaceID: workspaceID, MilestoneID: normalizedMilestone,
		Title: title, Description: "", Position: position,
		CreatedAt: now, UpdatedAt: now, Version: 1,
	})
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
	return s.Store.UpdateTask(ctx, *current)
}

func (s Service) DeleteTask(ctx context.Context, workspaceID, taskID string, version int) error {
	if version < 1 || strings.TrimSpace(taskID) == "" {
		return ErrInvalid
	}
	if err := s.requireWorkspace(ctx, workspaceID); err != nil {
		return err
	}
	return s.Store.DeleteTask(ctx, workspaceID, taskID, version)
}

func ValidatePlan(plan Plan, workspaceID string) error {
	if plan.WorkspaceID != "" && plan.WorkspaceID != workspaceID {
		return ErrInvalid
	}
	milestones := map[string]bool{}
	for _, milestone := range plan.Milestones {
		if milestone.ID == "" || milestone.WorkspaceID != workspaceID || !validTitle(milestone.Title) || milestone.Position < 0 || milestone.Version < 1 || milestones[milestone.ID] {
			return ErrInvalid
		}
		milestones[milestone.ID] = true
	}
	tasks := map[string]bool{}
	for _, task := range plan.Tasks {
		if task.ID == "" || task.WorkspaceID != workspaceID || !validTitle(task.Title) || !validDescription(task.Description) || task.Position < 0 || task.Version < 1 || tasks[task.ID] {
			return ErrInvalid
		}
		if task.MilestoneID != nil && !milestones[*task.MilestoneID] {
			return ErrInvalid
		}
		tasks[task.ID] = true
	}
	return nil
}
