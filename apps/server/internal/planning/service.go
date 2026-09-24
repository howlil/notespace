package planning

import (
	"context"
	"strings"
	"time"
)

type Service struct {
	store      Store
	workspaces WorkspaceLookup
	nowFn      func() time.Time
}

func NewService(store Store, workspaces WorkspaceLookup, now func() time.Time) Service {
	if store == nil {
		panic("planning: store is required")
	}
	if workspaces == nil {
		panic("planning: workspace lookup is required")
	}
	return Service{store: store, workspaces: workspaces, nowFn: now}
}

func (s Service) now() time.Time {
	if s.nowFn != nil {
		return s.nowFn().UTC()
	}
	return time.Now().UTC()
}

func (s Service) requireWorkspace(ctx context.Context, workspaceID string) error {
	if strings.TrimSpace(workspaceID) == "" {
		return ErrInvalid
	}
	exists, err := s.workspaces.WorkspaceExists(ctx, workspaceID)
	if err != nil {
		return err
	}
	if !exists {
		return ErrNotFound
	}
	return nil
}

func (s Service) GetPlan(ctx context.Context, workspaceID string) (Plan, error) {
	if err := s.requireWorkspace(ctx, workspaceID); err != nil {
		return Plan{}, err
	}
	return s.store.GetPlan(ctx, workspaceID)
}
