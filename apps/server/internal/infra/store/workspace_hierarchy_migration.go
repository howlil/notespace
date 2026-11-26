package store

import (
	"context"
	"database/sql"
	"fmt"

	"github.com/howlil/notespace/apps/server/internal/domain"
	"github.com/howlil/notespace/apps/server/internal/domain/archive"
)

// verifyAndUpgradeWorkspaceHierarchyTx runs inside the 0035 migration
// transaction. It verifies that every Workspace has a Canvas, no cycles exist
// in projects.parent_id, and rewrites workspace_trash payloads to carry parentId.
func verifyAndUpgradeWorkspaceHierarchyTx(ctx context.Context, tx *sql.Tx) error {
	var missingCanvas int
	if err := tx.QueryRowContext(ctx, `
		SELECT COUNT(*) FROM projects p
		WHERE NOT EXISTS (SELECT 1 FROM workspace_canvas c WHERE c.workspace_id = p.id)
	`).Scan(&missingCanvas); err != nil {
		return err
	}
	if missingCanvas > 0 {
		return fmt.Errorf("workspace hierarchy verification failed: %d workspaces missing canvas", missingCanvas)
	}

	rows, err := tx.QueryContext(ctx, `SELECT id, parent_id FROM projects`)
	if err != nil {
		return err
	}
	parentByID := map[string]*string{}
	for rows.Next() {
		var id string
		var parent sql.NullString
		if err := rows.Scan(&id, &parent); err != nil {
			_ = rows.Close()
			return err
		}
		if parent.Valid {
			if parent.String == id {
				_ = rows.Close()
				return fmt.Errorf("workspace %s cannot be its own parent", id)
			}
			val := parent.String
			parentByID[id] = &val
		} else {
			parentByID[id] = nil
		}
	}
	if err := rows.Err(); err != nil {
		_ = rows.Close()
		return err
	}
	if err := rows.Close(); err != nil {
		return err
	}

	for id, parent := range parentByID {
		seen := map[string]bool{id: true}
		cur := parent
		for cur != nil {
			if seen[*cur] {
				return fmt.Errorf("workspace hierarchy cycle detected at %s", *cur)
			}
			seen[*cur] = true
			next, ok := parentByID[*cur]
			if !ok {
				return fmt.Errorf("workspace %s references missing parent %s", id, *cur)
			}
			cur = next
		}
	}

	type trashRow struct {
		id       string
		parentID *string
		payload  []byte
	}
	trashRows, err := tx.QueryContext(ctx, `SELECT id, parent_id, payload FROM workspace_trash ORDER BY id`)
	if err != nil {
		return err
	}
	var items []trashRow
	for trashRows.Next() {
		var item trashRow
		var parent sql.NullString
		if err := trashRows.Scan(&item.id, &parent, &item.payload); err != nil {
			_ = trashRows.Close()
			return err
		}
		if parent.Valid {
			val := parent.String
			item.parentID = &val
		}
		items = append(items, item)
	}
	if err := trashRows.Err(); err != nil {
		_ = trashRows.Close()
		return err
	}
	if err := trashRows.Close(); err != nil {
		return err
	}

	for _, item := range items {
		var envelope domain.WorkspaceEnvelope
		if err := archive.DecodeTrashEnvelope(item.payload, &envelope); err != nil {
			return fmt.Errorf("decode trash payload %s: %w", item.id, err)
		}
		envelope.Project.ParentID = item.parentID
		encoded, err := archive.EncodeTrashEnvelope(envelope)
		if err != nil {
			return fmt.Errorf("encode trash payload %s: %w", item.id, err)
		}
		if _, err := tx.ExecContext(ctx, `UPDATE workspace_trash SET payload=? WHERE id=?`, encoded, item.id); err != nil {
			return err
		}
	}
	return nil
}
