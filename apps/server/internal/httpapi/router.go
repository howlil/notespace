// Package httpapi composes Notespace's HTTP route table and public middleware
// facade over transport, middleware, and capability handler subpackages.
package httpapi

import (
	"net/http"

	"github.com/howlil/notespace/apps/server/internal/domain"
	"github.com/howlil/notespace/apps/server/internal/httpapi/handler"
	"github.com/howlil/notespace/apps/server/internal/httpapi/middleware"
	"github.com/howlil/notespace/apps/server/internal/httpapi/transport"
	"github.com/howlil/notespace/apps/server/internal/infra/store"
)

type Dependencies struct {
	Library *store.Store
	Icons   domain.IconSource
}

type PoolStats = middleware.PoolStats

func New(deps Dependencies) http.Handler {
	if deps.Library == nil {
		panic("httpapi: library store is required")
	}
	if deps.Icons == nil {
		panic("httpapi: icon source is required")
	}

	h := handler.New(handler.Dependencies{
		Library: deps.Library,
		Icons:   deps.Icons,
	})
	mux := http.NewServeMux()

	// Health & icons
	mux.HandleFunc("GET /api/health", h.Health)
	mux.HandleFunc("GET /api/icons/eraser/{slug}", h.ServeEraserIcon)

	// Workspaces, Canvas & Workspace Trash
	mux.HandleFunc("GET /api/workspaces", h.ListWorkspaces)
	mux.HandleFunc("POST /api/workspaces", h.CreateWorkspace)
	mux.HandleFunc("GET /api/workspaces/{id}", h.GetWorkspace)
	mux.HandleFunc("PATCH /api/workspaces/{id}/title", h.RenameWorkspace)
	mux.HandleFunc("PATCH /api/workspaces/{id}/parent", h.MoveWorkspaceParent)
	mux.HandleFunc("POST /api/workspaces/{id}/reparent-children", h.ReparentWorkspaceChildren)
	mux.HandleFunc("DELETE /api/workspaces/{id}", h.DeleteWorkspace)
	mux.HandleFunc("GET /api/workspaces/{id}/canvas", h.GetCanvas)
	mux.HandleFunc("PATCH /api/workspaces/{id}/canvas", h.UpdateCanvas)
	mux.HandleFunc("GET /api/trash", h.ListTrash)
	mux.HandleFunc("POST /api/trash/{id}", h.RestoreTrash)
	mux.HandleFunc("DELETE /api/trash/{id}", h.DeleteTrash)
	mux.HandleFunc("GET /api/legacy/categories/{id}", h.ResolveLegacyCategory)

	// Assets
	mux.HandleFunc("GET /api/workspaces/{id}/assets/{assetId}", h.GetAsset)
	mux.HandleFunc("PUT /api/workspaces/{id}/assets/{assetId}", h.PutAsset)

	// Notes, Placements & Note Trash
	mux.HandleFunc("POST /api/workspaces/{id}/note-instances", h.CreateNoteInstance)
	mux.HandleFunc("DELETE /api/workspaces/{id}/note-instances/{instanceId}", h.DeleteNoteInstance)
	mux.HandleFunc("GET /api/notes", h.ListNotes)
	mux.HandleFunc("GET /api/notes/{id}", h.GetNote)
	mux.HandleFunc("GET /api/notes/{id}/info", h.GetNoteInfo)
	mux.HandleFunc("PUT /api/notes/{id}", h.UpdateNote)
	mux.HandleFunc("DELETE /api/notes/{id}", h.DeleteEmptyNote)
	mux.HandleFunc("POST /api/notes/{id}/trash", h.TrashNote)
	mux.HandleFunc("GET /api/trash/notes", h.ListTrashedNotes)
	mux.HandleFunc("POST /api/trash/notes/{id}", h.RestoreTrashedNote)
	mux.HandleFunc("DELETE /api/trash/notes/{id}", h.DeleteTrashedNote)

	// Tags & Note Tags
	mux.HandleFunc("GET /api/tags", h.ListTags)
	mux.HandleFunc("POST /api/tags", h.CreateTag)
	mux.HandleFunc("PATCH /api/tags/{id}", h.RenameTag)
	mux.HandleFunc("DELETE /api/tags/{id}", h.DeleteTag)
	mux.HandleFunc("POST /api/notes/{id}/tags", h.AssignNoteTag)
	mux.HandleFunc("DELETE /api/notes/{id}/tags/{tagId}", h.RemoveNoteTag)
	mux.HandleFunc("POST /api/notes/batch-tags", h.BatchUpdateNoteTags)

	// Portable Backup
	mux.HandleFunc("GET /api/backup", h.ExportBackup)
	mux.HandleFunc("POST /api/backup/restore", h.RestoreBackup)

	// Global Search
	mux.HandleFunc("GET /api/search", h.Search)

	mux.HandleFunc("/api/", func(w http.ResponseWriter, r *http.Request) {
		transport.SendJSON(w, http.StatusNotFound, map[string]string{"error": "Not found"})
	})

	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("X-Content-Type-Options", "nosniff")
		w.Header().Set("Cache-Control", "no-store")
		mux.ServeHTTP(w, r)
	})
}

func WithSameOriginMutations(base http.Handler) http.Handler {
	return middleware.SameOriginMutations(base)
}

func WithRequestObservability(next http.Handler, poolStats func() PoolStats) http.Handler {
	return middleware.RequestObservability(next, poolStats)
}
