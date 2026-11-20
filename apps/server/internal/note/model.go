package note

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"math"
	"net/url"
	"slices"
	"strings"
	"unicode"
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
	DefaultListLimit    = 50
	MaxListLimit        = 100
	MaxLabelRunes       = 120
	MaxExcerptRunes     = 240

	BacklinkKindLink     = "link"
	BacklinkKindEmbed    = "embed"
	BacklinkKindBlockRef = "blockRef"
)

var (
	ErrNotFound = errors.New("note not found")
	ErrConflict = errors.New("note changed in another session")
	ErrInvalid  = errors.New("invalid note input")
	// ErrNotEmpty rejects deleting a Note that already holds authored content.
	ErrNotEmpty = errors.New("note has content")
	// ErrNoteInUse rejects deleting a Note that a live Canvas element still places.
	ErrNoteInUse = errors.New("note is placed on a Canvas")
	// ErrNoteTrashed rejects editing or placing a Note that is in Trash.
	ErrNoteTrashed = errors.New("note is in Trash")
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
	// DeletedAt is set while the Note is in Trash; the Note stays readable so a
	// Canvas card can show its Trash state, but it cannot be edited or placed.
	DeletedAt string `json:"deletedAt,omitempty"`
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

type ListQuery struct {
	Query    string
	Unplaced bool
	Limit    int
}

type Summary struct {
	ID             string   `json:"id"`
	Label          string   `json:"label"`
	Excerpt        string   `json:"excerpt"`
	PlacementCount int      `json:"placementCount"`
	WorkspaceIDs   []string `json:"workspaceIds"`
	IsEmpty        bool     `json:"isEmpty"`
	CreatedAt      string   `json:"createdAt"`
	UpdatedAt      string   `json:"updatedAt"`
}

type ListResult struct {
	Notes []Summary `json:"notes"`
}

type PlacementInfo struct {
	InstanceID     string `json:"instanceId"`
	WorkspaceID    string `json:"workspaceId"`
	WorkspaceTitle string `json:"workspaceTitle"`
	ElementID      string `json:"elementId"`
	Compact        bool   `json:"compact"`
}

type BacklinkInfo struct {
	NoteID         string `json:"noteId"`
	Label          string `json:"label"`
	WorkspaceID    string `json:"workspaceId"`
	WorkspaceTitle string `json:"workspaceTitle"`
	Kind           string `json:"kind"`
}

type Info struct {
	NoteID     string          `json:"noteId"`
	Placements []PlacementInfo `json:"placements"`
	Backlinks  []BacklinkInfo  `json:"backlinks"`
}

type Store interface {
	GetNote(context.Context, string) (Note, error)
	ListNotes(context.Context, ListQuery) ([]Summary, error)
	GetNoteInfo(context.Context, string) (Info, error)
	UpdateNote(context.Context, string, UpdateRequest) (Note, error)
	CreateNoteInstance(context.Context, string, CreateInstanceRequest) (CreateInstanceResult, error)
	DeleteNoteInstance(context.Context, string, string, DeleteInstanceRequest) (CanvasState, error)
	DeleteEmptyNote(context.Context, string) error
}

// IsEmptyDocument reports whether a document holds no authored text or
// non-paragraph content. Only such Notes may be deleted without losing data.
func IsEmptyDocument(document json.RawMessage) bool {
	var root emptyNode
	if err := json.Unmarshal(document, &root); err != nil || root.Type != "doc" {
		return false
	}
	return emptyContent(root.Content)
}

type emptyNode struct {
	Type    string      `json:"type"`
	Text    *string     `json:"text"`
	Content []emptyNode `json:"content"`
}

func emptyContent(nodes []emptyNode) bool {
	for _, node := range nodes {
		if node.Type != "paragraph" && node.Type != "text" {
			return false
		}
		if node.Text != nil && strings.TrimSpace(*node.Text) != "" {
			return false
		}
		if !emptyContent(node.Content) {
			return false
		}
	}
	return true
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
	if raw == nil {
		return nodeType != "noteImage" && nodeType != "noteEmbed" && nodeType != "noteBlockReference"
	}
	attrs, hasAttrs := raw.(map[string]any)
	if !hasAttrs {
		return false
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
	case "noteToggle":
		if open, exists := attrs["open"]; exists {
			if _, ok := open.(bool); !ok {
				return false
			}
		}
	case "noteToggleSummary":
		return true
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

func validHighlightTone(value string) bool {
	switch value {
	case "yellow", "green", "blue", "pink", "purple", "orange":
		return true
	default:
		return false
	}
}

func validTextColorTone(value string) bool {
	switch value {
	case "muted", "red", "orange", "yellow", "green", "blue", "purple":
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
		switch markType {
		case "link":
			attrs, ok := mark["attrs"].(map[string]any)
			href, hrefOK := attrs["href"].(string)
			if !ok || !hrefOK || !safeLink(href) {
				return false
			}
		case "noteHighlight":
			attrs, ok := mark["attrs"].(map[string]any)
			tone, toneOK := attrs["tone"].(string)
			if !ok || !toneOK || !validHighlightTone(tone) {
				return false
			}
		case "noteTextColor":
			attrs, ok := mark["attrs"].(map[string]any)
			tone, toneOK := attrs["tone"].(string)
			if !ok || !toneOK || !validTextColorTone(tone) {
				return false
			}
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
	placements, err := ExtractCanvasPlacements(canvas.Data)
	if err != nil {
		return false
	}
	for _, placement := range placements {
		if placement.ElementID == elementID && placement.NoteID == noteID && placement.InstanceID == instanceID {
			return true
		}
	}
	return false
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

// ExtractCanvasPlacements decodes active Note placement metadata and geometry from an Excalidraw scene.
func ExtractCanvasPlacements(canvasData json.RawMessage) ([]CanvasPlacement, error) {
	var scene struct {
		Elements []struct {
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
		} `json:"elements"`
	}
	if err := json.Unmarshal(canvasData, &scene); err != nil {
		return nil, ErrInvalid
	}
	var placements []CanvasPlacement
	for _, element := range scene.Elements {
		ref := element.CustomData.Reference
		if element.IsDeleted || (ref.NoteID == "" && ref.InstanceID == "") {
			continue
		}
		placements = append(placements, CanvasPlacement{
			ElementID:  element.ID,
			NoteID:     ref.NoteID,
			InstanceID: ref.InstanceID,
			X:          element.X,
			Y:          element.Y,
			Width:      element.Width,
			Height:     element.Height,
			Compact:    ref.Compact,
		})
	}
	return placements, nil
}

type pmNode struct {
	Type    string         `json:"type"`
	Text    string         `json:"text"`
	Attrs   map[string]any `json:"attrs"`
	Marks   []pmMark       `json:"marks"`
	Content []pmNode       `json:"content"`
}

type pmMark struct {
	Type  string         `json:"type"`
	Attrs map[string]any `json:"attrs"`
}

// ExtractSearchText extracts only user-authored plain text from a ProseMirror
// Note document (text nodes and non-empty noteImage alt text), joining inline
// text within blocks and separating text blocks with "\n". Non-JSON input falls
// back to the raw string.
func ExtractSearchText(document json.RawMessage) string {
	var root pmNode
	if err := json.Unmarshal(document, &root); err != nil {
		return string(document)
	}
	lines := []string{}
	collectTextLines(root, &lines)
	return strings.Join(lines, "\n")
}

func collectTextLines(node pmNode, lines *[]string) {
	if node.Type == "noteImage" {
		if alt, ok := node.Attrs["alt"].(string); ok {
			appendNormalizedLines(alt, lines)
		}
		return
	}
	if node.Type == "text" {
		appendNormalizedLines(node.Text, lines)
		return
	}
	if len(node.Content) == 0 {
		return
	}
	var inline strings.Builder
	flushInline := func() {
		if inline.Len() == 0 {
			return
		}
		appendNormalizedLines(inline.String(), lines)
		inline.Reset()
	}
	for _, child := range node.Content {
		switch child.Type {
		case "text":
			inline.WriteString(child.Text)
		case "hardBreak":
			inline.WriteByte('\n')
		default:
			if child.Type == "noteImage" || len(child.Content) > 0 {
				flushInline()
				collectTextLines(child, lines)
			}
		}
	}
	flushInline()
}

func appendNormalizedLines(raw string, lines *[]string) {
	for _, part := range strings.Split(raw, "\n") {
		normalized := collapseWhitespace(part)
		if normalized != "" {
			*lines = append(*lines, normalized)
		}
	}
}

func collapseWhitespace(value string) string {
	return strings.Join(strings.Fields(value), " ")
}

// TruncateRunes caps value at maxRunes runes, appending "…" when truncated.
func TruncateRunes(value string, maxRunes int) string {
	if maxRunes <= 0 || utf8.RuneCountInString(value) <= maxRunes {
		return value
	}
	runes := []rune(value)
	prefix := strings.TrimRightFunc(string(runes[:maxRunes-1]), unicode.IsSpace)
	return prefix + "…"
}

// ExtractFirstLine returns the first non-empty text block with whitespace
// collapsed and capped at 120 runes with "…" when truncated, mirroring web noteFirstLine.
func ExtractFirstLine(document json.RawMessage) string {
	var root pmNode
	if err := json.Unmarshal(document, &root); err != nil || root.Type != "doc" {
		return ""
	}
	line := firstTextBlock(root.Content)
	return TruncateRunes(line, MaxLabelRunes)
}

func firstTextBlock(nodes []pmNode) string {
	for _, node := range nodes {
		if hasDirectTextChild(node.Content) {
			if text := collapseWhitespace(inlineTextOf(node)); text != "" {
				return text
			}
			continue
		}
		if len(node.Content) > 0 {
			if nested := firstTextBlock(node.Content); nested != "" {
				return nested
			}
		}
	}
	return ""
}

func hasDirectTextChild(nodes []pmNode) bool {
	for _, child := range nodes {
		if child.Type == "text" {
			return true
		}
	}
	return false
}

func inlineTextOf(node pmNode) string {
	var b strings.Builder
	var walk func(pmNode)
	walk = func(current pmNode) {
		switch current.Type {
		case "text":
			b.WriteString(current.Text)
		case "hardBreak":
			b.WriteByte(' ')
		default:
			for _, child := range current.Content {
				walk(child)
			}
		}
	}
	walk(node)
	return b.String()
}

// MatchesSearchQuery reports whether every whitespace-separated term in query
// matches text case-insensitively.
func MatchesSearchQuery(text, query string) bool {
	terms := strings.Fields(strings.ToLower(strings.TrimSpace(query)))
	if len(terms) == 0 {
		return true
	}
	haystack := strings.ToLower(text)
	for _, term := range terms {
		if !strings.Contains(haystack, term) {
			return false
		}
	}
	return true
}

// ExtractBacklinkKinds returns deduplicated reference kinds ("link", "embed",
// "blockRef") by which document references targetNoteID.
func ExtractBacklinkKinds(document json.RawMessage, targetNoteID string) []string {
	if targetNoteID == "" {
		return nil
	}
	var root pmNode
	if err := json.Unmarshal(document, &root); err != nil {
		return nil
	}
	var hasLink, hasEmbed, hasBlockRef bool
	var walk func(pmNode)
	walk = func(node pmNode) {
		switch node.Type {
		case "noteEmbed":
			if id, ok := node.Attrs["noteId"].(string); ok && id == targetNoteID {
				hasEmbed = true
			}
		case "noteBlockReference":
			if id, ok := node.Attrs["noteId"].(string); ok && id == targetNoteID {
				hasBlockRef = true
			}
		}
		for _, mark := range node.Marks {
			if mark.Type != "link" {
				continue
			}
			href, ok := mark.Attrs["href"].(string)
			if !ok {
				continue
			}
			if linkReferencesNote(href, targetNoteID) {
				hasLink = true
			}
		}
		for _, child := range node.Content {
			walk(child)
		}
	}
	walk(root)
	var kinds []string
	if hasLink {
		kinds = append(kinds, BacklinkKindLink)
	}
	if hasEmbed {
		kinds = append(kinds, BacklinkKindEmbed)
	}
	if hasBlockRef {
		kinds = append(kinds, BacklinkKindBlockRef)
	}
	return kinds
}

func linkReferencesNote(href, targetNoteID string) bool {
	parsed, err := url.Parse(strings.TrimSpace(href))
	if err != nil {
		return false
	}
	return slices.Contains(parsed.Query()["noteId"], targetNoteID)
}
