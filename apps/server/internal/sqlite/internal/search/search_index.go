package searchquery

import (
	"context"
	"strings"
	"unicode"

	"github.com/howlil/notespace/apps/server/internal/sqlite/internal/dbtx"
)

type StaleSearchWorkspace struct {
	ID         string
	CategoryID string
	Title      string
	Version    int
}

// AdvanceCanvasRevisionTx does not index Canvas content. Existing title/category
// mismatches still trigger the normal lazy repair of the derived projection.
func AdvanceCanvasRevisionTx(ctx context.Context, tx dbtx.DBTX, workspaceID string) error {
	_, err := tx.ExecContext(ctx, `UPDATE workspace_search_meta
SET version=(SELECT version FROM projects WHERE id=?)
WHERE workspace_id=?`, workspaceID, workspaceID)
	return err
}

func ReplaceWorkspaceTx(ctx context.Context, tx dbtx.DBTX, value StaleSearchWorkspace) error {
	if _, err := tx.ExecContext(ctx, `DELETE FROM workspace_search WHERE workspace_id=?`, value.ID); err != nil {
		return err
	}
	if _, err := tx.ExecContext(ctx, `INSERT INTO workspace_search(type,category_id,workspace_id,workspace_title,note_id,note_title,block_id,title,content) VALUES ('workspace',?,?,?,?,?,?,?,?)`, value.CategoryID, value.ID, value.Title, "", "", "", value.Title, ""); err != nil {
		return err
	}
	_, err := tx.ExecContext(ctx, `INSERT INTO workspace_search_meta(workspace_id,version,category_id,title) VALUES (?,?,?,?)
ON CONFLICT(workspace_id) DO UPDATE SET version=excluded.version,category_id=excluded.category_id,title=excluded.title`, value.ID, value.Version, value.CategoryID, value.Title)
	return err
}

// SyncIndexTx borrows one transaction so authored revisions and the projection
// cannot be observed or advanced from different snapshots.
func SyncIndexTx(ctx context.Context, tx dbtx.DBTX) error {
	rows, err := tx.QueryContext(ctx, `SELECT p.id,p.category_id,p.title,p.version
FROM projects p LEFT JOIN workspace_search_meta m ON m.workspace_id=p.id
WHERE m.workspace_id IS NULL OR m.version<>p.version OR m.category_id<>p.category_id OR m.title<>p.title`)
	if err != nil {
		return err
	}
	stale := []StaleSearchWorkspace{}
	for rows.Next() {
		var value StaleSearchWorkspace
		if err := rows.Scan(&value.ID, &value.CategoryID, &value.Title, &value.Version); err != nil {
			rows.Close()
			return err
		}
		stale = append(stale, value)
	}
	if err := rows.Err(); err != nil {
		rows.Close()
		return err
	}
	rows.Close()
	if _, err := tx.ExecContext(ctx, `DELETE FROM workspace_search WHERE workspace_id NOT IN (SELECT id FROM projects)`); err != nil {
		return err
	}
	if _, err := tx.ExecContext(ctx, `DELETE FROM workspace_search_meta WHERE workspace_id NOT IN (SELECT id FROM projects)`); err != nil {
		return err
	}
	for _, value := range stale {
		if err := ReplaceWorkspaceTx(ctx, tx, value); err != nil {
			return err
		}
	}
	return nil
}

func SafeFTSQuery(query string) string {
	// Keep user input out of FTS5 query syntax. unicode61 applies its own
	// tokenization to indexed content, so searching Unicode letter/digit terms
	// as quoted prefixes preserves normal search while punctuation stays inert.
	terms := strings.FieldsFunc(strings.TrimSpace(query), func(r rune) bool {
		return r != '_' && !unicode.IsLetter(r) && !unicode.IsDigit(r)
	})
	parts := make([]string, 0, len(terms))
	for _, term := range terms {
		if term != "" {
			parts = append(parts, `"`+term+`"*`)
		}
	}
	return strings.Join(parts, " AND ")
}
