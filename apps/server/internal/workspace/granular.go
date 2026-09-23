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

type NoteCreate struct {
	ID       string   `json:"id"`
	Title    string   `json:"title"`
	Document Snapshot `json:"document"`
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
	CreateNote(context.Context, string, NoteCreate) (Note, error)
	UpdateNote(context.Context, string, string, NoteUpdate) (Note, error)
	DeleteNote(context.Context, string, string, int) error
	UpdateCanvas(context.Context, string, CanvasUpdate) (CanvasState, error)
}

func (s Service) hydrateGranularState(ctx context.Context, value Workspace) (Workspace, error) {
	notes, err := s.Store.ListNotes(ctx, value.ID)
	if err != nil {
		return Workspace{}, err
	}
	if len(notes) > 0 {
		value.Notes = notes
		value.Document = notes[0].Document
	}
	canvas, err := s.Store.GetCanvasState(ctx, value.ID)
	if err != nil {
		return Workspace{}, err
	}
	value.Canvas = canvas.Canvas
	value.CanvasVersion = canvas.Version
	return value, nil
}

func (s Service) CreateNote(ctx context.Context, workspaceID string, input NoteCreate) (Note, error) {
	workspaceID = strings.TrimSpace(workspaceID)
	input.ID = strings.TrimSpace(input.ID)
	input.Title = strings.TrimSpace(input.Title)
	if workspaceID == "" || input.ID == "" || !ValidTitle(input.Title) || !validDocument(input.Document) {
		return Note{}, ErrInvalid
	}
	return s.Store.CreateNote(ctx, workspaceID, input)
}

func (s Service) UpdateNote(ctx context.Context, workspaceID, noteID string, update NoteUpdate) (Note, error) {
	workspaceID = strings.TrimSpace(workspaceID)
	noteID = strings.TrimSpace(noteID)
	update.Title = strings.TrimSpace(update.Title)
	if workspaceID == "" || noteID == "" || !ValidTitle(update.Title) || update.Version < 1 || !validDocument(update.Document) {
		return Note{}, ErrInvalid
	}
	return s.Store.UpdateNote(ctx, workspaceID, noteID, update)
}

func (s Service) UpdateCanvas(ctx context.Context, workspaceID string, update CanvasUpdate) (CanvasState, error) {
	workspaceID = strings.TrimSpace(workspaceID)
	if workspaceID == "" || update.Version < 1 || !validCanvas(update.Canvas) {
		return CanvasState{}, ErrInvalid
	}
	return s.Store.UpdateCanvas(ctx, workspaceID, update)
}

func (s Service) DeleteNote(ctx context.Context, workspaceID, noteID string, version int) error {
	workspaceID = strings.TrimSpace(workspaceID)
	noteID = strings.TrimSpace(noteID)
	if workspaceID == "" || noteID == "" || version < 1 {
		return ErrInvalid
	}
	return s.Store.DeleteNote(ctx, workspaceID, noteID, version)
}
