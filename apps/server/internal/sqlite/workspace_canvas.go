package sqlite

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"time"

	"github.com/howlil/notespace/apps/server/internal/workspace"
)

func canvasStateFromRow(row scanner) (workspace.CanvasState, error) {
	var value workspace.CanvasState
	var encoded string
	err := row.Scan(&encoded, &value.Version, &value.UpdatedAt)
	if errors.Is(err, sql.ErrNoRows) {
		return value, workspace.ErrNotFound
	}
	if err != nil {
		return value, err
	}
	if err := json.Unmarshal([]byte(encoded), &value.Canvas); err != nil {
		return value, err
	}
	return value, nil
}

func (s *Store) GetCanvasState(ctx context.Context, workspaceID string) (workspace.CanvasState, error) {
	return canvasStateFromRow(s.db.QueryRowContext(ctx,
		`SELECT canvas_state,version,updated_at FROM workspace_canvas WHERE workspace_id=?`,
		workspaceID,
	))
}

func canvasElementCount(canvas workspace.Snapshot) (int, error) {
	var scene struct {
		Elements []json.RawMessage `json:"elements"`
	}
	if err := json.Unmarshal(canvas.Data, &scene); err != nil {
		return 0, err
	}
	return len(scene.Elements), nil
}

func (s *Store) UpdateCanvas(ctx context.Context, workspaceID string, update workspace.CanvasUpdate) (workspace.CanvasState, error) {
	encoded, err := json.Marshal(update.Canvas)
	if err != nil {
		return workspace.CanvasState{}, err
	}
	elementCount, err := canvasElementCount(update.Canvas)
	if err != nil {
		return workspace.CanvasState{}, err
	}
	now := time.Now().UTC().Format(time.RFC3339Nano)
	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return workspace.CanvasState{}, err
	}
	defer tx.Rollback()

	var state workspace.CanvasState
	var stored string
	err = tx.QueryRowContext(ctx, `UPDATE workspace_canvas
SET canvas_state=?,updated_at=?,version=version+1,element_count=?
WHERE workspace_id=? AND version=?
RETURNING canvas_state,version,updated_at`,
		encoded, now, elementCount, workspaceID, update.Version,
	).Scan(&stored, &state.Version, &state.UpdatedAt)
	if errors.Is(err, sql.ErrNoRows) {
		var count int
		if countErr := tx.QueryRowContext(ctx, `SELECT COUNT(*) FROM workspace_canvas WHERE workspace_id=?`, workspaceID).Scan(&count); countErr != nil {
			return workspace.CanvasState{}, countErr
		}
		if count == 0 {
			return workspace.CanvasState{}, workspace.ErrNotFound
		}
		return workspace.CanvasState{}, workspace.ErrConflict
	}
	if err != nil {
		return workspace.CanvasState{}, err
	}
	if err := json.Unmarshal([]byte(stored), &state.Canvas); err != nil {
		return workspace.CanvasState{}, err
	}

	result, err := tx.ExecContext(ctx, `UPDATE projects SET updated_at=?,version=version+1 WHERE id=?`, now, workspaceID)
	if err != nil {
		return workspace.CanvasState{}, err
	}
	if affected, _ := result.RowsAffected(); affected == 0 {
		return workspace.CanvasState{}, workspace.ErrNotFound
	}
	// Canvas content is not searchable, so advance only the aggregate revision
	// recorded by an existing FTS projection. Title/category/notes_revision
	// mismatches still force the normal lazy rebuild.
	if _, err := tx.ExecContext(ctx, `UPDATE workspace_search_meta
SET version=(SELECT version FROM projects WHERE id=?)
WHERE workspace_id=?`, workspaceID, workspaceID); err != nil {
		return workspace.CanvasState{}, err
	}
	if err := tx.Commit(); err != nil {
		return workspace.CanvasState{}, err
	}
	return state, nil
}
