package workspace

import (
	"context"
	"errors"
	"testing"
)

func TestUpdateCanvasValidatesAndForwardsExpectedVersion(t *testing.T) {
	store := &workspaceTestStore{}
	service := NewService(store)
	input := CanvasUpdate{Canvas: validCanvasSnapshot(), Version: 6}
	got, err := service.UpdateCanvas(context.Background(), " workspace-1 ", input)
	if err != nil {
		t.Fatal(err)
	}
	if store.updateCanvasWorkspaceID != "workspace-1" || store.updateCanvasInput.Version != 6 {
		t.Fatalf("store input = workspace:%q input:%#v", store.updateCanvasWorkspaceID, store.updateCanvasInput)
	}
	if got.Version != 7 {
		t.Fatalf("canvas version = %d, want 7", got.Version)
	}
}

func TestUpdateCanvasRejectsInvalidInputBeforeStore(t *testing.T) {
	tests := []struct {
		name        string
		workspaceID string
		input       CanvasUpdate
	}{
		{"blank workspace", " ", CanvasUpdate{Canvas: validCanvasSnapshot(), Version: 1}},
		{"zero version", "workspace-1", CanvasUpdate{Canvas: validCanvasSnapshot(), Version: 0}},
		{"invalid canvas", "workspace-1", CanvasUpdate{Canvas: Snapshot{Format: "excalidraw", Version: 1, Data: []byte("{}")}, Version: 1}},
	}
	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			store := &workspaceTestStore{}
			_, err := NewService(store).UpdateCanvas(context.Background(), tc.workspaceID, tc.input)
			if !errors.Is(err, ErrInvalid) {
				t.Fatalf("error = %v, want ErrInvalid", err)
			}
			if store.updateCanvasWorkspaceID != "" {
				t.Fatal("invalid input reached store")
			}
		})
	}
}

func TestUpdateCanvasPropagatesStoreConflict(t *testing.T) {
	store := &workspaceTestStore{updateCanvasErr: ErrConflict}
	_, err := NewService(store).UpdateCanvas(context.Background(), "workspace-1", CanvasUpdate{Canvas: validCanvasSnapshot(), Version: 2})
	if !errors.Is(err, ErrConflict) {
		t.Fatalf("error = %v, want ErrConflict", err)
	}
}
