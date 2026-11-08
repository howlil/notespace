package workspacehttp

import (
	"github.com/howlil/notespace/apps/server/internal/library"
	"github.com/howlil/notespace/apps/server/internal/workspace"
)

// Handler owns workspace transport and delegates product rules to application services.
type Handler struct {
	library   *library.Service
	workspace *workspace.Service
}

func New(library *library.Service, workspace *workspace.Service) Handler {
	return Handler{library: library, workspace: workspace}
}
