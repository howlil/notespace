package legacynote

import (
	"encoding/json"
	"errors"
	"strconv"
	"strings"
	"testing"
)

func markdownOf(t *testing.T, doc string) (string, Report) {
	t.Helper()
	out, report, err := Upgrade(json.RawMessage(doc))
	if err != nil {
		t.Fatalf("Upgrade: %v", err)
	}
	var env struct {
		Type string `json:"type"`
		Text string `json:"text"`
	}
	if err := json.Unmarshal(out, &env); err != nil || env.Type != "markdown" {
		t.Fatalf("output is not a Markdown envelope: %s", out)
	}
	return env.Text, report
}

func TestUpgradeKeepsExistingMarkdownByteForByte(t *testing.T) {
	raw := json.RawMessage(`{"type":"markdown","text":"# Keep   me\n\n- [ ] x ^id"}`)
	out, report, err := Upgrade(raw)
	if err != nil || report.Converted || string(out) != string(raw) {
		t.Fatalf("Upgrade(markdown) = %s %+v %v", out, report, err)
	}
}

func TestUpgradeRejectsUnknownEnvelope(t *testing.T) {
	for _, raw := range []string{`{"type":"html"}`, `not json`, `[]`} {
		if _, _, err := Upgrade(json.RawMessage(raw)); !errors.Is(err, ErrUnsupported) {
			t.Fatalf("Upgrade(%s) error = %v, want ErrUnsupported", raw, err)
		}
	}
}

func TestUpgradeConvertsCommonStructure(t *testing.T) {
	doc := `{"type":"doc","content":[
	  {"type":"heading","attrs":{"level":2,"blockId":"h1"},"content":[{"type":"text","text":"Plan"}]},
	  {"type":"paragraph","content":[
	    {"type":"text","text":"a "},
	    {"type":"text","text":"bold","marks":[{"type":"bold"}]},
	    {"type":"text","text":" and "},
	    {"type":"text","text":"link","marks":[{"type":"link","attrs":{"href":"https://example.com/a b"}}]},
	    {"type":"text","text":" 1*2_3"}
	  ]},
	  {"type":"taskList","content":[
	    {"type":"taskItem","attrs":{"checked":true},"content":[{"type":"paragraph","content":[{"type":"text","text":"done"}]}]},
	    {"type":"taskItem","attrs":{"checked":false},"content":[{"type":"paragraph","content":[{"type":"text","text":"todo"}]}]}
	  ]},
	  {"type":"orderedList","attrs":{"start":3},"content":[
	    {"type":"listItem","content":[{"type":"paragraph","content":[{"type":"text","text":"three"}]},
	      {"type":"bulletList","content":[{"type":"listItem","content":[{"type":"paragraph","content":[{"type":"text","text":"nested"}]}]}]}]}
	  ]},
	  {"type":"noteCallout","attrs":{"tone":"warning"},"content":[{"type":"paragraph","content":[{"type":"text","text":"careful"}]}]},
	  {"type":"noteToggle","attrs":{"open":true},"content":[
	    {"type":"noteToggleSummary","content":[{"type":"text","text":"More <b>"}]},
	    {"type":"paragraph","content":[{"type":"text","text":"hidden"}]}
	  ]},
	  {"type":"codeBlock","attrs":{"language":"go"},"content":[{"type":"text","text":"x := ` + "`a`" + `"}]},
	  {"type":"blockMath","attrs":{"latex":"a^2+b^2"}},
	  {"type":"noteEmbed","attrs":{"noteId":"n1","workspaceId":"w1","label":"Other"}},
	  {"type":"noteBlockReference","attrs":{"noteId":"n2","workspaceId":"","blockId":"b9"}},
	  {"type":"noteImage","attrs":{"src":"/api/workspaces/w1/assets/a1","assetId":"a1","alt":"pic"}}
	]}`
	got, report := markdownOf(t, doc)
	for _, want := range []string{
		"## Plan ^h1",
		"a **bold** and [link](https://example.com/a%20b) 1\\*2\\_3",
		"- [x] done\n- [ ] todo",
		"3. three\n   - nested",
		"> [!warning]\n> careful",
		"<details open>\n<summary>More &lt;b&gt;</summary>\n\nhidden\n\n</details>",
		"```go\nx := `a`\n```",
		"$$\na^2+b^2\n$$",
		"![Other](/workspaces/w1?noteId=n1)",
		"[Block reference](/workspaces/_?noteId=n2&blockId=b9)",
		"![pic](/api/workspaces/w1/assets/a1)",
	} {
		if !strings.Contains(got, want) {
			t.Errorf("missing %q in:\n%s", want, got)
		}
	}
	if len(report.Degraded) != 0 {
		t.Errorf("unexpected degradation %v", report.Degraded)
	}
}

func TestUpgradeConvertsTablesAndFlagsMergedCells(t *testing.T) {
	cell := func(kind, text string, extra string) string {
		return `{"type":"` + kind + `","attrs":{` + extra + `},"content":[{"type":"paragraph","content":[{"type":"text","text":"` + text + `"}]}]}`
	}
	doc := `{"type":"doc","content":[{"type":"table","content":[
	  {"type":"tableRow","content":[` + cell("tableHeader", "A|B", "") + `,` + cell("tableHeader", "C", `"colspan":2`) + `]},
	  {"type":"tableRow","content":[` + cell("tableCell", "1", "") + `]}
	]}]}`
	got, report := markdownOf(t, doc)
	want := "| A\\|B | C |\n| --- | --- |\n| 1 |  |"
	if got != want {
		t.Fatalf("table =\n%s\nwant\n%s", got, want)
	}
	if len(report.Degraded) != 1 || report.Degraded[0] != "merged table cells" {
		t.Fatalf("Degraded = %v", report.Degraded)
	}
}

func TestUpgradeEscapesAuthoredTextThatLooksLikeSyntax(t *testing.T) {
	doc := `{"type":"doc","content":[{"type":"paragraph","content":[{"type":"text","text":"# not heading"}]},{"type":"paragraph","content":[{"type":"text","text":"1. not list"}]}]}`
	got, _ := markdownOf(t, doc)
	if got != "\\# not heading\n\n1\\. not list" {
		t.Fatalf("got %q", got)
	}
}

func TestUpgradeKeepsRawLatexDelimitersTypeset(t *testing.T) {
	text := func(s string) string { return `{"type":"text","text":` + strconv.Quote(s) + `}` }
	para := func(children ...string) string {
		return `{"type":"paragraph","content":[` + strings.Join(children, ",") + `]}`
	}
	doc := `{"type":"doc","content":[` +
		para(text(`Inline \(E = mc^2\) works.`)) + `,` +
		para(text(`\[ \text{a} +`), `{"type":"hardBreak"}`, text(`b \]`)) + `,` +
		para(text(`before $$x^2$$ after`)) + `,` +
		para(text(`literal \(a $ b\) stays`)) +
		`]}`
	got, _ := markdownOf(t, doc)
	want := strings.Join([]string{
		`Inline $E = mc^2$ works.`,
		"$$\n\\text{a} +\nb\n$$",
		"before\n\n$$\nx^2\n$$\n\nafter",
		`literal \\(a \$ b\\) stays`,
	}, "\n\n")
	if got != want {
		t.Fatalf("got:\n%s\nwant:\n%s", got, want)
	}
}

func TestUpgradeReportsBlockIdsThatCannotBeMarkers(t *testing.T) {
	doc := `{"type":"doc","content":[` +
		`{"type":"paragraph","attrs":{"blockId":"uuid-ok_1"},"content":[{"type":"text","text":"kept"}]},` +
		`{"type":"paragraph","attrs":{"blockId":"has space"},"content":[{"type":"text","text":"unmarked"}]}]}`
	got, report := markdownOf(t, doc)
	if got != "kept ^uuid-ok_1\n\nunmarked" {
		t.Fatalf("got %q", got)
	}
	if len(report.Degraded) != 1 || report.Degraded[0] != "block ids with unsupported characters" {
		t.Fatalf("Degraded = %v", report.Degraded)
	}
}

func TestUpgradeEmptyDocumentIsEmptyMarkdown(t *testing.T) {
	got, report := markdownOf(t, `{"type":"doc","content":[{"type":"paragraph"}]}`)
	if got != "" || !report.Converted {
		t.Fatalf("got %q %+v", got, report)
	}
}

func TestPreservesDetectsLostText(t *testing.T) {
	if !preserves("Héllo 12", "**Héllo** <br> 1\\2") || preserves("abc", "ab") {
		t.Fatal("preserves does not track authored letters and digits")
	}
}
