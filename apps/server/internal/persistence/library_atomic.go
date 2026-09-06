package persistence

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"
	"time"

	"github.com/howlil/notespace/apps/server/internal/asset"
	"github.com/howlil/notespace/apps/server/internal/project"
	"github.com/howlil/notespace/apps/server/internal/study"
)

func snapshotWorkspaceTx(ctx context.Context, tx *sql.Tx, id string) (workspaceEnvelope, error) {
	workspace, err := readProject(tx.QueryRowContext(ctx, `SELECT `+columns+` FROM projects WHERE id=?`, id))
	if err != nil {
		return workspaceEnvelope{}, err
	}

	historyRows, err := tx.QueryContext(ctx, `SELECT h.id,h.workspace_id,h.version,h.title,h.document_state,h.notes_state,h.canvas_state,h.references_state,h.split_ratio,h.created_at,p.codec,p.payload FROM workspace_history h LEFT JOIN workspace_history_payload p ON p.history_id=h.id WHERE h.workspace_id=? ORDER BY h.created_at DESC,h.rowid DESC LIMIT 50`, id)
	if err != nil {
		return workspaceEnvelope{}, err
	}
	history := []project.HistorySnapshot{}
	for historyRows.Next() {
		var snapshot project.HistorySnapshot
		var document, notes, canvas, references string
		var codec sql.NullString
		var payload []byte
		if err := historyRows.Scan(&snapshot.ID, &snapshot.WorkspaceID, &snapshot.Version, &snapshot.Title, &document, &notes, &canvas, &references, &snapshot.SplitRatio, &snapshot.CreatedAt, &codec, &payload); err != nil {
			historyRows.Close()
			return workspaceEnvelope{}, err
		}
		if codec.Valid && len(payload) > 0 {
			if err := decodeHistoryPayload(codec.String, payload, &snapshot); err != nil {
				historyRows.Close()
				return workspaceEnvelope{}, fmt.Errorf("decode history payload: %w", err)
			}
		} else {
			if err := json.Unmarshal([]byte(document), &snapshot.Document); err != nil {
				historyRows.Close()
				return workspaceEnvelope{}, err
			}
			if err := json.Unmarshal([]byte(notes), &snapshot.Notes); err != nil {
				historyRows.Close()
				return workspaceEnvelope{}, err
			}
			if err := json.Unmarshal([]byte(canvas), &snapshot.Canvas); err != nil {
				historyRows.Close()
				return workspaceEnvelope{}, err
			}
			if err := json.Unmarshal([]byte(references), &snapshot.References); err != nil {
				historyRows.Close()
				return workspaceEnvelope{}, err
			}
		}
		history = append(history, snapshot)
	}
	if err := historyRows.Err(); err != nil {
		historyRows.Close()
		return workspaceEnvelope{}, err
	}
	historyRows.Close()

	assetRows, err := tx.QueryContext(ctx, `SELECT id,workspace_id,mime_type,data,created_at FROM workspace_assets WHERE workspace_id=? ORDER BY created_at,id`, id)
	if err != nil {
		return workspaceEnvelope{}, err
	}
	assets := []asset.Stored{}
	for assetRows.Next() {
		var value asset.Stored
		if err := assetRows.Scan(&value.ID, &value.WorkspaceID, &value.MimeType, &value.Data, &value.CreatedAt); err != nil {
			assetRows.Close()
			return workspaceEnvelope{}, err
		}
		assets = append(assets, value)
	}
	if err := assetRows.Err(); err != nil {
		assetRows.Close()
		return workspaceEnvelope{}, err
	}
	assetRows.Close()
	return workspaceEnvelope{Project: workspace, History: history, Assets: assets}, nil
}

// TrashWorkspaceAtomic owns the complete save-point. With SQLite's single
// connection, no autosave can land between the captured snapshot and deletion.
func (s *Store) TrashWorkspaceAtomic(ctx context.Context, id string) error {
	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	defer tx.Rollback()
	envelope, err := snapshotWorkspaceTx(ctx, tx, id)
	if err != nil {
		return err
	}
	payload, err := json.Marshal(envelope)
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
		return project.ErrNotFound
	}
	return tx.Commit()
}

func categoriesTx(ctx context.Context, tx *sql.Tx) ([]project.CategorySummary, error) {
	rows, err := tx.QueryContext(ctx, `SELECT c.id,c.title,c.created_at,c.updated_at,COUNT(p.id) FROM categories c LEFT JOIN projects p ON p.category_id=c.id GROUP BY c.id ORDER BY c.updated_at DESC,c.id`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	items := []project.CategorySummary{}
	for rows.Next() {
		var category project.CategorySummary
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
		if err := json.Unmarshal(payload, &record.Payload); err != nil {
			return nil, fmt.Errorf("decode trash payload %s: %w", record.ID, err)
		}
		records = append(records, record)
	}
	return records, rows.Err()
}

func studySessionsTx(ctx context.Context, tx *sql.Tx) ([]study.Session, error) {
	rows, err := tx.QueryContext(ctx, `SELECT id,workspace_id,workspace_title_snapshot,activity_date,started_at,ended_at,active_seconds,last_heartbeat_at FROM study_sessions ORDER BY started_at,id`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	sessions := []study.Session{}
	for rows.Next() {
		session, err := scanStudySession(rows)
		if err != nil {
			return nil, err
		}
		sessions = append(sessions, session)
	}
	return sessions, rows.Err()
}

func (s *Store) ExportBackupJSONAtomic(ctx context.Context) ([]byte, error) {
	tx, err := s.db.BeginTx(ctx, &sql.TxOptions{ReadOnly: true})
	if err != nil {
		return nil, err
	}
	defer tx.Rollback()
	categories, err := categoriesTx(ctx, tx)
	if err != nil {
		return nil, err
	}
	rows, err := tx.QueryContext(ctx, `SELECT id FROM projects ORDER BY updated_at DESC,id`)
	if err != nil {
		return nil, err
	}
	ids := []string{}
	for rows.Next() {
		var id string
		if err := rows.Scan(&id); err != nil {
			rows.Close()
			return nil, err
		}
		ids = append(ids, id)
	}
	if err := rows.Err(); err != nil {
		rows.Close()
		return nil, err
	}
	rows.Close()
	workspaces := make([]workspaceEnvelope, 0, len(ids))
	for _, id := range ids {
		envelope, err := snapshotWorkspaceTx(ctx, tx, id)
		if err != nil {
			return nil, err
		}
		workspaces = append(workspaces, envelope)
	}
	trash, err := trashRecordsTx(ctx, tx)
	if err != nil {
		return nil, err
	}
	sessions, err := studySessionsTx(ctx, tx)
	if err != nil {
		return nil, err
	}
	data, err := json.Marshal(libraryBackup{
		Format: libraryBackupFormat, Version: libraryBackupVersion,
		GeneratedAt: time.Now().UTC().Format(time.RFC3339Nano),
		Categories: categories, Workspaces: workspaces, Trash: trash, Study: sessions,
	})
	if err != nil {
		return nil, err
	}
	if err := tx.Commit(); err != nil && !errors.Is(err, sql.ErrTxDone) {
		return nil, err
	}
	return data, nil
}
