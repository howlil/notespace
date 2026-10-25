package sqlite

import (
	"context"
	"crypto/rand"
	"database/sql"
	"encoding/json"
	"errors"
	"time"

	"github.com/howlil/notespace/apps/server/internal/workspace"
)

func (s *Store) Create(ctx context.Context, p workspace.Workspace) error {
	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	defer tx.Rollback()
	references, _ := json.Marshal(p.References)
	_, err = tx.ExecContext(
		ctx,
		`INSERT INTO projects(id,category_id,title,references_state,split_ratio,created_at,updated_at,version) VALUES (?,?,?,?,?,?,?,?)`,
		p.ID, p.CategoryID, p.Title, string(references),
		p.SplitRatio, p.CreatedAt, p.UpdatedAt, p.Version,
	)
	if err != nil {
		return err
	}
	if err := insertGranularStateTx(ctx, tx, p); err != nil {
		return err
	}
	// Retain one creation baseline only for legacy backup/restore compatibility.
	// Normal autosave no longer produces periodic history checkpoints.
	if err := createHistory(ctx, tx, workspace.HistorySnapshot{
		HistoryEntry: workspace.HistoryEntry{ID: rand.Text(), WorkspaceID: p.ID, Version: p.Version, Title: p.Title, CreatedAt: p.CreatedAt},
		Document:     p.Document, Notes: p.Notes, Canvas: p.Canvas, References: p.References, SplitRatio: p.SplitRatio,
	}); err != nil {
		return err
	}
	return tx.Commit()
}

// Metadata changes never rewrite granular authored Note or Canvas rows.
func workspaceReadError(err error) error {
	if errors.Is(err, sql.ErrNoRows) {
		return workspace.ErrNotFound
	}
	return err
}

func (s *Store) RenameMetadata(ctx context.Context, id, title string, expectedTitle ...string) (workspace.Workspace, error) {
	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return workspace.Workspace{}, err
	}
	defer tx.Rollback()
	var currentTitle string
	if err := tx.QueryRowContext(ctx, `SELECT title FROM projects WHERE id=?`, id).Scan(&currentTitle); err != nil {
		return workspace.Workspace{}, workspaceReadError(err)
	}
	if len(expectedTitle) > 0 && currentTitle != expectedTitle[0] {
		return workspace.Workspace{}, workspace.ErrConflict
	}
	if currentTitle != title {
		if _, err := tx.ExecContext(ctx, `UPDATE projects SET title=?,updated_at=?,version=version+1 WHERE id=?`, title, time.Now().UTC().Format(time.RFC3339Nano), id); err != nil {
			return workspace.Workspace{}, err
		}
	}
	value, err := readProject(tx.QueryRowContext(ctx, `SELECT `+columns+` FROM projects WHERE id=?`, id))
	if err != nil {
		return workspace.Workspace{}, err
	}
	value, err = hydrateGranularProject(ctx, tx, value)
	if err != nil {
		return workspace.Workspace{}, err
	}
	if err := tx.Commit(); err != nil {
		return workspace.Workspace{}, err
	}
	return value, nil
}

func (s *Store) Move(ctx context.Context, id, categoryID string, expectedCategory ...string) (workspace.Workspace, error) {
	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return workspace.Workspace{}, err
	}
	defer tx.Rollback()
	var categoryExists int
	if err := tx.QueryRowContext(ctx, `SELECT COUNT(*) FROM categories WHERE id=?`, categoryID).Scan(&categoryExists); err != nil {
		return workspace.Workspace{}, err
	}
	if categoryExists == 0 {
		return workspace.Workspace{}, workspace.ErrNotFound
	}
	var currentCategory string
	if err := tx.QueryRowContext(ctx, `SELECT category_id FROM projects WHERE id=?`, id).Scan(&currentCategory); err != nil {
		return workspace.Workspace{}, workspaceReadError(err)
	}
	if len(expectedCategory) > 0 && currentCategory != expectedCategory[0] {
		return workspace.Workspace{}, workspace.ErrConflict
	}
	if currentCategory != categoryID {
		if _, err := tx.ExecContext(ctx, `UPDATE projects SET category_id=?,updated_at=?,version=version+1 WHERE id=?`, categoryID, time.Now().UTC().Format(time.RFC3339Nano), id); err != nil {
			return workspace.Workspace{}, err
		}
	}
	value, err := readProject(tx.QueryRowContext(ctx, `SELECT `+columns+` FROM projects WHERE id=?`, id))
	if err != nil {
		return workspace.Workspace{}, err
	}
	value, err = hydrateGranularProject(ctx, tx, value)
	if err != nil {
		return workspace.Workspace{}, err
	}
	if err := tx.Commit(); err != nil {
		return workspace.Workspace{}, err
	}
	return value, nil
}

func (s *Store) Update(ctx context.Context, id string, u workspace.Update) (workspace.Workspace, error) {
	references, _ := json.Marshal(u.References)
	now := time.Now().UTC().Format(time.RFC3339Nano)

	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return workspace.Workspace{}, err
	}
	defer tx.Rollback()

	result, err := tx.ExecContext(ctx, `UPDATE projects SET title=?,references_state=?,split_ratio=?,updated_at=?,version=version+1 WHERE id=? AND version=?`,
		u.Title, string(references), u.SplitRatio, now, id, u.Version)
	if err != nil {
		return workspace.Workspace{}, err
	}
	affected, err := result.RowsAffected()
	if err != nil {
		return workspace.Workspace{}, err
	}
	if affected == 0 {
		var exists int
		if err := tx.QueryRowContext(ctx, `SELECT COUNT(*) FROM projects WHERE id=?`, id).Scan(&exists); err != nil {
			return workspace.Workspace{}, err
		}
		if exists == 0 {
			return workspace.Workspace{}, workspace.ErrNotFound
		}
		return workspace.Workspace{}, workspace.ErrConflict
	}
	if err := reconcileGranularStateTx(ctx, tx, id, u.Notes, u.Canvas, now); err != nil {
		return workspace.Workspace{}, err
	}
	p, err := readProject(tx.QueryRowContext(ctx, `SELECT `+columns+` FROM projects WHERE id=?`, id))
	if err != nil {
		return workspace.Workspace{}, err
	}
	p, err = hydrateGranularProject(ctx, tx, p)
	if err != nil {
		return workspace.Workspace{}, err
	}
	if err := tx.Commit(); err != nil {
		return workspace.Workspace{}, err
	}
	return p, nil
}
