package workspace

import (
	"context"
	"strings"
)

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

func (s Service) CreateNote(ctx context.Context, workspaceID string, input NoteCreate) (Note, error) {
	workspaceID = strings.TrimSpace(workspaceID)
	input.ID = strings.TrimSpace(input.ID)
	input.Title = strings.TrimSpace(input.Title)
	if workspaceID == "" || input.ID == "" || !ValidTitle(input.Title) || !validDocument(input.Document) {
		return Note{}, ErrInvalid
	}
	return s.store.CreateNote(ctx, workspaceID, input)
}

func (s Service) UpdateNote(ctx context.Context, workspaceID, noteID string, update NoteUpdate) (Note, error) {
	workspaceID = strings.TrimSpace(workspaceID)
	noteID = strings.TrimSpace(noteID)
	update.Title = strings.TrimSpace(update.Title)
	if workspaceID == "" || noteID == "" || !ValidTitle(update.Title) || update.Version < 1 || !validDocument(update.Document) {
		return Note{}, ErrInvalid
	}
	return s.store.UpdateNote(ctx, workspaceID, noteID, update)
}

func (s Service) DeleteNote(ctx context.Context, workspaceID, noteID string, version int) error {
	workspaceID = strings.TrimSpace(workspaceID)
	noteID = strings.TrimSpace(noteID)
	if workspaceID == "" || noteID == "" || version < 1 {
		return ErrInvalid
	}
	return s.store.DeleteNote(ctx, workspaceID, noteID, version)
}
