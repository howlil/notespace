package workspace

import "context"

// GranularStore owns authored Note/Canvas persistence separately from the
// compatibility whole-workspace aggregate.
type GranularStore interface {
	ListNotes(context.Context, string) ([]Note, error)
	GetCanvasState(context.Context, string) (CanvasState, error)
	CreateNote(context.Context, string, NoteCreate) (Note, error)
	UpdateNote(context.Context, string, string, NoteUpdate) (Note, error)
	DeleteNote(context.Context, string, string, int) error
	UpdateCanvas(context.Context, string, CanvasUpdate) (CanvasState, error)
}

func (s Service) hydrateGranularState(ctx context.Context, value Workspace) (Workspace, error) {
	notes, err := s.store.ListNotes(ctx, value.ID)
	if err != nil {
		return Workspace{}, err
	}
	if len(notes) > 0 {
		value.Notes = notes
		value.Document = notes[0].Document
	}
	canvas, err := s.store.GetCanvasState(ctx, value.ID)
	if err != nil {
		return Workspace{}, err
	}
	value.Canvas = canvas.Canvas
	value.CanvasVersion = canvas.Version
	return value, nil
}
