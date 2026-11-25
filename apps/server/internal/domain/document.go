package domain

import (
	"bytes"
	"encoding/json"
	"net/url"
	"slices"
	"strings"
	"unicode"
	"unicode/utf8"
)

const (
	NoteSchemaVersion   = 1
	MaxDocumentBytes    = 1 << 20
	MaxDocumentDepth    = 64
	MaxDocumentNodes    = 10000
	MaxNoteIDLength     = 128
	MaxRequestIDLength  = 128
	MaxInstanceIDLength = 128
	DefaultNoteLimit    = 50
	MaxNoteLimit        = 100
	MaxLabelRunes       = 120
	MaxExcerptRunes     = 240

	BacklinkKindLink     = "link"
	BacklinkKindEmbed    = "embed"
	BacklinkKindBlockRef = "blockRef"
)

// pmNode is the single canonical ProseMirror AST representation used for both
// strict validation and read-model extraction (text, labels, emptiness, backlinks).
type pmNode struct {
	Type    string          `json:"type"`
	Text    json.RawMessage `json:"text"`
	Attrs   json.RawMessage `json:"attrs"`
	Marks   json.RawMessage `json:"marks"`
	Content json.RawMessage `json:"content"`

	// Decoded fields populated during single-pass parse.
	textValue  string
	attrsMap   map[string]any
	marksList  []pmMark
	childNodes []pmNode
}

type pmMark struct {
	Type  string          `json:"type"`
	Attrs json.RawMessage `json:"attrs"`

	attrsMap map[string]any
}

// DocumentSummary holds all read-model fields extracted from a single AST parse.
type DocumentSummary struct {
	PlainText string
	Label     string
	Excerpt   string
	IsEmpty   bool
}

// ParsedDocument is a strictly validated ProseMirror document backed by a
// single decoded AST so callers never unmarshal the same JSON twice.
type ParsedDocument struct {
	raw  json.RawMessage
	root pmNode
}

// ParseDocument strictly validates a ProseMirror Note document and decodes its
// AST once, enforcing size, depth, node-count, attribute, and link invariants.
func ParseDocument(raw json.RawMessage) (ParsedDocument, error) {
	if len(raw) == 0 || len(raw) > MaxDocumentBytes || !json.Valid(raw) {
		return ParsedDocument{}, ErrNoteInvalid
	}
	var root pmNode
	if err := decodeStrictObject(raw, &root); err != nil {
		return ParsedDocument{}, ErrNoteInvalid
	}
	if root.Type == "markdown" {
		rawMap, ok := decodeMap(raw)
		if !ok || len(rawMap) != 2 {
			return ParsedDocument{}, ErrNoteInvalid
		}
		text, ok := rawMap["text"].(string)
		if !ok || !utf8.ValidString(text) {
			return ParsedDocument{}, ErrNoteInvalid
		}
		root.textValue = text
		return ParsedDocument{raw: raw, root: root}, nil
	}
	if root.Type != "doc" {
		return ParsedDocument{}, ErrNoteInvalid
	}
	if len(bytes.TrimSpace(root.Content)) == 0 {
		return ParsedDocument{}, ErrNoteInvalid
	}
	count := 0
	children, ok := parseAndValidateChildren(root.Content, 0, &count)
	if !ok {
		return ParsedDocument{}, ErrNoteInvalid
	}
	root.childNodes = children
	return ParsedDocument{raw: raw, root: root}, nil
}

func (d ParsedDocument) Raw() json.RawMessage { return d.raw }

func (d ParsedDocument) IsEmpty() bool {
	if d.root.Type == "markdown" {
		return strings.TrimSpace(d.root.textValue) == ""
	}
	return emptyPMContent(d.root.childNodes)
}

func (d ParsedDocument) Summary() DocumentSummary {
	return summarizeRoot(d.root)
}

func (d ParsedDocument) BacklinkInfo(targetNoteID string) (string, []string) {
	return backlinkInfoFromRoot(d.root, targetNoteID)
}

// SummarizeDocument parses a stored Note document once to produce read-model
// metadata (plain search text, derived first-line label, excerpt, empty flag).
func SummarizeDocument(raw json.RawMessage) DocumentSummary {
	root, ok := decodeLenientNode(raw)
	if !ok {
		fallback := string(raw)
		return DocumentSummary{
			PlainText: fallback,
			Excerpt:   TruncateRunes(fallback, MaxExcerptRunes),
			IsEmpty:   false,
		}
	}
	return summarizeRoot(root)
}

// IsEmptyDocument reports whether a stored document contains no authored text
// or non-paragraph content.
func IsEmptyDocument(raw json.RawMessage) bool {
	root, ok := decodeLenientNode(raw)
	if !ok {
		return false
	}
	if root.Type == "markdown" {
		var text string
		return len(root.Text) > 0 && json.Unmarshal(root.Text, &text) == nil && strings.TrimSpace(text) == ""
	}
	if root.Type != "doc" {
		return false
	}
	return emptyPMContent(root.childNodes)
}

// ExtractBacklinkInfo parses a referencing document once and returns its
// derived label alongside deduplicated reference kinds targeting targetNoteID.
func ExtractBacklinkInfo(raw json.RawMessage, targetNoteID string) (string, []string) {
	if targetNoteID == "" {
		return "", nil
	}
	root, ok := decodeLenientNode(raw)
	if !ok {
		return "", nil
	}
	return backlinkInfoFromRoot(root, targetNoteID)
}

func decodeStrictObject(raw json.RawMessage, dst any) error {
	trimmed := bytes.TrimSpace(raw)
	if len(trimmed) == 0 || trimmed[0] != '{' {
		return ErrNoteInvalid
	}
	dec := json.NewDecoder(bytes.NewReader(trimmed))
	dec.UseNumber()
	return dec.Decode(dst)
}

func decodeMap(raw json.RawMessage) (map[string]any, bool) {
	trimmed := bytes.TrimSpace(raw)
	if len(trimmed) == 0 || bytes.Equal(trimmed, []byte("null")) {
		return nil, true
	}
	if trimmed[0] != '{' {
		return nil, false
	}
	dec := json.NewDecoder(bytes.NewReader(trimmed))
	dec.UseNumber()
	var m map[string]any
	if err := dec.Decode(&m); err != nil {
		return nil, false
	}
	return m, true
}

func parseAndValidateChildren(rawContent json.RawMessage, depth int, count *int) ([]pmNode, bool) {
	if depth > MaxDocumentDepth {
		return nil, false
	}
	trimmed := bytes.TrimSpace(rawContent)
	if len(trimmed) == 0 || trimmed[0] != '[' {
		return nil, false
	}
	var rawNodes []json.RawMessage
	if err := json.Unmarshal(trimmed, &rawNodes); err != nil {
		return nil, false
	}
	nodes := make([]pmNode, 0, len(rawNodes))
	for _, rawNode := range rawNodes {
		(*count)++
		if *count > MaxDocumentNodes {
			return nil, false
		}
		var node pmNode
		if err := decodeStrictObject(rawNode, &node); err != nil {
			return nil, false
		}
		if strings.TrimSpace(node.Type) == "" || utf8.RuneCountInString(node.Type) > 64 {
			return nil, false
		}
		attrs, attrsOK := decodeMap(node.Attrs)
		if !attrsOK || !validateNodeAttrs(node.Type, attrs) {
			return nil, false
		}
		node.attrsMap = attrs

		if len(bytes.TrimSpace(node.Text)) > 0 {
			var text string
			if err := json.Unmarshal(node.Text, &text); err != nil || !utf8.ValidString(text) {
				return nil, false
			}
			node.textValue = text
		}
		if len(bytes.TrimSpace(node.Marks)) > 0 {
			marks, ok := parseAndValidateMarks(node.Marks)
			if !ok {
				return nil, false
			}
			node.marksList = marks
		}
		if len(bytes.TrimSpace(node.Content)) > 0 {
			children, ok := parseAndValidateChildren(node.Content, depth+1, count)
			if !ok {
				return nil, false
			}
			node.childNodes = children
		}
		nodes = append(nodes, node)
	}
	return nodes, true
}

func parseAndValidateMarks(rawMarks json.RawMessage) ([]pmMark, bool) {
	trimmed := bytes.TrimSpace(rawMarks)
	if len(trimmed) == 0 || trimmed[0] != '[' {
		return nil, false
	}
	var rawList []json.RawMessage
	if err := json.Unmarshal(trimmed, &rawList); err != nil {
		return nil, false
	}
	marks := make([]pmMark, 0, len(rawList))
	for _, rawMark := range rawList {
		var mark pmMark
		if err := decodeStrictObject(rawMark, &mark); err != nil || strings.TrimSpace(mark.Type) == "" {
			return nil, false
		}
		attrs, ok := decodeMap(mark.Attrs)
		if !ok {
			return nil, false
		}
		mark.attrsMap = attrs
		switch mark.Type {
		case "link":
			href, hrefOK := attrs["href"].(string)
			if !hrefOK || !safeLink(href) {
				return nil, false
			}
		case "noteHighlight":
			tone, toneOK := attrs["tone"].(string)
			if !toneOK || (!validHighlightTone(tone) && !validHexColor(tone)) {
				return nil, false
			}
		case "noteTextColor":
			tone, toneOK := attrs["tone"].(string)
			if !toneOK || (!validTextColorTone(tone) && !validHexColor(tone)) {
				return nil, false
			}
		}
		marks = append(marks, mark)
	}
	return marks, true
}

// decodeLenientNode parses already-persisted documents for read-model views
// using the exact same pmNode AST type without rejecting legacy/partial attrs.
func decodeLenientNode(raw json.RawMessage) (pmNode, bool) {
	var node pmNode
	if err := json.Unmarshal(raw, &node); err != nil {
		return pmNode{}, false
	}
	hydrateLenientNode(&node)
	return node, true
}

func hydrateLenientNode(node *pmNode) {
	if len(node.Text) > 0 {
		_ = json.Unmarshal(node.Text, &node.textValue)
	}
	if len(node.Attrs) > 0 {
		_ = json.Unmarshal(node.Attrs, &node.attrsMap)
	}
	if len(node.Marks) > 0 {
		if json.Unmarshal(node.Marks, &node.marksList) == nil {
			for i := range node.marksList {
				if len(node.marksList[i].Attrs) > 0 {
					_ = json.Unmarshal(node.marksList[i].Attrs, &node.marksList[i].attrsMap)
				}
			}
		}
	}
	if len(node.Content) > 0 {
		if json.Unmarshal(node.Content, &node.childNodes) == nil {
			for i := range node.childNodes {
				hydrateLenientNode(&node.childNodes[i])
			}
		}
	}
}

func summarizeRoot(root pmNode) DocumentSummary {
	lines := []string{}
	if root.Type == "markdown" {
		appendNormalizedLines(root.textValue, &lines)
		plainText := strings.Join(lines, "\n")
		var text string
		isEmpty := len(root.Text) > 0 && json.Unmarshal(root.Text, &text) == nil && strings.TrimSpace(text) == ""
		return DocumentSummary{
			PlainText: plainText,
			Label:     markdownFirstLine(root.textValue),
			Excerpt:   TruncateRunes(plainText, MaxExcerptRunes),
			IsEmpty:   isEmpty,
		}
	}
	collectTextLines(root, &lines)
	plainText := strings.Join(lines, "\n")
	var label string
	var isEmpty bool
	if root.Type == "doc" {
		label = TruncateRunes(firstTextBlock(root.childNodes), MaxLabelRunes)
		isEmpty = emptyPMContent(root.childNodes)
	}
	return DocumentSummary{
		PlainText: plainText,
		Label:     label,
		Excerpt:   TruncateRunes(plainText, MaxExcerptRunes),
		IsEmpty:   isEmpty,
	}
}

func markdownFirstLine(text string) string {
	for _, raw := range strings.Split(text, "\n") {
		line := collapseWhitespace(raw)
		prefix := strings.TrimLeft(line, "#")
		if size := len(line) - len(prefix); size > 0 && size <= 6 && (prefix == "" || strings.HasPrefix(prefix, " ")) {
			line = strings.TrimSpace(prefix)
		}
		if line != "" {
			return TruncateRunes(line, MaxLabelRunes)
		}
	}
	return ""
}

func backlinkInfoFromRoot(root pmNode, targetNoteID string) (string, []string) {
	if targetNoteID == "" {
		return "", nil
	}
	kinds := collectBacklinkKinds(root, targetNoteID)
	if len(kinds) == 0 {
		return "", nil
	}
	var label string
	if root.Type == "doc" {
		label = TruncateRunes(firstTextBlock(root.childNodes), MaxLabelRunes)
	}
	return label, kinds
}

func emptyPMContent(nodes []pmNode) bool {
	for _, node := range nodes {
		if node.Type != "paragraph" && node.Type != "text" {
			return false
		}
		if strings.TrimSpace(node.textValue) != "" {
			return false
		}
		if !emptyPMContent(node.childNodes) {
			return false
		}
	}
	return true
}

func validateNodeAttrs(nodeType string, attrs map[string]any) bool {
	if attrs == nil {
		return nodeType != "noteImage" && nodeType != "noteEmbed" && nodeType != "noteBlockReference"
	}
	if blockID, exists := attrs["blockId"]; exists {
		value, ok := blockID.(string)
		if !ok || !ValidID(value, MaxInstanceIDLength) {
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
			if !ok || !ValidID(value, MaxInstanceIDLength) {
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
		return validateReferenceAttrs(attrs, false)
	case "noteBlockReference":
		return validateReferenceAttrs(attrs, true)
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

func validHexColor(value string) bool {
	if len(value) != 7 || value[0] != '#' {
		return false
	}
	for i := 1; i < 7; i++ {
		c := value[i]
		isHex := (c >= '0' && c <= '9') || (c >= 'a' && c <= 'f') || (c >= 'A' && c <= 'F')
		if !isHex {
			return false
		}
	}
	return true
}

func validateReferenceAttrs(attrs map[string]any, requireBlock bool) bool {
	noteID, ok := attrs["noteId"].(string)
	if !ok || !ValidID(noteID, MaxNoteIDLength) {
		return false
	}
	if workspaceID, exists := attrs["workspaceId"]; exists {
		value, ok := workspaceID.(string)
		if !ok || (value != "" && !ValidID(value, MaxNoteIDLength)) {
			return false
		}
	}
	if requireBlock {
		blockID, ok := attrs["blockId"].(string)
		if !ok || !ValidID(blockID, MaxInstanceIDLength) {
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
	return err == nil && parsed.Scheme == "" && parsed.Host == "" && strings.HasPrefix(parsed.Path, InternalAssetPathPrefix)
}

func safeLink(value string) bool {
	value = strings.TrimSpace(value)
	if strings.ContainsAny(value, "\r\n") {
		return false
	}
	if strings.HasPrefix(value, "/") && !strings.HasPrefix(value, "//") {
		parsed, err := url.Parse(value)
		return err == nil && parsed.Scheme == "" && parsed.Host == "" &&
			strings.HasPrefix(parsed.Path, InternalWorkspaceRoutePrefix) &&
			strings.TrimPrefix(parsed.Path, InternalWorkspaceRoutePrefix) != ""
	}
	parsed, err := url.Parse(value)
	if err != nil || parsed.Scheme == "" || (parsed.Host == "" && parsed.Scheme != "mailto") {
		return false
	}
	switch strings.ToLower(parsed.Scheme) {
	case "http", "https", "mailto":
		return true
	default:
		return false
	}
}

func collectTextLines(node pmNode, lines *[]string) {
	if node.Type == "noteImage" {
		if alt, ok := node.attrsMap["alt"].(string); ok {
			appendNormalizedLines(alt, lines)
		}
		return
	}
	if node.Type == "text" {
		appendNormalizedLines(node.textValue, lines)
		return
	}
	if len(node.childNodes) == 0 {
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
	for _, child := range node.childNodes {
		switch child.Type {
		case "text":
			inline.WriteString(child.textValue)
		case "hardBreak":
			inline.WriteByte('\n')
		default:
			if child.Type == "noteImage" || len(child.childNodes) > 0 {
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

func TruncateRunes(value string, maxRunes int) string {
	if maxRunes <= 0 || utf8.RuneCountInString(value) <= maxRunes {
		return value
	}
	runes := []rune(value)
	prefix := strings.TrimRightFunc(string(runes[:maxRunes-1]), unicode.IsSpace)
	return prefix + "…"
}

func firstTextBlock(nodes []pmNode) string {
	for _, node := range nodes {
		if hasDirectTextChild(node.childNodes) {
			if text := collapseWhitespace(inlineTextOf(node)); text != "" {
				return text
			}
			continue
		}
		if len(node.childNodes) > 0 {
			if nested := firstTextBlock(node.childNodes); nested != "" {
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
			b.WriteString(current.textValue)
		case "hardBreak":
			b.WriteByte(' ')
		default:
			for _, child := range current.childNodes {
				walk(child)
			}
		}
	}
	walk(node)
	return b.String()
}

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

func collectBacklinkKinds(root pmNode, targetNoteID string) []string {
	var hasLink, hasEmbed, hasBlockRef bool
	var walk func(pmNode)
	walk = func(node pmNode) {
		switch node.Type {
		case "noteEmbed":
			if id, ok := node.attrsMap["noteId"].(string); ok && id == targetNoteID {
				hasEmbed = true
			}
		case "noteBlockReference":
			if id, ok := node.attrsMap["noteId"].(string); ok && id == targetNoteID {
				hasBlockRef = true
			}
		}
		for _, mark := range node.marksList {
			if mark.Type != "link" {
				continue
			}
			href, ok := mark.attrsMap["href"].(string)
			if !ok {
				continue
			}
			if linkReferencesNote(href, targetNoteID) {
				hasLink = true
			}
		}
		for _, child := range node.childNodes {
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
