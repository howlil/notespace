package workspace

import (
	"encoding/json"
	"strings"
	"unicode/utf8"
)

func ValidTitle(title string) bool {
	return strings.TrimSpace(title) != "" && utf8.RuneCountInString(title) <= 160
}

func ValidateWorkspace(p Workspace) error {
	if strings.TrimSpace(p.ID) == "" || strings.TrimSpace(p.CategoryID) == "" || !ValidTitle(p.Title) || p.Version < 1 || !validCanvas(p.Canvas) {
		return ErrInvalid
	}
	return nil
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

// CountActiveCanvasElements parses an Excalidraw scene and counts non-deleted elements.
func CountActiveCanvasElements(s Snapshot) (int, error) {
	var scene struct {
		Elements []struct {
			IsDeleted bool `json:"isDeleted"`
		} `json:"elements"`
	}
	if err := json.Unmarshal(s.Data, &scene); err != nil {
		return 0, err
	}
	count := 0
	for _, element := range scene.Elements {
		if !element.IsDeleted {
			count++
		}
	}
	return count, nil
}
