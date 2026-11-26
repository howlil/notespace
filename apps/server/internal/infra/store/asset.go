package store

import (
	"context"
	"database/sql"
	"errors"
	"strings"

	"github.com/howlil/notespace/apps/server/internal/domain"
	"github.com/howlil/notespace/apps/server/internal/infra/sqlite"
)

// PutAsset atomically verifies workspace existence, tombstone state, and
// asset persistence inside a single write transaction (eliminating TOCTOU).
func (s *Store) PutAsset(ctx context.Context, value domain.StoredAsset) (domain.StoredAsset, error) {
	normalized, err := domain.NormalizeStoredAsset(value)
	if err != nil {
		return domain.StoredAsset{}, err
	}
	value = normalized
	if value.CreatedAt == "" {
		value.CreatedAt = sqlite.NowUTC()
	}
	err = s.db.WithTx(ctx, func(tx *sql.Tx) error {
		var wsExists, referenced, tombstoned int
		if err := tx.QueryRowContext(ctx, `SELECT
EXISTS(SELECT 1 FROM projects WHERE id=?),
EXISTS(SELECT 1 FROM workspace_asset_references WHERE workspace_id=? AND asset_id=?),
EXISTS(SELECT 1 FROM workspace_asset_tombstones WHERE workspace_id=? AND id=?)`,
			value.WorkspaceID, value.WorkspaceID, value.ID, value.WorkspaceID, value.ID,
		).Scan(&wsExists, &referenced, &tombstoned); err != nil {
			return err
		}
		if wsExists == 0 {
			return domain.ErrWorkspaceNotFound
		}
		if tombstoned != 0 {
			if strings.HasPrefix(value.ID, domain.ReusableIconAssetPrefix) {
				if _, err := tx.ExecContext(ctx, `DELETE FROM workspace_asset_tombstones WHERE workspace_id=? AND id=?`, value.WorkspaceID, value.ID); err != nil {
					return err
				}
			} else {
				return domain.ErrAssetNotFound
			}
		}
		staged := 1
		if referenced != 0 {
			staged = 0
		}
		return tx.QueryRowContext(ctx, `INSERT INTO workspace_assets(workspace_id,id,mime_type,data,created_at,staged)
VALUES (?,?,?,?,?,?)
ON CONFLICT(workspace_id,id) DO UPDATE SET
  mime_type=excluded.mime_type,
  data=excluded.data,
  staged=excluded.staged
RETURNING created_at`,
			value.WorkspaceID, value.ID, value.MimeType, value.Data, value.CreatedAt, staged,
		).Scan(&value.CreatedAt)
	})
	if err != nil {
		return domain.StoredAsset{}, err
	}
	return value, nil
}

// GetAsset executes primary lookup and canonical Note asset survival fallback
// inside one consistent WAL read transaction.
func (s *Store) GetAsset(ctx context.Context, workspaceID, id string) (domain.StoredAsset, error) {
	workspaceID = strings.TrimSpace(workspaceID)
	id = strings.TrimSpace(id)
	if workspaceID == "" || id == "" {
		return domain.StoredAsset{}, domain.ErrAssetInvalid
	}
	var out domain.StoredAsset
	err := s.db.WithReadTx(ctx, func(tx *sql.Tx) error {
		stored, err := getAssetTx(ctx, tx, workspaceID, id)
		if !errors.Is(err, domain.ErrAssetNotFound) {
			out = stored
			return err
		}
		referenced, refErr := noteReferencesAssetTx(ctx, tx, id)
		if refErr != nil || !referenced {
			return domain.ErrAssetNotFound
		}
		if rehomed, findErr := getAssetByIDTx(ctx, tx, id); findErr == nil {
			rehomed.WorkspaceID = workspaceID
			out = rehomed
			return nil
		}
		if trashed, trashErr := readTrashTx(ctx, tx, workspaceID); trashErr == nil {
			for _, candidate := range trashed.Payload.Assets {
				if candidate.ID == id {
					out = candidate
					return nil
				}
			}
		}
		return domain.ErrAssetNotFound
	})
	return out, err
}

func getAssetTx(ctx context.Context, db sqlite.DBTX, workspaceID, id string) (domain.StoredAsset, error) {
	var value domain.StoredAsset
	err := db.QueryRowContext(ctx, `SELECT id,workspace_id,mime_type,data,created_at FROM workspace_assets WHERE workspace_id=? AND id=?`, workspaceID, id).
		Scan(&value.ID, &value.WorkspaceID, &value.MimeType, &value.Data, &value.CreatedAt)
	if errors.Is(err, sql.ErrNoRows) {
		return value, domain.ErrAssetNotFound
	}
	return value, err
}

func getAssetByIDTx(ctx context.Context, db sqlite.DBTX, id string) (domain.StoredAsset, error) {
	var value domain.StoredAsset
	err := db.QueryRowContext(ctx, `SELECT id,workspace_id,mime_type,data,created_at FROM workspace_assets WHERE id=? ORDER BY staged ASC, created_at ASC LIMIT 1`, id).
		Scan(&value.ID, &value.WorkspaceID, &value.MimeType, &value.Data, &value.CreatedAt)
	if errors.Is(err, sql.ErrNoRows) {
		return value, domain.ErrAssetNotFound
	}
	return value, err
}

// noteAssetRef matches a Note's Markdown image destination for one asset id.
// The boundary after the id keeps "a1" from matching "a12". Arguments: id, id.
const noteAssetRef = `(instr(n.document_state, '/assets/'||?||')') > 0 OR instr(n.document_state, '/assets/'||?||' ') > 0)`

func noteReferencesAssetTx(ctx context.Context, db sqlite.DBTX, assetID string) (bool, error) {
	var referenced int
	err := db.QueryRowContext(ctx, `SELECT EXISTS(SELECT 1 FROM canvas_notes n WHERE `+noteAssetRef+`)`, assetID, assetID).Scan(&referenced)
	return referenced != 0, err
}

// rehomeNoteAssetsFromTrashTx copies assets that live Notes still reference into
// a surviving workspace when a trashed workspace is permanently deleted.
func rehomeNoteAssetsFromTrashTx(ctx context.Context, tx sqlite.DBTX, assets []domain.StoredAsset) error {
	byID := make(map[string]domain.StoredAsset, len(assets))
	for _, stored := range assets {
		if stored.ID != "" && len(stored.Data) > 0 {
			byID[stored.ID] = stored
		}
	}
	targets := make(map[string]string, len(byID))
	for assetID := range byID {
		rows, err := tx.QueryContext(ctx, `
			SELECT COALESCE(
				(SELECT i.workspace_id
				 FROM canvas_note_instances i
				 INNER JOIN projects p ON p.id = i.workspace_id
				 WHERE i.note_id = n.id
				 ORDER BY i.created_at ASC LIMIT 1),
				''
			)
			FROM canvas_notes n
			WHERE `+noteAssetRef, assetID, assetID)
		if err != nil {
			return err
		}
		referenced := false
		for rows.Next() {
			var targetWS string
			if err := rows.Scan(&targetWS); err != nil {
				_ = rows.Close()
				return err
			}
			referenced = true
			if targets[assetID] == "" {
				targets[assetID] = targetWS
			}
		}
		if err := rows.Close(); err != nil {
			return err
		}
		if err := rows.Err(); err != nil {
			return err
		}
		if !referenced {
			delete(targets, assetID)
		}
	}
	if len(targets) == 0 {
		return nil
	}

	var fallbackWorkspaceID string
	_ = tx.QueryRowContext(ctx, `SELECT id FROM projects ORDER BY created_at ASC, id ASC LIMIT 1`).Scan(&fallbackWorkspaceID)

	for assetID, targetWS := range targets {
		if targetWS == "" {
			targetWS = fallbackWorkspaceID
		}
		if targetWS == "" {
			continue
		}
		stored := byID[assetID]
		createdAt := stored.CreatedAt
		if createdAt == "" {
			createdAt = sqlite.NowUTC()
		}
		if _, err := tx.ExecContext(ctx,
			`INSERT INTO workspace_assets(workspace_id,id,mime_type,data,created_at,staged) VALUES (?,?,?,?,?,0) ON CONFLICT(workspace_id,id) DO NOTHING`,
			targetWS, stored.ID, stored.MimeType, stored.Data, createdAt,
		); err != nil {
			return err
		}
	}
	return nil
}

func restoreAssetsTx(ctx context.Context, tx sqlite.DBTX, workspaceID string, assets []domain.StoredAsset) error {
	for _, value := range assets {
		normalized, err := domain.NormalizeStoredAsset(domain.StoredAsset{
			ID:          value.ID,
			WorkspaceID: workspaceID,
			MimeType:    value.MimeType,
			Data:        value.Data,
			CreatedAt:   value.CreatedAt,
		})
		if err != nil {
			return err
		}
		if normalized.CreatedAt == "" {
			normalized.CreatedAt = sqlite.NowUTC()
		}
		if _, err := tx.ExecContext(ctx,
			`INSERT INTO workspace_assets(workspace_id,id,mime_type,data,created_at,staged) VALUES (?,?,?,?,?,0)`,
			normalized.WorkspaceID, normalized.ID, normalized.MimeType, normalized.Data, normalized.CreatedAt,
		); err != nil {
			return err
		}
	}
	return nil
}
