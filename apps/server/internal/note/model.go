package note

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"math"
	"net/url"
	"strings"
	"unicode/utf8"
)

const (
	SchemaVersion       = 1
	MaxDocumentBytes    = 1 << 20
	MaxDocumentDepth    = 64
	MaxDocumentNodes    = 10000
	MaxNoteIDLength     = 128
	MaxRequestIDLength  = 128
	MaxInstanceIDLength = 128
)

var (
	ErrNotFound = errors.New("note not found")
	ErrConflict = errors.New("note changed in another session")
	ErrInvalid  = errors.New("invalid note input")
)

// CanvasSnapshot is intentionally transport-neutral. The Canvas owns the
// scene; the Note capability only validates and atomically updates the scene
// supplied with a create/remove command.
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

type Note struct {
	ID            string          `json:"id"`
	SchemaVersion int             `json:"schemaVersion"`
	Revision      int             `json:"revision"`
	Document      json.RawMessage `json:"document"`
	CreatedAt     string          `json:"createdAt"`
	UpdatedAt     string          `json:"updatedAt"`
}

type Backlink struct {
	NoteID         string `json:"noteId"`
	WorkspaceID    string `json:"workspaceId,omitempty"`
	WorkspaceTitle string `json:"workspaceTitle,omitempty"`
	InstanceID     string `json:"instanceId,omitempty"`
	ElementID      string `json:"elementId,omitempty"`
	Excerpt        string `json:"excerpt"`
}

type Instance struct {
	ID          string  `json:"id"`
	NoteID      string  `json:"noteId"`
	WorkspaceID string  `json:"workspaceId"`
	ElementID   string  `json:"elementId"`
	X           float64 `json:"x"`
	Y           float64 `json:"y"`
	Width       float64 `json:"width"`
	Height      float64 `json:"height"`
	Compact     bool    `json:"compact"`
	CreatedAt   string  `json:"createdAt"`
	UpdatedAt   string  `json:"updatedAt"`
}

type CreateInstanceRequest struct {
	ClientRequestID       string          `json:"clientRequestId"`
	ClientNoteID          string          `json:"clientNoteId"`
	ClientInstanceID      string          `json:"clientInstanceId"`
	ExistingNoteID        string          `json:"existingNoteId,omitempty"`
	ElementID             string          `json:"elementId"`
	ExpectedCanvasVersion int             `json:"expectedCanvasVersion"`
	Document              json.RawMessage `json:"document,omitempty"`
	Canvas                CanvasSnapshot  `json:"canvas"`
	X                     float64         `json:"x"`
	Y                     float64         `json:"y"`
	Width                 float64         `json:"width"`
	Height                float64         `json:"height"`
	Compact               bool            `json:"compact"`
}

type CreateInstanceResult struct {
	Note     Note        `json:"note"`
	Instance Instance    `json:"instance"`
	Canvas   CanvasState `json:"canvas"`
}

type UpdateRequest struct {
	Document         json.RawMessage `json:"document"`
	ExpectedRevision int             `json:"expectedRevision"`
}

type DeleteInstanceRequest struct {
	ExpectedCanvasVersion int            `json:"expectedCanvasVersion"`
	Canvas                CanvasSnapshot `json:"canvas"`
}

type Store interface {
	GetNote(context.Context, string) (Note, error)
	ListBacklinks(context.Context, string) ([]Backlink, error)
	UpdateNote(context.Context, string, UpdateRequest) (Note, error)
	CreateNoteInstance(context.Context, string, CreateInstanceRequest) (CreateInstanceResult, error)
	DeleteNoteInstance(context.Context, string, string, DeleteInstanceRequest) (CanvasState, error)
}

func ValidateNote(value Note) error {
	if !ValidateID(value.ID, MaxNoteIDLength) || value.SchemaVersion != SchemaVersion || value.Revision < 1 || ValidateDocument(value.Document) != nil || value.CreatedAt == "" || value.UpdatedAt == "" {
		return ErrInvalid
	}
	return nil
}

func ValidateInstance(value Instance, workspaceID string) error {
	if !ValidateID(value.ID, MaxInstanceIDLength) || !ValidateID(value.NoteID, MaxNoteIDLength) || !ValidateID(value.WorkspaceID, MaxNoteIDLength) || value.WorkspaceID != workspaceID || !ValidateID(value.ElementID, MaxInstanceIDLength) || !ValidateGeometry(value.X, value.Y, value.Width, value.Height) || value.CreatedAt == "" || value.UpdatedAt == "" {
		return ErrInvalid
	}
	return nil
}

func ValidateDocument(document json.RawMessage) error {
	if len(document) == 0 || len(document) > MaxDocumentBytes || !json.Valid(document) {
		return ErrInvalid
	}
	decoder := json.NewDecoder(bytes.NewReader(document))
	decoder.UseNumber()
	var root map[string]any
	if err := decoder.Decode(&root); err != nil || root["type"] != "doc" {
		return ErrInvalid
	}
	content, ok := root["content"].([]any)
	if !ok {
		return ErrInvalid
	}
	nodes := 0
	if !validateNodes(content, 0, &nodes) {
		return ErrInvalid
	}
	return nil
}

func validateNodes(nodes []any, depth int, count *int) bool {
	if depth > MaxDocumentDepth {
		return false
	}
	for _, raw := range nodes {
		(*count)++
		if *count > MaxDocumentNodes {
			return false
		}
		node, ok := raw.(map[string]any)
		if !ok {
			return false
		}
		nodeType, ok := node["type"].(string)
		if !ok || strings.TrimSpace(nodeType) == "" || utf8.RuneCountInString(nodeType) > 64 {
			return false
		}
		if !validateNodeAttrs(nodeType, node["attrs"]) {
			return false
		}
		if text, exists := node["text"]; exists {
			if value, ok := text.(string); !ok || !utf8.ValidString(value) {
				return false
			}
		}
		if marks, exists := node["marks"]; exists {
			items, ok := marks.([]any)
			if !ok || !validateMarks(items) {
				return false
			}
		}
		if child, exists := node["content"]; exists {
			children, ok := child.([]any)
			if !ok || !validateNodes(children, depth+1, count) {
				return false
			}
		}
	}
	return true
}

func validateNodeAttrs(nodeType string, raw any) bool {
	attrs, hasAttrs := raw.(map[string]any)
	if nodeType == "noteImage" || nodeType == "noteEmbed" || nodeType == "noteBlockReference" {
		if !hasAttrs {
			return false
		}
	}
	if !hasAttrs {
		return true
	}
	if blockID, exists := attrs["blockId"]; exists {
		value, ok := blockID.(string)
		if !ok || !ValidateID(value, MaxInstanceIDLength) {
			return false
		}
	}
	switch nodeType {
	case "noteCallout":
		if tone, exists := attrs["tone"]; exists {
			value, ok := tone.(string)
			if !ok || !validCalloutTone(value) {
				return false
			}
		}
	case "noteImage":
		if src, exists := attrs["src"]; exists {
			value, ok := src.(string)
			if !ok || !safeAssetSource(value) {
				return false
			}
		}
		if assetID, exists := attrs["assetId"]; exists {
			value, ok := assetID.(string)
			if !ok || !ValidateID(value, MaxInstanceIDLength) {
				return false
			}
		}
		if alt, exists := attrs["alt"]; exists {
			value, ok := alt.(string)
			if !ok || !utf8.ValidString(value) || utf8.RuneCountInString(value) > 512 {
				return false
			}
		}
	case "noteEmbed":
		if !validateReferenceAttrs(attrs, false) {
			return false
		}
	case "noteBlockReference":
		if !validateReferenceAttrs(attrs, true) {
			return false
		}
	}
	return true
}

func validCalloutTone(value string) bool {
	switch value {
	case "note", "info", "tip", "warning", "danger":
		return true
	default:
		return false
	}
}

func validateReferenceAttrs(attrs map[string]any, requireBlock bool) bool {
	noteID, ok := attrs["noteId"].(string)
	if !ok || !ValidateID(noteID, MaxNoteIDLength) {
		return false
	}
	if workspaceID, exists := attrs["workspaceId"]; exists {
		value, ok := workspaceID.(string)
		if !ok || (value != "" && !ValidateID(value, MaxNoteIDLength)) {
			return false
		}
	}
	if requireBlock {
		blockID, ok := attrs["blockId"].(string)
		if !ok || !ValidateID(blockID, MaxInstanceIDLength) {
			return false
		}
	}
	return true
}

func safeAssetSource(value string) bool {
	value = strings.TrimSpace(value)
	if value == "" || strings.ContainsAny(value, "\r\n") || strings.HasPrefix(value, "//") {
		return false
	}
	parsed, err := url.Parse(value)
	return err == nil && parsed.Scheme == "" && parsed.Host == "" && strings.HasPrefix(parsed.Path, "/api/workspaces/")
}

func validateMarks(marks []any) bool {
	for _, raw := range marks {
		mark, ok := raw.(map[string]any)
		if !ok {
			return false
		}
		markType, ok := mark["type"].(string)
		if !ok || strings.TrimSpace(markType) == "" {
			return false
		}
		if markType != "link" {
			continue
		}
		attrs, ok := mark["attrs"].(map[string]any)
		href, hrefOK := attrs["href"].(string)
		if !ok || !hrefOK || !safeLink(href) {
			return false
		}
	}
	return true
}

func safeLink(value string) bool {
	value = strings.TrimSpace(value)
	if strings.ContainsAny(value, "\r\n") {
		return false
	}
	if strings.HasPrefix(value, "/") && !strings.HasPrefix(value, "//") {
		parsed, err := url.Parse(value)
		return err == nil && parsed.Scheme == "" && parsed.Host == "" && strings.HasPrefix(parsed.Path, "/workspaces/") && strings.TrimPrefix(parsed.Path, "/workspaces/") != ""
	}
	parsed, err := url.Parse(value)
	if err != nil || parsed.Scheme == "" || parsed.Host == "" && parsed.Scheme != "mailto" {
		return false
	}
	switch strings.ToLower(parsed.Scheme) {
	case "http", "https", "mailto":
		return true
	default:
		return false
	}
}

func ValidateCanvas(canvas CanvasSnapshot) error {
	if canvas.Format != "excalidraw" || canvas.Version != 1 || len(canvas.Data) == 0 || !json.Valid(canvas.Data) {
		return ErrInvalid
	}
	var scene struct {
		Elements []json.RawMessage `json:"elements"`
		AppState json.RawMessage   `json:"appState"`
		Files    json.RawMessage   `json:"files"`
	}
	if err := json.Unmarshal(canvas.Data, &scene); err != nil || scene.Elements == nil || len(scene.AppState) == 0 || len(scene.Files) == 0 {
		return ErrInvalid
	}
	return nil
}

func ValidateID(value string, max int) bool {
	return value != "" && len(value) <= max && strings.TrimSpace(value) == value && !strings.ContainsAny(value, "/\\")
}

func ValidateGeometry(x, y, width, height float64) bool {
	return !math.IsNaN(x) && !math.IsNaN(y) && !math.IsNaN(width) && !math.IsNaN(height) && !math.IsInf(x, 0) && !math.IsInf(y, 0) && !math.IsInf(width, 0) && !math.IsInf(height, 0) && width >= 160 && width <= 10000 && height >= 48 && height <= 10000
}

func ValidateCreateRequest(request CreateInstanceRequest) error {
	if !(ValidateID(request.ClientRequestID, MaxRequestIDLength) && ValidateID(request.ClientNoteID, MaxNoteIDLength) && ValidateID(request.ClientInstanceID, MaxInstanceIDLength) && ValidateID(request.ElementID, MaxInstanceIDLength) && request.ExpectedCanvasVersion >= 1 && ValidateGeometry(request.X, request.Y, request.Width, request.Height) && ValidateCanvas(request.Canvas) == nil) {
		return ErrInvalid
	}
	if request.ExistingNoteID == "" {
		if ValidateDocument(request.Document) != nil {
			return ErrInvalid
		}
	} else if !ValidateID(request.ExistingNoteID, MaxNoteIDLength) || request.ExistingNoteID != request.ClientNoteID {
		return ErrInvalid
	}
	if !canvasHasReference(request.Canvas, request.ElementID, request.ClientNoteID, request.ClientInstanceID) {
		return ErrInvalid
	}
	return nil
}

func ValidateUpdateRequest(request UpdateRequest) error {
	if request.ExpectedRevision < 1 || ValidateDocument(request.Document) != nil {
		return ErrInvalid
	}
	return nil
}

func ValidateDeleteRequest(request DeleteInstanceRequest) error {
	if request.ExpectedCanvasVersion < 1 || ValidateCanvas(request.Canvas) != nil {
		return ErrInvalid
	}
	return nil
}

func canvasHasReference(canvas CanvasSnapshot, elementID, noteID, instanceID string) bool {
	var scene struct {
		Elements []struct {
			ID         string `json:"id"`
			IsDeleted  bool   `json:"isDeleted"`
			CustomData struct {
				Reference struct {
					NoteID     string `json:"noteId"`
					InstanceID string `json:"instanceId"`
				} `json:"notespaceNote"`
			} `json:"customData"`
		} `json:"elements"`
	}
	if json.Unmarshal(canvas.Data, &scene) != nil {
		return false
	}
	for _, element := range scene.Elements {
		if element.ID == elementID && !element.IsDeleted && element.CustomData.Reference.NoteID == noteID && element.CustomData.Reference.InstanceID == instanceID {
			return true
		}
	}
	return false
}
