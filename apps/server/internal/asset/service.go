package asset

import (
	"context"
	"errors"
	"strings"
)

var ErrWorkspaceNotFound = errors.New("asset workspace not found")

type WorkspaceLookup interface {
	WorkspaceExists(context.Context, string) (bool, error)
}

type Service struct {
	store      Store
	workspaces WorkspaceLookup
}

func NewService(store Store, workspaces WorkspaceLookup) Service {
	if store == nil {
		panic("asset: store is required")
	}
	if workspaces == nil {
		panic("asset: workspace lookup is required")
	}
	return Service{store: store, workspaces: workspaces}
}

func (s Service) Put(ctx context.Context, value Stored) (Stored, error) {
	value.ID = strings.TrimSpace(value.ID)
	value.WorkspaceID = strings.TrimSpace(value.WorkspaceID)
	value.MimeType = strings.TrimSpace(value.MimeType)
	if value.ID == "" || value.WorkspaceID == "" || value.MimeType == "" || len(value.Data) == 0 {
		return Stored{}, ErrInvalid
	}
	exists, err := s.workspaces.WorkspaceExists(ctx, value.WorkspaceID)
	if err != nil {
		return Stored{}, err
	}
	if !exists {
		return Stored{}, ErrWorkspaceNotFound
	}
	return s.store.PutAsset(ctx, value)
}

func (s Service) Get(ctx context.Context, workspaceID, assetID string) (Stored, error) {
	workspaceID = strings.TrimSpace(workspaceID)
	assetID = strings.TrimSpace(assetID)
	if workspaceID == "" || assetID == "" {
		return Stored{}, ErrInvalid
	}
	return s.store.GetAsset(ctx, workspaceID, assetID)
}

func (s Service) Delete(ctx context.Context, workspaceID, assetID string) error {
	workspaceID = strings.TrimSpace(workspaceID)
	assetID = strings.TrimSpace(assetID)
	if workspaceID == "" || assetID == "" {
		return ErrInvalid
	}
	return s.store.DeleteAsset(ctx, workspaceID, assetID)
}
