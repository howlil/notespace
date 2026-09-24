package sqlite

import (
	"context"
	"crypto/rand"
	"encoding/json"
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

func (s *Store) Move(ctx context.Context, id, categoryID string) (workspace.Workspace, error) {
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
	moved, err := readProject(tx.QueryRowContext(ctx, `UPDATE projects SET category_id=?,updated_at=? WHERE id=? RETURNING `+columns,
		categoryID, time.Now().UTC().Format(time.RFC3339Nano), id))
	if err != nil {
		return workspace.Workspace{}, err
	}
	moved, err = hydrateGranularProject(ctx, tx, moved)
	if err != nil {
		return workspace.Workspace{}, err
	}
	if err := tx.Commit(); err != nil {
		return workspace.Workspace{}, err
	}
	return moved, nil
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
