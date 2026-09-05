package persistence

import (
	"context"
	"encoding/json"
	"fmt"
	"strings"

	"github.com/howlil/notespace/apps/server/internal/project"
)

type staleSearchWorkspace struct {
	ID         string
	CategoryID string
	Title      string
	NotesJSON  string
	Version    int
}

type searchBlock struct {
	ID   string
	Text string
}

func extractSearchBlocks(raw json.RawMessage) []searchBlock {
	var root any
	if json.Unmarshal(raw, &root) != nil {
		return nil
	}
	order := []string{}
	textByID := map[string][]string{}
	var walk func(any, string)
	walk = func(value any, blockID string) {
		switch typed := value.(type) {
		case map[string]any:
			if attrs, ok := typed["attrs"].(map[string]any); ok {
				if candidate, ok := attrs["blockId"].(string); ok && candidate != "" {
					blockID = candidate
					if _, exists := textByID[blockID]; !exists {
						order = append(order, blockID)
						textByID[blockID] = nil
					}
				}
			}
			if text, ok := typed["text"].(string); ok && blockID != "" {
				textByID[blockID] = append(textByID[blockID], text)
			}
			if children, ok := typed["content"].([]any); ok {
				for _, child := range children {
					walk(child, blockID)
				}
			}
		case []any:
			for _, child := range typed {
				walk(child, blockID)
			}
		}
	}
	walk(root, "")
	blocks := make([]searchBlock, 0, len(order))
	for _, id := range order {
		text := strings.TrimSpace(strings.Join(textByID[id], " "))
		if text != "" {
			blocks = append(blocks, searchBlock{ID: id, Text: text})
		}
	}
	return blocks
}

func (s *Store) syncSearchIndex(ctx context.Context) error {
	rows, err := s.db.QueryContext(ctx, `SELECT p.id,p.category_id,p.title,p.notes_state,p.version
FROM projects p LEFT JOIN workspace_search_meta m ON m.workspace_id=p.id
WHERE m.workspace_id IS NULL OR m.version<>p.version OR m.category_id<>p.category_id OR m.title<>p.title`)
	if err != nil {
		return err
	}
	stale := []staleSearchWorkspace{}
	for rows.Next() {
		var value staleSearchWorkspace
		if err := rows.Scan(&value.ID, &value.CategoryID, &value.Title, &value.NotesJSON, &value.Version); err != nil {
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

	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	defer tx.Rollback()
	if _, err := tx.ExecContext(ctx, `DELETE FROM workspace_search WHERE workspace_id NOT IN (SELECT id FROM projects)`); err != nil {
		return err
	}
	if _, err := tx.ExecContext(ctx, `DELETE FROM workspace_search_meta WHERE workspace_id NOT IN (SELECT id FROM projects)`); err != nil {
		return err
	}
	for _, value := range stale {
		if _, err := tx.ExecContext(ctx, `DELETE FROM workspace_search WHERE workspace_id=?`, value.ID); err != nil {
			return err
		}
		if _, err := tx.ExecContext(ctx, `INSERT INTO workspace_search(type,category_id,workspace_id,workspace_title,note_id,note_title,block_id,title,content) VALUES ('workspace',?,?,?,?,?,?,?,?)`, value.CategoryID, value.ID, value.Title, "", "", "", value.Title, ""); err != nil {
			return err
		}
		var notes []project.Note
		if err := json.Unmarshal([]byte(value.NotesJSON), &notes); err != nil {
			return fmt.Errorf("index workspace %s notes: %w", value.ID, err)
		}
		for _, note := range notes {
			if _, err := tx.ExecContext(ctx, `INSERT INTO workspace_search(type,category_id,workspace_id,workspace_title,note_id,note_title,block_id,title,content) VALUES ('note',?,?,?,?,?,?,?,?)`, value.CategoryID, value.ID, value.Title, note.ID, note.Title, "", note.Title, ""); err != nil {
				return err
			}
			for _, block := range extractSearchBlocks(note.Document.Data) {
				if _, err := tx.ExecContext(ctx, `INSERT INTO workspace_search(type,category_id,workspace_id,workspace_title,note_id,note_title,block_id,title,content) VALUES ('block',?,?,?,?,?,?,?,?)`, value.CategoryID, value.ID, value.Title, note.ID, note.Title, block.ID, "", block.Text); err != nil {
					return err
				}
			}
		}
		if _, err := tx.ExecContext(ctx, `INSERT INTO workspace_search_meta(workspace_id,version,category_id,title) VALUES (?,?,?,?)
ON CONFLICT(workspace_id) DO UPDATE SET version=excluded.version,category_id=excluded.category_id,title=excluded.title`, value.ID, value.Version, value.CategoryID, value.Title); err != nil {
			return err
		}
	}
	return tx.Commit()
}

func safeFTSQuery(query string) string {
	parts := []string{}
	for _, token := range strings.Fields(strings.TrimSpace(query)) {
		token = strings.ReplaceAll(token, `"`, `""`)
		if token != "" {
			parts = append(parts, `"`+token+`"*`)
		}
	}
	return strings.Join(parts, " AND ")
}

// SearchIndexed keeps authored snapshots as the source of truth while using a
// lazily synchronized SQLite FTS projection for retrieval. Only workspaces whose
// version/category/title changed are decoded during a search.
func (s *Store) SearchIndexed(ctx context.Context, query string) ([]project.SearchResult, error) {
	query = strings.TrimSpace(query)
	if query == "" {
		return []project.SearchResult{}, nil
	}
	if err := s.syncSearchIndex(ctx); err != nil {
		return nil, err
	}
	results := []project.SearchResult{}
	categoryRows, err := s.db.QueryContext(ctx, `SELECT id,title FROM categories WHERE LOWER(title) LIKE ? ORDER BY updated_at DESC LIMIT 20`, "%"+strings.ToLower(query)+"%")
	if err != nil {
		return nil, err
	}
	for categoryRows.Next() {
		var id, title string
		if err := categoryRows.Scan(&id, &title); err != nil {
			categoryRows.Close()
			return nil, err
		}
		results = append(results, project.SearchResult{Type: "category", CategoryID: id, CategoryTitle: title, Excerpt: title})
	}
	if err := categoryRows.Err(); err != nil {
		categoryRows.Close()
		return nil, err
	}
	categoryRows.Close()

	match := safeFTSQuery(query)
	if match == "" {
		return results, nil
	}
	rows, err := s.db.QueryContext(ctx, `SELECT s.type,s.category_id,COALESCE(c.title,''),s.workspace_id,s.workspace_title,s.note_id,s.note_title,s.block_id,s.title,s.content
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
		excerptValue := title
		if kind == "block" {
			excerptValue = excerpt(content, strings.ToLower(query))
		}
		results = append(results, project.SearchResult{Type: kind, CategoryID: categoryID, CategoryTitle: categoryTitle, WorkspaceID: workspaceID, WorkspaceTitle: workspaceTitle, NoteID: noteID, NoteTitle: noteTitle, BlockID: blockID, Excerpt: excerptValue})
	}
	return results, rows.Err()
}
