package workspacequery

import (
	"context"
	"database/sql"
	"errors"
	"time"

	"github.com/howlil/notespace/apps/server/internal/sqlite/internal/dbtx"
	workspacepkg "github.com/howlil/notespace/apps/server/internal/workspace"
)

func CreateCategory(db dbtx.DBTX, ctx context.Context, category workspacepkg.CategorySummary) error {
	_, err := db.ExecContext(
		ctx,
		`INSERT INTO categories(id,title,created_at,updated_at) VALUES (?,?,?,?)`,
		category.ID,
		category.Title,
		category.CreatedAt,
		category.UpdatedAt,
	)
	return err
}
func UpdateCategory(db dbtx.DBTX, ctx context.Context, id, title string) (workspacepkg.CategorySummary, error) {
	var category workspacepkg.CategorySummary
	err := db.QueryRowContext(ctx, `UPDATE categories SET title=?,updated_at=? WHERE id=? RETURNING id,title,created_at,updated_at`, title, time.Now().UTC().Format(time.RFC3339Nano), id).Scan(&category.ID, &category.Title, &category.CreatedAt, &category.UpdatedAt)
	if errors.Is(err, sql.ErrNoRows) {
		return category, workspacepkg.ErrNotFound
	}
	if err != nil {
		return category, err
	}
	return category, nil
}
func ListCategories(db dbtx.DBTX, ctx context.Context) ([]workspacepkg.CategorySummary, error) {
	rows, err := db.QueryContext(ctx, `SELECT c.id,c.title,c.created_at,c.updated_at,COUNT(p.id) FROM categories c LEFT JOIN projects p ON p.category_id=c.id GROUP BY c.id ORDER BY c.updated_at DESC,c.id`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []workspacepkg.CategorySummary{}
	for rows.Next() {
		var category workspacepkg.CategorySummary
		if err := rows.Scan(&category.ID, &category.Title, &category.CreatedAt, &category.UpdatedAt, &category.WorkspaceCount); err != nil {
			return nil, err
		}
		out = append(out, category)
	}
	return out, rows.Err()
}
func CategoryExists(db dbtx.DBTX, ctx context.Context, id string) (bool, error) {
	var count int
	err := db.QueryRowContext(ctx, `SELECT COUNT(*) FROM categories WHERE id=?`, id).Scan(&count)
	return count > 0, err
}
