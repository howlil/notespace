package sqlite

import (
	"context"
	"time"

	"github.com/howlil/notespace/apps/server/internal/asset"
	assetsquery "github.com/howlil/notespace/apps/server/internal/sqlite/internal/assets"
)

func (s *Store) PutAsset(ctx context.Context, value asset.Stored) (asset.Stored, error) {
	normalized, err := asset.NormalizeStored(value)
	if err != nil {
		return asset.Stored{}, err
	}
	value = normalized
	if value.CreatedAt == "" {
		value.CreatedAt = time.Now().UTC().Format(time.RFC3339Nano)
	}
	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return asset.Stored{}, err
	}
	defer tx.Rollback()
	var referenced, tombstoned int
	if err := tx.QueryRowContext(ctx, `SELECT
EXISTS(SELECT 1 FROM workspace_asset_references WHERE workspace_id=? AND asset_id=?),
EXISTS(SELECT 1 FROM workspace_asset_tombstones WHERE workspace_id=? AND id=?)`,
		value.WorkspaceID, value.ID, value.WorkspaceID, value.ID).Scan(&referenced, &tombstoned); err != nil {
		return asset.Stored{}, err
	}
	if tombstoned != 0 {
		// Asset IDs are immutable. Once an authored delete commits, the same ID
		// cannot be resurrected by a delayed upload, local cache, or old history.
		return asset.Stored{}, asset.ErrNotFound
	}
	staged := 1
	if referenced != 0 {
		staged = 0
	}
	err = tx.QueryRowContext(ctx, `INSERT INTO workspace_assets(workspace_id,id,mime_type,data,created_at,staged)
VALUES (?,?,?,?,?,?)
ON CONFLICT(workspace_id,id) DO UPDATE SET
  mime_type=excluded.mime_type,
  data=excluded.data,
  staged=excluded.staged
RETURNING created_at`,
		value.WorkspaceID, value.ID, value.MimeType, value.Data, value.CreatedAt, staged).Scan(&value.CreatedAt)
	if err != nil {
		return asset.Stored{}, err
	}
	if err := tx.Commit(); err != nil {
		return asset.Stored{}, err
	}
	return value, nil
}

func (s *Store) GetAsset(ctx context.Context, workspaceID, id string) (asset.Stored, error) {
	return assetsquery.GetAsset(s.db, ctx, workspaceID, id)
}

func (s *Store) DeleteAsset(ctx context.Context, workspaceID, id string) error {
	return assetsquery.DeleteAsset(s.db, ctx, workspaceID, id)
}
