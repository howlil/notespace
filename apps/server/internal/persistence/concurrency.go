package persistence

import (
	"context"
	"database/sql"
	"errors"
	"fmt"

	"github.com/howlil/notespace/apps/server/internal/project"
	"github.com/howlil/notespace/apps/server/migrations"
)

func readTrashTx(ctx context.Context, tx *sql.Tx, id string) (trashRecord, error) {
	var record trashRecord
	var payload []byte
	err := tx.QueryRowContext(ctx, `SELECT id,category_id,title,deleted_at,payload FROM workspace_trash WHERE id=?`, id).
		Scan(&record.ID, &record.CategoryID, &record.Title, &record.DeletedAt, &payload)
	if errors.Is(err, sql.ErrNoRows) {
		return record, project.ErrNotFound
	}
	if err != nil {
		return record, err
	}
	if err := decodeTrashEnvelope(payload, &record.Payload); err != nil {
		return record, fmt.Errorf("decode trash envelope: %w", err)
	}
	return record, nil
}

// RestoreTrashedWorkspaceAtomic claims the trash row and restores its workspace
// in one transaction. A concurrent permanent purge can therefore win before
// this transaction or lose after it, but it cannot remove the row between the
// restore read and the restore commit.
func (s *Store) RestoreTrashedWorkspaceAtomic(ctx context.Context, id string) (project.Project, error) {
	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return project.Project{}, err
	}
	defer tx.Rollback()

	record, err := readTrashTx(ctx, tx, id)
	if err != nil {
		return project.Project{}, err
	}
	categoryID := record.CategoryID
	var categoryCount int
	if err := tx.QueryRowContext(ctx, `SELECT COUNT(*) FROM categories WHERE id=?`, categoryID).Scan(&categoryCount); err != nil {
		return project.Project{}, err
	}
	if categoryCount == 0 {
		categoryID = project.UncategorizedCategoryID
	}
	if err := restoreWorkspaceTx(ctx, tx, record.Payload, categoryID); err != nil {
		return project.Project{}, err
	}
	result, err := tx.ExecContext(ctx, `DELETE FROM workspace_trash WHERE id=?`, id)
	if err != nil {
		return project.Project{}, err
	}
	count, err := result.RowsAffected()
	if err != nil {
		return project.Project{}, err
	}
	if count != 1 {
		return project.Project{}, project.ErrConflict
	}
	if err := migrations.Validate(ctx, tx); err != nil {
		return project.Project{}, err
	}
	if err := tx.Commit(); err != nil {
		return project.Project{}, err
	}
	return s.Get(ctx, id)
}

// DeleteCategoryAtomic validates active and trashed ownership at the same
// serialization point as the delete. This closes the old check-then-delete gap
// where a workspace could enter trash after the HTTP preflight check.
func (s *Store) DeleteCategoryAtomic(ctx context.Context, id string) error {
	if id == "" || id == project.UncategorizedCategoryID {
		return project.ErrInvalid
	}
	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	defer tx.Rollback()

	var exists int
	if err := tx.QueryRowContext(ctx, `SELECT COUNT(*) FROM categories WHERE id=?`, id).Scan(&exists); err != nil {
		return err
	}
	if exists == 0 {
		return project.ErrNotFound
	}
	var active, trashed int
	if err := tx.QueryRowContext(ctx, `SELECT COUNT(*) FROM projects WHERE category_id=?`, id).Scan(&active); err != nil {
		return err
	}
	if err := tx.QueryRowContext(ctx, `SELECT COUNT(*) FROM workspace_trash WHERE category_id=?`, id).Scan(&trashed); err != nil {
		return err
	}
	if active > 0 || trashed > 0 {
		return project.ErrNotEmpty
	}
	result, err := tx.ExecContext(ctx, `DELETE FROM categories WHERE id=?`, id)
	if err != nil {
		return err
	}
	count, err := result.RowsAffected()
	if err != nil {
		return err
	}
	if count != 1 {
		return project.ErrNotFound
	}
	return tx.Commit()
}
