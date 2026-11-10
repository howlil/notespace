package transport

import (
	"errors"
	"log/slog"
	"net/http"

	"github.com/howlil/notespace/apps/server/internal/activity"
	"github.com/howlil/notespace/apps/server/internal/asset"
	"github.com/howlil/notespace/apps/server/internal/capture"
	"github.com/howlil/notespace/apps/server/internal/note"
	"github.com/howlil/notespace/apps/server/internal/planning"
	"github.com/howlil/notespace/apps/server/internal/workspace"
)

func Fail(w http.ResponseWriter, err error) {
	switch {
	case errors.Is(err, workspace.ErrNotFound):
		Send(w, 404, map[string]string{"error": "Workspace not found"})
	case errors.Is(err, workspace.ErrInvalid):
		Send(w, 400, map[string]string{"error": "Invalid title, content, version, or split ratio"})
	case errors.Is(err, workspace.ErrConflict):
		Send(w, 409, map[string]string{"error": "This workspace changed in another tab. Your edits remain here; reload only after preserving them.", "code": "workspace_conflict"})
	case errors.Is(err, workspace.ErrNotEmpty):
		Send(w, 409, map[string]string{"error": "Delete or move the workspaces in this category first."})
	case errors.Is(err, note.ErrNotFound):
		Send(w, 404, map[string]string{"error": "Note or Canvas instance not found"})
	case errors.Is(err, note.ErrInvalid):
		Send(w, 400, map[string]string{"error": "Invalid note document, Canvas reference, geometry, or version"})
	case errors.Is(err, note.ErrConflict):
		Send(w, 409, map[string]string{"error": "This note or Canvas changed in another session. Your draft remains available for recovery.", "code": "note_conflict"})
	case errors.Is(err, capture.ErrNotFound):
		Send(w, 404, map[string]string{"error": "Capture or destination workspace not found"})
	case errors.Is(err, capture.ErrInvalid):
		Send(w, 400, map[string]string{"error": "Invalid capture content, version, or conversion target"})
	case errors.Is(err, capture.ErrConflict):
		Send(w, 409, map[string]string{"error": "Capture changed or is already converted. Refresh its status before retrying.", "code": "capture_conflict"})
	case errors.Is(err, planning.ErrNotFound):
		Send(w, 404, map[string]string{"error": "Planning item not found"})
	case errors.Is(err, planning.ErrInvalid):
		Send(w, 400, map[string]string{"error": "Invalid milestone or task"})
	case errors.Is(err, planning.ErrConflict):
		Send(w, 409, map[string]string{"error": "This planning item changed in another tab. Reload the plan and retry.", "code": "planning_conflict"})
	case errors.Is(err, asset.ErrWorkspaceNotFound):
		Send(w, 404, map[string]string{"error": "Workspace not found"})
	case errors.Is(err, asset.ErrNotFound):
		Send(w, 404, map[string]string{"error": "Image asset not found"})
	case errors.Is(err, asset.ErrInvalid):
		Send(w, 400, map[string]string{"error": "Invalid image asset"})
	case errors.Is(err, activity.ErrTaskNotFound):
		Send(w, 404, map[string]string{"error": "Planning item not found"})
	case errors.Is(err, activity.ErrWorkspaceNotFound):
		Send(w, 404, map[string]string{"error": "Workspace not found"})
	case errors.Is(err, activity.ErrTaskWorkspaceMismatch):
		Send(w, 400, map[string]string{"error": "Invalid milestone or task"})
	case errors.Is(err, activity.ErrNotFound):
		Send(w, 404, map[string]string{"error": "Activity session not found"})
	case errors.Is(err, activity.ErrDeleted):
		Send(w, http.StatusGone, map[string]string{"error": "Activity session was deleted", "code": "activity_deleted"})
	case errors.Is(err, activity.ErrConflict):
		Send(w, 409, map[string]string{"error": "This activity session ID is already used by another activity.", "code": "activity_conflict"})
	case errors.Is(err, activity.ErrInvalid):
		Send(w, 400, map[string]string{"error": "Invalid activity"})
	default:
		slog.Error("request operation failed", "error", err)
		Send(w, 500, map[string]string{"error": "Unable to complete the request. Please retry."})
	}
}
