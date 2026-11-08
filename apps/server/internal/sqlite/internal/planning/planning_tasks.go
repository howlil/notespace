package planningquery

import (
	"context"

	"github.com/howlil/notespace/apps/server/internal/planning"
	"github.com/howlil/notespace/apps/server/internal/sqlite/internal/dbtx"
)

func UpdateTask(db dbtx.DBTX, ctx context.Context, item planning.Task) (planning.Task, error) {
	result, err := db.ExecContext(ctx, `
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
func DeleteTask(db dbtx.DBTX, ctx context.Context, taskID string, version int) error {
	result, err := db.ExecContext(ctx, `DELETE FROM planning_tasks WHERE id=? AND version=?`, taskID, version)
	if err != nil {
		return err
	}
	count, err := result.RowsAffected()
	if err != nil {
		return err
	}
	if count == 0 {
		var exists int
		if err := db.QueryRowContext(ctx, `SELECT EXISTS(SELECT 1 FROM planning_tasks WHERE id=?)`, taskID).Scan(&exists); err != nil {
			return err
		}
		if exists == 0 {
			return planning.ErrNotFound
		}
		return planning.ErrConflict
	}
	return nil
}
