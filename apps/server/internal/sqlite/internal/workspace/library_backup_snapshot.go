package workspacequery

import (
	"context"

	"github.com/howlil/notespace/apps/server/internal/sqlite/internal/dbtx"
	workspacepkg "github.com/howlil/notespace/apps/server/internal/workspace"
)

func CategoriesTx(ctx context.Context, tx dbtx.DBTX) ([]workspacepkg.CategorySummary, error) {
	rows, err := tx.QueryContext(ctx, `SELECT c.id,c.title,c.created_at,c.updated_at,COUNT(p.id) FROM categories c LEFT JOIN projects p ON p.category_id=c.id GROUP BY c.id ORDER BY c.updated_at DESC,c.id`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	items := []workspacepkg.CategorySummary{}
	for rows.Next() {
		var category workspacepkg.CategorySummary
		if err := rows.Scan(&category.ID, &category.Title, &category.CreatedAt, &category.UpdatedAt, &category.WorkspaceCount); err != nil {
			return nil, err
		}
		items = append(items, category)
	}
	return items, rows.Err()
}
