package workspace

import (
	"context"
	"errors"
	"reflect"
	"testing"
)

func TestHydrateGranularStateUsesCanonicalNotesAndCanvas(t *testing.T) {
	base := validWorkspaceFixture()
	canonicalNote := validNoteFixture("canonical-note")
	canonicalCanvas := CanvasState{Canvas: validCanvasSnapshot(), Version: 7}
	store := &workspaceTestStore{notes: []Note{canonicalNote}, canvas: canonicalCanvas}
	got, err := NewService(store).hydrateGranularState(context.Background(), base)
	if err != nil {
		t.Fatal(err)
	}
	if !reflect.DeepEqual(got.Notes, []Note{canonicalNote}) {
		t.Fatalf("notes = %#v", got.Notes)
	}
	if !reflect.DeepEqual(got.Document, canonicalNote.Document) {
		t.Fatal("compatibility document was not derived from first note")
	}
	if !reflect.DeepEqual(got.Canvas, canonicalCanvas.Canvas) || got.CanvasVersion != 7 {
		t.Fatalf("canvas = %#v version=%d", got.Canvas, got.CanvasVersion)
	}
}

func TestHydrateGranularStatePreservesCompatibilityDocumentWhenNotesAreAbsent(t *testing.T) {
	base := validWorkspaceFixture()
	legacy := base.Document
	store := &workspaceTestStore{notes: []Note{}, canvas: CanvasState{Canvas: validCanvasSnapshot(), Version: 2}}
	got, err := NewService(store).hydrateGranularState(context.Background(), base)
	if err != nil {
		t.Fatal(err)
	}
	if !reflect.DeepEqual(got.Document, legacy) {
		t.Fatal("empty granular notes should preserve compatibility document")
	}
}

func TestHydrateGranularStateStopsWhenNotesFail(t *testing.T) {
	want := errors.New("notes unavailable")
	store := &workspaceTestStore{notesErr: want}
	_, err := NewService(store).hydrateGranularState(context.Background(), validWorkspaceFixture())
	if !errors.Is(err, want) {
		t.Fatalf("error = %v, want %v", err, want)
	}
	if store.getCanvasCalls != 0 {
		t.Fatalf("canvas calls = %d, want 0", store.getCanvasCalls)
	}
}

func TestHydrateGranularStatePropagatesCanvasFailure(t *testing.T) {
	want := errors.New("canvas unavailable")
	store := &workspaceTestStore{notes: []Note{validNoteFixture("note-2")}, canvasErr: want}
	_, err := NewService(store).hydrateGranularState(context.Background(), validWorkspaceFixture())
	if !errors.Is(err, want) {
		t.Fatalf("error = %v, want %v", err, want)
	}
	if store.listNotesCalls != 1 || store.getCanvasCalls != 1 {
		t.Fatalf("calls notes=%d canvas=%d", store.listNotesCalls, store.getCanvasCalls)
	}
}
