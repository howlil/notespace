package domain

import (
	"bytes"
	"encoding/json"
)

type CanvasSnapshot struct {
	Format  string          `json:"format"`
	Version int             `json:"version"`
	Data    json.RawMessage `json:"data"`
}

type CanvasState struct {
	Canvas    CanvasSnapshot `json:"canvas"`
	Version   int            `json:"version"`
	UpdatedAt string         `json:"updatedAt"`
}

type CanvasUpdate struct {
	Canvas  CanvasSnapshot `json:"canvas"`
	Version int            `json:"version"`
}

// CanvasPlacement describes an active Canvas Note element inside an Excalidraw scene.
type CanvasPlacement struct {
	ElementID  string
	NoteID     string
	InstanceID string
	X          float64
	Y          float64
	Width      float64
	Height     float64
	Compact    *bool
}

// ParsedScene is a validated Excalidraw canvas snapshot decoded in a single
// JSON pass, exposing element counts and Note placements without re-parsing.
type ParsedScene struct {
	snapshot           CanvasSnapshot
	activeElementCount int
	placements         []CanvasPlacement
	allReferences      []CanvasPlacement
}

type rawExcalidrawScene struct {
	Elements []json.RawMessage          `json:"elements"`
	AppState map[string]json.RawMessage `json:"appState"`
	Files    map[string]json.RawMessage `json:"files"`
}

type rawExcalidrawElement struct {
	ID         string  `json:"id"`
	IsDeleted  bool    `json:"isDeleted"`
	X          float64 `json:"x"`
	Y          float64 `json:"y"`
	Width      float64 `json:"width"`
	Height     float64 `json:"height"`
	CustomData struct {
		Reference struct {
			NoteID     string `json:"noteId"`
			InstanceID string `json:"instanceId"`
			Compact    *bool  `json:"compact"`
		} `json:"notespaceNote"`
	} `json:"customData"`
}

// ParseScene validates an Excalidraw snapshot and extracts active element count
// plus all live Canvas Note placements in one pass.
func ParseScene(snapshot CanvasSnapshot) (ParsedScene, error) {
	if snapshot.Format != "excalidraw" || snapshot.Version != 1 || len(snapshot.Data) == 0 || !json.Valid(snapshot.Data) {
		return ParsedScene{}, ErrWorkspaceInvalid
	}
	var scene rawExcalidrawScene
	if err := json.Unmarshal(snapshot.Data, &scene); err != nil || scene.Elements == nil || scene.AppState == nil || scene.Files == nil {
		return ParsedScene{}, ErrWorkspaceInvalid
	}

	activeCount := 0
	var placements []CanvasPlacement
	var allRefs []CanvasPlacement
	for _, rawElem := range scene.Elements {
		// Ensure every element is a JSON object (rejects corrupt scalars like [123]).
		var objectCheck map[string]json.RawMessage
		if err := json.Unmarshal(rawElem, &objectCheck); err != nil || objectCheck == nil {
			return ParsedScene{}, ErrWorkspaceInvalid
		}
		var elem rawExcalidrawElement
		if err := json.Unmarshal(rawElem, &elem); err != nil {
			return ParsedScene{}, ErrWorkspaceInvalid
		}
		ref := elem.CustomData.Reference
		hasRef := ref.NoteID != "" || ref.InstanceID != ""
		var placement CanvasPlacement
		if hasRef {
			placement = CanvasPlacement{
				ElementID:  elem.ID,
				NoteID:     ref.NoteID,
				InstanceID: ref.InstanceID,
				X:          elem.X,
				Y:          elem.Y,
				Width:      elem.Width,
				Height:     elem.Height,
				Compact:    ref.Compact,
			}
			allRefs = append(allRefs, placement)
		}
		if elem.IsDeleted {
			continue
		}
		activeCount++
		if hasRef {
			placements = append(placements, placement)
		}
	}
	return ParsedScene{
		snapshot:           snapshot,
		activeElementCount: activeCount,
		placements:         placements,
		allReferences:      allRefs,
	}, nil
}

func (p ParsedScene) Snapshot() CanvasSnapshot      { return p.snapshot }
func (p ParsedScene) ActiveElementCount() int       { return p.activeElementCount }
func (p ParsedScene) Placements() []CanvasPlacement { return p.placements }

func (p ParsedScene) HasReference(elementID, noteID, instanceID string) bool {
	for _, ref := range p.allReferences {
		if ref.ElementID == elementID && ref.NoteID == noteID && ref.InstanceID == instanceID {
			return true
		}
	}
	return false
}

func (p ParsedScene) LiveInstanceIDs(noteID string) map[string]bool {
	live := map[string]bool{}
	for _, placement := range p.placements {
		if placement.NoteID == noteID && placement.InstanceID != "" {
			live[placement.InstanceID] = true
		}
	}
	return live
}

// ParseSceneData decodes an already-stored Excalidraw scene payload when only
// raw scene JSON is present (such as live placement inspection on delete).
func ParseSceneData(data json.RawMessage) (ParsedScene, error) {
	var scene struct {
		Elements []rawExcalidrawElement `json:"elements"`
	}
	if err := json.Unmarshal(data, &scene); err != nil {
		return ParsedScene{}, ErrNoteInvalid
	}
	activeCount := 0
	var placements []CanvasPlacement
	for _, elem := range scene.Elements {
		if elem.IsDeleted {
			continue
		}
		activeCount++
		ref := elem.CustomData.Reference
		if ref.NoteID != "" || ref.InstanceID != "" {
			placements = append(placements, CanvasPlacement{
				ElementID:  elem.ID,
				NoteID:     ref.NoteID,
				InstanceID: ref.InstanceID,
				X:          elem.X,
				Y:          elem.Y,
				Width:      elem.Width,
				Height:     elem.Height,
				Compact:    ref.Compact,
			})
		}
	}
	return ParsedScene{
		snapshot:           CanvasSnapshot{Format: "excalidraw", Version: 1, Data: data},
		activeElementCount: activeCount,
		placements:         placements,
	}, nil
}

// ScrubRetiredSnapshot removes retired `notespaceNoteArtifact` elements from an
// Excalidraw canvas snapshot while preserving live `notespaceNote` elements and
// returning whether the scene changed along with the remaining active element count.
func ScrubRetiredSnapshot(snapshot CanvasSnapshot) (CanvasSnapshot, bool, int, error) {
	if len(bytes.TrimSpace(snapshot.Data)) == 0 {
		return snapshot, false, 0, nil
	}
	var scene map[string]json.RawMessage
	if err := json.Unmarshal(snapshot.Data, &scene); err != nil {
		return CanvasSnapshot{}, false, 0, err
	}
	if scene == nil {
		return snapshot, false, 0, nil
	}
	rawElements, ok := scene["elements"]
	if !ok || bytes.Equal(bytes.TrimSpace(rawElements), []byte("null")) {
		return snapshot, false, 0, nil
	}
	var elements []json.RawMessage
	if err := json.Unmarshal(rawElements, &elements); err != nil {
		return CanvasSnapshot{}, false, 0, err
	}
	filtered := make([]json.RawMessage, 0, len(elements))
	changed := false
	elementCount := 0
	for _, element := range elements {
		var object map[string]json.RawMessage
		if err := json.Unmarshal(element, &object); err != nil {
			return CanvasSnapshot{}, false, 0, err
		}
		var customData map[string]json.RawMessage
		if rawCustomData, ok := object["customData"]; ok && json.Unmarshal(rawCustomData, &customData) == nil {
			if _, retired := customData["notespaceNoteArtifact"]; retired {
				changed = true
				continue
			}
		}
		filtered = append(filtered, element)
		var state struct {
			IsDeleted bool `json:"isDeleted"`
		}
		if json.Unmarshal(element, &state) == nil && !state.IsDeleted {
			elementCount++
		}
	}
	if !changed {
		return snapshot, false, elementCount, nil
	}
	encodedElements, err := json.Marshal(filtered)
	if err != nil {
		return CanvasSnapshot{}, false, 0, err
	}
	scene["elements"] = encodedElements
	snapshot.Data, err = json.Marshal(scene)
	if err != nil {
		return CanvasSnapshot{}, false, 0, err
	}
	return snapshot, true, elementCount, nil
}
