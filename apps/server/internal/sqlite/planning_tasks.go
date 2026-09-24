package sqlite

import (
	"context"

	"github.com/howlil/notespace/apps/server/internal/planning"
)

func (s *Store) CreateTask(ctx context.Context, item planning.Task) (planning.Task, error) {
	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return planning.Task{}, err
	}
	defer tx.Rollback()

	if item.WorkspaceID != nil {
		var workspaceExists, taskCount int
		if err := tx.QueryRowContext(ctx, `SELECT EXISTS(SELECT 1 FROM projects WHERE id=?),COUNT(*) FROM planning_tasks WHERE workspace_id=?`, *item.WorkspaceID, *item.WorkspaceID).Scan(&workspaceExists, &taskCount); err != nil {
			return planning.Task{}, err
		}
		if workspaceExists == 0 {
			return planning.Task{}, planning.ErrNotFound
		}
		if taskCount >= planning.MaxTasksPerWorkspace {
			return planning.Task{}, planning.ErrInvalid
		}
		if item.MilestoneID != nil {
			var milestoneExists int
			if err := tx.QueryRowContext(ctx, `SELECT EXISTS(SELECT 1 FROM workspace_milestones WHERE workspace_id=? AND id=?)`, *item.WorkspaceID, *item.MilestoneID).Scan(&milestoneExists); err != nil {
				return planning.Task{}, err
			}
			if milestoneExists == 0 {
				return planning.Task{}, planning.ErrInvalid
			}
			if err := tx.QueryRowContext(ctx, `SELECT COALESCE(MAX(position),-1)+1 FROM planning_tasks WHERE workspace_id=? AND milestone_id=?`, *item.WorkspaceID, *item.MilestoneID).Scan(&item.Position); err != nil {
				return planning.Task{}, err
			}
		} else if err := tx.QueryRowContext(ctx, `SELECT COALESCE(MAX(position),-1)+1 FROM planning_tasks WHERE workspace_id=? AND milestone_id IS NULL`, *item.WorkspaceID).Scan(&item.Position); err != nil {
			return planning.Task{}, err
		}
	} else {
		if item.MilestoneID != nil {
			return planning.Task{}, planning.ErrInvalid
		}
		if item.PlannedFor != nil {
			if err := tx.QueryRowContext(ctx, `SELECT COALESCE(MAX(position),-1)+1 FROM planning_tasks WHERE workspace_id IS NULL AND (planned_for=? OR (planned_for<? AND completed_at IS NULL))`, *item.PlannedFor, *item.PlannedFor).Scan(&item.Position); err != nil {
				return planning.Task{}, err
			}
		} else if err := tx.QueryRowContext(ctx, `SELECT COALESCE(MAX(position),-1)+1 FROM planning_tasks WHERE workspace_id IS NULL AND planned_for IS NULL AND completed_at IS NULL`).Scan(&item.Position); err != nil {
			return planning.Task{}, err
		}
	}

	if _, err := tx.ExecContext(ctx, `
		INSERT INTO planning_tasks(id,workspace_id,milestone_id,title,description,position,planned_for,completed_at,created_at,updated_at,version)
		VALUES (?,?,?,?,?,?,?,?,?,?,?)
	`, item.ID, item.WorkspaceID, item.MilestoneID, item.Title, item.Description, item.Position, item.PlannedFor, item.CompletedAt, item.CreatedAt, item.UpdatedAt, item.Version); err != nil {
		return planning.Task{}, err
	}
	if err := tx.Commit(); err != nil {
		return planning.Task{}, err
	}
	return item, nil
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
