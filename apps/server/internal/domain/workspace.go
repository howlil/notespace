package domain

import (
	"bytes"
	"encoding/json"
	"strings"
	"unicode/utf8"
)

const (
	WorkspaceSnapshotStart = "start"
	DefaultWorkspaceLimit  = 50
	MaxWorkspaceLimit      = 100
)

type WorkspaceSummary struct {
	ID         string  `json:"id"`
	ParentID   *string `json:"parentId"`
	Title      string  `json:"title"`
	CreatedAt  string  `json:"createdAt"`
	UpdatedAt  string  `json:"updatedAt"`
	Version    int     `json:"version"`
	ChildCount int     `json:"childCount"`
	HasCanvas  bool    `json:"hasCanvas,omitempty"`
}

type Workspace struct {
	WorkspaceSummary
	Canvas         CanvasSnapshot     `json:"canvas"`
	CanvasVersion  int                `json:"canvasVersion,omitempty"`
	Ancestors      []WorkspaceSummary `json:"ancestors,omitempty"`
	RestoredToRoot bool               `json:"restoredToRoot,omitempty"`
}

type WorkspacePage struct {
	Items      []WorkspaceSummary `json:"items"`
	Total      int                `json:"total"`
	Offset     int                `json:"offset"`
	Limit      int                `json:"limit"`
	NextOffset *int               `json:"nextOffset,omitempty"`
	Snapshot   string             `json:"snapshot,omitempty"`
}

type WorkspaceQuery struct {
	RootOnly  bool
	ParentID  string
	Query     string
	Sort      string
	HasCanvas bool
	Offset    int
	Limit     int
	Snapshot  string
}

type TrashItem struct {
	ID          string  `json:"id"`
	ParentID    *string `json:"parentId"`
	ParentTitle string  `json:"parentTitle,omitempty"`
	Title       string  `json:"title"`
	DeletedAt   string  `json:"deletedAt"`
}

type CategoryRedirect struct {
	LegacyCategoryID string `json:"legacyCategoryId"`
	WorkspaceID      string `json:"workspaceId"`
}

// OptionalString distinguishes an omitted JSON field from an explicit null or string.
type OptionalString struct {
	Set   bool
	Value *string
}

func (o *OptionalString) UnmarshalJSON(data []byte) error {
	o.Set = true
	if bytes.Equal(bytes.TrimSpace(data), []byte("null")) {
		o.Value = nil
		return nil
	}
	var value string
	if err := json.Unmarshal(data, &value); err != nil {
		return err
	}
	o.Value = &value
	return nil
}

func ValidTitle(title string) bool {
	return strings.TrimSpace(title) != "" && utf8.RuneCountInString(title) <= 160
}

func ValidateWorkspace(p Workspace) error {
	if !ValidID(strings.TrimSpace(p.ID), MaxIDLength) || !ValidTitle(p.Title) || p.Version < 1 {
		return ErrWorkspaceInvalid
	}
	if p.ParentID != nil {
		parent := strings.TrimSpace(*p.ParentID)
		if !ValidID(parent, MaxIDLength) || parent == p.ID {
			return ErrWorkspaceInvalid
		}
	}
	if _, err := ParseScene(p.Canvas); err != nil {
		return ErrWorkspaceInvalid
	}
	return nil
}

// NormalizeWorkspaceQuery enforces a single validation contract across HTTP,
// live queries, and snapshot-cursor queries (eliminating sort/limit drift).
func NormalizeWorkspaceQuery(query WorkspaceQuery) (WorkspaceQuery, error) {
	query.ParentID = strings.TrimSpace(query.ParentID)
	query.Snapshot = strings.TrimSpace(query.Snapshot)
	if query.RootOnly && query.ParentID != "" {
		return WorkspaceQuery{}, ErrWorkspaceInvalid
	}
	if query.Limit == 0 {
		query.Limit = DefaultWorkspaceLimit
	}
	if query.Offset < 0 || query.Limit < 1 || query.Limit > MaxWorkspaceLimit || len(query.Snapshot) > MaxIDLength {
		return WorkspaceQuery{}, ErrWorkspaceInvalid
	}
	switch query.Sort {
	case "", "updated", "created", "name":
	default:
		return WorkspaceQuery{}, ErrWorkspaceInvalid
	}
	if query.Snapshot == WorkspaceSnapshotStart && query.Offset != 0 {
		return WorkspaceQuery{}, ErrWorkspaceInvalid
	}
	return query, nil
}
