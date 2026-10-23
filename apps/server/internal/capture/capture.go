// Package capture owns the temporary, unorganized intake lifecycle.
// A converted Capture remains as an idempotency receipt, not a second Note or Task.
package capture

import (
	"context"
	"errors"
	"strings"
	"unicode/utf8"

	"github.com/howlil/notespace/apps/server/internal/workspace"
)

var (
	ErrInvalid  = errors.New("invalid capture")
	ErrNotFound = errors.New("capture not found")
	ErrConflict = errors.New("capture changed")
)

const MaxContentBytes = 65536

type Item struct {
	ID                string `json:"id"`
	Content           string `json:"content"`
	Status            string `json:"status"`
	Version           int    `json:"version"`
	CreatedAt         string `json:"createdAt"`
	UpdatedAt         string `json:"updatedAt"`
	TargetKind        string `json:"targetKind,omitempty"`
	TargetWorkspaceID string `json:"targetWorkspaceId,omitempty"`
	TargetID          string `json:"targetId,omitempty"`
	ConvertedAt       string `json:"convertedAt,omitempty"`
}

type Organize struct {
	Version     int                 `json:"version"`
	WorkspaceID string              `json:"workspaceId"`
	Kind        string              `json:"kind"`
	Document    *workspace.Snapshot `json:"document,omitempty"`
}

type Store interface {
	CreateCapture(context.Context, string) (Item, error)
	ListCaptures(context.Context) ([]Item, error)
	GetCapture(context.Context, string) (Item, error)
	UpdateCapture(context.Context, string, int, string) (Item, error)
	DeleteCapture(context.Context, string, int) error
	OrganizeCapture(context.Context, string, Organize) (Item, error)
}

type Service struct{ store Store }

func NewService(store Store) Service {
	if store == nil {
		panic("capture: store required")
	}
	return Service{store: store}
}

func ValidContent(content string) bool {
	return strings.TrimSpace(content) != "" && utf8.ValidString(content) && len(content) <= MaxContentBytes
}

func ValidItem(item Item) bool {
	if item.ID == "" || !ValidContent(item.Content) || item.Version < 1 ||
		item.CreatedAt == "" || item.UpdatedAt == "" {
		return false
	}
	switch item.Status {
	case "pending":
		return item.TargetKind == "" && item.TargetWorkspaceID == "" && item.TargetID == "" && item.ConvertedAt == ""
	case "converted":
		return (item.TargetKind == "note" || item.TargetKind == "task") &&
			item.TargetWorkspaceID != "" && item.TargetID != "" && item.ConvertedAt != ""
	}
	return false
}

func (s Service) Create(ctx context.Context, content string) (Item, error) {
	if !ValidContent(content) {
		return Item{}, ErrInvalid
	}
	return s.store.CreateCapture(ctx, content)
}
func (s Service) List(ctx context.Context) ([]Item, error) { return s.store.ListCaptures(ctx) }
func (s Service) Get(ctx context.Context, id string) (Item, error) {
	if strings.TrimSpace(id) == "" {
		return Item{}, ErrInvalid
	}
	return s.store.GetCapture(ctx, id)
}
func (s Service) Update(ctx context.Context, id string, version int, content string) (Item, error) {
	if strings.TrimSpace(id) == "" || version < 1 || !ValidContent(content) {
		return Item{}, ErrInvalid
	}
	return s.store.UpdateCapture(ctx, id, version, content)
}
func (s Service) Delete(ctx context.Context, id string, version int) error {
	if strings.TrimSpace(id) == "" || version < 1 {
		return ErrInvalid
	}
	return s.store.DeleteCapture(ctx, id, version)
}
func (s Service) Organize(ctx context.Context, id string, req Organize) (Item, error) {
	if strings.TrimSpace(id) == "" || req.Version < 1 || strings.TrimSpace(req.WorkspaceID) == "" ||
		(req.Kind != "note" && req.Kind != "task") ||
		(req.Document != nil && (req.Kind != "note" || !workspace.ValidDocumentSnapshot(*req.Document))) {
		return Item{}, ErrInvalid
	}
	return s.store.OrganizeCapture(ctx, id, req)
}
