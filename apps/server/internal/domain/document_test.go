package domain

import (
	"encoding/json"
	"errors"
	"reflect"
	"slices"
	"strings"
	"testing"
	"unicode/utf8"
)

func TestSummarizeDocumentSinglePassInvariants(t *testing.T) {
	longLine := strings.Repeat("alpha ", 30)
	cases := []struct {
		name      string
		doc       string
		wantPlain string
		wantLabel string
		wantEmpty bool
	}{
		{
			name:      "empty doc",
			doc:       `{"type":"doc","content":[{"type":"paragraph"}]}`,
			wantPlain: "",
			wantLabel: "",
			wantEmpty: true,
		},
		{
			name:      "whitespace-only paragraph",
			doc:       `{"type":"doc","content":[{"type":"paragraph","content":[{"type":"text","text":"   \t\n  "}]}]}`,
			wantPlain: "",
			wantLabel: "",
			wantEmpty: true,
		},
		{
			name:      "heading and multi-paragraph body",
			doc:       `{"type":"doc","content":[{"type":"heading","attrs":{"level":1},"content":[{"type":"text","text":"Distributed Consensus"}]},{"type":"paragraph","content":[{"type":"text","text":"Raft separates leader election from log replication."}]}]}`,
			wantPlain: "Distributed Consensus\nRaft separates leader election from log replication.",
			wantLabel: "Distributed Consensus",
			wantEmpty: false,
		},
		{
			name:      "image-only doc is not empty and indexes alt text",
			doc:       `{"type":"doc","content":[{"type":"noteImage","attrs":{"src":"/api/workspaces/w1/assets/a1","assetId":"a1","alt":"System diagram"}}]}`,
			wantPlain: "System diagram",
			wantLabel: "",
			wantEmpty: false,
		},
		{
			name:      "long label and excerpt truncation",
			doc:       `{"type":"doc","content":[{"type":"paragraph","content":[{"type":"text","text":"` + longLine + `"}]}]}`,
			wantPlain: strings.TrimSpace(longLine),
			wantLabel: TruncateRunes(strings.TrimSpace(longLine), MaxLabelRunes),
			wantEmpty: false,
		},
		{
			name:      "malformed json fallback",
			doc:       `not-valid-json`,
			wantPlain: "not-valid-json",
			wantLabel: "",
			wantEmpty: false,
		},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			raw := json.RawMessage(tc.doc)
			got := SummarizeDocument(raw)

			if got.PlainText != tc.wantPlain {
				t.Fatalf("PlainText = %q, want %q", got.PlainText, tc.wantPlain)
			}
			if got.Label != tc.wantLabel {
				t.Fatalf("Label = %q, want %q", got.Label, tc.wantLabel)
			}
			if wantExcerpt := TruncateRunes(tc.wantPlain, MaxExcerptRunes); got.Excerpt != wantExcerpt {
				t.Fatalf("Excerpt = %q, want %q", got.Excerpt, wantExcerpt)
			}
			if got.IsEmpty != tc.wantEmpty || got.IsEmpty != IsEmptyDocument(raw) {
				t.Fatalf("IsEmpty = %v, want %v", got.IsEmpty, tc.wantEmpty)
			}
		})
	}
}

func TestExtractBacklinkInfoSinglePassDeduplicatesAndLabels(t *testing.T) {
	doc := json.RawMessage(`{
		"type": "doc",
		"content": [
			{"type": "heading", "attrs": {"level": 2}, "content": [{"type": "text", "text": "Architecture Notes"}]},
			{"type": "paragraph", "content": [
				{"type": "text", "text": "See ", "marks": []},
				{"type": "text", "text": "target", "marks": [{"type": "link", "attrs": {"href": "/workspaces/w1?noteId=note-target"}}]}
			]},
			{"type": "noteEmbed", "attrs": {"noteId": "note-target"}},
			{"type": "noteBlockReference", "attrs": {"noteId": "note-target", "blockId": "blk-1"}},
			{"type": "noteEmbed", "attrs": {"noteId": "note-target"}}
		]
	}`)

	label, kinds := ExtractBacklinkInfo(doc, "note-target")
	if label != "Architecture Notes" {
		t.Fatalf("label = %q, want %q", label, "Architecture Notes")
	}
	if !slices.Equal(kinds, []string{BacklinkKindLink, BacklinkKindEmbed, BacklinkKindBlockRef}) {
		t.Fatalf("unexpected deduplicated kinds = %v", kinds)
	}

	missLabel, missKinds := ExtractBacklinkInfo(doc, "other-note")
	if missLabel != "" || len(missKinds) != 0 {
		t.Fatalf("unmatched target returned (%q, %v), want empty", missLabel, missKinds)
	}
}

func TestParseDocumentRejectsUnsafeLinks(t *testing.T) {
	valid := json.RawMessage(`{"type":"doc","content":[{"type":"paragraph","content":[{"type":"text","text":"safe","marks":[{"type":"link","attrs":{"href":"https://example.com"}}]}]}]}`)
	if _, err := ParseDocument(valid); err != nil {
		t.Fatalf("valid link rejected: %v", err)
	}
	internal := json.RawMessage(`{"type":"doc","content":[{"type":"paragraph","content":[{"type":"text","text":"jump","marks":[{"type":"link","attrs":{"href":"/workspaces/workspace-1?noteId=note-1"}}]}]}]}`)
	if _, err := ParseDocument(internal); err != nil {
		t.Fatalf("valid internal link rejected: %v", err)
	}
	for _, href := range []string{"javascript:alert(1)", "data:text/html,unsafe", "//evil.example/redirect", "/settings", "https://example.com\nX-Evil: yes"} {
		unsafe := json.RawMessage(`{"type":"doc","content":[{"type":"paragraph","content":[{"type":"text","text":"unsafe","marks":[{"type":"link","attrs":{"href":"` + href + `"}}]}]}]}`)
		if _, err := ParseDocument(unsafe); !errors.Is(err, ErrNoteInvalid) {
			t.Fatalf("unsafe href %q error = %v, want ErrNoteInvalid", href, err)
		}
	}
}

func TestParseDocumentAcceptsManagedNoteNodesAndRejectsUnsafeAttrs(t *testing.T) {
	valid := json.RawMessage(`{"type":"doc","content":[{"type":"noteImage","attrs":{"src":"/api/workspaces/workspace-1/assets/image-1","assetId":"image-1","alt":"photo"}},{"type":"noteEmbed","attrs":{"noteId":"note-1","workspaceId":"workspace-1"}},{"type":"noteBlockReference","attrs":{"noteId":"note-1","workspaceId":"workspace-1","blockId":"block-1"}}]}`)
	if _, err := ParseDocument(valid); err != nil {
		t.Fatalf("managed note nodes rejected: %v", err)
	}
	for _, document := range []string{
		`{"type":"doc","content":[{"type":"noteImage","attrs":{"src":"https://evil.example/image"}}]}`,
		`{"type":"doc","content":[{"type":"noteEmbed","attrs":{"noteId":"note-1","workspaceId":"/evil"}}]}`,
		`{"type":"doc","content":[{"type":"noteBlockReference","attrs":{"noteId":"note-1","blockId":""}}]}`,
	} {
		if _, err := ParseDocument(json.RawMessage(document)); !errors.Is(err, ErrNoteInvalid) {
			t.Fatalf("unsafe managed node document error = %v", err)
		}
	}
}

func TestParseDocumentAcceptsCalloutsAndRejectsUnknownTone(t *testing.T) {
	valid := json.RawMessage(`{"type":"doc","content":[{"type":"noteCallout","attrs":{"tone":"warning"},"content":[{"type":"paragraph","content":[{"type":"text","text":"Check this"}]}]}]}`)
	if _, err := ParseDocument(valid); err != nil {
		t.Fatalf("valid callout rejected: %v", err)
	}
	invalid := json.RawMessage(`{"type":"doc","content":[{"type":"noteCallout","attrs":{"tone":"javascript"},"content":[{"type":"paragraph"}]}]}`)
	if _, err := ParseDocument(invalid); !errors.Is(err, ErrNoteInvalid) {
		t.Fatalf("unknown callout tone accepted: %v", err)
	}
}

func TestIsEmptyDocumentOnlyAcceptsBlankParagraphs(t *testing.T) {
	for _, document := range []string{
		`{"type":"doc","content":[]}`,
		`{"type":"doc","content":[{"type":"paragraph"}]}`,
		`{"type":"doc","content":[{"type":"paragraph","content":[{"type":"text","text":"   "}]}]}`,
	} {
		if !IsEmptyDocument(json.RawMessage(document)) {
			t.Fatalf("blank document %s was not treated as empty", document)
		}
	}
	for _, document := range []string{
		`{"type":"doc","content":[{"type":"paragraph","content":[{"type":"text","text":"kept"}]}]}`,
		`{"type":"doc","content":[{"type":"heading","attrs":{"level":1}}]}`,
		`{"type":"doc","content":[{"type":"noteImage","attrs":{"assetId":"image-1"}}]}`,
		`{"type":"doc","content":[{"type":"noteToggle","attrs":{"open":true},"content":[{"type":"noteToggleSummary"},{"type":"paragraph"}]}]}`,
		`{"type":"doc","content":[{"type":"noteToggle","attrs":{"open":false}}]}`,
		`{"type":"paragraph","content":[]}`,
		`not json`,
	} {
		if IsEmptyDocument(json.RawMessage(document)) {
			t.Fatalf("document %s with content or invalid shape was treated as empty", document)
		}
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

func TestExtractSearchTextCollectsProseMirrorText(t *testing.T) {
	doc := json.RawMessage(`{
		"type":"doc",
		"content":[
			{"type":"paragraph"},
			{"type":"heading","attrs":{"level":1,"blockId":"550e8400-e29b-41d4-a716-446655440000"},"content":[{"type":"text","text":"  First   line "}]},
			{"type":"paragraph","attrs":{"blockId":"660e8400-e29b-41d4-a716-446655440001"},"content":[
				{"type":"text","text":"Second "},
				{"type":"text","text":"linked","marks":[{"type":"link","attrs":{"href":"https://secret.example/hidden-url"}},{"type":"noteHighlight","attrs":{"tone":"yellow"}}]},
				{"type":"text","text":"   line"}
			]},
			{"type":"noteCallout","attrs":{"tone":"warning","blockId":"770e8400-e29b-41d4-a716-446655440002"},"content":[
				{"type":"paragraph","content":[{"type":"text","text":"Callout body"}]}
			]},
			{"type":"noteToggle","attrs":{"open":false,"blockId":"880e8400-e29b-41d4-a716-446655440003"},"content":[
				{"type":"noteToggleSummary","content":[{"type":"text","text":"Toggle title"}]},
				{"type":"paragraph","content":[{"type":"text","text":"Toggle details"}]}
			]},
			{"type":"noteImage","attrs":{"src":"/api/workspaces/ws-1/assets/asset-99","assetId":"asset-99","alt":"System   diagram"}},
			{"type":"noteImage","attrs":{"src":"/api/workspaces/ws-1/assets/asset-empty","assetId":"asset-empty","alt":"   "}},
			{"type":"noteEmbed","attrs":{"noteId":"embed-target","workspaceId":"ws-1","label":"Leaked embed label"}},
			{"type":"noteBlockReference","attrs":{"noteId":"ref-target","workspaceId":"ws-1","blockId":"ref-block-uuid"}}
		]
	}`)
	got := SummarizeDocument(doc).PlainText
	want := strings.Join([]string{
		"First line",
		"Second linked line",
		"Callout body",
		"Toggle title",
		"Toggle details",
		"System diagram",
	}, "\n")
	if got != want {
		t.Fatalf("SummarizeDocument.PlainText =\n%q\nwant:\n%q", got, want)
	}
	for _, forbidden := range []string{
		"doc", "paragraph", "heading", "text", "noteCallout", "warning",
		"noteToggle", "noteToggleSummary", "noteImage", "noteEmbed", "noteBlockReference",
		"noteHighlight", "yellow", "550e8400", "660e8400", "770e8400", "880e8400",
		"secret.example", "hidden-url", "/api/workspaces", "asset-99",
		"embed-target", "Leaked embed label", "ref-target", "ref-block-uuid",
	} {
		if strings.Contains(got, forbidden) {
			t.Fatalf("SummarizeDocument.PlainText leaked metadata %q in %q", forbidden, got)
		}
	}
	if fallback := SummarizeDocument(json.RawMessage(`plain fallback`)).PlainText; fallback != "plain fallback" {
		t.Fatalf("fallback search text = %q", fallback)
	}
	if empty := SummarizeDocument(json.RawMessage(`{"type":"doc","content":[]}`)).PlainText; empty != "" {
		t.Fatalf("empty doc search text = %q, want empty", empty)
	}
}

func TestExtractFirstLineMirrorsWebBehavior(t *testing.T) {
	doc := json.RawMessage(`{
		"type":"doc",
		"content":[
			{"type":"paragraph","content":[{"type":"text","text":"   "}]},
			{"type":"noteImage","attrs":{"src":"/api/workspaces/ws-1/assets/a1","assetId":"a1","alt":"Cover image"}},
			{"type":"noteToggle","attrs":{"open":true},"content":[
				{"type":"noteToggleSummary","content":[{"type":"text","text":"  Toggle   "},{"type":"text","text":"heading\tline"}]},
				{"type":"paragraph","content":[{"type":"text","text":"Body text"}]}
			]}
		]
	}`)
	if got := SummarizeDocument(doc).Label; got != "Toggle heading line" {
		t.Fatalf("SummarizeDocument.Label = %q, want %q", got, "Toggle heading line")
	}

	longText := strings.Repeat("α", 140)
	longDoc := json.RawMessage(`{"type":"doc","content":[{"type":"paragraph","content":[{"type":"text","text":"` + longText + `"}]}]}`)
	gotLong := SummarizeDocument(longDoc).Label
	if utf8.RuneCountInString(gotLong) != MaxLabelRunes || !strings.HasSuffix(gotLong, "…") {
		t.Fatalf("truncated SummarizeDocument.Label len=%d value=%q", utf8.RuneCountInString(gotLong), gotLong)
	}

	if got := SummarizeDocument(json.RawMessage(`{"type":"doc","content":[]}`)).Label; got != "" {
		t.Fatalf("empty doc SummarizeDocument.Label = %q", got)
	}
	if got := SummarizeDocument(json.RawMessage(`not json`)).Label; got != "" {
		t.Fatalf("invalid json SummarizeDocument.Label = %q", got)
	}
}

func TestParseDocumentSlice4ToggleAndColorMarks(t *testing.T) {
	validDoc := json.RawMessage(`{
		"type":"doc",
		"content":[
			{
				"type":"noteToggle",
				"attrs":{"open":true,"blockId":"toggle-1"},
				"content":[
					{"type":"noteToggleSummary","content":[{"type":"text","text":"Summary"}]},
					{"type":"paragraph","content":[
						{"type":"text","text":"Highlighted","marks":[{"type":"noteHighlight","attrs":{"tone":"pink"}}]},
						{"type":"text","text":"Colored","marks":[{"type":"noteTextColor","attrs":{"tone":"muted"}}]}
					]}
				]
			},
			{
				"type":"noteToggle",
				"content":[
					{"type":"noteToggleSummary","attrs":{},"content":[{"type":"text","text":"No attrs toggle"}]},
					{"type":"paragraph"}
				]
			}
		]
	}`)
	if _, err := ParseDocument(validDoc); err != nil {
		t.Fatalf("valid Slice 4 document rejected: %v", err)
	}

	for _, tone := range []string{"yellow", "green", "blue", "pink", "purple", "orange"} {
		doc := json.RawMessage(`{"type":"doc","content":[{"type":"paragraph","content":[{"type":"text","text":"x","marks":[{"type":"noteHighlight","attrs":{"tone":"` + tone + `"}}]}]}]}`)
		if _, err := ParseDocument(doc); err != nil {
			t.Fatalf("valid noteHighlight tone %q rejected: %v", tone, err)
		}
	}
	for _, tone := range []string{"muted", "red", "orange", "yellow", "green", "blue", "purple", "#e11d48", "#0EA5E9"} {
		doc := json.RawMessage(`{"type":"doc","content":[{"type":"paragraph","content":[{"type":"text","text":"x","marks":[{"type":"noteTextColor","attrs":{"tone":"` + tone + `"}}]}]}]}`)
		if _, err := ParseDocument(doc); err != nil {
			t.Fatalf("valid noteTextColor tone %q rejected: %v", tone, err)
		}
	}
	for _, tone := range []string{"#f59e0b", "#10B981"} {
		doc := json.RawMessage(`{"type":"doc","content":[{"type":"paragraph","content":[{"type":"text","text":"x","marks":[{"type":"noteHighlight","attrs":{"tone":"` + tone + `"}}]}]}]}`)
		if _, err := ParseDocument(doc); err != nil {
			t.Fatalf("valid custom noteHighlight hex %q rejected: %v", tone, err)
		}
	}

	invalidDocs := []string{
		`{"type":"doc","content":[{"type":"noteToggle","attrs":{"open":"true"}}]}`,
		`{"type":"doc","content":[{"type":"noteToggle","attrs":{"open":1}}]}`,
		`{"type":"doc","content":[{"type":"noteToggle","attrs":{"blockId":"bad/id"}}]}`,
		`{"type":"doc","content":[{"type":"noteToggle","attrs":"not-a-map"}]}`,
		`{"type":"doc","content":[{"type":"noteToggleSummary","attrs":"not-a-map"}]}`,
		`{"type":"doc","content":[{"type":"paragraph","content":[{"type":"text","text":"x","marks":[{"type":"noteHighlight"}]}]}]}`,
		`{"type":"doc","content":[{"type":"paragraph","content":[{"type":"text","text":"x","marks":[{"type":"noteHighlight","attrs":{}}]}]}]}`,
		`{"type":"doc","content":[{"type":"paragraph","content":[{"type":"text","text":"x","marks":[{"type":"noteHighlight","attrs":{"tone":"red"}}]}]}]}`,
		`{"type":"doc","content":[{"type":"paragraph","content":[{"type":"text","text":"x","marks":[{"type":"noteHighlight","attrs":{"tone":"#fff"}}]}]}]}`,
		`{"type":"doc","content":[{"type":"paragraph","content":[{"type":"text","text":"x","marks":[{"type":"noteTextColor"}]}]}]}`,
		`{"type":"doc","content":[{"type":"paragraph","content":[{"type":"text","text":"x","marks":[{"type":"noteTextColor","attrs":{"tone":"pink"}}]}]}]}`,
		`{"type":"doc","content":[{"type":"paragraph","content":[{"type":"text","text":"x","marks":[{"type":"noteTextColor","attrs":{"tone":"#12345g"}}]}]}]}`,
		`{"type":"doc","content":[{"type":"paragraph","content":[{"type":"text","text":"x","marks":[{"type":"noteTextColor","attrs":{"tone":123}}]}]}]}`,
	}
	for _, raw := range invalidDocs {
		if _, err := ParseDocument(json.RawMessage(raw)); !errors.Is(err, ErrNoteInvalid) {
			t.Fatalf("invalid Slice 4 document %s error = %v, want ErrNoteInvalid", raw, err)
		}
	}
}

func TestExtractBacklinkKindsDeduplicatesAndMatchesQueryParam(t *testing.T) {
	doc := json.RawMessage(`{
		"type":"doc",
		"content":[
			{"type":"paragraph","content":[
				{"type":"text","text":"Link 1","marks":[{"type":"link","attrs":{"href":"/workspaces/ws-1?noteId=target-note"}}]},
				{"type":"text","text":"Link 2","marks":[{"type":"link","attrs":{"href":"/workspaces/ws-2?noteId=target-note&blockId=b-1"}}]},
				{"type":"text","text":"Other","marks":[{"type":"link","attrs":{"href":"/workspaces/ws-2?noteId=target-note-other"}}]}
			]},
			{"type":"noteToggle","attrs":{"open":true},"content":[
				{"type":"noteToggleSummary","content":[{"type":"text","text":"Refs"}]},
				{"type":"noteEmbed","attrs":{"noteId":"target-note","workspaceId":"ws-1"}},
				{"type":"noteEmbed","attrs":{"noteId":"target-note","workspaceId":"ws-2"}},
				{"type":"noteBlockReference","attrs":{"noteId":"target-note","workspaceId":"ws-1","blockId":"blk-1"}}
			]}
		]
	}`)
	_, got := ExtractBacklinkInfo(doc, "target-note")
	want := []string{BacklinkKindLink, BacklinkKindEmbed, BacklinkKindBlockRef}
	if !reflect.DeepEqual(got, want) {
		t.Fatalf("ExtractBacklinkInfo = %v, want %v", got, want)
	}
	if _, other := ExtractBacklinkInfo(doc, "target-note-other"); !reflect.DeepEqual(other, []string{BacklinkKindLink}) {
		t.Fatalf("ExtractBacklinkInfo(other) = %v, want [link]", other)
	}
	if _, none := ExtractBacklinkInfo(doc, "missing"); len(none) != 0 {
		t.Fatalf("ExtractBacklinkInfo(missing) = %v, want empty", none)
	}
}
