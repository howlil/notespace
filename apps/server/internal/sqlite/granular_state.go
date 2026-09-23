package sqlite

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"time"

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

func listGranularNotes(ctx context.Context, q rowsQueryer, workspaceID string) ([]workspace.Note, error) {
	rows, err := q.QueryContext(ctx, `SELECT id,title,document_state,created_at,updated_at,version
FROM workspace_notes WHERE workspace_id=? ORDER BY created_at,id`, workspaceID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	notes := []workspace.Note{}
	for rows.Next() {
		var note workspace.Note
		var document string
		if err := rows.Scan(&note.ID, &note.Title, &document, &note.CreatedAt, &note.UpdatedAt, &note.Version); err != nil {
			return nil, err
		}
		if err := json.Unmarshal([]byte(document), &note.Document); err != nil {
			return nil, err
		}
		notes = append(notes, note)
	}
	return notes, rows.Err()
}

func (s *Store) ListNotes(ctx context.Context, workspaceID string) ([]workspace.Note, error) {
	var exists int
	if err := s.db.QueryRowContext(ctx, `SELECT COUNT(*) FROM projects WHERE id=?`, workspaceID).Scan(&exists); err != nil {
		return nil, err
	}
	if exists == 0 {
		return nil, workspace.ErrNotFound
	}
	return listGranularNotes(ctx, s.db, workspaceID)
}

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

func canvasElementCount(canvas workspace.Snapshot) (int, error) {
	var scene struct {
		Elements []json.RawMessage `json:"elements"`
	}
	if err := json.Unmarshal(canvas.Data, &scene); err != nil {
		return 0, err
	}
	return len(scene.Elements), nil
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

func (s *Store) CreateNote(ctx context.Context, workspaceID string, input workspace.NoteCreate) (workspace.Note, error) {
	document, err := json.Marshal(input.Document)
	if err != nil {
		return workspace.Note{}, err
	}
	now := time.Now().UTC().Format(time.RFC3339Nano)
	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return workspace.Note{}, err
	}
	defer tx.Rollback()

	var workspaceExists int
	if err := tx.QueryRowContext(ctx, `SELECT COUNT(*) FROM projects WHERE id=?`, workspaceID).Scan(&workspaceExists); err != nil {
		return workspace.Note{}, err
	}
	if workspaceExists == 0 {
		return workspace.Note{}, workspace.ErrNotFound
	}
	var existing int
	if err := tx.QueryRowContext(ctx, `SELECT COUNT(*) FROM workspace_notes WHERE workspace_id=? AND id=?`, workspaceID, input.ID).Scan(&existing); err != nil {
		return workspace.Note{}, err
	}
	if existing != 0 {
		return workspace.Note{}, workspace.ErrConflict
	}
	if _, err := tx.ExecContext(ctx, `INSERT INTO workspace_notes(workspace_id,id,title,document_state,created_at,updated_at,version)
VALUES (?,?,?,?,?,?,1)`, workspaceID, input.ID, input.Title, document, now, now); err != nil {
		return workspace.Note{}, err
	}
	if _, err := tx.ExecContext(ctx, `UPDATE projects SET updated_at=?,version=version+1,notes_revision=notes_revision+1 WHERE id=?`, now, workspaceID); err != nil {
		return workspace.Note{}, err
	}
	if err := tx.Commit(); err != nil {
		return workspace.Note{}, err
	}
	return workspace.Note{
		ID: input.ID, Title: input.Title, Document: input.Document,
		CreatedAt: now, UpdatedAt: now, Version: 1,
	}, nil
}

func (s *Store) UpdateNote(ctx context.Context, workspaceID, noteID string, update workspace.NoteUpdate) (workspace.Note, error) {
	document, err := json.Marshal(update.Document)
	if err != nil {
		return workspace.Note{}, err
	}
	now := time.Now().UTC().Format(time.RFC3339Nano)
	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return workspace.Note{}, err
	}
	defer tx.Rollback()

	var note workspace.Note
	var encoded string
	err = tx.QueryRowContext(ctx, `UPDATE workspace_notes
SET title=?,document_state=?,updated_at=?,version=version+1
WHERE workspace_id=? AND id=? AND version=?
RETURNING id,title,document_state,created_at,updated_at,version`,
		update.Title, document, now, workspaceID, noteID, update.Version,
	).Scan(&note.ID, &note.Title, &encoded, &note.CreatedAt, &note.UpdatedAt, &note.Version)
	if errors.Is(err, sql.ErrNoRows) {
		var count int
		if countErr := tx.QueryRowContext(ctx, `SELECT COUNT(*) FROM workspace_notes WHERE workspace_id=? AND id=?`, workspaceID, noteID).Scan(&count); countErr != nil {
			return workspace.Note{}, countErr
		}
		if count == 0 {
			return workspace.Note{}, workspace.ErrNotFound
		}
		return workspace.Note{}, workspace.ErrConflict
	}
	if err != nil {
		return workspace.Note{}, err
	}
	if err := json.Unmarshal([]byte(encoded), &note.Document); err != nil {
		return workspace.Note{}, err
	}

	if _, err := tx.ExecContext(ctx, `UPDATE projects SET updated_at=?,version=version+1,notes_revision=notes_revision+1 WHERE id=?`, now, workspaceID); err != nil {
		return workspace.Note{}, err
	}
	if err := tx.Commit(); err != nil {
		return workspace.Note{}, err
	}
	return note, nil
}

func (s *Store) DeleteNote(ctx context.Context, workspaceID, noteID string, version int) error {
	now := time.Now().UTC().Format(time.RFC3339Nano)
	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	defer tx.Rollback()

	var total int
	if err := tx.QueryRowContext(ctx, `SELECT COUNT(*) FROM workspace_notes WHERE workspace_id=?`, workspaceID).Scan(&total); err != nil {
		return err
	}
	if total == 0 {
		return workspace.ErrNotFound
	}
	if total <= 1 {
		return workspace.ErrInvalid
	}
	var currentVersion int
	err = tx.QueryRowContext(ctx, `SELECT version FROM workspace_notes WHERE workspace_id=? AND id=?`, workspaceID, noteID).Scan(&currentVersion)
	if errors.Is(err, sql.ErrNoRows) {
		return workspace.ErrNotFound
	}
	if err != nil {
		return err
	}
	if currentVersion != version {
		return workspace.ErrConflict
	}
	if _, err := tx.ExecContext(ctx, `DELETE FROM workspace_notes WHERE workspace_id=? AND id=?`, workspaceID, noteID); err != nil {
		return err
	}
	if _, err := tx.ExecContext(ctx, `UPDATE projects SET updated_at=?,version=version+1,notes_revision=notes_revision+1 WHERE id=?`, now, workspaceID); err != nil {
		return err
	}
	return tx.Commit()
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
