package persistence

import (
	"context"
	"database/sql"
	"errors"
	"strings"
	"time"

	"github.com/howlil/notespace/apps/server/internal/asset"
)

func (s *Store) PutAsset(ctx context.Context, value asset.Stored) (asset.Stored, error) {
	if strings.TrimSpace(value.WorkspaceID) == "" || strings.TrimSpace(value.ID) == "" || strings.TrimSpace(value.MimeType) == "" || len(value.Data) == 0 {
		return asset.Stored{}, asset.ErrInvalid
	}
	if value.CreatedAt == "" {
		value.CreatedAt = time.Now().UTC().Format(time.RFC3339Nano)
	}
	_, err := s.db.ExecContext(ctx, `INSERT INTO workspace_assets(workspace_id,id,mime_type,data,created_at) VALUES (?,?,?,?,?)
ON CONFLICT(workspace_id,id) DO UPDATE SET mime_type=excluded.mime_type,data=excluded.data`, value.WorkspaceID, value.ID, value.MimeType, value.Data, value.CreatedAt)
	if err != nil {
		return asset.Stored{}, err
	}
	return s.GetAsset(ctx, value.WorkspaceID, value.ID)
}

func (s *Store) GetAsset(ctx context.Context, workspaceID, id string) (asset.Stored, error) {
	var value asset.Stored
	err := s.db.QueryRowContext(ctx, `SELECT id,workspace_id,mime_type,data,created_at FROM workspace_assets WHERE workspace_id=? AND id=?`, workspaceID, id).Scan(&value.ID, &value.WorkspaceID, &value.MimeType, &value.Data, &value.CreatedAt)
	if errors.Is(err, sql.ErrNoRows) {
		return value, asset.ErrNotFound
	}
	return value, err
}

func (s *Store) ListAssets(ctx context.Context, workspaceID string) ([]asset.Stored, error) {
	rows, err := s.db.QueryContext(ctx, `SELECT id,workspace_id,mime_type,data,created_at FROM workspace_assets WHERE workspace_id=? ORDER BY created_at,id`, workspaceID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	values := []asset.Stored{}
	for rows.Next() {
		var value asset.Stored
		if err := rows.Scan(&value.ID, &value.WorkspaceID, &value.MimeType, &value.Data, &value.CreatedAt); err != nil {
			return nil, err
		}
		values = append(values, value)
	}
	return values, rows.Err()
}

func (s *Store) DeleteAsset(ctx context.Context, workspaceID, id string) error {
	result, err := s.db.ExecContext(ctx, `DELETE FROM workspace_assets WHERE workspace_id=? AND id=?`, workspaceID, id)
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
