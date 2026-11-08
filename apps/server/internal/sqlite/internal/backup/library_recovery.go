package backupquery

import (
	"context"
	"database/sql"
	"errors"
	"fmt"

	workspacepkg "github.com/howlil/notespace/apps/server/internal/workspace"
)

func ReadTrashTx(ctx context.Context, tx *sql.Tx, id string) (TrashRecord, error) {
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
