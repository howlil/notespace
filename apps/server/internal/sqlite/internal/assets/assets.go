package assetsquery

import (
	"context"
	"database/sql"
	"errors"
	"strings"

	"github.com/howlil/notespace/apps/server/internal/asset"
	"github.com/howlil/notespace/apps/server/internal/sqlite/internal/dbtx"
)

func GetAsset(ctx context.Context, db dbtx.DBTX, workspaceID, id string) (asset.Stored, error) {
	var value asset.Stored
	err := db.QueryRowContext(ctx, `SELECT id,workspace_id,mime_type,data,created_at FROM workspace_assets WHERE workspace_id=? AND id=?`, workspaceID, id).Scan(&value.ID, &value.WorkspaceID, &value.MimeType, &value.Data, &value.CreatedAt)
	if errors.Is(err, sql.ErrNoRows) {
		return value, asset.ErrNotFound
	}
	return value, err
}

func NoteReferencesAsset(ctx context.Context, db dbtx.DBTX, assetID string) (bool, error) {
	var referenced int
	err := db.QueryRowContext(ctx, `SELECT EXISTS(
		SELECT 1 FROM canvas_notes n, json_tree(n.document_state) j
		WHERE j.type='text' AND j.key IN ('assetId','fileId') AND CAST(j.value AS TEXT)=?
	)`, assetID).Scan(&referenced)
	return referenced != 0, err
}

func GetAssetByID(ctx context.Context, db dbtx.DBTX, id string) (asset.Stored, error) {
	var value asset.Stored
	err := db.QueryRowContext(ctx, `SELECT id,workspace_id,mime_type,data,created_at FROM workspace_assets WHERE id=? ORDER BY staged ASC, created_at ASC LIMIT 1`, id).Scan(&value.ID, &value.WorkspaceID, &value.MimeType, &value.Data, &value.CreatedAt)
	if errors.Is(err, sql.ErrNoRows) {
		return value, asset.ErrNotFound
	}
	return value, err
}

func RehomeNoteAssetsFromTrashTx(ctx context.Context, tx dbtx.DBTX, assets []asset.Stored) error {
	for _, stored := range assets {
		referenced, err := NoteReferencesAsset(ctx, tx, stored.ID)
		if err != nil {
			return err
		}
		if !referenced {
			continue
		}
		var targetWorkspaceID string
		err = tx.QueryRowContext(ctx, `
			SELECT COALESCE(
				(SELECT i.workspace_id
				 FROM canvas_notes n
				 JOIN canvas_note_instances i ON i.note_id = n.id
				 JOIN projects p ON p.id = i.workspace_id
				 JOIN json_tree(n.document_state) j
				 WHERE j.type='text' AND j.key IN ('assetId','fileId') AND CAST(j.value AS TEXT)=?
				 ORDER BY i.created_at ASC LIMIT 1),
				(SELECT id FROM projects ORDER BY created_at ASC, id ASC LIMIT 1),
				''
			)
		`, stored.ID).Scan(&targetWorkspaceID)
		if err != nil {
			return err
		}
		if targetWorkspaceID == "" {
			continue
		}
		if _, err := tx.ExecContext(ctx, `
			INSERT INTO workspace_assets(workspace_id,id,mime_type,data,created_at,staged)
			VALUES (?,?,?,?,?,0)
			ON CONFLICT(workspace_id,id) DO UPDATE SET staged=0
		`, targetWorkspaceID, stored.ID, stored.MimeType, stored.Data, stored.CreatedAt); err != nil {
			return err
		}
	}
	return nil
}

func PutAssetTx(ctx context.Context, tx dbtx.DBTX, value asset.Stored) (asset.Stored, error) {
	var referenced, tombstoned int
	if err := tx.QueryRowContext(ctx, `SELECT
EXISTS(SELECT 1 FROM workspace_asset_references WHERE workspace_id=? AND asset_id=?),
EXISTS(SELECT 1 FROM workspace_asset_tombstones WHERE workspace_id=? AND id=?)`,
		value.WorkspaceID, value.ID, value.WorkspaceID, value.ID).Scan(&referenced, &tombstoned); err != nil {
		return asset.Stored{}, err
	}
	if tombstoned != 0 {
		if strings.HasPrefix(value.ID, "eraser-icon-") {
			if _, err := tx.ExecContext(ctx, `DELETE FROM workspace_asset_tombstones WHERE workspace_id=? AND id=?`, value.WorkspaceID, value.ID); err != nil {
				return asset.Stored{}, err
			}
		} else {
			// User-uploaded asset IDs are immutable. Once an authored delete commits,
			// the same ID cannot be resurrected by a delayed upload, local cache, or old history.
			return asset.Stored{}, asset.ErrNotFound
		}
	}
	staged := 1
	if referenced != 0 {
		staged = 0
	}
	err := tx.QueryRowContext(ctx, `INSERT INTO workspace_assets(workspace_id,id,mime_type,data,created_at,staged)
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
	return value, nil
}

func Snapshot(ctx context.Context, tx dbtx.DBTX, id string) ([]asset.Stored, error) {
	assetRows, err := tx.QueryContext(ctx, `SELECT id,workspace_id,mime_type,data,created_at FROM workspace_assets WHERE workspace_id=? ORDER BY created_at,id`, id)
	if err != nil {
		return nil, err
	}
	defer assetRows.Close()
	assets := []asset.Stored{}
	for assetRows.Next() {
		var value asset.Stored
		if err := assetRows.Scan(&value.ID, &value.WorkspaceID, &value.MimeType, &value.Data, &value.CreatedAt); err != nil {
			return nil, err
		}
		assets = append(assets, value)
	}
	return assets, assetRows.Err()
}

func Restore(ctx context.Context, tx dbtx.DBTX, workspaceID string, values []asset.Stored) error {
	for _, stored := range values {
		if _, err := tx.ExecContext(ctx,
			`INSERT INTO workspace_assets(workspace_id,id,mime_type,data,created_at) VALUES (?,?,?,?,?)`,
			workspaceID, stored.ID, stored.MimeType, stored.Data, stored.CreatedAt,
		); err != nil {
			return err
		}
	}
	if _, err := tx.ExecContext(ctx, `UPDATE workspace_assets SET staged=0 WHERE workspace_id=? AND EXISTS (SELECT 1 FROM workspace_asset_references r WHERE r.workspace_id=? AND r.asset_id=workspace_assets.id)`, workspaceID, workspaceID); err != nil {
		return err
	}
	return nil
}

func DeleteAllTx(ctx context.Context, tx dbtx.DBTX) error {
	for _, statement := range []string{
		`DELETE FROM workspace_asset_tombstones`,
		`DELETE FROM workspace_assets`,
	} {
		if _, err := tx.ExecContext(ctx, statement); err != nil {
			return err
		}
	}
	return nil
}
