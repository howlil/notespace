package sqlite

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"time"

	"github.com/howlil/notespace/apps/server/internal/workspace"
)

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
