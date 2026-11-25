package domain

import (
	"strings"
	"unicode/utf8"
)

const (
	WorkspaceSnapshotStart = "start"
	DefaultWorkspaceLimit  = 50
	MaxWorkspaceLimit      = 100
)

type CategorySummary struct {
	ID             string `json:"id"`
	Title          string `json:"title"`
	CreatedAt      string `json:"createdAt"`
	UpdatedAt      string `json:"updatedAt"`
	WorkspaceCount int    `json:"workspaceCount"`
}

type WorkspaceSummary struct {
	ID         string `json:"id"`
	CategoryID string `json:"categoryId"`
	Title      string `json:"title"`
	CreatedAt  string `json:"createdAt"`
	UpdatedAt  string `json:"updatedAt"`
	Version    int    `json:"version"`
	HasCanvas  bool   `json:"hasCanvas,omitempty"`
}

type Workspace struct {
	WorkspaceSummary
	Canvas        CanvasSnapshot `json:"canvas"`
	CanvasVersion int            `json:"canvasVersion,omitempty"`
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
	CategoryID string
	Query      string
	Sort       string
	HasCanvas  bool
	Offset     int
	Limit      int
	Snapshot   string
}

type TrashItem struct {
	ID         string `json:"id"`
	CategoryID string `json:"categoryId"`
	Title      string `json:"title"`
	DeletedAt  string `json:"deletedAt"`
}

func ValidTitle(title string) bool {
	return strings.TrimSpace(title) != "" && utf8.RuneCountInString(title) <= 160
}

func ValidateWorkspace(p Workspace) error {
	if strings.TrimSpace(p.ID) == "" || strings.TrimSpace(p.CategoryID) == "" || !ValidTitle(p.Title) || p.Version < 1 {
		return ErrWorkspaceInvalid
	}
	if _, err := ParseScene(p.Canvas); err != nil {
		return ErrWorkspaceInvalid
	}
	return nil
}

// NormalizeWorkspaceQuery enforces a single validation contract across HTTP,
// live queries, and snapshot-cursor queries (eliminating sort/limit drift).
func NormalizeWorkspaceQuery(query WorkspaceQuery) (WorkspaceQuery, error) {
	query.CategoryID = strings.TrimSpace(query.CategoryID)
	query.Snapshot = strings.TrimSpace(query.Snapshot)
	if query.Limit == 0 {
		query.Limit = DefaultWorkspaceLimit
	}
	if query.Offset < 0 || query.Limit < 1 || query.Limit > MaxWorkspaceLimit || len(query.Snapshot) > MaxIDLength {
		return WorkspaceQuery{}, ErrWorkspaceInvalid
	}
	switch query.Sort {
	case "", "created", "name":
	default:
		return WorkspaceQuery{}, ErrWorkspaceInvalid
	}
	if query.Snapshot == WorkspaceSnapshotStart && query.Offset != 0 {
		return WorkspaceQuery{}, ErrWorkspaceInvalid
	}
	return query, nil
}
