package backupquery

import (
	"context"
	"database/sql"
	"errors"
	"fmt"

	"github.com/howlil/notespace/apps/server/internal/library"
	"github.com/howlil/notespace/apps/server/internal/sqlite/internal/dbtx"
	workspacepkg "github.com/howlil/notespace/apps/server/internal/workspace"
)

func ListTrash(ctx context.Context, db dbtx.DBTX) ([]library.TrashItem, error) {
	rows, err := db.QueryContext(ctx, `SELECT id,category_id,title,deleted_at FROM workspace_trash ORDER BY deleted_at DESC,id`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	items := []library.TrashItem{}
	for rows.Next() {
		var item library.TrashItem
		if err := rows.Scan(&item.ID, &item.CategoryID, &item.Title, &item.DeletedAt); err != nil {
			return nil, err
		}
		items = append(items, item)
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}
	return items, nil
}

func DeleteTrashedWorkspace(ctx context.Context, db dbtx.DBTX, id string) error {
	result, err := db.ExecContext(ctx, `DELETE FROM workspace_trash WHERE id=?`, id)
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
	return nil
}

func ClaimTrashedWorkspaceTx(ctx context.Context, tx dbtx.DBTX, id string) error {
	result, err := tx.ExecContext(ctx, `DELETE FROM workspace_trash WHERE id=?`, id)
	if err != nil {
		return err
	}
	count, err := result.RowsAffected()
	if err != nil {
		return err
	}
	if count != 1 {
		return workspacepkg.ErrConflict
	}
	return nil
}

func InsertTrashTx(ctx context.Context, tx dbtx.DBTX, id, categoryID, title, deletedAt string, envelope WorkspaceEnvelope) error {
	payload, err := EncodeTrashEnvelope(envelope)
	if err != nil {
		return err
	}
	_, err = tx.ExecContext(ctx, `INSERT INTO workspace_trash(id,category_id,title,deleted_at,payload) VALUES (?,?,?,?,?)`, id, categoryID, title, deletedAt, payload)
	return err
}

func HasTrashedWorkspaceInCategoryTx(ctx context.Context, tx dbtx.DBTX, categoryID string) (bool, error) {
	var count int
	if err := tx.QueryRowContext(ctx, `SELECT COUNT(*) FROM workspace_trash WHERE category_id=?`, categoryID).Scan(&count); err != nil {
		return false, err
	}
	return count > 0, nil
}

func DeleteAllTx(ctx context.Context, tx dbtx.DBTX) error {
	_, err := tx.ExecContext(ctx, `DELETE FROM workspace_trash`)
	return err
}

func TrashRecordsTx(ctx context.Context, tx dbtx.DBTX) ([]TrashRecord, error) {
	rows, err := tx.QueryContext(ctx, `SELECT id,category_id,title,deleted_at,payload FROM workspace_trash ORDER BY deleted_at DESC,id`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	records := []TrashRecord{}
	for rows.Next() {
		var record TrashRecord
		var payload []byte
		if err := rows.Scan(&record.ID, &record.CategoryID, &record.Title, &record.DeletedAt, &payload); err != nil {
			return nil, err
		}
		if err := DecodeTrashEnvelope(payload, &record.Payload); err != nil {
			return nil, fmt.Errorf("decode trash payload %s: %w", record.ID, err)
		}
		records = append(records, record)
	}
	return records, rows.Err()
}

func ReadTrashTx(ctx context.Context, tx dbtx.DBTX, id string) (TrashRecord, error) {
	var record TrashRecord
	var payload []byte
	err := tx.QueryRowContext(ctx, `SELECT id,category_id,title,deleted_at,payload FROM workspace_trash WHERE id=?`, id).
		Scan(&record.ID, &record.CategoryID, &record.Title, &record.DeletedAt, &payload)
	if errors.Is(err, sql.ErrNoRows) {
		return record, workspacepkg.ErrNotFound
	}
	if err != nil {
		return record, err
	}
	if err := DecodeTrashEnvelope(payload, &record.Payload); err != nil {
		return record, fmt.Errorf("decode trash envelope: %w", err)
	}
	return record, nil
}
