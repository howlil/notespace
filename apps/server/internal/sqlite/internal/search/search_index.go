package searchquery

import (
	"context"
	"encoding/json"
	"strings"
	"unicode"

	"github.com/howlil/notespace/apps/server/internal/note"
	"github.com/howlil/notespace/apps/server/internal/sqlite/internal/dbtx"
	workspacepkg "github.com/howlil/notespace/apps/server/internal/workspace"
)

type StaleSearchWorkspace struct {
	ID         string
	CategoryID string
	Title      string
	Version    int
}

func Query(ctx context.Context, db dbtx.DBTX, query string) ([]workspacepkg.SearchResult, error) {
	results := []workspacepkg.SearchResult{}
	categoryRows, err := db.QueryContext(ctx, `SELECT id,title FROM categories WHERE LOWER(title) LIKE ? ESCAPE '\' ORDER BY updated_at DESC LIMIT 20`, dbtx.ContainsLikeLiteral(query))
	if err != nil {
		return nil, err
	}
	for categoryRows.Next() {
		var id, title string
		if err := categoryRows.Scan(&id, &title); err != nil {
			categoryRows.Close()
			return nil, err
		}
		results = append(results, workspacepkg.SearchResult{Type: "category", CategoryID: id, CategoryTitle: title, Excerpt: title})
	}
	if err := categoryRows.Err(); err != nil {
		categoryRows.Close()
		return nil, err
	}
	categoryRows.Close()

	match := SafeFTSQuery(query)
	if match == "" {
		return results, nil
	}
	rows, err := db.QueryContext(ctx, `SELECT s.type,s.category_id,COALESCE(c.title,''),s.workspace_id,s.workspace_title,s.note_id,s.note_title,s.block_id,s.title,s.content
FROM workspace_search s LEFT JOIN categories c ON c.id=s.category_id
WHERE workspace_search MATCH ? ORDER BY bm25(workspace_search) LIMIT 100`, match)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	for rows.Next() {
		var kind, categoryID, categoryTitle, workspaceID, workspaceTitle, noteID, noteTitle, blockID, title, content string
		if err := rows.Scan(&kind, &categoryID, &categoryTitle, &workspaceID, &workspaceTitle, &noteID, &noteTitle, &blockID, &title, &content); err != nil {
			return nil, err
		}
		result := workspacepkg.SearchResult{Type: kind, CategoryID: categoryID, CategoryTitle: categoryTitle, WorkspaceID: workspaceID, WorkspaceTitle: workspaceTitle, NoteID: noteID, Excerpt: title}
		if kind == "note" {
			result.InstanceID = blockID
			result.Excerpt = content
		}
		results = append(results, result)
	}
	return results, rows.Err()
}

// AdvanceCanvasRevisionTx does not index Canvas content. Existing title/category
// mismatches still trigger the normal lazy repair of the derived projection.
func AdvanceCanvasRevisionTx(ctx context.Context, tx dbtx.DBTX, workspaceID string) error {
	_, err := tx.ExecContext(ctx, `UPDATE workspace_search_meta
SET version=(SELECT version FROM projects WHERE id=?)
WHERE workspace_id=?`, workspaceID, workspaceID)
	return err
}

// InvalidateNotesInWorkspaceTx clears the per-Note search markers for every Note
// placed in a workspace, so the next search reindexes their FTS rows. Called when
// a Canvas scene changes (Note instance placement/geometry) where the Note's own
// revision does not move but the derived row's workspace/instance fields do.
func InvalidateNotesInWorkspaceTx(ctx context.Context, tx dbtx.DBTX, workspaceID string) error {
	_, err := tx.ExecContext(ctx, `DELETE FROM canvas_note_search_meta
WHERE note_id IN (SELECT note_id FROM canvas_note_instances WHERE workspace_id=?)`, workspaceID)
	return err
}

func InvalidateNoteTx(ctx context.Context, tx dbtx.DBTX, noteID string) error {
	_, err := tx.ExecContext(ctx, `DELETE FROM canvas_note_search_meta WHERE note_id=?`, noteID)
	return err
}

func ReplaceWorkspaceTx(ctx context.Context, tx dbtx.DBTX, value StaleSearchWorkspace) error {
	if _, err := tx.ExecContext(ctx, `DELETE FROM workspace_search WHERE workspace_id=?`, value.ID); err != nil {
		return err
	}
	if err := InvalidateNotesInWorkspaceTx(ctx, tx, value.ID); err != nil {
		return err
	}
	if _, err := tx.ExecContext(ctx, `INSERT INTO workspace_search(type,category_id,workspace_id,workspace_title,note_id,note_title,block_id,title,content) VALUES ('workspace',?,?,?,?,?,?,?,?)`, value.CategoryID, value.ID, value.Title, "", "", "", value.Title, ""); err != nil {
		return err
	}
	_, err := tx.ExecContext(ctx, `INSERT INTO workspace_search_meta(workspace_id,version,category_id,title) VALUES (?,?,?,?)
ON CONFLICT(workspace_id) DO UPDATE SET version=excluded.version,category_id=excluded.category_id,title=excluded.title`, value.ID, value.Version, value.CategoryID, value.Title)
	return err
}

type staleNotePlacement struct {
	noteID         string
	instanceID     string
	workspaceID    string
	workspaceTitle string
	categoryID     string
	document       string
}

func syncCanvasNotesTx(ctx context.Context, tx dbtx.DBTX) error {
	rows, err := tx.QueryContext(ctx, `
SELECT n.id,COALESCE(i.id,''),COALESCE(i.workspace_id,''),COALESCE(p.title,''),COALESCE(p.category_id,''),n.document_state
FROM canvas_notes n
LEFT JOIN canvas_note_search_meta m ON m.note_id=n.id
LEFT JOIN canvas_note_instances i ON i.note_id=n.id
LEFT JOIN projects p ON p.id=i.workspace_id
WHERE m.note_id IS NULL OR m.revision<>n.revision OR m.updated_at<>n.updated_at
ORDER BY n.updated_at DESC,n.id,i.id`)
	if err != nil {
		return err
	}
	placements := []staleNotePlacement{}
	staleNoteIDs := []string{}
	seenNoteIDs := map[string]bool{}
	for rows.Next() {
		var item staleNotePlacement
		if err := rows.Scan(&item.noteID, &item.instanceID, &item.workspaceID, &item.workspaceTitle, &item.categoryID, &item.document); err != nil {
			rows.Close()
			return err
		}
		placements = append(placements, item)
		if !seenNoteIDs[item.noteID] {
			seenNoteIDs[item.noteID] = true
			staleNoteIDs = append(staleNoteIDs, item.noteID)
		}
	}
	if err := rows.Err(); err != nil {
		rows.Close()
		return err
	}
	rows.Close()

	// Drop FTS rows for deleted Notes and prior rows for stale Notes before
	// inserting updated placements, then advance the meta marker so unchanged
	// Notes are not re-scanned on the next search.
	if _, err := tx.ExecContext(ctx, `DELETE FROM workspace_search WHERE type='note' AND note_id NOT IN (SELECT id FROM canvas_notes)`); err != nil {
		return err
	}
	for _, noteID := range staleNoteIDs {
		if _, err := tx.ExecContext(ctx, `DELETE FROM workspace_search WHERE type='note' AND note_id=?`, noteID); err != nil {
			return err
		}
	}
	for _, item := range placements {
		content := note.ExtractSearchText(json.RawMessage(item.document))
		if _, err := tx.ExecContext(ctx, `INSERT INTO workspace_search(type,category_id,workspace_id,workspace_title,note_id,note_title,block_id,title,content) VALUES ('note',?,?,?,?,?,?,?,?)`, item.categoryID, item.workspaceID, item.workspaceTitle, item.noteID, "", item.instanceID, "Canvas Note", content); err != nil {
			return err
		}
	}
	if _, err := tx.ExecContext(ctx, `DELETE FROM canvas_note_search_meta WHERE note_id NOT IN (SELECT id FROM canvas_notes)`); err != nil {
		return err
	}
	_, err = tx.ExecContext(ctx, `INSERT INTO canvas_note_search_meta(note_id,revision,updated_at)
SELECT id,revision,updated_at FROM canvas_notes
WHERE id IN (
  SELECT DISTINCT n.id FROM canvas_notes n
  LEFT JOIN canvas_note_search_meta m ON m.note_id=n.id
  WHERE m.note_id IS NULL OR m.revision<>n.revision OR m.updated_at<>n.updated_at
)
ON CONFLICT(note_id) DO UPDATE SET revision=excluded.revision,updated_at=excluded.updated_at`)
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
	if _, err := tx.ExecContext(ctx, `DELETE FROM canvas_note_search_meta WHERE note_id IN (SELECT DISTINCT note_id FROM workspace_search WHERE type='note' AND workspace_id<>'' AND workspace_id NOT IN (SELECT id FROM projects))`); err != nil {
		return err
	}
	if _, err := tx.ExecContext(ctx, `DELETE FROM workspace_search WHERE workspace_id<>'' AND workspace_id NOT IN (SELECT id FROM projects)`); err != nil {
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
	return syncCanvasNotesTx(ctx, tx)
}

func DeleteAllTx(ctx context.Context, tx dbtx.DBTX) error {
	for _, statement := range []string{
		`DELETE FROM workspace_search`,
		`DELETE FROM workspace_search_meta`,
		`DELETE FROM canvas_note_search_meta`,
	} {
		if _, err := tx.ExecContext(ctx, statement); err != nil {
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
