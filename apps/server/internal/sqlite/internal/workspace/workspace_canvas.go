package workspacequery

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"

	"github.com/howlil/notespace/apps/server/internal/sqlite/internal/dbtx"
	workspacepkg "github.com/howlil/notespace/apps/server/internal/workspace"
)

func CanvasStateFromRow(row dbtx.Scanner) (workspacepkg.CanvasState, error) {
	var value workspacepkg.CanvasState
	var encoded string
	err := row.Scan(&encoded, &value.Version, &value.UpdatedAt)
	if errors.Is(err, sql.ErrNoRows) {
		return value, workspacepkg.ErrNotFound
	}
	if err != nil {
		return value, err
	}
	if err := json.Unmarshal([]byte(encoded), &value.Canvas); err != nil {
		return value, err
	}
	return value, nil
}
func GetCanvasState(db dbtx.DBTX, ctx context.Context, workspaceID string) (workspacepkg.CanvasState, error) {
	return CanvasStateFromRow(db.QueryRowContext(ctx,
		`SELECT canvas_state,version,updated_at FROM workspace_canvas WHERE workspace_id=?`,
		workspaceID,
	))
}

// UpdateCanvasTx borrows the facade's transaction; Canvas and aggregate revision
// change together. Encoding and element counting happen before Store begins it.
func UpdateCanvasTx(ctx context.Context, tx dbtx.DBTX, workspaceID string, expectedVersion int, encoded []byte, elementCount int, now string) (workspacepkg.CanvasState, error) {
	var state workspacepkg.CanvasState
	var stored string
	err := tx.QueryRowContext(ctx, `UPDATE workspace_canvas
SET canvas_state=?,updated_at=?,version=version+1,element_count=?
WHERE workspace_id=? AND version=?
RETURNING canvas_state,version,updated_at`,
		encoded, now, elementCount, workspaceID, expectedVersion,
	).Scan(&stored, &state.Version, &state.UpdatedAt)
	if errors.Is(err, sql.ErrNoRows) {
		var count int
		if countErr := tx.QueryRowContext(ctx, `SELECT COUNT(*) FROM workspace_canvas WHERE workspace_id=?`, workspaceID).Scan(&count); countErr != nil {
			return workspacepkg.CanvasState{}, countErr
		}
		if count == 0 {
			return workspacepkg.CanvasState{}, workspacepkg.ErrNotFound
		}
		return workspacepkg.CanvasState{}, workspacepkg.ErrConflict
	}
	if err != nil {
		return workspacepkg.CanvasState{}, err
	}
	if err := json.Unmarshal([]byte(stored), &state.Canvas); err != nil {
		return workspacepkg.CanvasState{}, err
	}
	result, err := tx.ExecContext(ctx, `UPDATE projects SET updated_at=?,version=version+1 WHERE id=?`, now, workspaceID)
	if err != nil {
		return workspacepkg.CanvasState{}, err
	}
	if affected, _ := result.RowsAffected(); affected == 0 {
		return workspacepkg.CanvasState{}, workspacepkg.ErrNotFound
	}
	return state, nil
}

func CanvasElementCount(canvas workspacepkg.Snapshot) (int, error) {
	var scene struct {
		Elements []struct {
			IsDeleted bool `json:"isDeleted"`
		} `json:"elements"`
	}
	if err := json.Unmarshal(canvas.Data, &scene); err != nil {
		return 0, err
	}
	count := 0
	for _, element := range scene.Elements {
		if !element.IsDeleted {
			count++
		}
	}
	return count, nil
}
