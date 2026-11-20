package note

import (
	"encoding/json"
	"errors"
	"reflect"
	"strings"
	"testing"
	"unicode/utf8"
)

func TestValidateDocumentRejectsUnsafeLinks(t *testing.T) {
	valid := json.RawMessage(`{"type":"doc","content":[{"type":"paragraph","content":[{"type":"text","text":"safe","marks":[{"type":"link","attrs":{"href":"https://example.com"}}]}]}]}`)
	if err := ValidateDocument(valid); err != nil {
		t.Fatalf("valid link rejected: %v", err)
	}
	internal := json.RawMessage(`{"type":"doc","content":[{"type":"paragraph","content":[{"type":"text","text":"jump","marks":[{"type":"link","attrs":{"href":"/workspaces/workspace-1?noteId=note-1"}}]}]}]}`)
	if err := ValidateDocument(internal); err != nil {
		t.Fatalf("valid internal link rejected: %v", err)
	}
	for _, href := range []string{"javascript:alert(1)", "data:text/html,unsafe", "//evil.example/redirect", "/settings", "https://example.com\nX-Evil: yes"} {
		unsafe := json.RawMessage(`{"type":"doc","content":[{"type":"paragraph","content":[{"type":"text","text":"unsafe","marks":[{"type":"link","attrs":{"href":"` + href + `"}}]}]}]}`)
		if err := ValidateDocument(unsafe); err != ErrInvalid {
			t.Fatalf("unsafe href %q error = %v, want ErrInvalid", href, err)
		}
	}
}

func TestValidateDocumentAcceptsManagedNoteNodesAndRejectsUnsafeAttrs(t *testing.T) {
	valid := json.RawMessage(`{"type":"doc","content":[{"type":"noteImage","attrs":{"src":"/api/workspaces/workspace-1/assets/image-1","assetId":"image-1","alt":"photo"}},{"type":"noteEmbed","attrs":{"noteId":"note-1","workspaceId":"workspace-1"}},{"type":"noteBlockReference","attrs":{"noteId":"note-1","workspaceId":"workspace-1","blockId":"block-1"}}]}`)
	if err := ValidateDocument(valid); err != nil {
		t.Fatalf("managed note nodes rejected: %v", err)
	}
	for _, document := range []string{
		`{"type":"doc","content":[{"type":"noteImage","attrs":{"src":"https://evil.example/image"}}]}`,
		`{"type":"doc","content":[{"type":"noteEmbed","attrs":{"noteId":"note-1","workspaceId":"/evil"}}]}`,
		`{"type":"doc","content":[{"type":"noteBlockReference","attrs":{"noteId":"note-1","blockId":""}}]}`,
	} {
		if err := ValidateDocument(json.RawMessage(document)); err != ErrInvalid {
			t.Fatalf("unsafe managed node document error = %v", err)
		}
	}
}

func TestValidateDocumentAcceptsCalloutsAndRejectsUnknownTone(t *testing.T) {
	valid := json.RawMessage(`{"type":"doc","content":[{"type":"noteCallout","attrs":{"tone":"warning"},"content":[{"type":"paragraph","content":[{"type":"text","text":"Check this"}]}]}]}`)
	if err := ValidateDocument(valid); err != nil {
		t.Fatalf("valid callout rejected: %v", err)
	}
	invalid := json.RawMessage(`{"type":"doc","content":[{"type":"noteCallout","attrs":{"tone":"javascript"},"content":[{"type":"paragraph"}]}]}`)
	if err := ValidateDocument(invalid); !errors.Is(err, ErrInvalid) {
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

func TestExtractCanvasPlacementsReadsActivePlacementsAndRejectsMalformedJSON(t *testing.T) {
	compact := true
	scene := json.RawMessage(`{"elements":[
		{"id":"el-live","isDeleted":false,"x":10,"y":20,"width":320,"height":180,"customData":{"notespaceNote":{"noteId":"note-1","instanceId":"inst-1","compact":true}}},
		{"id":"el-dead","isDeleted":true,"x":0,"y":0,"width":200,"height":100,"customData":{"notespaceNote":{"noteId":"note-1","instanceId":"inst-dead"}}},
		{"id":"el-rect","isDeleted":false,"x":5,"y":5,"width":50,"height":50}
	],"appState":{},"files":{}}`)
	placements, err := ExtractCanvasPlacements(scene)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if len(placements) != 1 {
		t.Fatalf("placements len = %d, want 1", len(placements))
	}
	got := placements[0]
	if got.ElementID != "el-live" || got.NoteID != "note-1" || got.InstanceID != "inst-1" ||
		got.X != 10 || got.Y != 20 || got.Width != 320 || got.Height != 180 ||
		got.Compact == nil || *got.Compact != compact {
		t.Fatalf("unexpected placement: %+v", got)
	}
	if _, err := ExtractCanvasPlacements(json.RawMessage(`not json`)); !errors.Is(err, ErrInvalid) {
		t.Fatalf("malformed scene error = %v, want ErrInvalid", err)
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
	got := ExtractSearchText(doc)
	want := strings.Join([]string{
		"First line",
		"Second linked line",
		"Callout body",
		"Toggle title",
		"Toggle details",
		"System diagram",
	}, "\n")
	if got != want {
		t.Fatalf("ExtractSearchText =\n%q\nwant:\n%q", got, want)
	}
	for _, forbidden := range []string{
		"doc", "paragraph", "heading", "text", "noteCallout", "warning",
		"noteToggle", "noteToggleSummary", "noteImage", "noteEmbed", "noteBlockReference",
		"noteHighlight", "yellow", "550e8400", "660e8400", "770e8400", "880e8400",
		"secret.example", "hidden-url", "/api/workspaces", "asset-99",
		"embed-target", "Leaked embed label", "ref-target", "ref-block-uuid",
	} {
		if strings.Contains(got, forbidden) {
			t.Fatalf("ExtractSearchText leaked metadata %q in %q", forbidden, got)
		}
	}
	if fallback := ExtractSearchText(json.RawMessage(`plain fallback`)); fallback != "plain fallback" {
		t.Fatalf("fallback search text = %q", fallback)
	}
	if empty := ExtractSearchText(json.RawMessage(`{"type":"doc","content":[]}`)); empty != "" {
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
	if got := ExtractFirstLine(doc); got != "Toggle heading line" {
		t.Fatalf("ExtractFirstLine = %q, want %q", got, "Toggle heading line")
	}

	longText := strings.Repeat("α", 140)
	longDoc := json.RawMessage(`{"type":"doc","content":[{"type":"paragraph","content":[{"type":"text","text":"` + longText + `"}]}]}`)
	gotLong := ExtractFirstLine(longDoc)
	if utf8.RuneCountInString(gotLong) != MaxLabelRunes || !strings.HasSuffix(gotLong, "…") {
		t.Fatalf("truncated ExtractFirstLine len=%d value=%q", utf8.RuneCountInString(gotLong), gotLong)
	}

	if got := ExtractFirstLine(json.RawMessage(`{"type":"doc","content":[]}`)); got != "" {
		t.Fatalf("empty doc ExtractFirstLine = %q", got)
	}
	if got := ExtractFirstLine(json.RawMessage(`not json`)); got != "" {
		t.Fatalf("invalid json ExtractFirstLine = %q", got)
	}
}

func TestValidateDocumentSlice4ToggleAndColorMarks(t *testing.T) {
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
	if err := ValidateDocument(validDoc); err != nil {
		t.Fatalf("valid Slice 4 document rejected: %v", err)
	}

	for _, tone := range []string{"yellow", "green", "blue", "pink", "purple", "orange"} {
		doc := json.RawMessage(`{"type":"doc","content":[{"type":"paragraph","content":[{"type":"text","text":"x","marks":[{"type":"noteHighlight","attrs":{"tone":"` + tone + `"}}]}]}]}`)
		if err := ValidateDocument(doc); err != nil {
			t.Fatalf("valid noteHighlight tone %q rejected: %v", tone, err)
		}
	}
	for _, tone := range []string{"muted", "red", "orange", "yellow", "green", "blue", "purple"} {
		doc := json.RawMessage(`{"type":"doc","content":[{"type":"paragraph","content":[{"type":"text","text":"x","marks":[{"type":"noteTextColor","attrs":{"tone":"` + tone + `"}}]}]}]}`)
		if err := ValidateDocument(doc); err != nil {
			t.Fatalf("valid noteTextColor tone %q rejected: %v", tone, err)
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
		`{"type":"doc","content":[{"type":"paragraph","content":[{"type":"text","text":"x","marks":[{"type":"noteTextColor"}]}]}]}`,
		`{"type":"doc","content":[{"type":"paragraph","content":[{"type":"text","text":"x","marks":[{"type":"noteTextColor","attrs":{"tone":"pink"}}]}]}]}`,
		`{"type":"doc","content":[{"type":"paragraph","content":[{"type":"text","text":"x","marks":[{"type":"noteTextColor","attrs":{"tone":123}}]}]}]}`,
	}
	for _, raw := range invalidDocs {
		if err := ValidateDocument(json.RawMessage(raw)); !errors.Is(err, ErrInvalid) {
			t.Fatalf("invalid Slice 4 document %s error = %v, want ErrInvalid", raw, err)
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
	got := ExtractBacklinkKinds(doc, "target-note")
	want := []string{BacklinkKindLink, BacklinkKindEmbed, BacklinkKindBlockRef}
	if !reflect.DeepEqual(got, want) {
		t.Fatalf("ExtractBacklinkKinds = %v, want %v", got, want)
	}
	if other := ExtractBacklinkKinds(doc, "target-note-other"); !reflect.DeepEqual(other, []string{BacklinkKindLink}) {
		t.Fatalf("ExtractBacklinkKinds(other) = %v, want [link]", other)
	}
	if none := ExtractBacklinkKinds(doc, "missing"); len(none) != 0 {
		t.Fatalf("ExtractBacklinkKinds(missing) = %v, want empty", none)
	}
}
