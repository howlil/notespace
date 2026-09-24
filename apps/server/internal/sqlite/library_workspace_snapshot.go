package sqlite

import (
	"context"
	"database/sql"
	"encoding/json"
	"fmt"

	"github.com/howlil/notespace/apps/server/internal/asset"
	workspacepkg "github.com/howlil/notespace/apps/server/internal/workspace"
)

func snapshotWorkspaceTx(ctx context.Context, tx *sql.Tx, id string) (workspaceEnvelope, error) {
	workspace, err := readProject(tx.QueryRowContext(ctx, `SELECT `+columns+` FROM projects WHERE id=?`, id))
	if err != nil {
		return workspaceEnvelope{}, err
	}
	workspace, err = hydrateGranularProject(ctx, tx, workspace)
	if err != nil {
		return workspaceEnvelope{}, err
	}
	plan, err := planTx(ctx, tx, id)
	if err != nil {
		return workspaceEnvelope{}, err
	}

	historyRows, err := tx.QueryContext(ctx, `SELECT h.id,h.workspace_id,h.version,h.title,h.document_state,h.notes_state,h.canvas_state,h.references_state,h.split_ratio,h.created_at,p.codec,p.payload FROM workspace_history h LEFT JOIN workspace_history_payload p ON p.history_id=h.id WHERE h.workspace_id=? ORDER BY h.created_at DESC,h.rowid DESC LIMIT 50`, id)
	if err != nil {
		return workspaceEnvelope{}, err
	}
	history := []workspacepkg.HistorySnapshot{}
	for historyRows.Next() {
		var snapshot workspacepkg.HistorySnapshot
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
	return workspaceEnvelope{Project: workspace, Plan: plan, History: history, Assets: assets}, nil
}
