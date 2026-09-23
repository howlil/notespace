package sqlite

import (
	"context"
	"database/sql"
	"errors"

	"github.com/howlil/notespace/apps/server/internal/activity"
	"github.com/howlil/notespace/apps/server/internal/planning"
)

func (s *Store) LookupTask(ctx context.Context, taskID string) (activity.TaskRef, bool, error) {
	task, err := s.GetTask(ctx, taskID)
	if errors.Is(err, planning.ErrNotFound) {
		return activity.TaskRef{}, false, nil
	}
	if err != nil {
		return activity.TaskRef{}, false, err
	}
	return activity.TaskRef{Title: task.Title, WorkspaceID: task.WorkspaceID}, true, nil
}

func (s *Store) LookupWorkspace(ctx context.Context, id string) (activity.WorkspaceRef, bool, error) {
	var ref activity.WorkspaceRef
	err := s.db.QueryRowContext(ctx, `SELECT title FROM projects WHERE id=?`, id).Scan(&ref.Title)
	if errors.Is(err, sql.ErrNoRows) {
		return activity.WorkspaceRef{}, false, nil
	}
	if err != nil {
		return activity.WorkspaceRef{}, false, err
	}
	return ref, true, nil
}
