package httpapi

import (
	"context"
	activityhttp "github.com/howlil/notespace/apps/server/internal/httpapi/activity"
	assetshttp "github.com/howlil/notespace/apps/server/internal/httpapi/assets"
	capturehttp "github.com/howlil/notespace/apps/server/internal/httpapi/capture"
	iconshttp "github.com/howlil/notespace/apps/server/internal/httpapi/icons"
	"github.com/howlil/notespace/apps/server/internal/httpapi/internal/transport"
	libraryhttp "github.com/howlil/notespace/apps/server/internal/httpapi/library"
	noteshttp "github.com/howlil/notespace/apps/server/internal/httpapi/notes"
	planninghttp "github.com/howlil/notespace/apps/server/internal/httpapi/planning"
	workspacehttp "github.com/howlil/notespace/apps/server/internal/httpapi/workspace"
	"net/http"

	"github.com/howlil/notespace/apps/server/internal/activity"
	"github.com/howlil/notespace/apps/server/internal/asset"
	"github.com/howlil/notespace/apps/server/internal/capture"
	"github.com/howlil/notespace/apps/server/internal/icon"
	"github.com/howlil/notespace/apps/server/internal/library"
	"github.com/howlil/notespace/apps/server/internal/note"
	"github.com/howlil/notespace/apps/server/internal/planning"
	"github.com/howlil/notespace/apps/server/internal/workspace"
)

type Dependencies struct {
	Workspace *workspace.Service
	Planning  *planning.Service
	Activity  *activity.Service
	Capture   *capture.Service
	Assets    *asset.Service
	Library   *library.Service
	Notes     *note.Service
	Icons     icon.Source
	Health    func(context.Context) error
}

func New(deps Dependencies) http.Handler {
	if deps.Workspace == nil {
		panic("httpapi: workspace service is required")
	}
	if deps.Planning == nil {
		panic("httpapi: planning service is required")
	}
	if deps.Activity == nil {
		panic("httpapi: activity service is required")
	}
	if deps.Capture == nil {
		panic("httpapi: capture service is required")
	}
	if deps.Assets == nil {
		panic("httpapi: asset service is required")
	}
	if deps.Library == nil {
		panic("httpapi: library service is required")
	}
	if deps.Notes == nil {
		panic("httpapi: note service is required")
	}
	if deps.Icons == nil {
		panic("httpapi: icon source is required")
	}
	if deps.Health == nil {
		panic("httpapi: health check is required")
	}
	workspaceHandler := workspacehttp.New(deps.Library, deps.Workspace)
	libraryHandler := libraryhttp.New(deps.Library)
	noteHandler := noteshttp.New(deps.Notes)
	planningHandler := planninghttp.New(deps.Planning)
	activityHandler := activityhttp.New(deps.Activity)
	captureHandler := capturehttp.New(deps.Capture)
	assetsHandler := assetshttp.New(deps.Assets)
	iconsHandler := iconshttp.New(deps.Icons)
	mux := http.NewServeMux()
	mux.HandleFunc("GET /api/health", func(w http.ResponseWriter, r *http.Request) {
		if err := deps.Health(r.Context()); err != nil {
			transport.Fail(w, err)
			return
		}
		transport.Send(w, 200, map[string]string{"status": "ok"})
	})
	mux.HandleFunc("GET /api/icons/eraser/{slug}", iconsHandler.ServeEraserIcon)
	mux.HandleFunc("GET /api/projects", workspaceHandler.List)
	mux.HandleFunc("GET /api/workspaces", workspaceHandler.ListWorkspaces)
	mux.HandleFunc("POST /api/projects", workspaceHandler.Create)
	mux.HandleFunc("POST /api/workspaces", workspaceHandler.Create)
	mux.HandleFunc("GET /api/categories", workspaceHandler.ListCategories)
	mux.HandleFunc("GET /api/categories/{id}/workspaces", workspaceHandler.ListCategoryWorkspaces)
	mux.HandleFunc("POST /api/categories", workspaceHandler.CreateCategory)
	mux.HandleFunc("PATCH /api/categories/{id}", workspaceHandler.UpdateCategory)
	mux.HandleFunc("DELETE /api/categories/{id}", workspaceHandler.DeleteCategory)
	mux.HandleFunc("GET /api/projects/{id}", workspaceHandler.Get)
	mux.HandleFunc("GET /api/workspaces/{id}", workspaceHandler.Get)
	mux.HandleFunc("PATCH /api/projects/{id}", workspaceHandler.Update)
	mux.HandleFunc("PATCH /api/workspaces/{id}", workspaceHandler.Update)
	mux.HandleFunc("GET /api/workspaces/{id}/canvas", workspaceHandler.GetCanvas)
	mux.HandleFunc("PATCH /api/workspaces/{id}/canvas", workspaceHandler.UpdateCanvas)
	mux.HandleFunc("POST /api/workspaces/{id}/note-instances", noteHandler.CreateInstance)
	mux.HandleFunc("DELETE /api/workspaces/{id}/note-instances/{instanceId}", noteHandler.DeleteInstance)
	mux.HandleFunc("GET /api/notes/{id}", noteHandler.Get)
	mux.HandleFunc("GET /api/notes/{id}/backlinks", noteHandler.Backlinks)
	mux.HandleFunc("PUT /api/notes/{id}", noteHandler.Update)
	mux.HandleFunc("DELETE /api/notes/{id}", noteHandler.Delete)
	mux.HandleFunc("GET /api/workspaces/{id}/plan", planningHandler.WorkspacePlan)
	mux.HandleFunc("POST /api/workspaces/{id}/milestones", planningHandler.CreateMilestone)
	mux.HandleFunc("PATCH /api/workspaces/{id}/milestones/{milestoneId}", planningHandler.UpdateMilestone)
	mux.HandleFunc("DELETE /api/workspaces/{id}/milestones/{milestoneId}", planningHandler.DeleteMilestone)
	mux.HandleFunc("POST /api/workspaces/{id}/tasks", planningHandler.CreateTask)
	mux.HandleFunc("PATCH /api/workspaces/{id}/tasks/{taskId}", planningHandler.UpdateTask)
	mux.HandleFunc("DELETE /api/workspaces/{id}/tasks/{taskId}", planningHandler.DeleteTask)
	mux.HandleFunc("GET /api/captures", captureHandler.ListCaptures)
	mux.HandleFunc("POST /api/captures", captureHandler.CreateCapture)
	mux.HandleFunc("GET /api/captures/{captureId}", captureHandler.GetCapture)
	mux.HandleFunc("PATCH /api/captures/{captureId}", captureHandler.UpdateCapture)
	mux.HandleFunc("DELETE /api/captures/{captureId}", captureHandler.DeleteCapture)
	mux.HandleFunc("POST /api/captures/{captureId}/organize", captureHandler.OrganizeCapture)
	mux.HandleFunc("GET /api/tasks/today", planningHandler.TodayTasks)
	mux.HandleFunc("GET /api/tasks/inbox", planningHandler.InboxTasks)
	mux.HandleFunc("GET /api/tasks/unassigned", planningHandler.UnassignedTasks)
	mux.HandleFunc("GET /api/tasks/{taskId}", planningHandler.GetAnyTask)
	mux.HandleFunc("POST /api/tasks", planningHandler.CreateStandaloneTask)
	mux.HandleFunc("POST /api/tasks/{taskId}/assign-workspace", planningHandler.AssignStandaloneTask)
	mux.HandleFunc("PATCH /api/tasks/{taskId}", planningHandler.UpdateAnyTask)
	mux.HandleFunc("DELETE /api/tasks/{taskId}", planningHandler.DeleteAnyTask)
	mux.HandleFunc("PATCH /api/projects/{id}/title", workspaceHandler.Rename)
	mux.HandleFunc("PATCH /api/workspaces/{id}/title", workspaceHandler.Rename)
	mux.HandleFunc("PATCH /api/projects/{id}/category", workspaceHandler.Move)
	mux.HandleFunc("PATCH /api/workspaces/{id}/category", workspaceHandler.Move)
	mux.HandleFunc("DELETE /api/projects/{id}", workspaceHandler.Delete)
	mux.HandleFunc("DELETE /api/workspaces/{id}", workspaceHandler.Delete)
	mux.HandleFunc("GET /api/trash", libraryHandler.ListTrash)
	mux.HandleFunc("POST /api/trash/{id}", libraryHandler.RestoreTrash)
	mux.HandleFunc("DELETE /api/trash/{id}", libraryHandler.DeleteTrash)
	mux.HandleFunc("GET /api/backup", libraryHandler.ExportBackup)
	mux.HandleFunc("POST /api/backup/restore", libraryHandler.RestoreBackup)
	mux.HandleFunc("GET /api/workspaces/{id}/assets/{assetId}", assetsHandler.GetAsset)
	mux.HandleFunc("PUT /api/workspaces/{id}/assets/{assetId}", assetsHandler.PutAsset)
	mux.HandleFunc("DELETE /api/workspaces/{id}/assets/{assetId}", assetsHandler.DeleteAsset)
	mux.HandleFunc("GET /api/activity/sessions", activityHandler.ActivitySessions)
	mux.HandleFunc("PUT /api/activity/sessions/{sessionId}", activityHandler.ActivityHeartbeat)
	mux.HandleFunc("DELETE /api/activity/sessions/{sessionId}", activityHandler.DeleteActivitySession)
	mux.HandleFunc("GET /api/activity/stats", activityHandler.ActivityStats)
	mux.HandleFunc("GET /api/activity", activityHandler.Activity)
	mux.HandleFunc("GET /api/activity/{date}", activityHandler.DayDetail)
	mux.HandleFunc("GET /api/search", workspaceHandler.Search)
	mux.HandleFunc("/api/", func(w http.ResponseWriter, r *http.Request) {
		transport.Send(w, 404, map[string]string{"error": "Not found"})
	})
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("X-Content-Type-Options", "nosniff")
		w.Header().Set("Cache-Control", "no-store")
		if transport.IsLegacyProjectPath(r.URL.Path) {
			w.Header().Set("Deprecation", "true")
			w.Header().Set("Link", `</api/workspaces>; rel="successor-version"`)
		}
		mux.ServeHTTP(w, r)
	})
}
