// Package workspace owns Workspace metadata plus the hydrated compatibility view exposed to clients.\n// Note and Canvas authored state have independent persistence/version boundaries.
package workspace

import (
	"context"
	"crypto/rand"
	"encoding/json"
	"errors"
	"strings"
	"time"
	"unicode/utf8"
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

type CategoryStore interface {
	CreateCategory(context.Context, CategorySummary) error
	UpdateCategory(context.Context, string, string) (CategorySummary, error)
	ListCategories(context.Context) ([]CategorySummary, error)
	CategoryExists(context.Context, string) (bool, error)
}

type WorkspaceStore interface {
	Create(context.Context, Workspace) error
	List(context.Context) ([]Summary, error)
	ListRecent(context.Context, int) ([]Summary, error)
	ListWorkspaces(context.Context, WorkspaceQuery) (WorkspacePage, error)
	Move(context.Context, string, string) (Workspace, error)
	Get(context.Context, string) (Workspace, error)
	Update(context.Context, string, Update) (Workspace, error)
}

type SearchStore interface {
	Search(context.Context, string) ([]SearchResult, error)
}

type HistoryStore interface {
	ListHistory(context.Context, string) ([]HistoryEntry, error)
	GetHistory(context.Context, string, string) (HistorySnapshot, error)
	CreateHistory(context.Context, HistorySnapshot) error
}

// Store is the composition used by the application service. Tests and future
// adapters may depend on the narrower capability interfaces above.
type Store interface {
	CategoryStore
	WorkspaceStore
	GranularStore
	WorkspaceQueryStore
	SearchStore
	HistoryStore
}

type Service struct{ Store Store }

func NewService(store Store) Service {
	if store == nil {
		panic("workspace: store is required")
	}
	return Service{Store: store}
}

func ValidTitle(title string) bool {
	return strings.TrimSpace(title) != "" && utf8.RuneCountInString(title) <= 160
}

// ValidateWorkspace is the domain boundary for complete aggregate snapshots.
// Persistence imports and other adapters must use the same rules as ordinary
// updates before accepting externally supplied workspace data.
func ValidateWorkspace(p Workspace) error {
	if strings.TrimSpace(p.ID) == "" || strings.TrimSpace(p.CategoryID) == "" || !ValidTitle(p.Title) || p.Version < 1 || p.SplitRatio < .25 || p.SplitRatio > .7 || !validDocument(p.Document) || !validCanvas(p.Canvas) || !validReferences(p.References) || !validNotes(p.Notes) {
		return ErrInvalid
	}
	return nil
}

func ValidateHistorySnapshot(snapshot HistorySnapshot) error {
	if strings.TrimSpace(snapshot.ID) == "" || strings.TrimSpace(snapshot.WorkspaceID) == "" || !ValidTitle(snapshot.Title) || snapshot.Version < 1 || snapshot.SplitRatio < .25 || snapshot.SplitRatio > .7 || !validDocument(snapshot.Document) || !validCanvas(snapshot.Canvas) || !validReferences(snapshot.References) || !validNotes(snapshot.Notes) {
		return ErrInvalid
	}
	return nil
}

func (s Service) CreateCategory(
	ctx context.Context,
	title string,
) (CategorySummary, error) {
	title = strings.TrimSpace(title)
	if !ValidTitle(title) {
		return CategorySummary{}, ErrInvalid
	}
	now := time.Now().UTC().Format(time.RFC3339Nano)
	category := CategorySummary{
		ID:        rand.Text(),
		Title:     title,
		CreatedAt: now,
		UpdatedAt: now,
	}
	return category, s.Store.CreateCategory(ctx, category)
}

func (s Service) UpdateCategory(ctx context.Context, id, title string) (CategorySummary, error) {
	title = strings.TrimSpace(title)
	if strings.TrimSpace(id) == "" || !ValidTitle(title) {
		return CategorySummary{}, ErrInvalid
	}
	return s.Store.UpdateCategory(ctx, id, title)
}

func (s Service) Rename(ctx context.Context, id, title string) (Workspace, error) {
	title = strings.TrimSpace(title)
	if strings.TrimSpace(id) == "" || !ValidTitle(title) {
		return Workspace{}, ErrInvalid
	}
	current, err := s.Store.Get(ctx, id)
	if err != nil {
		return Workspace{}, err
	}
	return s.Update(ctx, id, Update{
		Title:      title,
		Document:   current.Document,
		Notes:      current.Notes,
		Canvas:     current.Canvas,
		References: current.References,
		SplitRatio: current.SplitRatio,
		Version:    current.Version,
	})
}

func (s Service) Move(ctx context.Context, id, categoryID string) (Workspace, error) {
	if strings.TrimSpace(id) == "" || strings.TrimSpace(categoryID) == "" {
		return Workspace{}, ErrInvalid
	}
	exists, err := s.Store.CategoryExists(ctx, categoryID)
	if err != nil {
		return Workspace{}, err
	}
	if !exists {
		return Workspace{}, ErrNotFound
	}
	return s.Store.Move(ctx, id, categoryID)
}

func (s Service) Create(
	ctx context.Context,
	title string,
	categoryID ...string,
) (Workspace, error) {
	title = strings.TrimSpace(title)
	if !ValidTitle(title) {
		return Workspace{}, ErrInvalid
	}
	category := UncategorizedCategoryID
	if len(categoryID) > 0 && strings.TrimSpace(categoryID[0]) != "" {
		category = strings.TrimSpace(categoryID[0])
	}
	exists, err := s.Store.CategoryExists(ctx, category)
	if err != nil {
		return Workspace{}, err
	}
	if !exists {
		return Workspace{}, ErrInvalid
	}
	now := time.Now().UTC().Format(time.RFC3339Nano)
	p := Workspace{
		Summary: Summary{
			ID:         rand.Text(),
			CategoryID: category,
			Title:      title,
			CreatedAt:  now,
			UpdatedAt:  now,
			Version:    1,
		},
		Document:      Snapshot{Format: "tiptap", Version: 1, Data: json.RawMessage(`{"type":"doc","content":[{"type":"paragraph"}]}`)},
		Notes:         []Note{{ID: rand.Text(), Title: "Untitled", Document: Snapshot{Format: "tiptap", Version: 1, Data: json.RawMessage(`{"type":"doc","content":[{"type":"paragraph"}]}`)}, CreatedAt: now, UpdatedAt: now, Version: 1}},
		Canvas:        Snapshot{Format: "excalidraw", Version: 1, Data: json.RawMessage(`{"elements":[],"appState":{},"files":{}}`)},
		CanvasVersion: 1,
		References:    []Reference{},
		SplitRatio:    0.45,
	}
	if err := s.Store.Create(ctx, p); err != nil {
		return Workspace{}, err
	}
	return s.Get(ctx, p.ID)
}

func (s Service) Update(ctx context.Context, id string, u Update) (Workspace, error) {
	u.Title = strings.TrimSpace(u.Title)
	notesOmitted := u.Notes == nil
	if u.References == nil || notesOmitted {
		current, err := s.Store.Get(ctx, id)
		if err != nil {
			return Workspace{}, err
		}
		if u.References == nil {
			u.References = current.References
		}
		if notesOmitted {
			u.Notes = append([]Note(nil), current.Notes...)
			if len(u.Notes) > 0 {
				u.Notes[0].Document = u.Document
			}
		}
	}
	if len(u.Notes) > 0 {
		// Notes are canonical authored state. The legacy top-level Document
		// remains a compatibility projection of the first Note.
		u.Document = u.Notes[0].Document
	}
	if !ValidTitle(u.Title) || u.Version < 1 || u.SplitRatio < .25 || u.SplitRatio > .7 || !validDocument(u.Document) || !validCanvas(u.Canvas) || !validReferences(u.References) || !validNotes(u.Notes) {
		return Workspace{}, ErrInvalid
	}
	value, err := s.Store.Update(ctx, id, u)
	if err != nil {
		return Workspace{}, err
	}
	return s.hydrateGranularState(ctx, value)
}

func validNotes(notes []Note) bool {
	if len(notes) == 0 || len(notes) > 100 {
		return false
	}
	seen := map[string]bool{}
	for _, note := range notes {
		if note.ID == "" || seen[note.ID] || !ValidTitle(note.Title) || !validDocument(note.Document) {
			return false
		}
		seen[note.ID] = true
	}
	return true
}

func validReferences(references []Reference) bool {
	if len(references) > 1000 {
		return false
	}
	seen := map[string]bool{}
	for _, reference := range references {
		if reference.ID == "" || reference.BlockID == "" || reference.ElementID == "" || seen[reference.ID] {
			return false
		}
		seen[reference.ID] = true
	}
	return true
}

func validDocument(s Snapshot) bool {
	if s.Format != "tiptap" || s.Version != 1 {
		return false
	}
	var doc struct {
		Type    string            `json:"type"`
		Content []json.RawMessage `json:"content"`
	}
	return json.Unmarshal(s.Data, &doc) == nil && doc.Type == "doc" && doc.Content != nil
}

func validCanvas(s Snapshot) bool {
	if s.Format != "excalidraw" || s.Version != 1 {
		return false
	}
	var scene struct {
		Elements []map[string]json.RawMessage `json:"elements"`
		AppState map[string]json.RawMessage   `json:"appState"`
		Files    map[string]json.RawMessage   `json:"files"`
	}
	return json.Unmarshal(s.Data, &scene) == nil && scene.Elements != nil && scene.AppState != nil && scene.Files != nil
}
