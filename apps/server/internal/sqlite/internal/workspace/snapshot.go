package workspacequery

import (
	"context"
	"database/sql"
	"encoding/json"
	"fmt"

	"github.com/howlil/notespace/apps/server/internal/sqlite/internal/dbtx"
	workspacepkg "github.com/howlil/notespace/apps/server/internal/workspace"
)

func Snapshot(ctx context.Context, tx dbtx.DBTX, id string) (workspacepkg.Workspace, []workspacepkg.HistorySnapshot, error) {
	workspace, err := ReadProject(tx.QueryRowContext(ctx, `SELECT `+Columns+` FROM projects WHERE id=?`, id))
	if err != nil {
		return workspacepkg.Workspace{}, nil, err
	}
	workspace, err = HydrateGranularProject(ctx, tx, workspace)
	if err != nil {
		return workspacepkg.Workspace{}, nil, err
	}
	historyRows, err := tx.QueryContext(ctx, `SELECT h.id,h.workspace_id,h.version,h.title,h.document_state,h.notes_state,h.canvas_state,h.references_state,h.split_ratio,h.created_at,p.codec,p.payload FROM workspace_history h LEFT JOIN workspace_history_payload p ON p.history_id=h.id WHERE h.workspace_id=? ORDER BY h.created_at DESC,h.rowid DESC LIMIT 50`, id)
	if err != nil {
		return workspacepkg.Workspace{}, nil, err
	}
	history := []workspacepkg.HistorySnapshot{}
	for historyRows.Next() {
		var snapshot workspacepkg.HistorySnapshot
		var document, notes, canvas, references string
		var codec sql.NullString
		var payload []byte
		if err := historyRows.Scan(&snapshot.ID, &snapshot.WorkspaceID, &snapshot.Version, &snapshot.Title, &document, &notes, &canvas, &references, &snapshot.SplitRatio, &snapshot.CreatedAt, &codec, &payload); err != nil {
			historyRows.Close()
			return workspacepkg.Workspace{}, nil, err
		}
		if codec.Valid && len(payload) > 0 {
			if err := DecodeHistoryPayload(codec.String, payload, &snapshot); err != nil {
				historyRows.Close()
				return workspacepkg.Workspace{}, nil, fmt.Errorf("decode history payload: %w", err)
			}
		} else {
			if err := json.Unmarshal([]byte(document), &snapshot.Document); err != nil {
				historyRows.Close()
				return workspacepkg.Workspace{}, nil, err
			}
			if err := json.Unmarshal([]byte(notes), &snapshot.Notes); err != nil {
				historyRows.Close()
				return workspacepkg.Workspace{}, nil, err
			}
			if err := json.Unmarshal([]byte(canvas), &snapshot.Canvas); err != nil {
				historyRows.Close()
				return workspacepkg.Workspace{}, nil, err
			}
			if err := json.Unmarshal([]byte(references), &snapshot.References); err != nil {
				historyRows.Close()
				return workspacepkg.Workspace{}, nil, err
			}
		}
		history = append(history, snapshot)
	}
	if err := historyRows.Err(); err != nil {
		historyRows.Close()
		return workspacepkg.Workspace{}, nil, err
	}
	historyRows.Close()

	return workspace, history, nil
}
