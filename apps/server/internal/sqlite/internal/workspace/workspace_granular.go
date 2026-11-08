package workspacequery

import (
	"context"
	"database/sql"
	"encoding/json"

	"github.com/howlil/notespace/apps/server/internal/sqlite/internal/dbtx"
	workspacepkg "github.com/howlil/notespace/apps/server/internal/workspace"
)

type RowsQueryer interface {
	QueryContext(context.Context, string, ...any) (*sql.Rows, error)
}

type RowQueryer interface {
	QueryRowContext(context.Context, string, ...any) *sql.Row
}

type GranularQueryer interface {
	RowsQueryer
	RowQueryer
}

func HydrateGranularProject(ctx context.Context, q GranularQueryer, value workspacepkg.Workspace) (workspacepkg.Workspace, error) {
	value.Notes = []workspacepkg.Note{}
	value.Document = workspacepkg.Snapshot{
		Format:  "tiptap",
		Version: 1,
		Data:    json.RawMessage(`{"type":"doc","content":[]}`),
	}
	canvas, err := CanvasStateFromRow(q.QueryRowContext(ctx,
		`SELECT canvas_state,version,updated_at FROM workspace_canvas WHERE workspace_id=?`,
		value.ID,
	))
	if err != nil {
		return workspacepkg.Workspace{}, err
	}
	value.Canvas = canvas.Canvas
	value.CanvasVersion = canvas.Version
	return value, nil
}

func InsertGranularStateTx(ctx context.Context, tx dbtx.DBTX, workspace workspacepkg.Workspace) error {
	canvas, err := json.Marshal(workspace.Canvas)
	if err != nil {
		return err
	}
	elementCount, err := CanvasElementCount(workspace.Canvas)
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

func ReconcileGranularStateTx(ctx context.Context, tx dbtx.DBTX, workspaceID string, canvas workspacepkg.Snapshot, updatedAt string) error {
	// Notes are retired. Clear any legacy rows during aggregate writes so an
	// old client cannot reintroduce Note data through the compatibility PATCH.
	if _, err := tx.ExecContext(ctx, `DELETE FROM workspace_notes WHERE workspace_id=?`, workspaceID); err != nil {
		return err
	}

	encodedCanvas, err := json.Marshal(canvas)
	if err != nil {
		return err
	}
	elementCount, err := CanvasElementCount(canvas)
	if err != nil {
		return err
	}
	_, err = tx.ExecContext(ctx, `INSERT INTO workspace_canvas(workspace_id,canvas_state,version,updated_at,element_count)
VALUES (?,?,1,?,?)
ON CONFLICT(workspace_id) DO UPDATE SET
  canvas_state=excluded.canvas_state,
  updated_at=excluded.updated_at,
  element_count=excluded.element_count,
  version=CASE WHEN workspace_canvas.canvas_state<>excluded.canvas_state
    THEN workspace_canvas.version+1 ELSE workspace_canvas.version END`,
		workspaceID, encodedCanvas, updatedAt, elementCount)
	return err
}
