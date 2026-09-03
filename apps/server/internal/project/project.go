// Package project owns the single aggregate shared by both editing surfaces.
package project

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
	ErrNotFound = errors.New("project not found")
	ErrConflict = errors.New("project changed in another session")
	ErrInvalid  = errors.New("invalid project input")
	ErrNotEmpty = errors.New("category still contains workspaces")
)

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
	BlockID   string `json:"blockId"`
	ElementID string `json:"elementId"`
}

type Note struct {
	ID        string   `json:"id"`
	Title     string   `json:"title"`
	Document  Snapshot `json:"document"`
	CreatedAt string   `json:"createdAt"`
	UpdatedAt string   `json:"updatedAt"`
}

type Project struct {
	Summary
	Document   Snapshot    `json:"document"`
	Notes      []Note      `json:"notes"`
	Canvas     Snapshot    `json:"canvas"`
	References []Reference `json:"references"`
	SplitRatio float64     `json:"splitRatio"`
}

type SearchResult struct {
	WorkspaceID string `json:"workspaceId"`
	WorkspaceTitle string `json:"workspaceTitle"`
	NoteID string `json:"noteId"`
	NoteTitle string `json:"noteTitle"`
	BlockID string `json:"blockId"`
	Excerpt string `json:"excerpt"`
}

type HistoryEntry struct {
	ID string `json:"id"`
	WorkspaceID string `json:"workspaceId"`
	Version int `json:"version"`
	Title string `json:"title"`
	CreatedAt string `json:"createdAt"`
}

type HistorySnapshot struct {
	HistoryEntry
	Document Snapshot `json:"document"`
	Notes []Note `json:"notes"`
	Canvas Snapshot `json:"canvas"`
	References []Reference `json:"references"`
	SplitRatio float64 `json:"splitRatio"`
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

type Store interface {
	CreateCategory(context.Context, CategorySummary) error
	UpdateCategory(context.Context, string, string) (CategorySummary, error)
	DeleteCategory(context.Context, string) error
	ListCategories(context.Context) ([]CategorySummary, error)
	CategoryExists(context.Context, string) (bool, error)
	Create(context.Context, Project) error
	List(context.Context) ([]Summary, error)
	Get(context.Context, string) (Project, error)
	Update(context.Context, string, Update) (Project, error)
	Delete(context.Context, string) error
	Search(context.Context, string) ([]SearchResult, error)
	ListHistory(context.Context, string) ([]HistoryEntry, error)
	GetHistory(context.Context, string, string) (HistorySnapshot, error)
	CreateHistory(context.Context, HistorySnapshot) error
}

type Service struct{ Store Store }

func ValidTitle(title string) bool {
	return strings.TrimSpace(title) != "" && utf8.RuneCountInString(title) <= 160
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

func (s Service) Rename(ctx context.Context, id, title string) (Project, error) {
	title = strings.TrimSpace(title)
	if strings.TrimSpace(id) == "" || !ValidTitle(title) {
		return Project{}, ErrInvalid
	}
	current, err := s.Store.Get(ctx, id)
	if err != nil {
		return Project{}, err
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

func (s Service) Create(
	ctx context.Context,
	title string,
	categoryID ...string,
) (Project, error) {
	title = strings.TrimSpace(title)
	if !ValidTitle(title) {
		return Project{}, ErrInvalid
	}
	category := "legacy"
	if len(categoryID) > 0 && strings.TrimSpace(categoryID[0]) != "" {
		category = strings.TrimSpace(categoryID[0])
	}
	exists, err := s.Store.CategoryExists(ctx, category)
	if err != nil {
		return Project{}, err
	}
	if !exists {
		return Project{}, ErrInvalid
	}
	now := time.Now().UTC().Format(time.RFC3339Nano)
	p := Project{
		Summary: Summary{
			ID:         rand.Text(),
			CategoryID: category,
			Title:      title,
			CreatedAt:  now,
			UpdatedAt:  now,
			Version:    1,
		},
		Document:   Snapshot{Format: "tiptap", Version: 1, Data: json.RawMessage(`{"type":"doc","content":[{"type":"paragraph"}]}`)},
		Notes:      []Note{{ID: rand.Text(), Title: "Untitled", Document: Snapshot{Format: "tiptap", Version: 1, Data: json.RawMessage(`{"type":"doc","content":[{"type":"paragraph"}]}`)}, CreatedAt: now, UpdatedAt: now}},
		Canvas:     Snapshot{Format: "excalidraw", Version: 1, Data: json.RawMessage(`{"elements":[],"appState":{},"files":{}}`)},
		References: []Reference{},
		SplitRatio: 0.45,
	}
	return p, s.Store.Create(ctx, p)
}

func (s Service) Update(ctx context.Context, id string, u Update) (Project, error) {
	u.Title = strings.TrimSpace(u.Title)
	if u.References == nil {
		current, err := s.Store.Get(ctx, id)
		if err != nil {
			return Project{}, err
		}
		u.References = current.References
	}
	if u.Notes == nil {
		current, err := s.Store.Get(ctx, id)
		if err != nil {
			return Project{}, err
		}
		u.Notes = current.Notes
	}
	if !ValidTitle(u.Title) || u.Version < 1 || u.SplitRatio < .25 || u.SplitRatio > .7 || !validDocument(u.Document) || !validCanvas(u.Canvas) || !validReferences(u.References) || !validNotes(u.Notes) {
		return Project{}, ErrInvalid
	}
	return s.Store.Update(ctx, id, u)
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
	if references == nil || len(references) > 1000 {
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
