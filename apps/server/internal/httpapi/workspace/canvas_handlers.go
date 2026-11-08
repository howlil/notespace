package workspacehttp

import (
	"github.com/howlil/notespace/apps/server/internal/httpapi/internal/transport"
	"net/http"

	"github.com/howlil/notespace/apps/server/internal/workspace"
)

func (a Handler) GetCanvas(w http.ResponseWriter, r *http.Request) {
	canvas, err := a.workspace.GetCanvasState(r.Context(), r.PathValue("id"))
	if err != nil {
		transport.Fail(w, err)
		return
	}
	transport.Send(w, http.StatusOK, canvas)
}

func (a Handler) UpdateCanvas(w http.ResponseWriter, r *http.Request) {
	var body workspace.CanvasUpdate
	if !transport.Decode(w, r, &body) {
		return
	}
	canvas, err := a.workspace.UpdateCanvas(r.Context(), r.PathValue("id"), body)
	if err != nil {
		transport.Fail(w, err)
		return
	}
	transport.Send(w, http.StatusOK, canvas)
}
