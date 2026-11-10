package sqlite

import (
	"context"
	"strings"

	searchquery "github.com/howlil/notespace/apps/server/internal/sqlite/internal/search"
	workspacequery "github.com/howlil/notespace/apps/server/internal/sqlite/internal/workspace"
	workspacepkg "github.com/howlil/notespace/apps/server/internal/workspace"
)

func (s *Store) Search(ctx context.Context, query string) ([]workspacepkg.SearchResult, error) {
	query = strings.ToLower(strings.TrimSpace(query))
	if query == "" {
		return []workspacepkg.SearchResult{}, nil
	}
	projects, err := s.List(ctx)
	if err != nil {
		return nil, err
	}
	categories, err := s.ListCategories(ctx)
	if err != nil {
		return nil, err
	}
	results := make([]workspacepkg.SearchResult, 0)
	for _, category := range categories {
		if strings.Contains(strings.ToLower(category.Title), query) {
			results = append(results, workspacepkg.SearchResult{Type: "category", CategoryID: category.ID, CategoryTitle: category.Title, Excerpt: category.Title})
		}
	}
	for _, summary := range projects {
		p, err := s.Get(ctx, summary.ID)
		if err != nil {
			return nil, err
		}
		categoryTitle := ""
		for _, category := range categories {
			if category.ID == p.CategoryID {
				categoryTitle = category.Title
				break
			}
		}
		if strings.Contains(strings.ToLower(p.Title), query) {
			results = append(results, workspacepkg.SearchResult{Type: "workspace", CategoryID: p.CategoryID, CategoryTitle: categoryTitle, WorkspaceID: p.ID, WorkspaceTitle: p.Title, Excerpt: p.Title})
		}
	}
	return results, nil
}
func (s *Store) syncSearchIndex(ctx context.Context) error {

	// Read the authored snapshots and advance the derived projection in the same
	// transaction. With the store's single SQLite connection, an autosave cannot
	// land between the version read and the meta/index write and make stale
	// projection rows look current.
	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	defer tx.Rollback()

	if err := searchquery.SyncIndexTx(ctx, tx); err != nil {
		return err
	}
	return tx.Commit()
}

// SearchIndexed keeps authored snapshots as the source of truth while using a
// lazily synchronized SQLite FTS projection for retrieval. Only workspaces whose
// version/category/title changed are decoded during a search.
func (s *Store) SearchIndexed(ctx context.Context, query string) ([]workspacepkg.SearchResult, error) {
	query = strings.TrimSpace(query)
	if query == "" {
		return []workspacepkg.SearchResult{}, nil
	}
	if err := s.syncSearchIndex(ctx); err != nil {
		return nil, err
	}
	results := []workspacepkg.SearchResult{}
	categoryRows, err := s.db.QueryContext(ctx, `SELECT id,title FROM categories WHERE LOWER(title) LIKE ? ESCAPE '\' ORDER BY updated_at DESC LIMIT 20`, searchquery.ContainsLikeLiteral(query))
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

	match := searchquery.SafeFTSQuery(query)
	if match == "" {
		return results, nil
	}
	rows, err := s.db.QueryContext(ctx, `SELECT s.type,s.category_id,COALESCE(c.title,''),s.workspace_id,s.workspace_title,s.note_id,s.note_title,s.block_id,s.title,s.content
FROM workspace_search s LEFT JOIN categories c ON c.id=s.category_id
WHERE s.type='workspace' AND workspace_search MATCH ? ORDER BY bm25(workspace_search) LIMIT 100`, match)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	for rows.Next() {
		var kind, categoryID, categoryTitle, workspaceID, workspaceTitle, noteID, noteTitle, blockID, title, content string
		if err := rows.Scan(&kind, &categoryID, &categoryTitle, &workspaceID, &workspaceTitle, &noteID, &noteTitle, &blockID, &title, &content); err != nil {
			return nil, err
		}
		results = append(results, workspacepkg.SearchResult{Type: kind, CategoryID: categoryID, CategoryTitle: categoryTitle, WorkspaceID: workspaceID, WorkspaceTitle: workspaceTitle, Excerpt: title})
	}
	return results, rows.Err()
}
func (s *Store) refreshWorkspaceSearch(ctx context.Context, workspaceID string) error {
	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	defer tx.Rollback()

	// Read the authored workspace from the same transaction that advances the
	// projection. Otherwise an autosave could land after Get and before BeginTx,
	// causing an older version to overwrite newer search metadata.
	value, err := workspacequery.GetWorkspaceRecord(tx, ctx, workspaceID)
	if err != nil {
		return err
	}
	if err := searchquery.ReplaceWorkspaceTx(ctx, tx, searchquery.StaleSearchWorkspace{ID: value.ID, CategoryID: value.CategoryID, Title: value.Title, Version: value.Version}); err != nil {
		return err
	}
	return tx.Commit()
}
