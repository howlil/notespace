package workspace

import (
	"encoding/json"
	"strings"
	"unicode/utf8"
)

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
