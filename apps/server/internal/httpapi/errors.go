package httpapi

import (
	"errors"
	"log/slog"
	"net/http"

	"github.com/howlil/notespace/apps/server/internal/activity"
	"github.com/howlil/notespace/apps/server/internal/asset"
	"github.com/howlil/notespace/apps/server/internal/planning"
	"github.com/howlil/notespace/apps/server/internal/workspace"
)

func fail(w http.ResponseWriter, err error) {
	switch {
	case errors.Is(err, workspace.ErrNotFound):
		send(w, 404, map[string]string{"error": "Workspace not found"})
	case errors.Is(err, workspace.ErrInvalid):
		send(w, 400, map[string]string{"error": "Invalid title, content, version, or split ratio"})
	case errors.Is(err, workspace.ErrConflict):
		send(w, 409, map[string]string{"error": "This workspace changed in another tab. Your edits remain here; reload only after preserving them.", "code": "workspace_conflict"})
	case errors.Is(err, workspace.ErrNotEmpty):
		send(w, 409, map[string]string{"error": "Delete or move the workspaces in this category first."})
	case errors.Is(err, planning.ErrNotFound):
		send(w, 404, map[string]string{"error": "Planning item not found"})
	case errors.Is(err, planning.ErrInvalid):
		send(w, 400, map[string]string{"error": "Invalid milestone or task"})
	case errors.Is(err, planning.ErrConflict):
		send(w, 409, map[string]string{"error": "This planning item changed in another tab. Reload the plan and retry.", "code": "planning_conflict"})
	case errors.Is(err, asset.ErrWorkspaceNotFound):
		send(w, 404, map[string]string{"error": "Workspace not found"})
	case errors.Is(err, asset.ErrNotFound):
		send(w, 404, map[string]string{"error": "Image asset not found"})
	case errors.Is(err, asset.ErrInvalid):
		send(w, 400, map[string]string{"error": "Invalid image asset"})
	case errors.Is(err, activity.ErrTaskNotFound):
		send(w, 404, map[string]string{"error": "Planning item not found"})
	case errors.Is(err, activity.ErrWorkspaceNotFound):
		send(w, 404, map[string]string{"error": "Workspace not found"})
	case errors.Is(err, activity.ErrTaskWorkspaceMismatch):
		send(w, 400, map[string]string{"error": "Invalid milestone or task"})
	case errors.Is(err, activity.ErrNotFound):
		send(w, 404, map[string]string{"error": "Activity session not found"})
	case errors.Is(err, activity.ErrConflict):
		send(w, 409, map[string]string{"error": "This activity session ID is already used by another activity.", "code": "activity_conflict"})
	case errors.Is(err, activity.ErrInvalid):
		send(w, 400, map[string]string{"error": "Invalid activity"})
	default:
		slog.Error("request operation failed", "error", err)
		send(w, 500, map[string]string{"error": "Unable to complete the request. Please retry."})
	}
}
