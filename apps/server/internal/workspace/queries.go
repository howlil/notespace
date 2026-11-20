package workspace

import (
	"context"
	"strings"
)

type WorkspaceQueryStore interface {
	GetWorkspaceSnapshot(context.Context, string) (Workspace, error)
}

// Get returns one authored workspace through the application boundary.
// Transport adapters should not reach through Service to the persistence port.
func (s Service) Get(ctx context.Context, id string) (Workspace, error) {
	id = strings.TrimSpace(id)
	if id == "" {
		return Workspace{}, ErrInvalid
	}
	return s.store.GetWorkspaceSnapshot(ctx, id)
}

func (s Service) ListWorkspaces(ctx context.Context, query WorkspaceQuery) (WorkspacePage, error) {
	if query.Offset < 0 || query.Limit < 1 || query.Limit > 100 {
		return WorkspacePage{}, ErrInvalid
	}
	return s.store.ListWorkspaces(ctx, query)
}

func (s Service) ListCategories(ctx context.Context) ([]CategorySummary, error) {
	return s.store.ListCategories(ctx)
}

func (s Service) ListCategoryWorkspaces(ctx context.Context, categoryID string, query WorkspaceQuery) (WorkspacePage, error) {
	categoryID = strings.TrimSpace(categoryID)
	if categoryID == "" {
		return WorkspacePage{}, ErrInvalid
	}
	exists, err := s.store.CategoryExists(ctx, categoryID)
	if err != nil {
		return WorkspacePage{}, err
	}
	if !exists {
		return WorkspacePage{}, ErrNotFound
	}
	query.CategoryID = categoryID
	return s.ListWorkspaces(ctx, query)
}

// Search is the application-facing query port. Decorated Store implementations
// may serve it from a derived projection while authored workspace rows remain authoritative.
func (s Service) Search(ctx context.Context, query string) ([]SearchResult, error) {
	return s.store.Search(ctx, strings.TrimSpace(query))
}
