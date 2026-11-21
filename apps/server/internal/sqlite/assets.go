package sqlite

import (
	"context"
	"errors"
	"time"

	"github.com/howlil/notespace/apps/server/internal/asset"
	assetsquery "github.com/howlil/notespace/apps/server/internal/sqlite/internal/assets"
	backupquery "github.com/howlil/notespace/apps/server/internal/sqlite/internal/backup"
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
	stored, err := assetsquery.GetAsset(ctx, s.db, workspaceID, id)
	if !errors.Is(err, asset.ErrNotFound) {
		return stored, err
	}
	referenced, refErr := assetsquery.NoteReferencesAsset(ctx, s.db, id)
	if refErr != nil || !referenced {
		return asset.Stored{}, asset.ErrNotFound
	}
	if rehomed, findErr := assetsquery.GetAssetByID(ctx, s.db, id); findErr == nil {
		rehomed.WorkspaceID = workspaceID
		return rehomed, nil
	}
	if trashed, trashErr := backupquery.ReadTrashTx(ctx, s.db, workspaceID); trashErr == nil {
		for _, candidate := range trashed.Payload.Assets {
			if candidate.ID == id {
				return candidate, nil
			}
		}
	}
	return asset.Stored{}, asset.ErrNotFound
}
