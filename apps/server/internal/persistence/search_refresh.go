package persistence

import (
	"context"
	"encoding/json"

	"github.com/howlil/notespace/apps/server/internal/project"
)

func (s *Store) refreshWorkspaceSearch(ctx context.Context, workspaceID string) error {
	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	defer tx.Rollback()

	// Read the authored workspace from the same transaction that advances the
	// projection. Otherwise an autosave could land after Get and before BeginTx,
	// causing an older version to overwrite newer search metadata.
	value, err := readProject(tx.QueryRowContext(ctx, `SELECT `+columns+` FROM projects WHERE id=?`, workspaceID))
	if err != nil {
		return err
	}
	if _, err := tx.ExecContext(ctx, `DELETE FROM workspace_search WHERE workspace_id=?`, value.ID); err != nil {
		return err
	}
	if _, err := tx.ExecContext(ctx, `INSERT INTO workspace_search(type,category_id,workspace_id,workspace_title,note_id,note_title,block_id,title,content) VALUES ('workspace',?,?,?,?,?,?,?,?)`, value.CategoryID, value.ID, value.Title, "", "", "", value.Title, ""); err != nil {
		return err
	}
	for _, note := range value.Notes {
		if _, err := tx.ExecContext(ctx, `INSERT INTO workspace_search(type,category_id,workspace_id,workspace_title,note_id,note_title,block_id,title,content) VALUES ('note',?,?,?,?,?,?,?,?)`, value.CategoryID, value.ID, value.Title, note.ID, note.Title, "", note.Title, ""); err != nil {
			return err
		}
		for _, block := range extractSearchBlocks(note.Document.Data) {
			if _, err := tx.ExecContext(ctx, `INSERT INTO workspace_search(type,category_id,workspace_id,workspace_title,note_id,note_title,block_id,title,content) VALUES ('block',?,?,?,?,?,?,?,?)`, value.CategoryID, value.ID, value.Title, note.ID, note.Title, block.ID, "", block.Text); err != nil {
				return err
			}
		}
	}
	if _, err := tx.ExecContext(ctx, `INSERT INTO workspace_search_meta(workspace_id,version,category_id,title) VALUES (?,?,?,?)
ON CONFLICT(workspace_id) DO UPDATE SET version=excluded.version,category_id=excluded.category_id,title=excluded.title`, value.ID, value.Version, value.CategoryID, value.Title); err != nil {
		return err
	}
	return tx.Commit()
}


func (s *Store) refreshNoteSearch(ctx context.Context, workspaceID, noteID string) error {
	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	defer tx.Rollback()

	var categoryID, workspaceTitle string
	if err := tx.QueryRowContext(ctx, `SELECT category_id,title FROM projects WHERE id=?`, workspaceID).Scan(&categoryID, &workspaceTitle); err != nil {
		return err
	}
	var noteTitle, encodedDocument string
	if err := tx.QueryRowContext(ctx, `SELECT title,document_state FROM workspace_notes WHERE workspace_id=? AND id=?`, workspaceID, noteID).Scan(&noteTitle, &encodedDocument); err != nil {
		return err
	}
	var document project.Snapshot
	if err := json.Unmarshal([]byte(encodedDocument), &document); err != nil {
		return err
	}
	if _, err := tx.ExecContext(ctx, `DELETE FROM workspace_search WHERE workspace_id=? AND note_id=?`, workspaceID, noteID); err != nil {
		return err
	}
	if _, err := tx.ExecContext(ctx, `INSERT INTO workspace_search(type,category_id,workspace_id,workspace_title,note_id,note_title,block_id,title,content)
VALUES ('note',?,?,?,?,?,?,?,?)`, categoryID, workspaceID, workspaceTitle, noteID, noteTitle, "", noteTitle, ""); err != nil {
		return err
	}
	for _, block := range extractSearchBlocks(document.Data) {
		if _, err := tx.ExecContext(ctx, `INSERT INTO workspace_search(type,category_id,workspace_id,workspace_title,note_id,note_title,block_id,title,content)
VALUES ('block',?,?,?,?,?,?,?,?)`, categoryID, workspaceID, workspaceTitle, noteID, noteTitle, block.ID, "", block.Text); err != nil {
			return err
		}
	}
	return tx.Commit()
}
