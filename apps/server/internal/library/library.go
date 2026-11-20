package library

import (
	"context"
	"strings"

	"github.com/howlil/notespace/apps/server/internal/workspace"
)

type TrashItem struct {
	ID         string `json:"id"`
	CategoryID string `json:"categoryId"`
	Title      string `json:"title"`
	DeletedAt  string `json:"deletedAt"`
}

// TrashedNote is a Canvas Note in Trash. It keeps its placements, so Restore
// returns it to every Canvas that showed it.
type TrashedNote struct {
	ID             string `json:"id"`
	Label          string `json:"label"`
	Excerpt        string `json:"excerpt"`
	DeletedAt      string `json:"deletedAt"`
	PlacementCount int    `json:"placementCount"`
}

// Store is the persistence capability required to preserve Library recovery and
// portability semantics. Atomic operations stay atomic behind this boundary.
type Store interface {
	TrashWorkspace(context.Context, string, int) error
	ListTrash(context.Context) ([]TrashItem, error)
	RestoreTrashedWorkspace(context.Context, string) (workspace.Workspace, error)
	DeleteTrashedWorkspace(context.Context, string) error
	DeleteCategory(context.Context, string) error
	TrashNote(context.Context, string) error
	ListTrashedNotes(context.Context) ([]TrashedNote, error)
	RestoreTrashedNote(context.Context, string) error
	DeleteTrashedNote(context.Context, string) error
	ExportBackupArchive(context.Context) ([]byte, error)
	RestoreBackupArchive(context.Context, []byte) error
}

type Service struct {
	store Store
}

func NewService(store Store) Service {
	if store == nil {
		panic("library: store is required")
	}
	return Service{store: store}
}

func (s Service) TrashWorkspace(ctx context.Context, id string, expectedVersion int) error {
	return s.store.TrashWorkspace(ctx, id, expectedVersion)
}

func (s Service) ListTrash(ctx context.Context) ([]TrashItem, error) {
	return s.store.ListTrash(ctx)
}

func (s Service) RestoreWorkspace(ctx context.Context, id string) (workspace.Workspace, error) {
	return s.store.RestoreTrashedWorkspace(ctx, id)
}

func (s Service) DeleteTrash(ctx context.Context, id string) error {
	return s.store.DeleteTrashedWorkspace(ctx, id)
}

func (s Service) TrashNote(ctx context.Context, id string) error {
	return s.store.TrashNote(ctx, strings.TrimSpace(id))
}

func (s Service) ListTrashedNotes(ctx context.Context) ([]TrashedNote, error) {
	items, err := s.store.ListTrashedNotes(ctx)
	if err != nil {
		return nil, err
	}
	if items == nil {
		return []TrashedNote{}, nil
	}
	return items, nil
}

func (s Service) RestoreNote(ctx context.Context, id string) error {
	return s.store.RestoreTrashedNote(ctx, strings.TrimSpace(id))
}

func (s Service) DeleteTrashedNote(ctx context.Context, id string) error {
	return s.store.DeleteTrashedNote(ctx, strings.TrimSpace(id))
}

func (s Service) DeleteCategory(ctx context.Context, id string) error {
	return s.store.DeleteCategory(ctx, id)
}

func (s Service) ExportBackup(ctx context.Context) ([]byte, error) {
	return s.store.ExportBackupArchive(ctx)
}

func (s Service) RestoreBackupArchive(ctx context.Context, data []byte) error {
	return s.store.RestoreBackupArchive(ctx, data)
}
