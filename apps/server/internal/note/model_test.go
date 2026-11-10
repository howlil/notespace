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
	for _, href := range []string{"javascript:alert(1)", "data:text/html,unsafe", "https://example.com\nX-Evil: yes"} {
		unsafe := json.RawMessage(`{"type":"doc","content":[{"type":"paragraph","content":[{"type":"text","text":"unsafe","marks":[{"type":"link","attrs":{"href":"` + href + `"}}]}]}]}`)
		if err := ValidateDocument(unsafe); err != ErrInvalid {
			t.Fatalf("unsafe href %q error = %v, want ErrInvalid", href, err)
		}
	}
}
