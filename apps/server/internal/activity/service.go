package activity

import (
	"context"
	"strings"
	"time"
)

type Service struct {
	Store      Store
	References ReferenceLookup
	Now        func() time.Time
}

func NewService(store Store, references ReferenceLookup, now func() time.Time) Service {
	if store == nil {
		panic("activity: store is required")
	}
	if references == nil {
		panic("activity: reference lookup is required")
	}
	return Service{Store: store, References: references, Now: now}
}

func (s Service) now() time.Time {
	if s.Now != nil {
		return s.Now().UTC()
	}
	return time.Now().UTC()
}

func (s Service) RecordWorkspaceSession(ctx context.Context, workspaceID, sessionID string, input Heartbeat) (Session, error) {
	workspaceID = strings.TrimSpace(workspaceID)
	if workspaceID == "" || s.References == nil {
		return Session{}, ErrInvalid
	}
	workspace, found, err := s.References.LookupWorkspace(ctx, workspaceID)
	if err != nil {
		return Session{}, err
	}
	if !found {
		return Session{}, ErrWorkspaceNotFound
	}
	return s.recordActivity(ctx, sessionID, ActivityHeartbeat{
		Heartbeat:              input,
		Title:                  workspace.Title,
		ActivityType:           "learn",
		WorkspaceID:            workspaceID,
		WorkspaceTitleSnapshot: workspace.Title,
	})
}

// Record remains as a compatibility helper for callers that already resolved a
// Workspace title. New request flows should use RecordWorkspaceSession.
func (s Service) Record(ctx context.Context, workspaceID, workspaceTitle, sessionID string, input Heartbeat) (Session, error) {
	return s.recordActivity(ctx, sessionID, ActivityHeartbeat{
		Heartbeat:              input,
		Title:                  workspaceTitle,
		ActivityType:           "learn",
		WorkspaceID:            workspaceID,
		WorkspaceTitleSnapshot: workspaceTitle,
	})
}

func (s Service) RecordActivity(ctx context.Context, sessionID string, input ActivityHeartbeat) (Session, error) {
	if s.References == nil {
		return Session{}, ErrInvalid
	}
	if err := s.resolveReferences(ctx, &input); err != nil {
		return Session{}, err
	}
	return s.recordActivity(ctx, sessionID, input)
}

func (s Service) resolveReferences(ctx context.Context, input *ActivityHeartbeat) error {
	input.Title = strings.TrimSpace(input.Title)
	input.ActivityType = strings.TrimSpace(input.ActivityType)
	input.WorkspaceID = strings.TrimSpace(input.WorkspaceID)
	input.WorkspaceTitleSnapshot = strings.TrimSpace(input.WorkspaceTitleSnapshot)
	input.TaskID = strings.TrimSpace(input.TaskID)
	input.TaskTitleSnapshot = strings.TrimSpace(input.TaskTitleSnapshot)

	if input.TaskID != "" {
		task, found, err := s.References.LookupTask(ctx, input.TaskID)
		if err != nil {
			return err
		}
		if found {
			input.TaskTitleSnapshot = task.Title
			if task.WorkspaceID != nil {
				if input.WorkspaceID != "" && input.WorkspaceID != *task.WorkspaceID {
					return ErrTaskWorkspaceMismatch
				}
				input.WorkspaceID = *task.WorkspaceID
			}
			if input.Title == "" {
				input.Title = task.Title
			}
		} else {
			if input.TaskTitleSnapshot == "" {
				return ErrTaskNotFound
			}
			if input.Title == "" {
				input.Title = input.TaskTitleSnapshot
			}
		}
	}

	if input.WorkspaceID != "" {
		workspace, found, err := s.References.LookupWorkspace(ctx, input.WorkspaceID)
		if err != nil {
			return err
		}
		if found {
			input.WorkspaceTitleSnapshot = workspace.Title
			if input.Title == "" {
				input.Title = workspace.Title
			}
		} else {
			if input.WorkspaceTitleSnapshot == "" {
				return ErrWorkspaceNotFound
			}
			if input.Title == "" {
				input.Title = input.WorkspaceTitleSnapshot
			}
		}
	}
	return nil
}

func (s Service) recordActivity(ctx context.Context, sessionID string, input ActivityHeartbeat) (Session, error) {
	input.Title = strings.TrimSpace(input.Title)
	input.ActivityType = strings.TrimSpace(input.ActivityType)
	input.WorkspaceID = strings.TrimSpace(input.WorkspaceID)
	input.WorkspaceTitleSnapshot = strings.TrimSpace(input.WorkspaceTitleSnapshot)
	input.TaskID = strings.TrimSpace(input.TaskID)
	input.TaskTitleSnapshot = strings.TrimSpace(input.TaskTitleSnapshot)
	if strings.TrimSpace(sessionID) == "" || !validTitle(input.Title) || !ValidActivityType(input.ActivityType) || !ValidDate(input.ActivityDate) || input.ActiveSeconds < 0 {
		return Session{}, ErrInvalid
	}
	if input.WorkspaceID != "" && input.WorkspaceTitleSnapshot == "" {
		return Session{}, ErrInvalid
	}
	if input.TaskID != "" && input.TaskTitleSnapshot == "" {
		return Session{}, ErrInvalid
	}
	now := s.now().Format(time.RFC3339Nano)
	var endedAt *string
	if input.Finish {
		endedAt = &now
	}
	return s.Store.UpsertSession(ctx, Session{
		ID:                     sessionID,
		WorkspaceID:            input.WorkspaceID,
		WorkspaceTitleSnapshot: input.WorkspaceTitleSnapshot,
		TaskID:                 input.TaskID,
		TaskTitleSnapshot:      input.TaskTitleSnapshot,
		Title:                  input.Title,
		ActivityType:           input.ActivityType,
		ActivityDate:           input.ActivityDate,
		StartedAt:              now,
		EndedAt:                endedAt,
		ActiveSeconds:          input.ActiveSeconds,
		LastHeartbeatAt:        now,
	})
}

func (s Service) ListSessions(ctx context.Context, workspaceID string, limit int) ([]Session, error) {
	if strings.TrimSpace(workspaceID) == "" || limit < 1 || limit > 50 {
		return nil, ErrInvalid
	}
	return s.Store.ListWorkspaceSessions(ctx, workspaceID, limit)
}

func (s Service) ListActivities(ctx context.Context, limit int) ([]Session, error) {
	if limit < 1 || limit > 100 {
		return nil, ErrInvalid
	}
	return s.Store.ListActivitySessions(ctx, limit)
}

func (s Service) DeleteSession(ctx context.Context, workspaceID, sessionID string) error {
	if strings.TrimSpace(workspaceID) == "" || strings.TrimSpace(sessionID) == "" {
		return ErrInvalid
	}
	return s.Store.DeleteWorkspaceSession(ctx, workspaceID, sessionID)
}

func (s Service) DeleteActivity(ctx context.Context, sessionID string) error {
	if strings.TrimSpace(sessionID) == "" {
		return ErrInvalid
	}
	return s.Store.DeleteActivitySession(ctx, sessionID)
}

func (s Service) GetWorkspaceStats(ctx context.Context, workspaceID, activityDate string) (WorkspaceStats, error) {
	workspaceID = strings.TrimSpace(workspaceID)
	if workspaceID == "" || !ValidDate(activityDate) || s.References == nil {
		return WorkspaceStats{}, ErrInvalid
	}
	_, found, err := s.References.LookupWorkspace(ctx, workspaceID)
	if err != nil {
		return WorkspaceStats{}, err
	}
	if !found {
		return WorkspaceStats{}, ErrWorkspaceNotFound
	}
	return s.Store.WorkspaceStats(ctx, workspaceID, activityDate)
}

func (s Service) GetGlobalStats(ctx context.Context, activityDate string) (WorkspaceStats, error) {
	if !ValidDate(activityDate) {
		return WorkspaceStats{}, ErrInvalid
	}
	return s.Store.GlobalStats(ctx, activityDate)
}

func (s Service) GetActivity(ctx context.Context, from, to string) (Activity, error) {
	if !ValidDate(from) || !ValidDate(to) || from > to {
		return Activity{}, ErrInvalid
	}
	return s.Store.Activity(ctx, from, to)
}

func (s Service) GetDayDetail(ctx context.Context, date string) (DayDetail, error) {
	if !ValidDate(date) {
		return DayDetail{}, ErrInvalid
	}
	return s.Store.DayDetail(ctx, date)
}

