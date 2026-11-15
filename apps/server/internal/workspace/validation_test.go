package workspace

import (
	"errors"
	"strings"
	"testing"
)

func TestValidTitleUsesRuneCount(t *testing.T) {
	if !ValidTitle(strings.Repeat("🙂", 160)) {
		t.Fatal("160 runes should be valid")
	}
	if ValidTitle(strings.Repeat("🙂", 161)) {
		t.Fatal("161 runes should be invalid")
	}
	if ValidTitle("   ") {
		t.Fatal("blank title should be invalid")
	}
}

func TestValidateWorkspaceOwnsAggregateInvariants(t *testing.T) {
	tests := []struct {
		name   string
		mutate func(*Workspace)
	}{
		{"missing id", func(w *Workspace) { w.ID = "" }},
		{"missing category", func(w *Workspace) { w.CategoryID = "" }},
		{"blank title", func(w *Workspace) { w.Title = "   " }},
		{"title over limit", func(w *Workspace) { w.Title = strings.Repeat("x", 161) }},
		{"zero version", func(w *Workspace) { w.Version = 0 }},
		{"invalid canvas format", func(w *Workspace) { w.Canvas.Format = "svg" }},
		{"invalid canvas shape", func(w *Workspace) { w.Canvas.Data = []byte("{\"elements\":[],\"appState\":{}}") }},
	}
	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			value := validWorkspaceFixture()
			tc.mutate(&value)
			if err := ValidateWorkspace(value); !errors.Is(err, ErrInvalid) {
				t.Fatalf("ValidateWorkspace() error = %v, want ErrInvalid", err)
			}
		})
	}
}
