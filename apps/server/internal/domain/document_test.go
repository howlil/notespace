package domain

import (
	"encoding/json"
	"errors"
	"reflect"
	"strings"
	"testing"
	"unicode/utf8"
)

func md(text string) json.RawMessage {
	raw, _ := json.Marshal(map[string]string{"type": "markdown", "text": text})
	return raw
}

func TestParseDocumentAcceptsOnlyTheMarkdownEnvelope(t *testing.T) {
	if _, err := ParseDocument(md("# ok\n\nbody")); err != nil {
		t.Fatalf("valid Markdown rejected: %v", err)
	}
	for name, raw := range map[string]string{
		"retired rich doc": `{"type":"doc","content":[]}`,
		"extra key":        `{"type":"markdown","text":"x","html":"<b>"}`,
		"missing text":     `{"type":"markdown"}`,
		"non-string text":  `{"type":"markdown","text":1}`,
		"nul byte":         `{"type":"markdown","text":"a\u0000b"}`,
		"not an object":    `"markdown"`,
		"empty":            ``,
	} {
		if _, err := ParseDocument(json.RawMessage(raw)); !errors.Is(err, ErrNoteInvalid) {
			t.Errorf("%s: error = %v, want ErrNoteInvalid", name, err)
		}
	}
	if _, err := ParseDocument(md(strings.Repeat("a", MaxDocumentBytes))); !errors.Is(err, ErrNoteInvalid) {
		t.Errorf("oversized document error = %v, want ErrNoteInvalid", err)
	}
}

func TestSummarizeDocumentDerivesReadableSearchTextWithoutMetadata(t *testing.T) {
	text := "## **Plan** ^h1\n\nSee [the spec](/workspaces/ws-1?noteId=11111111-aaaa) and ![pic](/api/workspaces/ws-1/assets/asset-9) ^p1\n\n" +
		"> [!tip]\n> remember `code` \\* star\n\n- [x] done\n1. first\n\n| a | b |\n| --- | --- |\n| 1 | 2 |\n\n" +
		"<details open>\n<summary>More</summary>\n\nhidden\n\n</details>\n\n```go\nx := 1\n```\n\n$$\nE=mc^2\n$$"
	got := SummarizeDocument(md(text))
	want := strings.Join([]string{"Plan", "See the spec and pic", "remember code * star", "done", "first", "a b", "1 2", "More", "hidden", "x := 1", "E=mc^2"}, "\n")
	if got.PlainText != want {
		t.Fatalf("PlainText =\n%q\nwant\n%q", got.PlainText, want)
	}
	for _, leaked := range []string{"11111111", "noteId", "asset-9", "workspaces", "^h1", "details", "[!tip]"} {
		if strings.Contains(got.PlainText, leaked) {
			t.Errorf("PlainText leaked %q", leaked)
		}
	}
	if got.Label != "Plan" || got.IsEmpty || got.Excerpt != got.PlainText {
		t.Fatalf("summary = %+v", got)
	}
}

func TestSummarizeDocumentLabelAndEmptiness(t *testing.T) {
	long := strings.Repeat("é", MaxLabelRunes+30)
	if label := SummarizeDocument(md("\n\n# " + long)).Label; utf8.RuneCountInString(label) != MaxLabelRunes || !strings.HasSuffix(label, "…") {
		t.Fatalf("label not truncated to %d runes: %q", MaxLabelRunes, label)
	}
	for _, blank := range []string{"", " \n\t\n"} {
		if !SummarizeDocument(md(blank)).IsEmpty || !IsEmptyDocument(md(blank)) {
			t.Errorf("%q should be empty", blank)
		}
	}
	if IsEmptyDocument(md("---")) || IsEmptyDocument(json.RawMessage(`not json`)) {
		t.Error("non-blank or unreadable documents must not report empty")
	}
	if fallback := SummarizeDocument(json.RawMessage(`plain fallback`)).PlainText; fallback != "plain fallback" {
		t.Fatalf("unreadable document must stay searchable, got %q", fallback)
	}
}

func TestExtractBacklinkInfoClassifiesLinkEmbedAndBlockRef(t *testing.T) {
	text := "# Source\n\n[plain](/workspaces/w1?noteId=target) and [again](/workspaces/w2?noteId=target)\n\n" +
		"![Embedded](/workspaces/w1?noteId=target)\n\n[Block reference](/workspaces/w1?noteId=target&blockId=b1)\n\n" +
		"[other](/workspaces/w1?noteId=other-note)"
	label, kinds := ExtractBacklinkInfo(md(text), "target")
	if label != "Source" || !reflect.DeepEqual(kinds, []string{BacklinkKindLink, BacklinkKindEmbed, BacklinkKindBlockRef}) {
		t.Fatalf("ExtractBacklinkInfo = %q %v", label, kinds)
	}
	if _, other := ExtractBacklinkInfo(md(text), "other-note"); !reflect.DeepEqual(other, []string{BacklinkKindLink}) {
		t.Fatalf("other-note kinds = %v", other)
	}
	if _, none := ExtractBacklinkInfo(md(text), "missing"); len(none) != 0 {
		t.Fatalf("missing kinds = %v", none)
	}
}

func TestExtractBacklinkInfoIgnoresCodeEscapesAndExternalLinks(t *testing.T) {
	text := "`[x](/workspaces/w?noteId=target)`\n\n```\n[y](/workspaces/w?noteId=target)\n```\n\n" +
		"\\[z](/workspaces/w?noteId=target)\n\n[ext](https://example.com/workspaces/w?noteId=target)"
	if _, kinds := ExtractBacklinkInfo(md(text), "target"); len(kinds) != 0 {
		t.Fatalf("kinds = %v, want none", kinds)
	}
}

func TestParseSceneDataReadsActivePlacementsAndRejectsMalformedJSON(t *testing.T) {
	compact := true
	scene := json.RawMessage(`{"elements":[
		{"id":"el-live","isDeleted":false,"x":10,"y":20,"width":320,"height":180,"customData":{"notespaceNote":{"noteId":"note-1","instanceId":"inst-1","compact":true}}},
		{"id":"el-dead","isDeleted":true,"x":0,"y":0,"width":200,"height":100,"customData":{"notespaceNote":{"noteId":"note-1","instanceId":"inst-dead"}}},
		{"id":"el-rect","isDeleted":false,"x":5,"y":5,"width":50,"height":50}
	],"appState":{},"files":{}}`)
	parsed, err := ParseSceneData(scene)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	placements := parsed.Placements()
	if len(placements) != 1 || parsed.ActiveElementCount() != 2 {
		t.Fatalf("placements=%d active=%d, want 1 and 2", len(placements), parsed.ActiveElementCount())
	}
	got := placements[0]
	if got.ElementID != "el-live" || got.NoteID != "note-1" || got.InstanceID != "inst-1" ||
		got.X != 10 || got.Y != 20 || got.Width != 320 || got.Height != 180 ||
		got.Compact == nil || *got.Compact != compact {
		t.Fatalf("unexpected placement: %+v", got)
	}
	if _, err := ParseSceneData(json.RawMessage(`not json`)); !errors.Is(err, ErrNoteInvalid) {
		t.Fatalf("malformed scene error = %v, want ErrNoteInvalid", err)
	}
}

func TestExtractNoteReferencesClassifiesAndExtractsExcerpts(t *testing.T) {
	text := "# Source\n\nSee [spec](/workspaces/w1?noteId=target-1) and ![diagram](/workspaces/w1?noteId=target-2)\n\n" +
		"Jump to [section](/workspaces/w1?noteId=target-1&blockId=b1).\n\n" +
		"`[ignored](/workspaces/w1?noteId=ignored)`\n\n```\n[fenced](/workspaces/w1?noteId=ignored)\n```\n\n" +
		"\\[escaped](/workspaces/w1?noteId=ignored) and [ext](https://example.com/workspaces/w1?noteId=ignored)"

	refs := ExtractNoteReferences(md(text))
	want := []ExtractedNoteReference{
		{TargetNoteID: "target-1", Kind: BacklinkKindLink, Excerpt: "See spec and diagram"},
		{TargetNoteID: "target-2", Kind: BacklinkKindEmbed, Excerpt: "See spec and diagram"},
		{TargetNoteID: "target-1", Kind: BacklinkKindBlockRef, Excerpt: "Jump to section."},
	}
	if !reflect.DeepEqual(refs, want) {
		t.Fatalf("ExtractNoteReferences = %+v\nwant %+v", refs, want)
	}
}
