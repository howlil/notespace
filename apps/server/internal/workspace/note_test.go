package workspace

import (
	"context"
	"errors"
	"testing"
)

func TestCreateNoteValidatesAndNormalizesBeforeStore(t *testing.T) {
	store := &workspaceTestStore{}
	service := NewService(store)
	input := NoteCreate{
		ID:       " note-2 ",
		Title:    " References ",
		Document: validDocumentSnapshot(),
	}
	got, err := service.CreateNote(context.Background(), " workspace-1 ", input)
	if err != nil {
		t.Fatal(err)
	}
	if store.createNoteWorkspaceID != "workspace-1" || store.createNoteInput.ID != "note-2" || store.createNoteInput.Title != "References" {
		t.Fatalf("store input = workspace:%q note:%#v", store.createNoteWorkspaceID, store.createNoteInput)
	}
	if got.ID != "note-2" || got.Title != "References" {
		t.Fatalf("created note = %#v", got)
	}
}

func TestCreateNoteRejectsInvalidInputBeforeStore(t *testing.T) {
	tests := []struct {
		name        string
		workspaceID string
		input       NoteCreate
	}{
		{"blank workspace", " ", NoteCreate{ID: "note-1", Title: "Note", Document: validDocumentSnapshot()}},
		{"blank id", "workspace-1", NoteCreate{ID: " ", Title: "Note", Document: validDocumentSnapshot()}},
		{"blank title", "workspace-1", NoteCreate{ID: "note-1", Title: " ", Document: validDocumentSnapshot()}},
		{"invalid document", "workspace-1", NoteCreate{ID: "note-1", Title: "Note", Document: Snapshot{Format: "markdown", Version: 1, Data: []byte("{}")}}},
	}
	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			store := &workspaceTestStore{}
			_, err := NewService(store).CreateNote(context.Background(), tc.workspaceID, tc.input)
			if !errors.Is(err, ErrInvalid) {
				t.Fatalf("error = %v, want ErrInvalid", err)
			}
			if store.createNoteWorkspaceID != "" {
				t.Fatal("invalid input reached store")
			}
		})
	}
}

func TestUpdateNoteForwardsExpectedVersionAndPropagatesConflict(t *testing.T) {
	store := &workspaceTestStore{}
	service := NewService(store)
	input := NoteUpdate{Title: " Updated ", Document: validDocumentSnapshot(), Version: 4}
	got, err := service.UpdateNote(context.Background(), " workspace-1 ", " note-1 ", input)
	if err != nil {
		t.Fatal(err)
	}
	if store.updateNoteWorkspaceID != "workspace-1" || store.updateNoteID != "note-1" || store.updateNoteInput.Version != 4 || store.updateNoteInput.Title != "Updated" {
		t.Fatalf("update input = workspace:%q note:%q input:%#v", store.updateNoteWorkspaceID, store.updateNoteID, store.updateNoteInput)
	}
	if got.Version != 5 {
		t.Fatalf("updated version = %d, want 5", got.Version)
	}

	store.updateNoteErr = ErrConflict
	_, err = service.UpdateNote(context.Background(), "workspace-1", "note-1", NoteUpdate{Title: "Updated", Document: validDocumentSnapshot(), Version: 5})
	if !errors.Is(err, ErrConflict) {
		t.Fatalf("conflict error = %v", err)
	}
}

func TestDeleteNoteValidatesAndForwardsVersion(t *testing.T) {
	store := &workspaceTestStore{}
	service := NewService(store)
	if err := service.DeleteNote(context.Background(), " workspace-1 ", " note-1 ", 3); err != nil {
		t.Fatal(err)
	}
	if store.deleteNoteWorkspaceID != "workspace-1" || store.deleteNoteID != "note-1" || store.deleteNoteVersion != 3 {
		t.Fatalf("delete call = %q %q %d", store.deleteNoteWorkspaceID, store.deleteNoteID, store.deleteNoteVersion)
	}
	for _, tc := range []struct {
		workspaceID string
		noteID      string
		version     int
	}{
		{"", "note-1", 1},
		{"workspace-1", "", 1},
		{"workspace-1", "note-1", 0},
	} {
		if err := service.DeleteNote(context.Background(), tc.workspaceID, tc.noteID, tc.version); !errors.Is(err, ErrInvalid) {
			t.Fatalf("DeleteNote(%q,%q,%d) error = %v", tc.workspaceID, tc.noteID, tc.version, err)
		}
	}
}
