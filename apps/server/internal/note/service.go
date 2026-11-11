package note

import (
	"context"
	"crypto/rand"
	"errors"
	"strings"
	"time"
)

type Service struct{ store Store }

func NewService(store Store) Service {
	if store == nil {
		panic("note: store is required")
	}
	return Service{store: store}
}

func (s Service) Get(ctx context.Context, id string) (Note, error) {
	if !ValidateID(strings.TrimSpace(id), MaxNoteIDLength) {
		return Note{}, ErrInvalid
	}
	return s.store.GetNote(ctx, id)
}

func (s Service) Backlinks(ctx context.Context, id string) ([]Backlink, error) {
	id = strings.TrimSpace(id)
	if !ValidateID(id, MaxNoteIDLength) {
		return nil, ErrInvalid
	}
	if _, err := s.store.GetNote(ctx, id); err != nil {
		return nil, err
	}
	return s.store.ListBacklinks(ctx, id)
}

func (s Service) Update(ctx context.Context, id string, request UpdateRequest) (Note, error) {
	id = strings.TrimSpace(id)
	if !ValidateID(id, MaxNoteIDLength) || ValidateUpdateRequest(request) != nil {
		return Note{}, ErrInvalid
	}
	return s.store.UpdateNote(ctx, id, request)
}

func (s Service) CreateInstance(ctx context.Context, workspaceID string, request CreateInstanceRequest) (CreateInstanceResult, error) {
	if !ValidateID(strings.TrimSpace(workspaceID), MaxNoteIDLength) || ValidateCreateRequest(request) != nil {
		return CreateInstanceResult{}, ErrInvalid
	}
	return s.store.CreateNoteInstance(ctx, workspaceID, request)
}

func (s Service) DeleteInstance(ctx context.Context, workspaceID, instanceID string, request DeleteInstanceRequest) (CanvasState, error) {
	if !ValidateID(strings.TrimSpace(workspaceID), MaxNoteIDLength) || !ValidateID(strings.TrimSpace(instanceID), MaxInstanceIDLength) || ValidateDeleteRequest(request) != nil {
		return CanvasState{}, ErrInvalid
	}
	return s.store.DeleteNoteInstance(ctx, workspaceID, instanceID, request)
}

func NewID() string { return rand.Text() }

func now() string { return time.Now().UTC().Format(time.RFC3339Nano) }

func isNotFound(err error) bool { return errors.Is(err, ErrNotFound) }
