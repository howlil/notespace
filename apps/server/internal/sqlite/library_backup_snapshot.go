package sqlite

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"
	"time"

	"github.com/howlil/notespace/apps/server/internal/activity"
	workspacepkg "github.com/howlil/notespace/apps/server/internal/workspace"
)

func categoriesTx(ctx context.Context, tx *sql.Tx) ([]workspacepkg.CategorySummary, error) {
	rows, err := tx.QueryContext(ctx, `SELECT c.id,c.title,c.created_at,c.updated_at,COUNT(p.id) FROM categories c LEFT JOIN projects p ON p.category_id=c.id GROUP BY c.id ORDER BY c.updated_at DESC,c.id`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	items := []workspacepkg.CategorySummary{}
	for rows.Next() {
		var category workspacepkg.CategorySummary
		if err := rows.Scan(&category.ID, &category.Title, &category.CreatedAt, &category.UpdatedAt, &category.WorkspaceCount); err != nil {
			return nil, err
		}
		items = append(items, category)
	}
	return items, rows.Err()
}

func trashRecordsTx(ctx context.Context, tx *sql.Tx) ([]trashRecord, error) {
	rows, err := tx.QueryContext(ctx, `SELECT id,category_id,title,deleted_at,payload FROM workspace_trash ORDER BY deleted_at DESC,id`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	records := []trashRecord{}
	for rows.Next() {
		var record trashRecord
		var payload []byte
		if err := rows.Scan(&record.ID, &record.CategoryID, &record.Title, &record.DeletedAt, &payload); err != nil {
			return nil, err
		}
		if err := decodeTrashEnvelope(payload, &record.Payload); err != nil {
			return nil, fmt.Errorf("decode trash payload %s: %w", record.ID, err)
		}
		records = append(records, record)
	}
	return records, rows.Err()
}

func activitySessionsTx(ctx context.Context, tx *sql.Tx) ([]activity.Session, error) {
	rows, err := tx.QueryContext(ctx, `SELECT `+activityColumns+` FROM activity_sessions ORDER BY started_at,id`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	sessions := []activity.Session{}
	for rows.Next() {
		session, err := scanActivitySession(rows)
		if err != nil {
			return nil, err
		}
		sessions = append(sessions, session)
	}
	return sessions, rows.Err()
}

func (s *Store) libraryBackupAtomic(ctx context.Context) (libraryBackup, error) {
	tx, err := s.db.BeginTx(ctx, &sql.TxOptions{ReadOnly: true})
	if err != nil {
		return libraryBackup{}, err
	}
	defer tx.Rollback()
	categories, err := categoriesTx(ctx, tx)
	if err != nil {
		return libraryBackup{}, err
	}
	rows, err := tx.QueryContext(ctx, `SELECT id FROM projects ORDER BY updated_at DESC,id`)
	if err != nil {
		return libraryBackup{}, err
	}
	ids := []string{}
	for rows.Next() {
		var id string
		if err := rows.Scan(&id); err != nil {
			rows.Close()
			return libraryBackup{}, err
		}
		ids = append(ids, id)
	}
	if err := rows.Err(); err != nil {
		rows.Close()
		return libraryBackup{}, err
	}
	rows.Close()
	workspaces := make([]workspaceEnvelope, 0, len(ids))
	for _, id := range ids {
		envelope, err := snapshotWorkspaceTx(ctx, tx, id)
		if err != nil {
			return libraryBackup{}, err
		}
		workspaces = append(workspaces, envelope)
	}
	trash, err := trashRecordsTx(ctx, tx)
	if err != nil {
		return libraryBackup{}, err
	}
	sessions, err := activitySessionsTx(ctx, tx)
	if err != nil {
		return libraryBackup{}, err
	}
	tasks, err := standaloneTasksTx(ctx, tx)
	if err != nil {
		return libraryBackup{}, err
	}
	backup := libraryBackup{
		Format: libraryBackupFormat, Version: libraryBackupVersion,
		GeneratedAt: time.Now().UTC().Format(time.RFC3339Nano),
		Categories:  categories, Workspaces: workspaces, Tasks: tasks, Trash: trash, Activity: sessions,
	}
	if err := tx.Commit(); err != nil && !errors.Is(err, sql.ErrTxDone) {
		return libraryBackup{}, err
	}
	return backup, nil
}

func (s *Store) exportBackupJSONAtomic(ctx context.Context) ([]byte, error) {
	backup, err := s.libraryBackupAtomic(ctx)
	if err != nil {
		return nil, err
	}
	return json.Marshal(backup)
}
