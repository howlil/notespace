package assetsquery

import (
	"context"
	"database/sql"
	"errors"

	"github.com/howlil/notespace/apps/server/internal/asset"
	"github.com/howlil/notespace/apps/server/internal/sqlite/internal/dbtx"
)

func GetAsset(db dbtx.DBTX, ctx context.Context, workspaceID, id string) (asset.Stored, error) {
	var value asset.Stored
	err := db.QueryRowContext(ctx, `SELECT id,workspace_id,mime_type,data,created_at FROM workspace_assets WHERE workspace_id=? AND id=?`, workspaceID, id).Scan(&value.ID, &value.WorkspaceID, &value.MimeType, &value.Data, &value.CreatedAt)
	if errors.Is(err, sql.ErrNoRows) {
		return value, asset.ErrNotFound
	}
	return value, err
}
func DeleteAsset(db dbtx.DBTX, ctx context.Context, workspaceID, id string) error {
	result, err := db.ExecContext(ctx, `DELETE FROM workspace_assets WHERE workspace_id=? AND id=?`, workspaceID, id)
	if err != nil {
		return err
	}
	count, err := result.RowsAffected()
	if err != nil {
		return err
	}
	if count == 0 {
		return asset.ErrNotFound
	}
	return nil
}
