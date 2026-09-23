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
	NoteCount  int    `json:"noteCount,omitempty"`
	HasCanvas  bool   `json:"hasCanvas,omitempty"`
}

type WorkspacePage struct {
	Items      []Summary `json:"items"`
	Total      int       `json:"total"`
	Offset     int       `json:"offset"`
	Limit      int       `json:"limit"`
	NextOffset *int      `json:"nextOffset,omitempty"`
}

// WorkspaceQuery is the storage-facing library query. HTTP-specific string
// representations are parsed before they reach the domain/store boundary.
type WorkspaceQuery struct {
	CategoryID string
	Query      string
	Sort       string
	HasCanvas  bool
	HasNotes   bool
	Offset     int
	Limit      int
}

// Category is the library-level grouping for workspaces. A workspace owns its
// notes and canvas as one editable aggregate.
type CategorySummary struct {
	ID             string `json:"id"`
	Title          string `json:"title"`
	CreatedAt      string `json:"createdAt"`
	UpdatedAt      string `json:"updatedAt"`
	WorkspaceCount int    `json:"workspaceCount"`
}

// Reference is a product-owned relationship between one document block and one
// canvas object. Targets may be absent after ordinary editing and are repaired
// by the client rather than silently reassigned by the server.
type Reference struct {
	ID        string `json:"id"`
	NoteID    string `json:"noteId,omitempty"`
	BlockID   string `json:"blockId"`
	ElementID string `json:"elementId"`
}

type Note struct {
	ID        string   `json:"id"`
	Title     string   `json:"title"`
	Document  Snapshot `json:"document"`
	CreatedAt string   `json:"createdAt"`
	UpdatedAt string   `json:"updatedAt"`
	Version   int      `json:"version,omitempty"`
}

type Workspace struct {
	Summary
	Document      Snapshot    `json:"document"`
	Notes         []Note      `json:"notes"`
	Canvas        Snapshot    `json:"canvas"`
	CanvasVersion int         `json:"canvasVersion,omitempty"`
	References    []Reference `json:"references"`
	SplitRatio    float64     `json:"splitRatio"`
}

type SearchResult struct {
	Type           string `json:"type"`
	CategoryID     string `json:"categoryId,omitempty"`
	CategoryTitle  string `json:"categoryTitle,omitempty"`
	WorkspaceID    string `json:"workspaceId"`
	WorkspaceTitle string `json:"workspaceTitle"`
	NoteID         string `json:"noteId"`
	NoteTitle      string `json:"noteTitle"`
	BlockID        string `json:"blockId"`
	Excerpt        string `json:"excerpt"`
}

type HistoryEntry struct {
	ID          string `json:"id"`
	WorkspaceID string `json:"workspaceId"`
	Version     int    `json:"version"`
	Title       string `json:"title"`
	CreatedAt   string `json:"createdAt"`
}

type HistorySnapshot struct {
	HistoryEntry
	Document   Snapshot    `json:"document"`
	Notes      []Note      `json:"notes"`
	Canvas     Snapshot    `json:"canvas"`
	References []Reference `json:"references"`
	SplitRatio float64     `json:"splitRatio"`
}

// Update is a complete authored snapshot; Version is an optimistic concurrency guard.
type Update struct {
	Title      string      `json:"title"`
	Document   Snapshot    `json:"document"`
	Notes      []Note      `json:"notes"`
	Canvas     Snapshot    `json:"canvas"`
	References []Reference `json:"references"`
	SplitRatio float64     `json:"splitRatio"`
	Version    int         `json:"version"`
}

