package workspacequery

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"

	"github.com/howlil/notespace/apps/server/internal/sqlite/internal/dbtx"
	workspacepkg "github.com/howlil/notespace/apps/server/internal/workspace"
)

func canvasStateFromRow(row dbtx.Scanner) (workspacepkg.CanvasState, error) {
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

func GetCanvasState(ctx context.Context, db dbtx.DBTX, workspaceID string) (workspacepkg.CanvasState, error) {
	return canvasStateFromRow(db.QueryRowContext(ctx,
		`SELECT canvas_state,version,updated_at FROM workspace_canvas WHERE workspace_id=?`,
		workspaceID,
	))
}

func hydrateGranularProject(ctx context.Context, db dbtx.DBTX, value workspacepkg.Workspace) (workspacepkg.Workspace, error) {
	canvas, err := GetCanvasState(ctx, db, value.ID)
	if err != nil {
		return workspacepkg.Workspace{}, err
	}
	value.Canvas = canvas.Canvas
	value.CanvasVersion = canvas.Version
	return value, nil
}

func insertGranularStateTx(ctx context.Context, tx dbtx.DBTX, workspace workspacepkg.Workspace) error {
	canvas, err := json.Marshal(workspace.Canvas)
	if err != nil {
		return err
	}
	elementCount, err := workspacepkg.CountActiveCanvasElements(workspace.Canvas)
	if err != nil {
		return err
	}
	canvasVersion := workspace.CanvasVersion
	if canvasVersion < 1 {
		canvasVersion = 1
	}
	_, err = tx.ExecContext(ctx, `INSERT INTO workspace_canvas(workspace_id,canvas_state,version,updated_at,element_count)
VALUES (?,?,?,?,?)`, workspace.ID, canvas, canvasVersion, workspace.UpdatedAt, elementCount)
	return err
}

// UpdateCanvasTx borrows the facade's transaction; Canvas and aggregate revision
// change together while element counting stays in domain logic before persistence.
func UpdateCanvasTx(ctx context.Context, tx dbtx.DBTX, workspaceID string, expectedVersion int, canvas workspacepkg.Snapshot, elementCount int, now string) (workspacepkg.CanvasState, error) {
	encoded, err := json.Marshal(canvas)
	if err != nil {
		return workspacepkg.CanvasState{}, err
	}
	state, err := canvasStateFromRow(tx.QueryRowContext(ctx, `UPDATE workspace_canvas
SET canvas_state=?,updated_at=?,version=version+1,element_count=?
WHERE workspace_id=? AND version=?
RETURNING canvas_state,version,updated_at`,
		encoded, now, elementCount, workspaceID, expectedVersion,
	))
	if errors.Is(err, workspacepkg.ErrNotFound) {
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
	result, err := tx.ExecContext(ctx, `UPDATE projects SET updated_at=?,version=version+1 WHERE id=?`, now, workspaceID)
	if err != nil {
		return workspacepkg.CanvasState{}, err
	}
	if affected, _ := result.RowsAffected(); affected == 0 {
		return workspacepkg.CanvasState{}, workspacepkg.ErrNotFound
	}
	return state, nil
}
