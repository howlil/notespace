package sqlite

import (
	"context"
	"database/sql"
	"errors"
	"time"

	"github.com/howlil/notespace/apps/server/internal/workspace"
)

func (s *Store) CreateCategory(ctx context.Context, category workspace.CategorySummary) error {
	_, err := s.db.ExecContext(
		ctx,
		`INSERT INTO categories(id,title,created_at,updated_at) VALUES (?,?,?,?)`,
		category.ID,
		category.Title,
		category.CreatedAt,
		category.UpdatedAt,
	)
	return err
}

func (s *Store) UpdateCategory(ctx context.Context, id, title string) (workspace.CategorySummary, error) {
	var category workspace.CategorySummary
	err := s.db.QueryRowContext(ctx, `UPDATE categories SET title=?,updated_at=? WHERE id=? RETURNING id,title,created_at,updated_at`, title, time.Now().UTC().Format(time.RFC3339Nano), id).Scan(&category.ID, &category.Title, &category.CreatedAt, &category.UpdatedAt)
	if errors.Is(err, sql.ErrNoRows) {
		return category, workspace.ErrNotFound
	}
	if err != nil {
		return category, err
	}
	return category, nil
}

func (s *Store) DeleteCategory(ctx context.Context, id string) error {
	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	defer tx.Rollback()
	var exists int
	if err := tx.QueryRowContext(ctx, `SELECT COUNT(*) FROM categories WHERE id=?`, id).Scan(&exists); err != nil {
		return err
	}
	if exists == 0 {
		return workspace.ErrNotFound
	}
	var workspaces int
	if err := tx.QueryRowContext(ctx, `SELECT COUNT(*) FROM projects WHERE category_id=?`, id).Scan(&workspaces); err != nil {
		return err
	}
	if workspaces > 0 {
		return workspace.ErrNotEmpty
	}
	if _, err := tx.ExecContext(ctx, `DELETE FROM categories WHERE id=?`, id); err != nil {
		return err
	}
	return tx.Commit()
}

func (s *Store) ListCategories(ctx context.Context) ([]workspace.CategorySummary, error) {
	rows, err := s.db.QueryContext(ctx, `SELECT c.id,c.title,c.created_at,c.updated_at,COUNT(p.id) FROM categories c LEFT JOIN projects p ON p.category_id=c.id GROUP BY c.id ORDER BY c.updated_at DESC,c.id`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []workspace.CategorySummary{}
	for rows.Next() {
		var category workspace.CategorySummary
		if err := rows.Scan(&category.ID, &category.Title, &category.CreatedAt, &category.UpdatedAt, &category.WorkspaceCount); err != nil {
			return nil, err
		}
		out = append(out, category)
	}
	return out, rows.Err()
}

func (s *Store) CategoryExists(ctx context.Context, id string) (bool, error) {
	var count int
	err := s.db.QueryRowContext(ctx, `SELECT COUNT(*) FROM categories WHERE id=?`, id).Scan(&count)
	return count > 0, err
}
