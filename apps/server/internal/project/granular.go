package project

import (
	"context"
	"strings"
)

type CanvasState struct {
	Canvas    Snapshot `json:"canvas"`
	Version   int      `json:"version"`
	UpdatedAt string   `json:"updatedAt"`
}

type NoteUpdate struct {
	Title    string   `json:"title"`
	Document Snapshot `json:"document"`
	Version  int      `json:"version"`
}

type CanvasUpdate struct {
	Canvas  Snapshot `json:"canvas"`
	Version int      `json:"version"`
}

// GranularStore is an additive persistence capability. Keeping it separate from
// Store preserves compatibility with older adapters while Notespace migrates
// authored Note/Canvas state away from the whole-workspace save boundary.
type GranularStore interface {
	ListNotes(context.Context, string) ([]Note, error)
	GetCanvasState(context.Context, string) (CanvasState, error)
	UpdateNote(context.Context, string, string, NoteUpdate) (Note, error)
	UpdateCanvas(context.Context, string, CanvasUpdate) (CanvasState, error)
}

func (s Service) granularStore() (GranularStore, bool) {
	store, ok := s.Store.(GranularStore)
	return store, ok
}

func (s Service) hydrateGranularState(ctx context.Context, value Project) (Project, error) {
	store, ok := s.granularStore()
	if !ok {
		return value, nil
	}
	notes, err := store.ListNotes(ctx, value.ID)
	if err != nil {
		return Project{}, err
	}
	if len(notes) > 0 {
		value.Notes = notes
	}
	canvas, err := store.GetCanvasState(ctx, value.ID)
	if err != nil {
		return Project{}, err
	}
	value.Canvas = canvas.Canvas
	value.CanvasVersion = canvas.Version
	return value, nil
}

func (s Service) UpdateNote(ctx context.Context, workspaceID, noteID string, update NoteUpdate) (Note, error) {
	workspaceID = strings.TrimSpace(workspaceID)
	noteID = strings.TrimSpace(noteID)
	update.Title = strings.TrimSpace(update.Title)
	if workspaceID == "" || noteID == "" || !ValidTitle(update.Title) || update.Version < 1 || !validDocument(update.Document) {
		return Note{}, ErrInvalid
	}
	store, ok := s.granularStore()
	if !ok {
		return Note{}, ErrInvalid
	}
	return store.UpdateNote(ctx, workspaceID, noteID, update)
}

func (s Service) UpdateCanvas(ctx context.Context, workspaceID string, update CanvasUpdate) (CanvasState, error) {
	workspaceID = strings.TrimSpace(workspaceID)
	if workspaceID == "" || update.Version < 1 || !validCanvas(update.Canvas) {
		return CanvasState{}, ErrInvalid
	}
	store, ok := s.granularStore()
	if !ok {
		return CanvasState{}, ErrInvalid
	}
	return store.UpdateCanvas(ctx, workspaceID, update)
}
