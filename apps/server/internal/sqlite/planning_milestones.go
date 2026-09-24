package sqlite

import (
	"context"

	"github.com/howlil/notespace/apps/server/internal/planning"
)

func (s *Store) CreateMilestone(ctx context.Context, item planning.Milestone) (planning.Milestone, error) {
	_, err := s.db.ExecContext(ctx, `INSERT INTO workspace_milestones(id,workspace_id,title,position,completed_at,created_at,updated_at,version) VALUES (?,?,?,?,?,?,?,?)`,
		item.ID, item.WorkspaceID, item.Title, item.Position, item.CompletedAt, item.CreatedAt, item.UpdatedAt, item.Version)
	return item, err
}

func (s *Store) UpdateMilestone(ctx context.Context, item planning.Milestone) (planning.Milestone, error) {
	result, err := s.db.ExecContext(ctx, `UPDATE workspace_milestones SET title=?,completed_at=?,updated_at=?,version=version+1 WHERE workspace_id=? AND id=? AND version=?`,
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

func (s *Store) DeleteMilestone(ctx context.Context, workspaceID, milestoneID string, version int) error {
	result, err := s.db.ExecContext(ctx, `DELETE FROM workspace_milestones WHERE workspace_id=? AND id=? AND version=?`, workspaceID, milestoneID, version)
	if err != nil {
		return err
	}
	count, err := result.RowsAffected()
	if err != nil {
		return err
	}
	if count == 0 {
		var exists int
		if err := s.db.QueryRowContext(ctx, `SELECT EXISTS(SELECT 1 FROM workspace_milestones WHERE workspace_id=? AND id=?)`, workspaceID, milestoneID).Scan(&exists); err != nil {
			return err
		}
		if exists == 0 {
			return planning.ErrNotFound
		}
		return planning.ErrConflict
	}
	return nil
}
