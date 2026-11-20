// Package workspace owns Workspace metadata plus the hydrated compatibility view exposed to clients.
// Note and Canvas authored state have independent persistence/version boundaries.
package workspace

import (
	"encoding/json"
	"errors"
)

var (
	ErrNotFound = errors.New("workspace not found")
	ErrConflict = errors.New("workspace changed in another session")
	ErrInvalid  = errors.New("invalid workspace input")
	ErrNotEmpty = errors.New("category still contains workspaces")
)

// UncategorizedCategoryID is the stable compatibility category used when a
// workspace is created from the library root without an explicit category.
const UncategorizedCategoryID = "legacy"

type Snapshot struct {
	Format  string          `json:"format"`
	Version int             `json:"version"`
	Data    json.RawMessage `json:"data"`
}

type Summary struct {
	ID         string `json:"id"`
	CategoryID string `json:"categoryId"`
	Title      string `json:"title"`
	CreatedAt  string `json:"createdAt"`
	UpdatedAt  string `json:"updatedAt"`
	Version    int    `json:"version"`
	HasCanvas  bool   `json:"hasCanvas,omitempty"`
}

type WorkspacePage struct {
	Items      []Summary `json:"items"`
	Total      int       `json:"total"`
	Offset     int       `json:"offset"`
	Limit      int       `json:"limit"`
	NextOffset *int      `json:"nextOffset,omitempty"`
	Snapshot   string    `json:"snapshot,omitempty"`
}

// WorkspaceQuery is the storage-facing library query. HTTP-specific string
// representations are parsed before they reach the domain/store boundary.
type WorkspaceQuery struct {
	CategoryID string
	Query      string
	Sort       string
	HasCanvas  bool
	Offset     int
	Limit      int
	Snapshot   string
}

// Category is the library-level grouping for workspaces. A workspace owns its
// canvas and canonical canvas note placements.
type CategorySummary struct {
	ID             string `json:"id"`
	Title          string `json:"title"`
	CreatedAt      string `json:"createdAt"`
	UpdatedAt      string `json:"updatedAt"`
	WorkspaceCount int    `json:"workspaceCount"`
}

type Workspace struct {
	Summary
	Canvas        Snapshot `json:"canvas"`
	CanvasVersion int      `json:"canvasVersion,omitempty"`
}

type SearchResult struct {
	Type           string `json:"type"`
	CategoryID     string `json:"categoryId,omitempty"`
	CategoryTitle  string `json:"categoryTitle,omitempty"`
	WorkspaceID    string `json:"workspaceId"`
	WorkspaceTitle string `json:"workspaceTitle"`
	Excerpt        string `json:"excerpt"`
	NoteID         string `json:"noteId,omitempty"`
	InstanceID     string `json:"instanceId,omitempty"`
	ElementID      string `json:"elementId,omitempty"`
}
