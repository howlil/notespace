package workspace

import (
	"context"
	"strings"
)

type WorkspaceQueryStore interface {
	GetWorkspaceRecord(context.Context, string) (Workspace, error)
	WorkspaceExists(context.Context, string) (bool, error)
}

// WorkspaceExists answers ownership checks without hydrating Note/Canvas state
// when the persistence adapter supports the lightweight capability.
func (s Service) WorkspaceExists(ctx context.Context, id string) (bool, error) {
	id = strings.TrimSpace(id)
	if id == "" {
		return false, ErrInvalid
	}
	return s.store.WorkspaceExists(ctx, id)
}

// Get returns one authored workspace through the application boundary.
// Transport adapters should not reach through Service to the persistence port.
func (s Service) Get(ctx context.Context, id string) (Workspace, error) {
	id = strings.TrimSpace(id)
	if id == "" {
		return Workspace{}, ErrInvalid
	}
	value, err := s.store.GetWorkspaceRecord(ctx, id)
	if err != nil {
		return Workspace{}, err
	}
	return s.hydrateGranularState(ctx, value)
}

func (s Service) List(ctx context.Context) ([]Summary, error) {
	return s.store.List(ctx)
}

func (s Service) ListRecent(ctx context.Context, limit int) ([]Summary, error) {
	if limit < 1 || limit > 100 {
		return nil, ErrInvalid
	}
	return s.store.ListRecent(ctx, limit)
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
