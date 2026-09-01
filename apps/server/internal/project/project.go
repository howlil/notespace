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
)

type Snapshot struct {
	Format  string          `json:"format"`
	Version int             `json:"version"`
	Data    json.RawMessage `json:"data"`
}

type Summary struct {
	ID        string `json:"id"`
	Title     string `json:"title"`
	CreatedAt string `json:"createdAt"`
	UpdatedAt string `json:"updatedAt"`
	Version   int    `json:"version"`
}

// Reference is a product-owned relationship between one document block and one
// canvas object. Targets may be absent after ordinary editing and are repaired
// by the client rather than silently reassigned by the server.
type Reference struct {
	ID	string	`json:"id"`
	BlockID	string	`json:"blockId"`
	ElementID	string	`json:"elementId"`
}

type Project struct {
	Summary
	Document	Snapshot	`json:"document"`
	Canvas	Snapshot	`json:"canvas"`
	References	[]Reference	`json:"references"`
	SplitRatio	float64	`json:"splitRatio"`
}

// Update is a complete authored snapshot; Version is an optimistic concurrency guard.
type Update struct {
	Title	string	`json:"title"`
	Document	Snapshot	`json:"document"`
	Canvas	Snapshot	`json:"canvas"`
	References	[]Reference	`json:"references"`
	SplitRatio	float64	`json:"splitRatio"`
	Version	int	`json:"version"`
}

type Store interface {
	Create(context.Context, Project) error
	List(context.Context) ([]Summary, error)
	Get(context.Context, string) (Project, error)
	Update(context.Context, string, Update) (Project, error)
	Delete(context.Context, string) error
}

type Service struct{ Store Store }

func ValidTitle(title string) bool {
	return strings.TrimSpace(title) != "" && utf8.RuneCountInString(title) <= 160
}

func (s Service) Create(ctx context.Context, title string) (Project, error) {
	title = strings.TrimSpace(title)
	if !ValidTitle(title) {
		return Project{}, ErrInvalid
	}
	now := time.Now().UTC().Format(time.RFC3339Nano)
	p := Project{
		Summary:    Summary{ID: rand.Text(), Title: title, CreatedAt: now, UpdatedAt: now, Version: 1},
		Document:   Snapshot{Format: "tiptap", Version: 1, Data: json.RawMessage(`{"type":"doc","content":[{"type":"paragraph"}]}`)},
		Canvas:     Snapshot{Format: "excalidraw", Version: 1, Data: json.RawMessage(`{"elements":[],"appState":{},"files":{}}`)},
		References: []Reference{},
		SplitRatio: 0.45,
	}
	return p, s.Store.Create(ctx, p)
}

func (s Service) Update(ctx context.Context, id string, u Update) (Project, error) {
	u.Title = strings.TrimSpace(u.Title)
	if !ValidTitle(u.Title) || u.Version < 1 || u.SplitRatio < .25 || u.SplitRatio > .7 || !validDocument(u.Document) || !validCanvas(u.Canvas) || !validReferences(u.References) {
		return Project{}, ErrInvalid
	}
	return s.Store.Update(ctx, id, u)
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
