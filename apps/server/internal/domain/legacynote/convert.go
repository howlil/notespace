// Package legacynote is the only place that still understands the retired
// ProseMirror Note document. It converts those documents to the canonical
// Markdown envelope at migration and backup-import boundaries, nowhere else.
package legacynote

import (
	"encoding/json"
	"errors"
	"fmt"
	"net/url"
	"regexp"
	"sort"
	"strings"
	"unicode"
	"unicode/utf8"
)

const maxMarkdownBytes = 1 << 20

// ErrUnsupported is returned when a document is neither Markdown nor a
// ProseMirror doc, or when conversion could not prove the authored text survived.
var ErrUnsupported = errors.New("unsupported Note document")

// Report describes what Upgrade did to one document.
type Report struct {
	Converted bool
	// Degraded lists constructs Markdown cannot represent exactly. The text is
	// kept; only presentation (for example merged table cells) is simplified.
	Degraded []string
}

type node struct {
	Type    string         `json:"type"`
	Text    string         `json:"text"`
	Attrs   map[string]any `json:"attrs"`
	Marks   []mark         `json:"marks"`
	Content []node         `json:"content"`
}

type mark struct {
	Type  string         `json:"type"`
	Attrs map[string]any `json:"attrs"`
}

// MarkdownDocument wraps text in the canonical Markdown Note envelope.
func MarkdownDocument(text string) json.RawMessage {
	raw, _ := json.Marshal(struct {
		Type string `json:"type"`
		Text string `json:"text"`
	}{"markdown", text})
	return raw
}

// IsLegacy reports whether raw is a retired ProseMirror document.
func IsLegacy(raw json.RawMessage) bool {
	var head struct {
		Type string `json:"type"`
	}
	return json.Unmarshal(raw, &head) == nil && head.Type == "doc"
}

// Upgrade returns raw unchanged when it is already Markdown (so existing
// Markdown source is preserved byte for byte) and converts a legacy document
// otherwise. It fails rather than return text that lost authored characters.
func Upgrade(raw json.RawMessage) (json.RawMessage, Report, error) {
	var root node
	if err := json.Unmarshal(raw, &root); err != nil {
		return nil, Report{}, ErrUnsupported
	}
	switch root.Type {
	case "markdown":
		return raw, Report{}, nil
	case "doc":
	default:
		return nil, Report{}, ErrUnsupported
	}
	c := &converter{degraded: map[string]bool{}}
	text := strings.Join(c.blocks(root.Content), "\n\n")
	if !utf8.ValidString(text) || len(text) > maxMarkdownBytes {
		return nil, Report{}, fmt.Errorf("%w: converted Markdown is not valid or exceeds %d bytes", ErrUnsupported, maxMarkdownBytes)
	}
	if !preserves(authoredText(root), text) {
		return nil, Report{}, fmt.Errorf("%w: conversion would drop authored text", ErrUnsupported)
	}
	report := Report{Converted: true}
	for reason := range c.degraded {
		report.Degraded = append(report.Degraded, reason)
	}
	sort.Strings(report.Degraded)
	return MarkdownDocument(text), report, nil
}

type converter struct {
	degraded map[string]bool
	inTable  bool
}

func (c *converter) degrade(reason string) { c.degraded[reason] = true }

func isInline(t string) bool { return t == "text" || t == "hardBreak" || t == "inlineMath" }

func (c *converter) blocks(nodes []node) []string {
	out := []string{}
	for _, n := range nodes {
		if s := c.block(n); s != "" {
			out = append(out, s)
		}
	}
	return out
}

func blockID(n node) string {
	id, _ := n.Attrs["blockId"].(string)
	if id == "" {
		return ""
	}
	for _, r := range id {
		if !(r == '-' || r == '_' || (r >= '0' && r <= '9') || (r >= 'a' && r <= 'z') || (r >= 'A' && r <= 'Z')) {
			return ""
		}
	}
	return id
}

// tagged appends the block identity marker. Text blocks carry it inline;
// every other block carries it on its own following line.
func tagged(n node, s string, textBlock bool) string {
	id := blockID(n)
	switch {
	case id == "" || s == "":
		return s
	case textBlock:
		return s + " ^" + id
	default:
		return s + "\n\n^" + id
	}
}

func (c *converter) block(n node) string {
	if raw, _ := n.Attrs["blockId"].(string); raw != "" && blockID(n) == "" {
		// A `^id` marker only carries [A-Za-z0-9_-]; the original keeps the exact id.
		c.degrade("block ids with unsupported characters")
	}
	switch n.Type {
	case "paragraph":
		if plain, ok := plainParagraph(n); ok && (strings.Contains(plain, `\[`) || strings.Contains(plain, "$$")) {
			if display, ok := c.paragraphWithDisplayMath(plain); ok {
				return tagged(n, display, false)
			}
		}
		text := c.inline(n.Content)
		if strings.TrimSpace(text) == "" {
			return ""
		}
		return tagged(n, escapeLineStarts(text), true)
	case "heading":
		text := c.inline(n.Content)
		if strings.TrimSpace(text) == "" {
			return ""
		}
		level := 1
		if v, ok := n.Attrs["level"].(float64); ok && v >= 1 && v <= 6 {
			level = int(v)
		}
		return tagged(n, strings.Repeat("#", level)+" "+text, true)
	case "bulletList", "orderedList", "taskList":
		return tagged(n, c.list(n), false)
	case "blockquote":
		inner := strings.Join(c.blocks(n.Content), "\n\n")
		if inner == "" {
			return ""
		}
		return tagged(n, quote(inner), false)
	case "noteCallout":
		tone, _ := n.Attrs["tone"].(string)
		if !safeToken(tone) {
			tone = "note"
		}
		inner := strings.Join(c.blocks(n.Content), "\n\n")
		head := "> [!" + tone + "]"
		if inner == "" {
			return tagged(n, head, false)
		}
		return tagged(n, head+"\n"+quote(inner), false)
	case "codeBlock":
		return tagged(n, codeFence(n), false)
	case "horizontalRule":
		return tagged(n, "---", false)
	case "noteImage":
		return tagged(n, c.image(n), false)
	case "noteEmbed":
		label, _ := n.Attrs["label"].(string)
		if strings.TrimSpace(label) == "" {
			label = "Embedded Note"
		}
		return tagged(n, "!["+escape(label)+"]("+routeHref(n, "")+")", false)
	case "noteBlockReference":
		bid, _ := n.Attrs["blockId"].(string)
		return tagged(n, "[Block reference]("+routeHref(n, bid)+")", false)
	case "noteToggle":
		return tagged(n, c.toggle(n), false)
	case "table":
		return tagged(n, c.table(n), false)
	case "blockMath":
		latex, _ := n.Attrs["latex"].(string)
		if strings.TrimSpace(latex) == "" {
			return ""
		}
		return tagged(n, "$$\n"+latex+"\n$$", false)
	}
	if isInline(n.Type) {
		return tagged(n, escapeLineStarts(c.inline([]node{n})), true)
	}
	c.degrade("unknown node " + n.Type)
	if len(n.Content) == 0 {
		return ""
	}
	for _, child := range n.Content {
		if !isInline(child.Type) {
			return strings.Join(c.blocks(n.Content), "\n\n")
		}
	}
	return escapeLineStarts(c.inline(n.Content))
}

func (c *converter) list(n node) string {
	start := 1
	if v, ok := n.Attrs["start"].(float64); ok && v >= 0 && v < 1e9 {
		start = int(v)
	}
	var items []string
	for i, item := range n.Content {
		marker := "- "
		if n.Type == "orderedList" {
			marker = fmt.Sprintf("%d. ", start+i)
		}
		prefix := marker
		if item.Type == "taskItem" {
			checked, _ := item.Attrs["checked"].(bool)
			if checked {
				prefix += "[x] "
			} else {
				prefix += "[ ] "
			}
		}
		body := c.blocks(item.Content)
		if len(body) == 0 {
			items = append(items, strings.TrimRight(prefix, " "))
			continue
		}
		indent := strings.Repeat(" ", len(marker))
		var b strings.Builder
		b.WriteString(prefix + indentTail(body[0], indent))
		for _, extra := range body[1:] {
			sep := "\n\n"
			if startsList(extra) {
				sep = "\n"
			}
			b.WriteString(sep + indentAll(extra, indent))
		}
		items = append(items, b.String())
	}
	return strings.Join(items, "\n")
}

func startsList(s string) bool {
	return strings.HasPrefix(s, "- ") || (len(s) > 2 && s[0] >= '0' && s[0] <= '9' && strings.Contains(s[:min(len(s), 12)], ". "))
}

func indentTail(s, indent string) string {
	lines := strings.Split(s, "\n")
	for i := 1; i < len(lines); i++ {
		if lines[i] != "" {
			lines[i] = indent + lines[i]
		}
	}
	return strings.Join(lines, "\n")
}

func indentAll(s, indent string) string {
	lines := strings.Split(s, "\n")
	for i, line := range lines {
		if line != "" {
			lines[i] = indent + line
		}
	}
	return strings.Join(lines, "\n")
}

func quote(s string) string {
	lines := strings.Split(s, "\n")
	for i, line := range lines {
		if line == "" {
			lines[i] = ">"
		} else {
			lines[i] = "> " + line
		}
	}
	return strings.Join(lines, "\n")
}

func codeFence(n node) string {
	var text strings.Builder
	for _, child := range n.Content {
		text.WriteString(child.Text)
	}
	body := text.String()
	fence, run := 3, 0
	for _, r := range body {
		if r == '`' {
			run++
			if run >= fence {
				fence = run + 1
			}
		} else {
			run = 0
		}
	}
	lang, _ := n.Attrs["language"].(string)
	if !safeToken(lang) {
		lang = ""
	}
	ticks := strings.Repeat("`", fence)
	return ticks + lang + "\n" + body + "\n" + ticks
}

func (c *converter) image(n node) string {
	src, _ := n.Attrs["src"].(string)
	alt, _ := n.Attrs["alt"].(string)
	return "![" + escape(alt) + "](" + safeURL(src) + ")"
}

func (c *converter) toggle(n node) string {
	summary := ""
	var body []node
	for i, child := range n.Content {
		if i == 0 && child.Type == "noteToggleSummary" {
			summary = strings.TrimSpace(plainText(child))
			if len(child.Marks) > 0 || hasMarks(child.Content) {
				c.degrade("formatting inside toggle titles")
			}
			continue
		}
		body = append(body, child)
	}
	open := ""
	if v, _ := n.Attrs["open"].(bool); v {
		open = " open"
	}
	out := "<details" + open + ">\n<summary>" + escapeHTML(summary) + "</summary>\n\n"
	if inner := strings.Join(c.blocks(body), "\n\n"); inner != "" {
		out += inner + "\n\n"
	}
	return out + "</details>"
}

func hasMarks(nodes []node) bool {
	for _, n := range nodes {
		if len(n.Marks) > 0 || hasMarks(n.Content) {
			return true
		}
	}
	return false
}

func (c *converter) table(n node) string {
	var rows [][]string
	headerFirst := false
	width := 0
	for i, row := range n.Content {
		var cells []string
		allHeaders := len(row.Content) > 0
		for _, cell := range row.Content {
			if cell.Type != "tableHeader" {
				allHeaders = false
			}
			for _, key := range []string{"colspan", "rowspan"} {
				if v, ok := cell.Attrs[key].(float64); ok && v > 1 {
					c.degrade("merged table cells")
				}
			}
			cells = append(cells, c.cell(cell))
		}
		if i == 0 {
			headerFirst = allHeaders
		}
		width = max(width, len(cells))
		rows = append(rows, cells)
	}
	if width == 0 {
		return ""
	}
	if !headerFirst {
		rows = append([][]string{make([]string, width)}, rows...)
	}
	line := func(cells []string) string {
		out := make([]string, width)
		for i := range out {
			if i < len(cells) {
				out[i] = cells[i]
			}
		}
		return "| " + strings.Join(out, " | ") + " |"
	}
	sep := make([]string, width)
	for i := range sep {
		sep[i] = "---"
	}
	lines := []string{line(rows[0]), "| " + strings.Join(sep, " | ") + " |"}
	for _, row := range rows[1:] {
		lines = append(lines, line(row))
	}
	return strings.Join(lines, "\n")
}

func (c *converter) cell(cell node) string {
	var parts []string
	for _, block := range cell.Content {
		if block.Type == "paragraph" {
			c.inTable = true
			text := c.inline(block.Content)
			c.inTable = false
			if strings.TrimSpace(text) != "" {
				parts = append(parts, text)
			}
			continue
		}
		if text := strings.TrimSpace(plainText(block)); text != "" {
			c.degrade("block content inside table cells")
			parts = append(parts, escape(text))
		}
	}
	return strings.ReplaceAll(strings.Join(parts, "<br>"), "|", "\\|")
}

// inline renders a run of inline nodes, merging adjacent text that shares marks.
func (c *converter) inline(nodes []node) string {
	var b strings.Builder
	for i := 0; i < len(nodes); i++ {
		n := nodes[i]
		switch n.Type {
		case "text":
			text := n.Text
			for i+1 < len(nodes) && nodes[i+1].Type == "text" && sameMarks(n.Marks, nodes[i+1].Marks) {
				i++
				text += nodes[i].Text
			}
			b.WriteString(c.textWithMath(text, n.Marks))
		case "hardBreak":
			if c.inTable {
				b.WriteString("<br>")
			} else {
				b.WriteString("\\\n")
			}
		case "inlineMath":
			latex, _ := n.Attrs["latex"].(string)
			if strings.TrimSpace(latex) != "" {
				b.WriteString("$" + latex + "$")
			}
		case "noteImage":
			b.WriteString(c.image(n))
		default:
			c.degrade("unknown inline node " + n.Type)
			b.WriteString(c.inline(n.Content))
		}
	}
	return b.String()
}

var (
	displayMathText = regexp.MustCompile(`(?s)\\\[(.+?)\\\]|\$\$(.+?)\$\$`)
	inlineMathText  = regexp.MustCompile(`(?s)\\\((.+?)\\\)`)
)

// The retired read view typeset raw LaTeX delimiters typed as plain text. Doing
// the same here keeps those formulas typeset: `\(x\)` becomes `$x$` and a
// display formula becomes its own `$$` block. Only unformatted text is touched,
// and a formula that could not sit inside `$…$` stays literal text.
func mathSource(latex string) (string, bool) {
	latex = strings.TrimSpace(latex)
	return latex, latex != "" && !strings.Contains(latex, "$")
}

func plainParagraph(n node) (string, bool) {
	var b strings.Builder
	for _, child := range n.Content {
		switch {
		case child.Type == "text" && len(child.Marks) == 0:
			b.WriteString(child.Text)
		case child.Type == "hardBreak":
			b.WriteByte('\n')
		default:
			return "", false
		}
	}
	return b.String(), true
}

func (c *converter) paragraphWithDisplayMath(plain string) (string, bool) {
	var parts []string
	last := 0
	for _, m := range displayMathText.FindAllStringSubmatchIndex(plain, -1) {
		var raw string
		if m[2] >= 0 {
			raw = plain[m[2]:m[3]]
		} else {
			raw = plain[m[4]:m[5]]
		}
		latex, ok := mathSource(raw)
		if !ok {
			continue
		}
		if before := strings.TrimSpace(plain[last:m[0]]); before != "" {
			parts = append(parts, escapeLineStarts(c.textWithMath(before, nil)))
		}
		parts = append(parts, "$$\n"+latex+"\n$$")
		last = m[1]
	}
	if len(parts) == 0 {
		return "", false
	}
	if after := strings.TrimSpace(plain[last:]); after != "" {
		parts = append(parts, escapeLineStarts(c.textWithMath(after, nil)))
	}
	return strings.Join(parts, "\n\n"), true
}

// textWithMath renders a text run, typesetting `\(…\)` spans outside inline code.
func (c *converter) textWithMath(text string, marks []mark) string {
	if !strings.Contains(text, `\(`) {
		return c.textRun(text, marks)
	}
	for _, m := range marks {
		if m.Type == "code" {
			return c.textRun(text, marks)
		}
	}
	var b strings.Builder
	last := 0
	for _, m := range inlineMathText.FindAllStringSubmatchIndex(text, -1) {
		latex, ok := mathSource(text[m[2]:m[3]])
		if !ok || strings.Contains(latex, "\n") {
			continue
		}
		b.WriteString(c.textRun(text[last:m[0]], marks))
		b.WriteString("$" + latex + "$")
		last = m[1]
	}
	b.WriteString(c.textRun(text[last:], marks))
	return b.String()
}

func sameMarks(a, b []mark) bool {
	x, _ := json.Marshal(a)
	y, _ := json.Marshal(b)
	return string(x) == string(y)
}

func (c *converter) textRun(text string, marks []mark) string {
	text = strings.ReplaceAll(text, "\r", "")
	text = strings.ReplaceAll(text, "\n", " ")
	core := strings.TrimFunc(text, unicode.IsSpace)
	if core == "" {
		return text
	}
	lead := text[:strings.Index(text, core)]
	trail := text[len(lead)+len(core):]

	has := map[string]mark{}
	for _, m := range marks {
		has[m.Type] = m
	}
	out := escape(core)
	if _, ok := has["code"]; ok {
		out = codeSpan(core)
	}
	if _, ok := has["strike"]; ok {
		out = "~~" + out + "~~"
	}
	if _, ok := has["italic"]; ok {
		out = "*" + out + "*"
	}
	if _, ok := has["bold"]; ok {
		out = "**" + out + "**"
	}
	if _, ok := has["underline"]; ok {
		out = "<u>" + out + "</u>"
	}
	if m, ok := has["noteHighlight"]; ok {
		if tone, _ := m.Attrs["tone"].(string); safeToken(tone) {
			out = `<mark data-tone="` + tone + `">` + out + "</mark>"
		}
	}
	if m, ok := has["noteTextColor"]; ok {
		if tone, _ := m.Attrs["tone"].(string); safeToken(tone) {
			out = `<span data-color="` + tone + `">` + out + "</span>"
		}
	}
	if m, ok := has["link"]; ok {
		if href, _ := m.Attrs["href"].(string); href != "" {
			out = "[" + out + "](" + safeURL(href) + ")"
		}
	}
	return lead + out + trail
}

func codeSpan(s string) string {
	fence, run := 1, 0
	for _, r := range s {
		if r == '`' {
			run++
			if run >= fence {
				fence = run + 1
			}
		} else {
			run = 0
		}
	}
	ticks := strings.Repeat("`", fence)
	if strings.HasPrefix(s, "`") || strings.HasSuffix(s, "`") || strings.HasPrefix(s, " ") || strings.HasSuffix(s, " ") {
		return ticks + " " + s + " " + ticks
	}
	return ticks + s + ticks
}

// safeToken accepts the short identifiers (tones, languages, hex colours) that
// are safe to place inside an attribute or a fence info string.
func safeToken(s string) bool {
	if s == "" || len(s) > 32 {
		return false
	}
	for _, r := range s {
		if !(r == '#' || r == '-' || r == '_' || r == '+' || r == '.' || (r >= '0' && r <= '9') || (r >= 'a' && r <= 'z') || (r >= 'A' && r <= 'Z')) {
			return false
		}
	}
	return true
}

func escape(s string) string {
	var b strings.Builder
	for _, r := range s {
		if strings.ContainsRune("\\`*_[]<>~$&^", r) {
			b.WriteByte('\\')
		}
		b.WriteRune(r)
	}
	return b.String()
}

func escapeHTML(s string) string {
	return strings.NewReplacer("&", "&amp;", "<", "&lt;", ">", "&gt;").Replace(s)
}

// escapeLineStarts keeps authored text from turning into block syntax.
func escapeLineStarts(s string) string {
	lines := strings.Split(s, "\n")
	for i, line := range lines {
		trimmed := strings.TrimLeft(line, " \t")
		if trimmed == "" {
			lines[i] = ""
			continue
		}
		switch trimmed[0] {
		case '#', '-', '+', '=', '|':
			trimmed = "\\" + trimmed
		default:
			digits := 0
			for digits < len(trimmed) && trimmed[digits] >= '0' && trimmed[digits] <= '9' {
				digits++
			}
			if digits > 0 && digits < len(trimmed) && (trimmed[digits] == '.' || trimmed[digits] == ')') {
				trimmed = trimmed[:digits] + "\\" + trimmed[digits:]
			}
		}
		lines[i] = trimmed
	}
	return strings.Join(lines, "\n")
}

func safeURL(raw string) string {
	raw = strings.TrimSpace(raw)
	return strings.NewReplacer(" ", "%20", "(", "%28", ")", "%29", "<", "%3C", ">", "%3E", "\n", "", "\r", "").Replace(raw)
}

// routeHref builds the internal Note route. The workspace segment "_" means the
// reference was authored without a target workspace.
func routeHref(n node, block string) string {
	noteID, _ := n.Attrs["noteId"].(string)
	workspaceID, _ := n.Attrs["workspaceId"].(string)
	if workspaceID == "" {
		workspaceID = "_"
	}
	href := "/workspaces/" + url.PathEscape(workspaceID) + "?noteId=" + url.QueryEscape(noteID)
	if block != "" {
		href += "&blockId=" + url.QueryEscape(block)
	}
	return href
}

func plainText(n node) string {
	var b strings.Builder
	var walk func(node)
	walk = func(cur node) {
		b.WriteString(cur.Text)
		if cur.Type == "hardBreak" {
			b.WriteByte(' ')
		}
		for _, child := range cur.Content {
			walk(child)
		}
	}
	walk(n)
	return b.String()
}

// authoredText returns the text a person typed, in document order.
func authoredText(root node) string {
	var b strings.Builder
	var walk func(node)
	walk = func(n node) {
		b.WriteString(n.Text)
		switch n.Type {
		case "noteImage":
			alt, _ := n.Attrs["alt"].(string)
			b.WriteString(alt)
		case "inlineMath", "blockMath":
			latex, _ := n.Attrs["latex"].(string)
			b.WriteString(latex)
		}
		for _, child := range n.Content {
			walk(child)
		}
	}
	walk(root)
	return b.String()
}

// preserves reports whether every letter and digit of want appears in got, in
// order. Markdown only adds syntax around authored text, so a violation means
// text was lost.
func preserves(want, got string) bool {
	g := []rune(got)
	pos := 0
	for _, r := range want {
		if !unicode.IsLetter(r) && !unicode.IsDigit(r) {
			continue
		}
		for pos < len(g) && g[pos] != r {
			pos++
		}
		if pos == len(g) {
			return false
		}
		pos++
	}
	return true
}
