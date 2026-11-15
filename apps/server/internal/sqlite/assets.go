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
	value, err = assetsquery.PutAssetTx(ctx, tx, value)
	if err != nil {
		return asset.Stored{}, err
	}
	if err := tx.Commit(); err != nil {
		return asset.Stored{}, err
	}
	return value, nil
}

func (s *Store) GetAsset(ctx context.Context, workspaceID, id string) (asset.Stored, error) {
	return assetsquery.GetAsset(ctx, s.db, workspaceID, id)
}
