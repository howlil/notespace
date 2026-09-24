package workspace

import (
	"context"
	"errors"
	"reflect"
	"testing"
)

func TestServiceCreateNormalizesInputAndHydratesCanonicalState(t *testing.T) {
	store := &workspaceTestStore{categoryExists: true}
	service := NewService(store)
	got, err := service.Create(context.Background(), "  Distributed Systems  ")
	if err != nil {
		t.Fatal(err)
	}
	if store.createInput.Title != "Distributed Systems" {
		t.Fatalf("created title = %q", store.createInput.Title)
	}
	if store.createInput.CategoryID != UncategorizedCategoryID {
		t.Fatalf("category = %q", store.createInput.CategoryID)
	}
	if store.createInput.Version != 1 || len(store.createInput.Notes) != 1 || store.createInput.CanvasVersion != 1 {
		t.Fatalf("invalid create defaults: %#v", store.createInput)
	}
	if got.ID == "" || got.Document.Format != "tiptap" || got.Canvas.Format != "excalidraw" {
		t.Fatalf("hydrated workspace = %#v", got)
	}
}

func TestServiceCreateRejectsUnknownCategory(t *testing.T) {
	store := &workspaceTestStore{categoryExists: false}
	_, err := NewService(store).Create(context.Background(), "Systems", "missing")
	if !errors.Is(err, ErrInvalid) {
		t.Fatalf("error = %v, want ErrInvalid", err)
	}
	if store.createInput.ID != "" {
		t.Fatal("store.Create should not be called")
	}
}

func TestServiceRenameBuildsCompleteUpdateFromCurrentWorkspace(t *testing.T) {
	current := validWorkspaceFixture()
	current.References = []Reference{{ID: "ref-1", BlockID: "block-1", ElementID: "element-1"}}
	store := &workspaceTestStore{
		record: current,
		notes:  append([]Note(nil), current.Notes...),
		canvas: CanvasState{Canvas: current.Canvas, Version: current.CanvasVersion},
	}
	got, err := NewService(store).Rename(context.Background(), current.ID, "  Renamed  ")
	if err != nil {
		t.Fatal(err)
	}
	if store.updateID != current.ID || store.updateInput.Title != "Renamed" {
		t.Fatalf("update call = %#v", store.updateInput)
	}
	if store.updateInput.Version != current.Version {
		t.Fatalf("version = %d", store.updateInput.Version)
	}
	if !reflect.DeepEqual(store.updateInput.Notes, current.Notes) || !reflect.DeepEqual(store.updateInput.References, current.References) {
		t.Fatalf("rename lost authored state: %#v", store.updateInput)
	}
	if got.Title != "Renamed" {
		t.Fatalf("renamed title = %q", got.Title)
	}
}

func TestServiceMoveRequiresExistingCategory(t *testing.T) {
	store := &workspaceTestStore{categoryExists: false}
	_, err := NewService(store).Move(context.Background(), "workspace-1", "missing")
	if !errors.Is(err, ErrNotFound) {
		t.Fatalf("error = %v, want ErrNotFound", err)
	}
	if store.moveID != "" {
		t.Fatal("store.Move should not be called")
	}
}

func TestServiceQueryBoundariesRejectInvalidPagination(t *testing.T) {
	service := NewService(&workspaceTestStore{})
	if _, err := service.ListRecent(context.Background(), 0); !errors.Is(err, ErrInvalid) {
		t.Fatalf("ListRecent error = %v", err)
	}
	if _, err := service.ListWorkspaces(context.Background(), WorkspaceQuery{Limit: 101}); !errors.Is(err, ErrInvalid) {
		t.Fatalf("ListWorkspaces error = %v", err)
	}
}
