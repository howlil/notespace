package workspace

import (
	"context"
	"errors"
	"reflect"
	"testing"
)

func workspaceStoreForUpdate(current Workspace) *workspaceTestStore {
	return &workspaceTestStore{
		record: current,
		notes:  append([]Note(nil), current.Notes...),
		canvas: CanvasState{
			Canvas:  current.Canvas,
			Version: current.CanvasVersion,
		},
	}
}

func validWorkspaceUpdate(current Workspace) Update {
	return Update{
		Title:      current.Title,
		Document:   current.Document,
		Notes:      append([]Note(nil), current.Notes...),
		Canvas:     current.Canvas,
		References: append([]Reference(nil), current.References...),
		SplitRatio: current.SplitRatio,
		Version:    current.Version,
	}
}

func TestUpdatePreservesCurrentReferencesWhenOmitted(t *testing.T) {
	current := validWorkspaceFixture()
	current.References = []Reference{{ID: "ref-1", BlockID: "block-1", ElementID: "element-1"}}
	store := workspaceStoreForUpdate(current)
	input := validWorkspaceUpdate(current)
	input.References = nil

	if _, err := NewService(store).Update(context.Background(), current.ID, input); err != nil {
		t.Fatal(err)
	}
	if !reflect.DeepEqual(store.updateInput.References, current.References) {
		t.Fatalf("references = %#v, want %#v", store.updateInput.References, current.References)
	}
}

func TestUpdateUsesCurrentNotesWhenNotesAreOmitted(t *testing.T) {
	current := validWorkspaceFixture()
	current.Notes[0].Title = "Canonical note title"
	store := workspaceStoreForUpdate(current)
	input := validWorkspaceUpdate(current)
	input.Notes = nil
	input.Document = Snapshot{
		Format:  "tiptap",
		Version: 1,
		Data:    []byte("{\"type\":\"doc\",\"content\":[{\"type\":\"paragraph\"}]}"),
	}

	if _, err := NewService(store).Update(context.Background(), current.ID, input); err != nil {
		t.Fatal(err)
	}
	if len(store.updateInput.Notes) != 1 || store.updateInput.Notes[0].Title != "Canonical note title" {
		t.Fatalf("notes = %#v", store.updateInput.Notes)
	}
	if !reflect.DeepEqual(store.updateInput.Notes[0].Document, input.Document) {
		t.Fatalf("compatibility document not projected into first note: %#v", store.updateInput.Notes[0].Document)
	}
}

func TestUpdateProjectsCanonicalFirstNoteIntoLegacyDocument(t *testing.T) {
	current := validWorkspaceFixture()
	store := workspaceStoreForUpdate(current)
	input := validWorkspaceUpdate(current)
	input.Document = Snapshot{
		Format:  "tiptap",
		Version: 1,
		Data:    []byte("{\"type\":\"doc\",\"content\":[{\"type\":\"paragraph\"}]}"),
	}
	input.Notes = []Note{validNoteFixture("canonical-note")}
	input.Notes[0].Document = Snapshot{
		Format:  "tiptap",
		Version: 1,
		Data:    []byte("{\"type\":\"doc\",\"content\":[{\"type\":\"heading\",\"attrs\":{\"level\":2}}]}"),
	}
	store.notes = append([]Note(nil), input.Notes...)

	if _, err := NewService(store).Update(context.Background(), current.ID, input); err != nil {
		t.Fatal(err)
	}
	if !reflect.DeepEqual(store.updateInput.Document, input.Notes[0].Document) {
		t.Fatalf("legacy document = %#v, want canonical first note %#v", store.updateInput.Document, input.Notes[0].Document)
	}
}

func TestUpdateRejectsInvalidAggregateBeforeStore(t *testing.T) {
	current := validWorkspaceFixture()
	tests := []struct {
		name   string
		mutate func(*Update)
	}{
		{"zero version", func(input *Update) { input.Version = 0 }},
		{"split ratio below minimum", func(input *Update) { input.SplitRatio = 0.24 }},
		{"split ratio above maximum", func(input *Update) { input.SplitRatio = 0.71 }},
		{"invalid canvas", func(input *Update) { input.Canvas = Snapshot{Format: "excalidraw", Version: 1, Data: []byte("{}")} }},
	}
	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			store := workspaceStoreForUpdate(current)
			input := validWorkspaceUpdate(current)
			tc.mutate(&input)
			_, err := NewService(store).Update(context.Background(), current.ID, input)
			if !errors.Is(err, ErrInvalid) {
				t.Fatalf("error = %v, want ErrInvalid", err)
			}
			if store.updateID != "" {
				t.Fatal("invalid aggregate reached store.Update")
			}
		})
	}
}

func TestUpdatePropagatesStoreConflictWithoutHydratingResult(t *testing.T) {
	current := validWorkspaceFixture()
	store := workspaceStoreForUpdate(current)
	store.updateErr = ErrConflict
	store.listNotesCalls = 0
	store.getCanvasCalls = 0

	_, err := NewService(store).Update(context.Background(), current.ID, validWorkspaceUpdate(current))
	if !errors.Is(err, ErrConflict) {
		t.Fatalf("error = %v, want ErrConflict", err)
	}
	if store.listNotesCalls != 0 || store.getCanvasCalls != 0 {
		t.Fatalf("hydration ran after store failure: notes=%d canvas=%d", store.listNotesCalls, store.getCanvasCalls)
	}
}
