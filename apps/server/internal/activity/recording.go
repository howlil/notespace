package activity

import (
	"context"
	"strings"
	"time"
)

func (s Service) RecordActivity(ctx context.Context, sessionID string, input ActivityHeartbeat) (Session, error) {
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
		task, found, err := s.references.LookupTask(ctx, input.TaskID)
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
		workspace, found, err := s.references.LookupWorkspace(ctx, input.WorkspaceID)
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
	now := s.now().Format(time.RFC3339Nano)
	var endedAt *string
	if input.Finish {
		endedAt = &now
	}
	session := Session{
		ID:                     strings.TrimSpace(sessionID),
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
	}
	if err := ValidateSession(session); err != nil {
		return Session{}, err
	}
	return s.store.UpsertSession(ctx, session)
}
