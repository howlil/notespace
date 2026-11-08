package sqlite

import (
	"context"
	"log/slog"

	workspacepkg "github.com/howlil/notespace/apps/server/internal/workspace"
)

// IndexedWorkspaceStore keeps authored SQLite rows authoritative. Search has its
// own version-aware lazy repair path, so ordinary high-frequency autosaves do
// not rebuild the FTS projection before acknowledging the user's write.
type IndexedWorkspaceStore struct{ *Store }

func NewIndexedWorkspaceStore(store *Store) *IndexedWorkspaceStore {
	return &IndexedWorkspaceStore{Store: store}
}

func (s *IndexedWorkspaceStore) refresh(ctx context.Context, workspaceID string) {
	if err := s.Store.refreshWorkspaceSearch(ctx, workspaceID); err != nil {
		slog.Warn("search projection refresh failed", "workspace_id", workspaceID, "error", err)
	}
}

func (s *IndexedWorkspaceStore) Create(ctx context.Context, value workspacepkg.Workspace) error {
	if err := s.Store.Create(ctx, value); err != nil {
		return err
	}
	s.refresh(ctx, value.ID)
	return nil
}

func (s *IndexedWorkspaceStore) Update(ctx context.Context, id string, update workspacepkg.Update) (workspacepkg.Workspace, error) {
	return s.Store.Update(ctx, id, update)
}

func (s *IndexedWorkspaceStore) Move(ctx context.Context, id, categoryID string, expectedCategory ...string) (workspacepkg.Workspace, error) {
	value, err := s.Store.Move(ctx, id, categoryID, expectedCategory...)
	if err != nil {
		return value, err
	}
	s.refresh(ctx, id)
	return value, nil
}

// Search keeps the search projection behind the workspace.Store port. Callers do
// not need to know whether retrieval is backed by FTS or the base store.
func (s *IndexedWorkspaceStore) Search(ctx context.Context, query string) ([]workspacepkg.SearchResult, error) {
	return s.Store.SearchIndexed(ctx, query)
}
