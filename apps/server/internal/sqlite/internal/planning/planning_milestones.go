package planningquery

import (
	"context"

	"github.com/howlil/notespace/apps/server/internal/planning"
	"github.com/howlil/notespace/apps/server/internal/sqlite/internal/dbtx"
)

func UpdateMilestone(db dbtx.DBTX, ctx context.Context, item planning.Milestone) (planning.Milestone, error) {
	result, err := db.ExecContext(ctx, `UPDATE workspace_milestones SET title=?,completed_at=?,updated_at=?,version=version+1 WHERE workspace_id=? AND id=? AND version=?`,
		item.Title, item.CompletedAt, item.UpdatedAt, item.WorkspaceID, item.ID, item.Version)
	if err != nil {
		return planning.Milestone{}, err
	}
	count, err := result.RowsAffected()
	if err != nil {
		return planning.Milestone{}, err
	}
	if count == 0 {
		return planning.Milestone{}, planning.ErrConflict
	}
	item.Version++
	return item, nil
}
func DeleteMilestone(db dbtx.DBTX, ctx context.Context, workspaceID, milestoneID string, version int) error {
	result, err := db.ExecContext(ctx, `DELETE FROM workspace_milestones WHERE workspace_id=? AND id=? AND version=?`, workspaceID, milestoneID, version)
	if err != nil {
		return err
	}
	count, err := result.RowsAffected()
	if err != nil {
		return err
	}
	if count == 0 {
		var exists int
		if err := db.QueryRowContext(ctx, `SELECT EXISTS(SELECT 1 FROM workspace_milestones WHERE workspace_id=? AND id=?)`, workspaceID, milestoneID).Scan(&exists); err != nil {
			return err
		}
		if exists == 0 {
			return planning.ErrNotFound
		}
		return planning.ErrConflict
	}
	return nil
}
