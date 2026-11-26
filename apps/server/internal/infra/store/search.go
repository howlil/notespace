package store

import (
	"context"
	"database/sql"
	"encoding/json"
	"strings"
	"unicode"

	"github.com/howlil/notespace/apps/server/internal/domain"
	"github.com/howlil/notespace/apps/server/internal/infra/sqlite"
)

type staleSearchWorkspace struct {
	id       string
	parentID string
	title    string
	version  int
}

type staleNotePlacement struct {
	noteID         string
	instanceID     string
	workspaceID    string
	workspaceTitle string
	parentID       string
	document       string
}

// Search checks projection freshness on the concurrent reader pool first and
// only acquires a write transaction when workspaces or notes are actually stale.
func (s *Store) Search(ctx context.Context, query string) ([]domain.SearchResult, error) {
	query = strings.TrimSpace(query)
	if query == "" {
		return []domain.SearchResult{}, nil
	}
	stale, err := s.searchIndexIsStale(ctx)
	if err != nil {
		return nil, err
	}
	if stale {
		if err := s.syncSearchIndex(ctx); err != nil {
			return nil, err
		}
	}
	var results []domain.SearchResult
	err = s.db.WithReadTx(ctx, func(tx *sql.Tx) error {
		var err error
		results, err = querySearchTx(ctx, tx, query)
		return err
	})
	if err != nil {
		return nil, err
	}
	if results == nil {
		return []domain.SearchResult{}, nil
	}
	return results, nil
}

func (s *Store) searchIndexIsStale(ctx context.Context) (bool, error) {
	var stale int
	err := s.db.ReadPool().QueryRowContext(ctx, `SELECT (
		EXISTS(
			SELECT 1 FROM projects p LEFT JOIN workspace_search_meta m ON m.workspace_id=p.id
			WHERE m.workspace_id IS NULL OR m.version<>p.version OR m.parent_id<>COALESCE(p.parent_id,'') OR m.title<>p.title
		)
		OR EXISTS(
			SELECT 1 FROM workspace_search_meta m WHERE m.workspace_id NOT IN (SELECT id FROM projects)
		)
		OR EXISTS(
			SELECT 1 FROM workspace_search s WHERE s.workspace_id<>'' AND s.workspace_id NOT IN (SELECT id FROM projects)
		)
		OR EXISTS(
			SELECT 1 FROM canvas_notes n LEFT JOIN canvas_note_search_meta m ON m.note_id=n.id
			WHERE n.deleted_at IS NULL AND (m.note_id IS NULL OR m.revision<>n.revision OR m.updated_at<>n.updated_at)
		)
		OR EXISTS(
			SELECT 1 FROM workspace_search s WHERE s.type='note' AND s.note_id NOT IN (SELECT id FROM canvas_notes WHERE deleted_at IS NULL)
		)
	)`).Scan(&stale)
	return stale != 0, err
}

func (s *Store) syncSearchIndex(ctx context.Context) error {
	return s.db.WithTx(ctx, func(tx *sql.Tx) error {
		return syncSearchIndexTx(ctx, tx)
	})
}

func querySearchTx(ctx context.Context, db sqlite.DBTX, query string) ([]domain.SearchResult, error) {
	results := []domain.SearchResult{}
	match := safeFTSQuery(query)
	if match == "" {
		return results, nil
	}
	rows, err := db.QueryContext(ctx, `SELECT s.type,s.parent_id,COALESCE(parent.title,''),s.workspace_id,s.workspace_title,s.note_id,s.note_title,s.block_id,s.title,s.content
FROM workspace_search s LEFT JOIN projects parent ON parent.id=s.parent_id
WHERE workspace_search MATCH ? ORDER BY bm25(workspace_search) LIMIT 100`, match)
	if err != nil {
		return nil, err
	}
	defer func() { _ = rows.Close() }()
	for rows.Next() {
		var kind, parentID, parentTitle, workspaceID, workspaceTitle, noteID, noteTitle, blockID, title, content string
		if err := rows.Scan(&kind, &parentID, &parentTitle, &workspaceID, &workspaceTitle, &noteID, &noteTitle, &blockID, &title, &content); err != nil {
			return nil, err
		}
		result := domain.SearchResult{
			Type: kind, ParentTitle: parentTitle,
			WorkspaceID: workspaceID, WorkspaceTitle: workspaceTitle, NoteID: noteID, Excerpt: title,
		}
		if parentID != "" {
			val := parentID
			result.ParentID = &val
		}
		if kind == "note" {
			result.InstanceID = blockID
			result.Excerpt = content
			if result.Excerpt == "" {
				result.Excerpt = noteTitle
			}
		}
		results = append(results, result)
	}
	return results, rows.Err()
}

func advanceCanvasSearchRevisionTx(ctx context.Context, tx sqlite.DBTX, workspaceID string) error {
	_, err := tx.ExecContext(ctx, `UPDATE workspace_search_meta
SET version=(SELECT version FROM projects WHERE id=?)
WHERE workspace_id=?`, workspaceID, workspaceID)
	return err
}

func invalidateNotesInWorkspaceSearchTx(ctx context.Context, tx sqlite.DBTX, workspaceID string) error {
	_, err := tx.ExecContext(ctx, `DELETE FROM canvas_note_search_meta
WHERE note_id IN (SELECT note_id FROM canvas_note_instances WHERE workspace_id=?)`, workspaceID)
	return err
}

func invalidateNoteSearchTx(ctx context.Context, tx sqlite.DBTX, noteID string) error {
	_, err := tx.ExecContext(ctx, `DELETE FROM canvas_note_search_meta WHERE note_id=?`, noteID)
	return err
}

func replaceWorkspaceSearchTx(ctx context.Context, tx sqlite.DBTX, value staleSearchWorkspace) error {
	if _, err := tx.ExecContext(ctx, `DELETE FROM workspace_search WHERE workspace_id=?`, value.id); err != nil {
		return err
	}
	if err := invalidateNotesInWorkspaceSearchTx(ctx, tx, value.id); err != nil {
		return err
	}
	if _, err := tx.ExecContext(ctx, `INSERT INTO workspace_search(type,parent_id,workspace_id,workspace_title,note_id,note_title,block_id,title,content) VALUES ('workspace',?,?,?,?,?,?,?,?)`, value.parentID, value.id, value.title, "", "", "", value.title, ""); err != nil {
		return err
	}
	_, err := tx.ExecContext(ctx, `INSERT INTO workspace_search_meta(workspace_id,version,parent_id,title) VALUES (?,?,?,?)
ON CONFLICT(workspace_id) DO UPDATE SET version=excluded.version,parent_id=excluded.parent_id,title=excluded.title`, value.id, value.version, value.parentID, value.title)
	return err
}

func syncCanvasNotesSearchTx(ctx context.Context, tx sqlite.DBTX) error {
	rows, err := tx.QueryContext(ctx, `
SELECT n.id,COALESCE(i.id,''),COALESCE(i.workspace_id,''),COALESCE(p.title,''),COALESCE(p.parent_id,''),n.document_state
FROM canvas_notes n
LEFT JOIN canvas_note_search_meta m ON m.note_id=n.id
LEFT JOIN canvas_note_instances i ON i.note_id=n.id
LEFT JOIN projects p ON p.id=i.workspace_id
WHERE n.deleted_at IS NULL AND (m.note_id IS NULL OR m.revision<>n.revision OR m.updated_at<>n.updated_at)
ORDER BY n.updated_at DESC,n.id,i.id`)
	if err != nil {
		return err
	}
	defer func() { _ = rows.Close() }()
	placements := []staleNotePlacement{}
	staleNoteIDs := []string{}
	seenNoteIDs := map[string]bool{}
	for rows.Next() {
		var item staleNotePlacement
		if err := rows.Scan(&item.noteID, &item.instanceID, &item.workspaceID, &item.workspaceTitle, &item.parentID, &item.document); err != nil {
			return err
		}
		placements = append(placements, item)
		if !seenNoteIDs[item.noteID] {
			seenNoteIDs[item.noteID] = true
			staleNoteIDs = append(staleNoteIDs, item.noteID)
		}
	}
	if err := rows.Err(); err != nil {
		return err
	}
	if err := rows.Close(); err != nil {
		return err
	}

	if _, err := tx.ExecContext(ctx, `DELETE FROM workspace_search WHERE type='note' AND note_id NOT IN (SELECT id FROM canvas_notes WHERE deleted_at IS NULL)`); err != nil {
		return err
	}
	for _, noteID := range staleNoteIDs {
		if _, err := tx.ExecContext(ctx, `DELETE FROM workspace_search WHERE type='note' AND note_id=?`, noteID); err != nil {
			return err
		}
	}
	for _, item := range placements {
		parsed := domain.SummarizeDocument(json.RawMessage(item.document))
		if _, err := tx.ExecContext(ctx, `INSERT INTO workspace_search(type,parent_id,workspace_id,workspace_title,note_id,note_title,block_id,title,content) VALUES ('note',?,?,?,?,?,?,?,?)`, item.parentID, item.workspaceID, item.workspaceTitle, item.noteID, parsed.Label, item.instanceID, parsed.Label, parsed.PlainText); err != nil {
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

func syncSearchIndexTx(ctx context.Context, tx sqlite.DBTX) error {
	rows, err := tx.QueryContext(ctx, `SELECT p.id,COALESCE(p.parent_id,''),p.title,p.version
FROM projects p LEFT JOIN workspace_search_meta m ON m.workspace_id=p.id
WHERE m.workspace_id IS NULL OR m.version<>p.version OR m.parent_id<>COALESCE(p.parent_id,'') OR m.title<>p.title`)
	if err != nil {
		return err
	}
	defer func() { _ = rows.Close() }()
	stale := []staleSearchWorkspace{}
	for rows.Next() {
		var value staleSearchWorkspace
		if err := rows.Scan(&value.id, &value.parentID, &value.title, &value.version); err != nil {
			return err
		}
		stale = append(stale, value)
	}
	if err := rows.Err(); err != nil {
		return err
	}
	if err := rows.Close(); err != nil {
		return err
	}
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
		if err := replaceWorkspaceSearchTx(ctx, tx, value); err != nil {
			return err
		}
	}
	return syncCanvasNotesSearchTx(ctx, tx)
}

func safeFTSQuery(query string) string {
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
