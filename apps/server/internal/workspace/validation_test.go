package workspace

import (
	"errors"
	"fmt"
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
		{"split ratio below minimum", func(w *Workspace) { w.SplitRatio = 0.2499 }},
		{"split ratio above maximum", func(w *Workspace) { w.SplitRatio = 0.7001 }},
		{"invalid document format", func(w *Workspace) { w.Document.Format = "markdown" }},
		{"invalid document json", func(w *Workspace) { w.Document.Data = []byte("{") }},
		{"invalid canvas format", func(w *Workspace) { w.Canvas.Format = "svg" }},
		{"invalid canvas shape", func(w *Workspace) { w.Canvas.Data = []byte("{\"elements\":[],\"appState\":{}}") }},
		{"no notes", func(w *Workspace) { w.Notes = nil }},
		{"duplicate note ids", func(w *Workspace) { w.Notes = append(w.Notes, validNoteFixture(w.Notes[0].ID)) }},
		{"too many notes", func(w *Workspace) {
			w.Notes = make([]Note, 101)
			for i := range w.Notes {
				w.Notes[i] = validNoteFixture(fmt.Sprintf("note-%d", i))
			}
		}},
		{"duplicate reference ids", func(w *Workspace) {
			w.References = []Reference{
				{ID: "ref-1", BlockID: "block-1", ElementID: "element-1"},
				{ID: "ref-1", BlockID: "block-2", ElementID: "element-2"},
			}
		}},
		{"too many references", func(w *Workspace) {
			w.References = make([]Reference, 1001)
			for i := range w.References {
				w.References[i] = Reference{ID: fmt.Sprintf("ref-%d", i), BlockID: fmt.Sprintf("block-%d", i), ElementID: fmt.Sprintf("element-%d", i)}
			}
		}},
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

func TestValidateWorkspaceAcceptsBoundaryValues(t *testing.T) {
	for _, ratio := range []float64{0.25, 0.7} {
		value := validWorkspaceFixture()
		value.SplitRatio = ratio
		if err := ValidateWorkspace(value); err != nil {
			t.Fatalf("split ratio %v rejected: %v", ratio, err)
		}
	}
}
