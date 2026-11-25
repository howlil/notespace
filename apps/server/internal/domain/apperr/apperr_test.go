package apperr_test

import (
	"errors"
	"fmt"
	"testing"

	"github.com/howlil/notespace/apps/server/internal/domain/apperr"
)

func TestStructuredErrorsMatchSentinelsAndDistinguishSiblings(t *testing.T) {
	wsNotFound := apperr.NotFound("Workspace not found")
	assetNotFound := apperr.NotFound("Image asset not found")
	noteTrashed := apperr.Conflict("note_trashed", "This Note is in Trash.")
	noteInUse := apperr.Conflict("note_in_use", "This Note is still placed on a Canvas.")

	if !errors.Is(wsNotFound, apperr.ErrNotFound) || !errors.Is(assetNotFound, apperr.ErrNotFound) {
		t.Fatal("structured NotFound errors must match ErrNotFound")
	}
	if errors.Is(wsNotFound, assetNotFound) {
		t.Fatal("distinct NotFound errors must not match each other")
	}
	if !errors.Is(noteTrashed, apperr.ErrConflict) || errors.Is(noteTrashed, noteInUse) {
		t.Fatal("conflict codes must match ErrConflict without matching sibling codes")
	}

	wrapped := fmt.Errorf("outer: %w", apperr.Wrap(noteTrashed, errors.New("row locked")))
	if !errors.Is(wrapped, noteTrashed) || !errors.Is(wrapped, apperr.ErrConflict) {
		t.Fatal("wrapped structured error lost identity")
	}
	extracted, ok := apperr.As(wrapped)
	if !ok || extracted.Kind != apperr.KindConflict || extracted.Code != "note_trashed" || extracted.Message != "This Note is in Trash." {
		t.Fatalf("As(wrapped) = %+v, %v", extracted, ok)
	}
}
