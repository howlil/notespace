package sqlite

import (
	"context"
	"time"

	workspacepkg "github.com/howlil/notespace/apps/server/internal/workspace"
)

// TrashWorkspace rejects a destructive command made from a stale
// workspace view. The version comparison, trash snapshot, and delete share one
// transaction so no autosave can land between them.
func (s *Store) TrashWorkspace(ctx context.Context, id string, expectedVersion *int) error {
	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	defer tx.Rollback()
	envelope, err := snapshotWorkspaceTx(ctx, tx, id)
	if err != nil {
		return err
	}
	if expectedVersion != nil && envelope.Project.Version != *expectedVersion {
		return workspacepkg.ErrConflict
	}
	payload, err := encodeTrashEnvelope(envelope)
	if err != nil {
		return err
	}
	if _, err := tx.ExecContext(ctx, `INSERT INTO workspace_trash(id,category_id,title,deleted_at,payload) VALUES (?,?,?,?,?)`, envelope.Project.ID, envelope.Project.CategoryID, envelope.Project.Title, time.Now().UTC().Format(time.RFC3339Nano), payload); err != nil {
		return err
	}
	if _, err := tx.ExecContext(ctx, `DELETE FROM workspace_history WHERE workspace_id=?`, id); err != nil {
		return err
	}
	result, err := tx.ExecContext(ctx, `DELETE FROM projects WHERE id=?`, id)
	if err != nil {
		return err
	}
	count, err := result.RowsAffected()
	if err != nil {
		return err
	}
	if count == 0 {
		return workspacepkg.ErrNotFound
	}
	return tx.Commit()
}
