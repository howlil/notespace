package sqlite

import (
	"context"

	"github.com/howlil/notespace/apps/server/internal/library"
	workspacepkg "github.com/howlil/notespace/apps/server/internal/workspace"
)

func (s *Store) ListTrash(ctx context.Context) ([]library.TrashItem, error) {
	rows, err := s.db.QueryContext(ctx, `SELECT id,category_id,title,deleted_at FROM workspace_trash ORDER BY deleted_at DESC,id`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	items := []library.TrashItem{}
	for rows.Next() {
		var item library.TrashItem
		if err := rows.Scan(&item.ID, &item.CategoryID, &item.Title, &item.DeletedAt); err != nil {
			return nil, err
		}
		items = append(items, item)
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}
	return items, nil
}

func (s *Store) DeleteTrashedWorkspace(ctx context.Context, id string) error {
	result, err := s.db.ExecContext(ctx, `DELETE FROM workspace_trash WHERE id=?`, id)
	if err != nil {
		return err
	}
	count, err := result.RowsAffected()
	if err != nil {
		return err
	}
	if count == 0 {
		return workspacepkg.ErrNotFound
	}
	return nil
}
