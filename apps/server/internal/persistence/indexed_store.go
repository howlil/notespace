package persistence

import (
	"context"
	"log/slog"

	"github.com/howlil/notespace/apps/server/internal/project"
)

// IndexedProjectStore keeps the derived FTS projection warm after successful
// authored writes. The authored SQLite rows remain authoritative: projection
// refresh failures are logged and the existing lazy search repair remains the
// fallback instead of turning a successful save into a false failure.
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
	value, err := s.Store.Update(ctx, id, update)
	if err != nil {
		return value, err
	}
	s.refresh(ctx, id)
	return value, nil
}

func (s *IndexedProjectStore) Move(ctx context.Context, id, categoryID string) (project.Project, error) {
	value, err := s.Store.Move(ctx, id, categoryID)
	if err != nil {
		return value, err
	}
	s.refresh(ctx, id)
	return value, nil
}
