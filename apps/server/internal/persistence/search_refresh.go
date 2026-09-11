package persistence

import (
	"context"
)

func (s *Store) refreshWorkspaceSearch(ctx context.Context, workspaceID string) error {
	value, err := s.Get(ctx, workspaceID)
	if err != nil {
		return err
	}
	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	defer tx.Rollback()
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
