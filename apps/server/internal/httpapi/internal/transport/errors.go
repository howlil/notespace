package transport

import (
	"errors"
	"log/slog"
	"net/http"

	"github.com/howlil/notespace/apps/server/internal/asset"
	"github.com/howlil/notespace/apps/server/internal/note"
	"github.com/howlil/notespace/apps/server/internal/workspace"
)

func Fail(w http.ResponseWriter, err error) {
	switch {
	case errors.Is(err, workspace.ErrNotFound):
		Send(w, http.StatusNotFound, map[string]string{"error": "Workspace not found"})
	case errors.Is(err, workspace.ErrInvalid):
		Send(w, http.StatusBadRequest, map[string]string{"error": "Invalid title, content, or version"})
	case errors.Is(err, workspace.ErrConflict):
		Send(w, http.StatusConflict, map[string]string{"error": "This workspace changed in another tab. Your edits remain here; reload only after preserving them.", "code": "workspace_conflict"})
	case errors.Is(err, workspace.ErrNotEmpty):
		Send(w, http.StatusConflict, map[string]string{"error": "Delete or move the workspaces in this category first."})
	case errors.Is(err, note.ErrNotFound):
		Send(w, http.StatusNotFound, map[string]string{"error": "Note or Canvas instance not found"})
	case errors.Is(err, note.ErrInvalid):
		Send(w, http.StatusBadRequest, map[string]string{"error": "Invalid note document, Canvas reference, geometry, or version"})
	case errors.Is(err, note.ErrConflict):
		Send(w, http.StatusConflict, map[string]string{"error": "This note or Canvas changed in another session. Your draft remains available for recovery.", "code": "note_conflict"})
	case errors.Is(err, note.ErrNotEmpty):
		Send(w, http.StatusConflict, map[string]string{"error": "This Note has content and cannot be deleted here.", "code": "note_not_empty"})
	case errors.Is(err, note.ErrNoteInUse):
		Send(w, http.StatusConflict, map[string]string{"error": "This Note is still placed on a Canvas.", "code": "note_in_use"})
	case errors.Is(err, asset.ErrWorkspaceNotFound):
		Send(w, http.StatusNotFound, map[string]string{"error": "Workspace not found"})
	case errors.Is(err, asset.ErrNotFound):
		Send(w, http.StatusNotFound, map[string]string{"error": "Image asset not found"})
	case errors.Is(err, asset.ErrInvalid):
		Send(w, http.StatusBadRequest, map[string]string{"error": "Invalid image asset"})
	default:
		slog.Error("request operation failed", "error", err)
		Send(w, http.StatusInternalServerError, map[string]string{"error": "Unable to complete the request. Please retry."})
	}
}
