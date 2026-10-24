package sqlite

import (
	"context"
	"database/sql"
	"errors"

	"github.com/howlil/notespace/apps/server/internal/planning"
)

// AssignStandaloneTask moves a legacy Task into a Workspace transactionally.
// Repeating an identical request after the response is lost returns the same
// Task identity; subsequent updates or a different destination conflict.
func (s *Store) AssignStandaloneTask(ctx context.Context, taskID, workspaceID string, version int, updatedAt string) (planning.Task, error) {
	if taskID == "" || workspaceID == "" || version < 1 {
		return planning.Task{}, planning.ErrInvalid
	}
	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return planning.Task{}, err
	}
	defer tx.Rollback()

	item, err := scanTask(tx.QueryRowContext(ctx, `SELECT id,workspace_id,milestone_id,title,description,position,planned_for,completed_at,created_at,updated_at,version
		FROM planning_tasks WHERE id=?`, taskID))
	if errors.Is(err, sql.ErrNoRows) {
		return planning.Task{}, planning.ErrNotFound
	}
	if err != nil {
		return planning.Task{}, err
	}
	if item.WorkspaceID != nil {
		if *item.WorkspaceID == workspaceID && item.Version == version+1 {
			return item, nil
		}
		return planning.Task{}, planning.ErrConflict
	}
	if item.Version != version {
		return planning.Task{}, planning.ErrConflict
	}
	var exists, count int
	if err := tx.QueryRowContext(ctx, `SELECT EXISTS(SELECT 1 FROM projects WHERE id=?),
		(SELECT COUNT(*) FROM planning_tasks WHERE workspace_id=?)`, workspaceID, workspaceID).Scan(&exists, &count); err != nil {
		return planning.Task{}, err
	}
	if exists == 0 {
		return planning.Task{}, planning.ErrNotFound
	}
	if count >= planning.MaxTasksPerWorkspace {
		return planning.Task{}, planning.ErrInvalid
	}
	var position int
	if err := tx.QueryRowContext(ctx, `SELECT COALESCE(MAX(position),-1)+1
		FROM planning_tasks WHERE workspace_id=? AND milestone_id IS NULL`, workspaceID).Scan(&position); err != nil {
		return planning.Task{}, err
	}
	result, err := tx.ExecContext(ctx, `UPDATE planning_tasks
		SET workspace_id=?, milestone_id=NULL, position=?, updated_at=?, version=version+1
		WHERE id=? AND workspace_id IS NULL AND version=?`,
		workspaceID, position, updatedAt, taskID, version)
	if err != nil {
		return planning.Task{}, err
	}
	affected, err := result.RowsAffected()
	if err != nil {
		return planning.Task{}, err
	}
	if affected != 1 {
		return planning.Task{}, planning.ErrConflict
	}
	if err := tx.Commit(); err != nil {
		return planning.Task{}, err
	}
	item.WorkspaceID = &workspaceID
	item.MilestoneID = nil
	item.Position = position
	item.UpdatedAt = updatedAt
	item.Version++
	return item, nil
}
