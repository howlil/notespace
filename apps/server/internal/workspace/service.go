package workspace

import (
	"context"
	"crypto/rand"
	"encoding/json"
	"strings"
	"time"
)

type Service struct{ store Store }

func NewService(store Store) Service {
	if store == nil {
		panic("workspace: store is required")
	}
	return Service{store: store}
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
	return category, s.store.CreateCategory(ctx, category)
}

func (s Service) UpdateCategory(ctx context.Context, id, title string) (CategorySummary, error) {
	title = strings.TrimSpace(title)
	if strings.TrimSpace(id) == "" || !ValidTitle(title) {
		return CategorySummary{}, ErrInvalid
	}
	return s.store.UpdateCategory(ctx, id, title)
}

func (s Service) Rename(ctx context.Context, id, title string) (Workspace, error) {
	title = strings.TrimSpace(title)
	if strings.TrimSpace(id) == "" || !ValidTitle(title) {
		return Workspace{}, ErrInvalid
	}
	current, err := s.store.Get(ctx, id)
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
	exists, err := s.store.CategoryExists(ctx, categoryID)
	if err != nil {
		return Workspace{}, err
	}
	if !exists {
		return Workspace{}, ErrNotFound
	}
	return s.store.Move(ctx, id, categoryID)
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
	exists, err := s.store.CategoryExists(ctx, category)
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
	if err := s.store.Create(ctx, p); err != nil {
		return Workspace{}, err
	}
	return s.Get(ctx, p.ID)
}

func (s Service) Update(ctx context.Context, id string, u Update) (Workspace, error) {
	u.Title = strings.TrimSpace(u.Title)
	notesOmitted := u.Notes == nil
	if u.References == nil || notesOmitted {
		current, err := s.store.Get(ctx, id)
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
	value, err := s.store.Update(ctx, id, u)
	if err != nil {
		return Workspace{}, err
	}
	return s.hydrateGranularState(ctx, value)
}
