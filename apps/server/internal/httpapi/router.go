package httpapi

import (
	"context"
	assetshttp "github.com/howlil/notespace/apps/server/internal/httpapi/assets"
	iconshttp "github.com/howlil/notespace/apps/server/internal/httpapi/icons"
	"github.com/howlil/notespace/apps/server/internal/httpapi/internal/transport"
	libraryhttp "github.com/howlil/notespace/apps/server/internal/httpapi/library"
	noteshttp "github.com/howlil/notespace/apps/server/internal/httpapi/notes"
	workspacehttp "github.com/howlil/notespace/apps/server/internal/httpapi/workspace"
	"net/http"

	"github.com/howlil/notespace/apps/server/internal/asset"
	"github.com/howlil/notespace/apps/server/internal/icon"
	"github.com/howlil/notespace/apps/server/internal/library"
	"github.com/howlil/notespace/apps/server/internal/note"
	"github.com/howlil/notespace/apps/server/internal/workspace"
)

type Dependencies struct {
	Workspace *workspace.Service
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
	assetsHandler := assetshttp.New(deps.Assets)
	iconsHandler := iconshttp.New(deps.Icons)
	mux := http.NewServeMux()
	mux.HandleFunc("GET /api/health", func(w http.ResponseWriter, r *http.Request) {
		if err := deps.Health(r.Context()); err != nil {
			transport.Fail(w, err)
			return
		}
		transport.Send(w, http.StatusOK, map[string]string{"status": "ok"})
	})
	mux.HandleFunc("GET /api/icons/eraser/{slug}", iconsHandler.ServeEraserIcon)
	mux.HandleFunc("GET /api/workspaces", workspaceHandler.ListWorkspaces)
	mux.HandleFunc("POST /api/workspaces", workspaceHandler.Create)
	mux.HandleFunc("GET /api/categories", workspaceHandler.ListCategories)
	mux.HandleFunc("GET /api/categories/{id}/workspaces", workspaceHandler.ListCategoryWorkspaces)
	mux.HandleFunc("POST /api/categories", workspaceHandler.CreateCategory)
	mux.HandleFunc("PATCH /api/categories/{id}", workspaceHandler.UpdateCategory)
	mux.HandleFunc("DELETE /api/categories/{id}", workspaceHandler.DeleteCategory)
	mux.HandleFunc("GET /api/workspaces/{id}", workspaceHandler.Get)
	mux.HandleFunc("GET /api/workspaces/{id}/canvas", workspaceHandler.GetCanvas)
	mux.HandleFunc("PATCH /api/workspaces/{id}/canvas", workspaceHandler.UpdateCanvas)
	mux.HandleFunc("POST /api/workspaces/{id}/note-instances", noteHandler.CreateInstance)
	mux.HandleFunc("DELETE /api/workspaces/{id}/note-instances/{instanceId}", noteHandler.DeleteInstance)
	mux.HandleFunc("GET /api/notes/{id}", noteHandler.Get)
	mux.HandleFunc("PUT /api/notes/{id}", noteHandler.Update)
	mux.HandleFunc("DELETE /api/notes/{id}", noteHandler.Delete)
	mux.HandleFunc("PATCH /api/workspaces/{id}/title", workspaceHandler.Rename)
	mux.HandleFunc("PATCH /api/workspaces/{id}/category", workspaceHandler.Move)
	mux.HandleFunc("DELETE /api/workspaces/{id}", workspaceHandler.Delete)
	mux.HandleFunc("GET /api/trash", libraryHandler.ListTrash)
	mux.HandleFunc("POST /api/trash/{id}", libraryHandler.RestoreTrash)
	mux.HandleFunc("DELETE /api/trash/{id}", libraryHandler.DeleteTrash)
	mux.HandleFunc("GET /api/backup", libraryHandler.ExportBackup)
	mux.HandleFunc("POST /api/backup/restore", libraryHandler.RestoreBackup)
	mux.HandleFunc("GET /api/workspaces/{id}/assets/{assetId}", assetsHandler.GetAsset)
	mux.HandleFunc("PUT /api/workspaces/{id}/assets/{assetId}", assetsHandler.PutAsset)
	mux.HandleFunc("GET /api/search", workspaceHandler.Search)
	mux.HandleFunc("/api/", func(w http.ResponseWriter, r *http.Request) {
		transport.Send(w, http.StatusNotFound, map[string]string{"error": "Not found"})
	})
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("X-Content-Type-Options", "nosniff")
		w.Header().Set("Cache-Control", "no-store")
		mux.ServeHTTP(w, r)
	})
}
