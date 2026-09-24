package sqlite

import (
	"context"

	"github.com/howlil/notespace/apps/server/internal/planning"
)

func (s *Store) CreateTask(ctx context.Context, item planning.Task) (planning.Task, error) {
	_, err := s.db.ExecContext(ctx, `
		INSERT INTO planning_tasks(id,workspace_id,milestone_id,title,description,position,planned_for,completed_at,created_at,updated_at,version)
		VALUES (?,?,?,?,?,?,?,?,?,?,?)
	`, item.ID, item.WorkspaceID, item.MilestoneID, item.Title, item.Description, item.Position, item.PlannedFor, item.CompletedAt, item.CreatedAt, item.UpdatedAt, item.Version)
	return item, err
}

func (s *Store) UpdateTask(ctx context.Context, item planning.Task) (planning.Task, error) {
	result, err := s.db.ExecContext(ctx, `
		UPDATE planning_tasks
		SET title=?,description=?,planned_for=?,completed_at=?,updated_at=?,version=version+1
		WHERE id=? AND version=?
	`, item.Title, item.Description, item.PlannedFor, item.CompletedAt, item.UpdatedAt, item.ID, item.Version)
	if err != nil {
		return planning.Task{}, err
	}
	count, err := result.RowsAffected()
	if err != nil {
		return planning.Task{}, err
	}
	if count == 0 {
		return planning.Task{}, planning.ErrConflict
	}
	item.Version++
	return item, nil
}

func (s *Store) DeleteTask(ctx context.Context, taskID string, version int) error {
	result, err := s.db.ExecContext(ctx, `DELETE FROM planning_tasks WHERE id=? AND version=?`, taskID, version)
	if err != nil {
		return err
	}
	count, err := result.RowsAffected()
	if err != nil {
		return err
	}
	if count == 0 {
		var exists int
		if err := s.db.QueryRowContext(ctx, `SELECT EXISTS(SELECT 1 FROM planning_tasks WHERE id=?)`, taskID).Scan(&exists); err != nil {
			return err
		}
		if exists == 0 {
			return planning.ErrNotFound
		}
		return planning.ErrConflict
	}
	return nil
}
