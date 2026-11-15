package sqlite

import (
	"context"
	"strings"

	searchquery "github.com/howlil/notespace/apps/server/internal/sqlite/internal/search"
	workspacequery "github.com/howlil/notespace/apps/server/internal/sqlite/internal/workspace"
	workspacepkg "github.com/howlil/notespace/apps/server/internal/workspace"
)

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

// Search keeps authored snapshots as the source of truth while using a lazily
// synchronized SQLite FTS projection for retrieval. Only workspaces whose
// version/category/title changed are decoded during a search.
func (s *Store) Search(ctx context.Context, query string) ([]workspacepkg.SearchResult, error) {
	query = strings.TrimSpace(query)
	if query == "" {
		return []workspacepkg.SearchResult{}, nil
	}
	if err := s.syncSearchIndex(ctx); err != nil {
		return nil, err
	}
	return searchquery.Query(ctx, s.db, query)
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
	value, err := workspacequery.GetWorkspaceRecord(ctx, tx, workspaceID)
	if err != nil {
		return err
	}
	if err := searchquery.ReplaceWorkspaceTx(ctx, tx, searchquery.StaleSearchWorkspace{ID: value.ID, CategoryID: value.CategoryID, Title: value.Title, Version: value.Version}); err != nil {
		return err
	}
	return tx.Commit()
}
