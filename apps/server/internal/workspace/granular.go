package workspace

import "context"

type GranularStore interface {
	GetCanvasState(context.Context, string) (CanvasState, error)
	UpdateCanvas(context.Context, string, CanvasUpdate) (CanvasState, error)
}

func (s Service) hydrateGranularState(ctx context.Context, value Workspace) (Workspace, error) {
	value.Notes = []Note{}
	canvas, err := s.store.GetCanvasState(ctx, value.ID)
	if err != nil {
		return Workspace{}, err
	}
	value.Canvas = canvas.Canvas
	value.CanvasVersion = canvas.Version
	return value, nil
}
