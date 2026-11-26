package domain

import (
	"bytes"
	"encoding/json"
	"net/url"
	"regexp"
	"slices"
	"strings"
	"unicode"
	"unicode/utf8"
)

const (
	NoteSchemaVersion   = 1
	MaxDocumentBytes    = 1 << 20
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

// DocumentSummary holds the read-model fields derived from a Note's Markdown.
type DocumentSummary struct {
	PlainText string
	Label     string
	Excerpt   string
	IsEmpty   bool
}

// ExtractedNoteReference describes a single internal Note link, embed, or
// block reference extracted from a Note's Markdown document.
type ExtractedNoteReference struct {
	TargetNoteID string
	Kind         string
	Excerpt      string
}

// ParsedDocument is a validated Markdown Note document: the canonical
// {"type":"markdown","text":string} envelope and nothing else.
type ParsedDocument struct {
	raw  json.RawMessage
	text string
}

// ParseDocument strictly validates the Markdown envelope: exactly the keys
// type and text, valid UTF-8 without NUL, within the size limit.
func ParseDocument(raw json.RawMessage) (ParsedDocument, error) {
	if len(raw) == 0 || len(raw) > MaxDocumentBytes || !json.Valid(raw) {
		return ParsedDocument{}, ErrNoteInvalid
	}
	text, ok := markdownText(raw, true)
	if !ok || !utf8.ValidString(text) || strings.ContainsRune(text, 0) {
		return ParsedDocument{}, ErrNoteInvalid
	}
	return ParsedDocument{raw: raw, text: text}, nil
}

func (d ParsedDocument) Raw() json.RawMessage { return d.raw }
func (d ParsedDocument) IsEmpty() bool        { return strings.TrimSpace(d.text) == "" }
func (d ParsedDocument) Summary() DocumentSummary {
	return summarizeMarkdown(d.text)
}

func (d ParsedDocument) BacklinkInfo(targetNoteID string) (string, []string) {
	return backlinkInfo(d.text, targetNoteID)
}

// markdownText decodes the envelope; strict also requires exactly two keys.
func markdownText(raw json.RawMessage, strict bool) (string, bool) {
	trimmed := bytes.TrimSpace(raw)
	if len(trimmed) == 0 || trimmed[0] != '{' {
		return "", false
	}
	dec := json.NewDecoder(bytes.NewReader(trimmed))
	var fields map[string]json.RawMessage
	if err := dec.Decode(&fields); err != nil || (strict && len(fields) != 2) {
		return "", false
	}
	var kind, text string
	if json.Unmarshal(fields["type"], &kind) != nil || kind != "markdown" || json.Unmarshal(fields["text"], &text) != nil {
		return "", false
	}
	return text, true
}

// SummarizeDocument derives search text, label, excerpt and emptiness from a
// stored document. A stored value that is not a Markdown envelope is indexed
// as opaque text rather than hidden from search.
func SummarizeDocument(raw json.RawMessage) DocumentSummary {
	text, ok := markdownText(raw, false)
	if !ok {
		fallback := string(raw)
		return DocumentSummary{PlainText: fallback, Excerpt: TruncateRunes(fallback, MaxExcerptRunes)}
	}
	return summarizeMarkdown(text)
}

// IsEmptyDocument reports whether a stored document has no authored text.
func IsEmptyDocument(raw json.RawMessage) bool {
	text, ok := markdownText(raw, false)
	return ok && strings.TrimSpace(text) == ""
}

// ExtractBacklinkInfo returns the referencing Note's label and the distinct
// reference kinds (link, embed, blockRef) that target targetNoteID.
func ExtractBacklinkInfo(raw json.RawMessage, targetNoteID string) (string, []string) {
	text, ok := markdownText(raw, false)
	if !ok {
		return "", nil
	}
	return backlinkInfo(text, targetNoteID)
}

// ExtractNoteReferences returns all internal Note references in document order
// with their classified kind and human-readable line excerpt, ignoring fenced
// code, inline code, escaped links, and external URLs.
func ExtractNoteReferences(raw json.RawMessage) []ExtractedNoteReference {
	text, ok := markdownText(raw, false)
	if !ok {
		return nil
	}
	return extractNoteReferences(text)
}

var (
	inlineCode    = regexp.MustCompile("`+[^`\n]+`+")
	markdownLink  = regexp.MustCompile(`(^|[^\\])(!?)\[(?:\\.|[^\]\\\n])*\]\(\s*<?([^)\s>]+)>?(?:\s+"[^"]*")?\s*\)`)
	linkOrImage   = regexp.MustCompile(`!?\[((?:\\.|[^\]\\\n])*)\]\(\s*<?[^)\s>]*>?(?:\s+"[^"]*")?\s*\)`)
	htmlTag       = regexp.MustCompile(`</?[A-Za-z][^>\n]*>`)
	blockIDMarker = regexp.MustCompile(`(^|\s)\^[A-Za-z0-9_-]+\s*$`)
	calloutMarker = regexp.MustCompile(`^\[![A-Za-z0-9_-]+\]\s*`)
	listMarker    = regexp.MustCompile(`^(?:[-+*]|\d{1,9}[.)])\s+(?:\[[ xX]\]\s+)?`)
	tableRule     = regexp.MustCompile(`^\|?\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)*\|?$`)
	escapedPunct  = regexp.MustCompile("\\\\([!-/:-@\\[-`{-~])")
)

// stripCode removes fenced and inline code so examples never count as links.
func stripCode(text string) string {
	var kept []string
	inFence := ""
	for _, raw := range strings.Split(text, "\n") {
		if fence := fenceOf(strings.TrimSpace(raw)); fence != "" {
			switch {
			case inFence == "":
				inFence = fence
			case fence[0] == inFence[0] && len(fence) >= len(inFence):
				inFence = ""
			}
			continue
		}
		if inFence == "" {
			kept = append(kept, raw)
		}
	}
	return inlineCode.ReplaceAllString(strings.Join(kept, "\n"), "")
}

// readableLines turns Markdown into the lines a person would read: syntax,
// link destinations (which carry Note ids) and block markers are removed.
func readableLines(text string) []string {
	lines := []string{}
	inFence := ""
	for _, raw := range strings.Split(strings.ReplaceAll(text, "\r\n", "\n"), "\n") {
		line := strings.TrimSpace(raw)
		if fence := fenceOf(line); fence != "" {
			switch {
			case inFence == "":
				inFence = fence
			case fence[0] == inFence[0] && len(fence) >= len(inFence):
				inFence = ""
			}
			continue
		}
		if inFence != "" {
			lines = appendLine(lines, line)
			continue
		}
		if line == "$$" || tableRule.MatchString(line) {
			continue
		}
		line = blockIDMarker.ReplaceAllString(line, "")
		for strings.HasPrefix(line, ">") {
			line = strings.TrimSpace(strings.TrimPrefix(line, ">"))
		}
		line = calloutMarker.ReplaceAllString(line, "")
		line = strings.TrimLeft(line, "#")
		line = listMarker.ReplaceAllString(strings.TrimSpace(line), "")
		line = linkOrImage.ReplaceAllString(line, "$1")
		line = htmlTag.ReplaceAllString(line, "")
		line = strings.NewReplacer("**", "", "~~", "", "`", "", "|", " ").Replace(line)
		line = escapedPunct.ReplaceAllString(line, "$1")
		lines = appendLine(lines, line)
	}
	return lines
}

// fenceOf returns the opening run of a code fence line, or "".
func fenceOf(line string) string {
	if line == "" || (line[0] != '`' && line[0] != '~') {
		return ""
	}
	n := len(line) - len(strings.TrimLeft(line, line[:1]))
	if n < 3 {
		return ""
	}
	return line[:n]
}

func appendLine(lines []string, line string) []string {
	if normalized := collapseWhitespace(line); normalized != "" {
		return append(lines, normalized)
	}
	return lines
}

func summarizeMarkdown(text string) DocumentSummary {
	lines := readableLines(text)
	plain := strings.Join(lines, "\n")
	summary := DocumentSummary{
		PlainText: plain,
		Excerpt:   TruncateRunes(plain, MaxExcerptRunes),
		IsEmpty:   strings.TrimSpace(text) == "",
	}
	if len(lines) > 0 {
		summary.Label = TruncateRunes(lines[0], MaxLabelRunes)
	}
	return summary
}

func extractNoteReferences(text string) []ExtractedNoteReference {
	stripped := stripCode(strings.ReplaceAll(text, "\r\n", "\n"))
	indices := markdownLink.FindAllStringSubmatchIndex(stripped, -1)
	if len(indices) == 0 {
		return nil
	}
	refs := make([]ExtractedNoteReference, 0, len(indices))
	for _, idx := range indices {
		bang := stripped[idx[4]:idx[5]]
		href := stripped[idx[6]:idx[7]]
		query, ok := internalNoteQuery(href)
		if !ok {
			continue
		}
		targetID := strings.TrimSpace(query.Get("noteId"))
		if !ValidID(targetID, MaxNoteIDLength) {
			continue
		}
		kind := BacklinkKindLink
		switch {
		case bang == "!":
			kind = BacklinkKindEmbed
		case query.Get("blockId") != "":
			kind = BacklinkKindBlockRef
		}
		lineStart := strings.LastIndexByte(stripped[:idx[0]], '\n') + 1
		lineEnd := strings.IndexByte(stripped[idx[1]:], '\n')
		if lineEnd < 0 {
			lineEnd = len(stripped)
		} else {
			lineEnd += idx[1]
		}
		line := stripped[lineStart:lineEnd]
		excerpt := TruncateRunes(strings.Join(readableLines(line), " "), MaxExcerptRunes)
		refs = append(refs, ExtractedNoteReference{
			TargetNoteID: targetID,
			Kind:         kind,
			Excerpt:      excerpt,
		})
	}
	return refs
}

func backlinkInfo(text, targetNoteID string) (string, []string) {
	if targetNoteID == "" {
		return "", nil
	}
	var hasLink, hasEmbed, hasBlockRef bool
	for _, match := range markdownLink.FindAllStringSubmatch(stripCode(text), -1) {
		query, ok := internalNoteQuery(match[3])
		if !ok || !slices.Contains(query["noteId"], targetNoteID) {
			continue
		}
		switch {
		case match[2] == "!":
			hasEmbed = true
		case query.Get("blockId") != "":
			hasBlockRef = true
		default:
			hasLink = true
		}
	}
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
	if len(kinds) == 0 {
		return "", nil
	}
	return summarizeMarkdown(text).Label, kinds
}

// internalNoteQuery parses a Note route such as /workspaces/<id>?noteId=<id>.
func internalNoteQuery(href string) (url.Values, bool) {
	parsed, err := url.Parse(strings.TrimSpace(href))
	if err != nil || parsed.Scheme != "" || parsed.Host != "" || !strings.HasPrefix(parsed.Path, InternalWorkspaceRoutePrefix) {
		return nil, false
	}
	return parsed.Query(), true
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
