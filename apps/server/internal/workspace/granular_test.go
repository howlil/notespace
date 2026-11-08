package workspace

import (
	"context"
	"errors"
	"reflect"
	"testing"
)

func TestHydrateGranularStateUsesCanonicalCanvas(t *testing.T) {
	base := validWorkspaceFixture()
	canonicalCanvas := CanvasState{Canvas: validCanvasSnapshot(), Version: 7}
	store := &workspaceTestStore{canvas: canonicalCanvas}
	got, err := NewService(store).hydrateGranularState(context.Background(), base)
	if err != nil {
		t.Fatal(err)
	}
	if len(got.Notes) != 0 {
		t.Fatalf("notes = %#v", got.Notes)
	}
	if !reflect.DeepEqual(got.Canvas, canonicalCanvas.Canvas) || got.CanvasVersion != 7 {
		t.Fatalf("canvas = %#v version=%d", got.Canvas, got.CanvasVersion)
	}
}

func TestHydrateGranularStateKeepsCompatibilityDocumentWhenCanvasLoads(t *testing.T) {
	base := validWorkspaceFixture()
	legacy := base.Document
	store := &workspaceTestStore{canvas: CanvasState{Canvas: validCanvasSnapshot(), Version: 2}}
	got, err := NewService(store).hydrateGranularState(context.Background(), base)
	if err != nil {
		t.Fatal(err)
	}
	if !reflect.DeepEqual(got.Document, legacy) {
		t.Fatal("empty granular notes should preserve compatibility document")
	}
}

func TestHydrateGranularStatePropagatesCanvasFailure(t *testing.T) {
	want := errors.New("canvas unavailable")
	store := &workspaceTestStore{canvasErr: want}
	_, err := NewService(store).hydrateGranularState(context.Background(), validWorkspaceFixture())
	if !errors.Is(err, want) {
		t.Fatalf("error = %v, want %v", err, want)
	}
	if store.getCanvasCalls != 1 {
		t.Fatalf("canvas calls = %d", store.getCanvasCalls)
	}
}
