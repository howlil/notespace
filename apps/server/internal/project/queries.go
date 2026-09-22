package project

import (
	"context"
	"errors"
	"strings"
)

type workspaceRecordStore interface {
	GetWorkspaceRecord(context.Context, string) (Project, error)
}

type workspaceExistenceStore interface {
	WorkspaceExists(context.Context, string) (bool, error)
}

// WorkspaceExists answers ownership checks without hydrating Note/Canvas state
// when the persistence adapter supports the lightweight capability.
func (s Service) WorkspaceExists(ctx context.Context, id string) (bool, error) {
	id = strings.TrimSpace(id)
	if id == "" {
		return false, ErrInvalid
	}
	if store, ok := s.Store.(workspaceExistenceStore); ok {
		return store.WorkspaceExists(ctx, id)
	}
	_, err := s.Store.Get(ctx, id)
	if errors.Is(err, ErrNotFound) {
		return false, nil
	}
	return err == nil, err
}

// GetCanvasState exposes the granular Canvas read boundary for conflict
// recovery without loading every Note in the Workspace.
func (s Service) GetCanvasState(ctx context.Context, id string) (CanvasState, error) {
	id = strings.TrimSpace(id)
	if id == "" {
		return CanvasState{}, ErrInvalid
	}
	store, ok := s.granularStore()
	if !ok {
		return CanvasState{}, ErrInvalid
	}
	return store.GetCanvasState(ctx, id)
}

// Get returns one authored workspace through the application boundary.
// Transport adapters should not reach through Service to the persistence port.
func (s Service) Get(ctx context.Context, id string) (Project, error) {
	id = strings.TrimSpace(id)
	if id == "" {
		return Project{}, ErrInvalid
	}
	var value Project
	var err error
	if store, ok := s.Store.(workspaceRecordStore); ok {
		value, err = store.GetWorkspaceRecord(ctx, id)
	} else {
		value, err = s.Store.Get(ctx, id)
	}
	if err != nil {
		return Project{}, err
	}
	return s.hydrateGranularState(ctx, value)
}

func (s Service) List(ctx context.Context) ([]Summary, error) {
	return s.Store.List(ctx)
}

func (s Service) ListRecent(ctx context.Context, limit int) ([]Summary, error) {
	if limit < 1 || limit > 100 {
		return nil, ErrInvalid
	}
	return s.Store.ListRecent(ctx, limit)
}

func (s Service) ListWorkspaces(ctx context.Context, query WorkspaceQuery) (WorkspacePage, error) {
	if query.Offset < 0 || query.Limit < 1 || query.Limit > 100 {
		return WorkspacePage{}, ErrInvalid
	}
	return s.Store.ListWorkspaces(ctx, query)
}

func (s Service) ListCategories(ctx context.Context) ([]CategorySummary, error) {
	return s.Store.ListCategories(ctx)
}

func (s Service) ListCategoryWorkspaces(ctx context.Context, categoryID string, query WorkspaceQuery) (WorkspacePage, error) {
	categoryID = strings.TrimSpace(categoryID)
	if categoryID == "" {
		return WorkspacePage{}, ErrInvalid
	}
	exists, err := s.Store.CategoryExists(ctx, categoryID)
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
	return s.Store.Search(ctx, strings.TrimSpace(query))
}

func (s Service) ListHistory(ctx context.Context, workspaceID string) ([]HistoryEntry, error) {
	if _, err := s.Get(ctx, workspaceID); err != nil {
		return nil, err
	}
	return s.Store.ListHistory(ctx, workspaceID)
}

func (s Service) GetHistory(ctx context.Context, workspaceID, historyID string) (HistorySnapshot, error) {
	workspaceID = strings.TrimSpace(workspaceID)
	historyID = strings.TrimSpace(historyID)
	if workspaceID == "" || historyID == "" {
		return HistorySnapshot{}, ErrInvalid
	}
	return s.Store.GetHistory(ctx, workspaceID, historyID)
}

// RestoreHistory owns the restore use case so HTTP only maps transport input/output.
func (s Service) RestoreHistory(ctx context.Context, workspaceID, historyID string) (Project, error) {
	current, err := s.Get(ctx, workspaceID)
	if err != nil {
		return Project{}, err
	}
	snapshot, err := s.GetHistory(ctx, workspaceID, historyID)
	if err != nil {
		return Project{}, err
	}
	return s.Update(ctx, current.ID, Update{
		Title:      snapshot.Title,
		Document:   snapshot.Document,
		Notes:      snapshot.Notes,
		Canvas:     snapshot.Canvas,
		References: []Reference{},
		SplitRatio: snapshot.SplitRatio,
		Version:    current.Version,
	})
}
