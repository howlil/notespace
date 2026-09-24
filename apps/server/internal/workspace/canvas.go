package workspace

import (
	"context"
	"strings"
)

type CanvasState struct {
	Canvas    Snapshot `json:"canvas"`
	Version   int      `json:"version"`
	UpdatedAt string   `json:"updatedAt"`
}

type CanvasUpdate struct {
	Canvas  Snapshot `json:"canvas"`
	Version int      `json:"version"`
}

func (s Service) GetCanvasState(ctx context.Context, id string) (CanvasState, error) {
	id = strings.TrimSpace(id)
	if id == "" {
		return CanvasState{}, ErrInvalid
	}
	return s.store.GetCanvasState(ctx, id)
}

func (s Service) UpdateCanvas(ctx context.Context, workspaceID string, update CanvasUpdate) (CanvasState, error) {
	workspaceID = strings.TrimSpace(workspaceID)
	if workspaceID == "" || update.Version < 1 || !validCanvas(update.Canvas) {
		return CanvasState{}, ErrInvalid
	}
	return s.store.UpdateCanvas(ctx, workspaceID, update)
}
