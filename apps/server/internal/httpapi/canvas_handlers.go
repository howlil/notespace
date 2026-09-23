package httpapi

import (
	"net/http"

	"github.com/howlil/notespace/apps/server/internal/workspace"
)

func (a API) getCanvas(w http.ResponseWriter, r *http.Request) {
	canvas, err := a.service.GetCanvasState(r.Context(), r.PathValue("id"))
	if err != nil {
		fail(w, err)
		return
	}
	send(w, http.StatusOK, canvas)
}

func (a API) updateCanvas(w http.ResponseWriter, r *http.Request) {
	var body workspace.CanvasUpdate
	if !decode(w, r, &body) {
		return
	}
	canvas, err := a.service.UpdateCanvas(r.Context(), r.PathValue("id"), body)
	if err != nil {
		fail(w, err)
		return
	}
	send(w, http.StatusOK, canvas)
}
