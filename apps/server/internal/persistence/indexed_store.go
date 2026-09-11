package persistence

import (
	"context"
	"log/slog"

	"github.com/howlil/notespace/apps/server/internal/project"
)

// IndexedProjectStore keeps authored SQLite rows authoritative. Search has its
// own version-aware lazy repair path, so ordinary high-frequency autosaves do
// not rebuild the FTS projection before acknowledging the user's write.
type IndexedProjectStore struct{ *Store }

func NewIndexedProjectStore(store *Store) *IndexedProjectStore {
	return &IndexedProjectStore{Store: store}
}

func (s *IndexedProjectStore) refresh(ctx context.Context, workspaceID string) {
	if err := s.Store.refreshWorkspaceSearch(ctx, workspaceID); err != nil {
		slog.Warn("search projection refresh failed", "workspace_id", workspaceID, "error", err)
	}
}

func (s *IndexedProjectStore) Create(ctx context.Context, value project.Project) error {
	if err := s.Store.Create(ctx, value); err != nil {
		return err
	}
	s.refresh(ctx, value.ID)
	return nil
}

func (s *IndexedProjectStore) Update(ctx context.Context, id string, update project.Update) (project.Project, error) {
	// Autosave is the hottest write path. SearchIndexed compares projection meta
	// with the authored workspace version and repairs stale entries on demand, so
	// rebuilding every note/block here only adds latency to the save response.
	return s.Store.Update(ctx, id, update)
}

func (s *IndexedProjectStore) Move(ctx context.Context, id, categoryID string) (project.Project, error) {
	value, err := s.Store.Move(ctx, id, categoryID)
	if err != nil {
		return value, err
	}
	s.refresh(ctx, id)
	return value, nil
}
