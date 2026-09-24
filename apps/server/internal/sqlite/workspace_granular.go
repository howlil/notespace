package sqlite

import (
	"context"
	"database/sql"
	"encoding/json"

	"github.com/howlil/notespace/apps/server/internal/workspace"
)

type rowsQueryer interface {
	QueryContext(context.Context, string, ...any) (*sql.Rows, error)
}

type rowQueryer interface {
	QueryRowContext(context.Context, string, ...any) *sql.Row
}

type granularQueryer interface {
	rowsQueryer
	rowQueryer
}

func hydrateGranularProject(ctx context.Context, q granularQueryer, value workspace.Workspace) (workspace.Workspace, error) {
	notes, err := listGranularNotes(ctx, q, value.ID)
	if err != nil {
		return workspace.Workspace{}, err
	}
	if len(notes) > 0 {
		value.Notes = notes
		value.Document = notes[0].Document
	}
	canvas, err := canvasStateFromRow(q.QueryRowContext(ctx,
		`SELECT canvas_state,version,updated_at FROM workspace_canvas WHERE workspace_id=?`,
		value.ID,
	))
	if err != nil {
		return workspace.Workspace{}, err
	}
	value.Canvas = canvas.Canvas
	value.CanvasVersion = canvas.Version
	return value, nil
}

func insertGranularStateTx(ctx context.Context, tx *sql.Tx, workspace workspace.Workspace) error {
	for _, note := range workspace.Notes {
		document, err := json.Marshal(note.Document)
		if err != nil {
			return err
		}
		version := note.Version
		if version < 1 {
			version = 1
		}
		if _, err := tx.ExecContext(ctx, `INSERT INTO workspace_notes(workspace_id,id,title,document_state,created_at,updated_at,version)
VALUES (?,?,?,?,?,?,?)`, workspace.ID, note.ID, note.Title, document, note.CreatedAt, note.UpdatedAt, version); err != nil {
			return err
		}
	}
	canvas, err := json.Marshal(workspace.Canvas)
	if err != nil {
		return err
	}
	elementCount, err := canvasElementCount(workspace.Canvas)
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

func reconcileGranularStateTx(ctx context.Context, tx *sql.Tx, workspaceID string, notes []workspace.Note, canvas workspace.Snapshot, updatedAt string) error {
	incoming := make(map[string]struct{}, len(notes))
	for _, note := range notes {
		incoming[note.ID] = struct{}{}
		document, err := json.Marshal(note.Document)
		if err != nil {
			return err
		}
		createdAt := note.CreatedAt
		if createdAt == "" {
			createdAt = updatedAt
		}
		noteUpdatedAt := note.UpdatedAt
		if noteUpdatedAt == "" {
			noteUpdatedAt = updatedAt
		}
		if _, err := tx.ExecContext(ctx, `INSERT INTO workspace_notes(workspace_id,id,title,document_state,created_at,updated_at,version)
VALUES (?,?,?,?,?,?,1)
ON CONFLICT(workspace_id,id) DO UPDATE SET
  title=excluded.title,
  document_state=excluded.document_state,
  updated_at=excluded.updated_at,
  version=CASE
    WHEN workspace_notes.title<>excluded.title OR workspace_notes.document_state<>excluded.document_state
    THEN workspace_notes.version+1 ELSE workspace_notes.version END`,
			workspaceID, note.ID, note.Title, document, createdAt, noteUpdatedAt); err != nil {
			return err
		}
	}
	existingRows, err := tx.QueryContext(ctx, `SELECT id FROM workspace_notes WHERE workspace_id=?`, workspaceID)
	if err != nil {
		return err
	}
	var stale []string
	for existingRows.Next() {
		var id string
		if err := existingRows.Scan(&id); err != nil {
			existingRows.Close()
			return err
		}
		if _, ok := incoming[id]; !ok {
			stale = append(stale, id)
		}
	}
	if err := existingRows.Err(); err != nil {
		existingRows.Close()
		return err
	}
	existingRows.Close()
	for _, id := range stale {
		if _, err := tx.ExecContext(ctx, `DELETE FROM workspace_notes WHERE workspace_id=? AND id=?`, workspaceID, id); err != nil {
			return err
		}
	}

	encodedCanvas, err := json.Marshal(canvas)
	if err != nil {
		return err
	}
	elementCount, err := canvasElementCount(canvas)
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
