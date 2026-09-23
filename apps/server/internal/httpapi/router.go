package httpapi

import (
	"context"
	"net/http"

	"github.com/howlil/notespace/apps/server/internal/activity"
	"github.com/howlil/notespace/apps/server/internal/asset"
	"github.com/howlil/notespace/apps/server/internal/icon"
	"github.com/howlil/notespace/apps/server/internal/library"
	"github.com/howlil/notespace/apps/server/internal/planning"
	"github.com/howlil/notespace/apps/server/internal/workspace"
)

type API struct {
	service     *workspace.Service
	planning    *planning.Service
	activities  *activity.Service
	assets      *asset.Service
	library     *library.Service
	health      func(context.Context) error
	eraserIcons icon.Source
}

type Dependencies struct {
	Workspace *workspace.Service
	Planning  *planning.Service
	Activity  *activity.Service
	Assets    *asset.Service
	Library   *library.Service
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
	if deps.Assets == nil {
		panic("httpapi: asset service is required")
	}
	if deps.Library == nil {
		panic("httpapi: library service is required")
	}
	if deps.Icons == nil {
		panic("httpapi: icon source is required")
	}
	if deps.Health == nil {
		panic("httpapi: health check is required")
	}
	a := API{service: deps.Workspace, planning: deps.Planning, activities: deps.Activity, assets: deps.Assets, library: deps.Library, health: deps.Health, eraserIcons: deps.Icons}
	mux := http.NewServeMux()
	mux.HandleFunc("GET /api/health", func(w http.ResponseWriter, r *http.Request) {
		if err := a.health(r.Context()); err != nil {
			fail(w, err)
			return
		}
		send(w, 200, map[string]string{"status": "ok"})
	})
	mux.HandleFunc("GET /api/icons/eraser/{slug}", a.serveEraserIcon)
	mux.HandleFunc("GET /api/projects", a.list)
	mux.HandleFunc("GET /api/workspaces", a.listWorkspaces)
	mux.HandleFunc("POST /api/projects", a.create)
	mux.HandleFunc("POST /api/workspaces", a.create)
	mux.HandleFunc("GET /api/categories", a.listCategories)
	mux.HandleFunc("GET /api/categories/{id}/workspaces", a.listCategoryWorkspaces)
	mux.HandleFunc("POST /api/categories", a.createCategory)
	mux.HandleFunc("PATCH /api/categories/{id}", a.updateCategory)
	mux.HandleFunc("DELETE /api/categories/{id}", a.deleteCategory)
	mux.HandleFunc("GET /api/projects/{id}", a.get)
	mux.HandleFunc("GET /api/workspaces/{id}", a.get)
	mux.HandleFunc("PATCH /api/projects/{id}", a.update)
	mux.HandleFunc("PATCH /api/workspaces/{id}", a.update)
	mux.HandleFunc("POST /api/workspaces/{id}/notes", a.createNote)
	mux.HandleFunc("PATCH /api/workspaces/{id}/notes/{noteId}", a.updateNote)
	mux.HandleFunc("DELETE /api/workspaces/{id}/notes/{noteId}", a.deleteNote)
	mux.HandleFunc("GET /api/workspaces/{id}/canvas", a.getCanvas)
	mux.HandleFunc("PATCH /api/workspaces/{id}/canvas", a.updateCanvas)
	mux.HandleFunc("GET /api/workspaces/{id}/plan", a.workspacePlan)
	mux.HandleFunc("POST /api/workspaces/{id}/milestones", a.createMilestone)
	mux.HandleFunc("PATCH /api/workspaces/{id}/milestones/{milestoneId}", a.updateMilestone)
	mux.HandleFunc("DELETE /api/workspaces/{id}/milestones/{milestoneId}", a.deleteMilestone)
	mux.HandleFunc("POST /api/workspaces/{id}/tasks", a.createTask)
	mux.HandleFunc("PATCH /api/workspaces/{id}/tasks/{taskId}", a.updateTask)
	mux.HandleFunc("DELETE /api/workspaces/{id}/tasks/{taskId}", a.deleteTask)
	mux.HandleFunc("GET /api/tasks/today", a.todayTasks)
	mux.HandleFunc("GET /api/tasks/inbox", a.inboxTasks)
	mux.HandleFunc("GET /api/tasks/{taskId}", a.getAnyTask)
	mux.HandleFunc("POST /api/tasks", a.createStandaloneTask)
	mux.HandleFunc("PATCH /api/tasks/{taskId}", a.updateAnyTask)
	mux.HandleFunc("DELETE /api/tasks/{taskId}", a.deleteAnyTask)
	mux.HandleFunc("PATCH /api/projects/{id}/title", a.rename)
	mux.HandleFunc("PATCH /api/workspaces/{id}/title", a.rename)
	mux.HandleFunc("PATCH /api/projects/{id}/category", a.move)
	mux.HandleFunc("PATCH /api/workspaces/{id}/category", a.move)
	mux.HandleFunc("GET /api/projects/{id}/history", a.history)
	mux.HandleFunc("GET /api/workspaces/{id}/history", a.history)
	mux.HandleFunc("GET /api/projects/{id}/history/{historyId}", a.historySnapshot)
	mux.HandleFunc("GET /api/workspaces/{id}/history/{historyId}", a.historySnapshot)
	mux.HandleFunc("POST /api/projects/{id}/history/{historyId}/restore", a.restore)
	mux.HandleFunc("POST /api/workspaces/{id}/history/{historyId}/restore", a.restore)
	mux.HandleFunc("DELETE /api/projects/{id}", a.delete)
	mux.HandleFunc("DELETE /api/workspaces/{id}", a.delete)
	mux.HandleFunc("GET /api/trash", a.listTrash)
	mux.HandleFunc("POST /api/trash/{id}", a.restoreTrash)
	mux.HandleFunc("DELETE /api/trash/{id}", a.deleteTrash)
	mux.HandleFunc("GET /api/backup", a.exportBackup)
	mux.HandleFunc("POST /api/backup/restore", a.restoreBackup)
	mux.HandleFunc("GET /api/workspaces/{id}/assets/{assetId}", a.getAsset)
	mux.HandleFunc("PUT /api/workspaces/{id}/assets/{assetId}", a.putAsset)
	mux.HandleFunc("DELETE /api/workspaces/{id}/assets/{assetId}", a.deleteAsset)
	mux.HandleFunc("GET /api/workspaces/{id}/study-sessions", a.workspaceActivitySessions)
	mux.HandleFunc("PUT /api/workspaces/{id}/study-sessions/{sessionId}", a.workspaceActivityHeartbeat)
	mux.HandleFunc("DELETE /api/workspaces/{id}/study-sessions/{sessionId}", a.deleteWorkspaceActivitySession)
	mux.HandleFunc("GET /api/workspaces/{id}/study", a.workspaceActivityStats)
	mux.HandleFunc("GET /api/study/activity", a.activity)
	mux.HandleFunc("GET /api/study/activity/{date}", a.dayDetail)
	mux.HandleFunc("GET /api/activity/sessions", a.activitySessions)
	mux.HandleFunc("PUT /api/activity/sessions/{sessionId}", a.activityHeartbeat)
	mux.HandleFunc("DELETE /api/activity/sessions/{sessionId}", a.deleteActivitySession)
	mux.HandleFunc("GET /api/activity/stats", a.activityStats)
	mux.HandleFunc("GET /api/activity", a.activity)
	mux.HandleFunc("GET /api/activity/{date}", a.dayDetail)
	mux.HandleFunc("GET /api/search", a.search)
	mux.HandleFunc("/api/", func(w http.ResponseWriter, r *http.Request) { send(w, 404, map[string]string{"error": "Not found"}) })
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("X-Content-Type-Options", "nosniff")
		w.Header().Set("Cache-Control", "no-store")
		if isLegacyProjectPath(r.URL.Path) {
			w.Header().Set("Deprecation", "true")
			w.Header().Set("Link", `</api/workspaces>; rel="successor-version"`)
		}
		mux.ServeHTTP(w, r)
	})
}
