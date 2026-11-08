package workspacequery

import (
	"context"

	"github.com/howlil/notespace/apps/server/internal/sqlite/internal/dbtx"
	workspacepkg "github.com/howlil/notespace/apps/server/internal/workspace"
)

func List(db dbtx.DBTX, ctx context.Context) ([]workspacepkg.Summary, error) {
	rows, err := db.QueryContext(ctx, `SELECT p.id,p.category_id,p.title,p.created_at,p.updated_at,p.version,
(EXISTS(SELECT 1 FROM workspace_canvas c WHERE c.workspace_id=p.id AND c.element_count>0))
FROM projects p ORDER BY p.updated_at DESC,p.id`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []workspacepkg.Summary{}
	for rows.Next() {
		var p workspacepkg.Summary
		if err := rows.Scan(
			&p.ID, &p.CategoryID, &p.Title, &p.CreatedAt, &p.UpdatedAt, &p.Version, &p.HasCanvas,
		); err != nil {
			return nil, err
		}
		out = append(out, p)
	}
	return out, rows.Err()
}
func ListRecent(db dbtx.DBTX, ctx context.Context, limit int) ([]workspacepkg.Summary, error) {
	if limit < 1 || limit > 100 {
		limit = 12
	}
	rows, err := db.QueryContext(ctx, `SELECT p.id,p.category_id,p.title,p.created_at,p.updated_at,p.version,
(EXISTS(SELECT 1 FROM workspace_canvas c WHERE c.workspace_id=p.id AND c.element_count>0))
FROM projects p ORDER BY p.updated_at DESC,p.id LIMIT ?`, limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []workspacepkg.Summary{}
	for rows.Next() {
		var p workspacepkg.Summary
		if err := rows.Scan(&p.ID, &p.CategoryID, &p.Title, &p.CreatedAt, &p.UpdatedAt, &p.Version, &p.HasCanvas); err != nil {
			return nil, err
		}
		out = append(out, p)
	}
	return out, rows.Err()
}
func GetWorkspaceRecord(db dbtx.DBTX, ctx context.Context, id string) (workspacepkg.Workspace, error) {
	return ReadProject(db.QueryRowContext(ctx, `SELECT `+Columns+` FROM projects WHERE id=?`, id))
}
func WorkspaceExists(db dbtx.DBTX, ctx context.Context, id string) (bool, error) {
	var exists int
	if err := db.QueryRowContext(ctx, `SELECT EXISTS(SELECT 1 FROM projects WHERE id=?)`, id).Scan(&exists); err != nil {
		return false, err
	}
	return exists != 0, nil
}
