package note

import (
	"encoding/json"
	"testing"
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
