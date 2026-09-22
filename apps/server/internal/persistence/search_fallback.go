package persistence

import (
	"context"
	"encoding/json"
	"strings"

	"github.com/howlil/notespace/apps/server/internal/project"
)

func (s *Store) Search(ctx context.Context, query string) ([]project.SearchResult, error) {
	query = strings.ToLower(strings.TrimSpace(query))
	if query == "" {
		return []project.SearchResult{}, nil
	}
	projects, err := s.List(ctx)
	if err != nil {
		return nil, err
	}
	categories, err := s.ListCategories(ctx)
	if err != nil {
		return nil, err
	}
	results := make([]project.SearchResult, 0)
	for _, category := range categories {
		if strings.Contains(strings.ToLower(category.Title), query) {
			results = append(results, project.SearchResult{Type: "category", CategoryID: category.ID, CategoryTitle: category.Title, Excerpt: category.Title})
		}
	}
	for _, summary := range projects {
		p, err := s.Get(ctx, summary.ID)
		if err != nil {
			return nil, err
		}
		categoryTitle := ""
		for _, category := range categories {
			if category.ID == p.CategoryID {
				categoryTitle = category.Title
				break
			}
		}
		if strings.Contains(strings.ToLower(p.Title), query) {
			results = append(results, project.SearchResult{Type: "workspace", CategoryID: p.CategoryID, CategoryTitle: categoryTitle, WorkspaceID: p.ID, WorkspaceTitle: p.Title, Excerpt: p.Title})
		}
		for _, note := range p.Notes {
			base := project.SearchResult{Type: "note", CategoryID: p.CategoryID, CategoryTitle: categoryTitle, WorkspaceID: p.ID, WorkspaceTitle: p.Title, NoteID: note.ID, NoteTitle: note.Title}
			if strings.Contains(strings.ToLower(note.Title), query) {
				base.Excerpt = note.Title
				results = append(results, base)
			}
			walkSearch(note.Document.Data, func(blockID, text string) {
				if strings.Contains(strings.ToLower(text), query) {
					result := base
					result.Type = "block"
					result.BlockID = blockID
					result.Excerpt = excerpt(text, query)
					results = append(results, result)
				}
			})
		}
	}
	return results, nil
}

func walkSearch(value json.RawMessage, visit func(string, string)) {
	var node any
	if json.Unmarshal(value, &node) != nil {
		return
	}
	var walk func(any, string)
	walk = func(value any, parentBlockID string) {
		if object, ok := value.(map[string]any); ok {
			blockID := parentBlockID
			if attrs, ok := object["attrs"].(map[string]any); ok {
				if candidate, ok := attrs["blockId"].(string); ok {
					blockID = candidate
				}
			}
			if text, ok := object["text"].(string); ok {
				visit(blockID, text)
			}
			for _, child := range object {
				walk(child, blockID)
			}
			return
		}
		if list, ok := value.([]any); ok {
			for _, child := range list {
				walk(child, parentBlockID)
			}
		}
	}
	walk(node, "")
}

func excerpt(text, query string) string {
	text = strings.TrimSpace(text)
	runes := []rune(text)
	if len(runes) <= 140 {
		return text
	}
	index := runeIndexFold(text, query)
	if index < 0 {
		return string(runes[:140]) + "…"
	}
	start := index - 55
	if start < 0 {
		start = 0
	}
	end := start + 140
	if end > len(runes) {
		end = len(runes)
	}
	return string(runes[start:end])
}

func runeIndexFold(text, query string) int {
	haystack := []rune(strings.ToLower(text))
	needle := []rune(strings.ToLower(strings.TrimSpace(query)))
	if len(needle) == 0 {
		return 0
	}
	if len(needle) > len(haystack) {
		return -1
	}
	for start := 0; start <= len(haystack)-len(needle); start++ {
		matched := true
		for offset := range needle {
			if haystack[start+offset] != needle[offset] {
				matched = false
				break
			}
		}
		if matched {
			return start
		}
	}
	return -1
}
