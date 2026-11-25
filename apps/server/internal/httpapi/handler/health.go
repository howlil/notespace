package handler

import (
	"net/http"

	"github.com/howlil/notespace/apps/server/internal/httpapi/transport"
)

func (h *Handler) Health(w http.ResponseWriter, r *http.Request) {
	if err := h.deps.Library.Healthy(r.Context()); err != nil {
		transport.Fail(w, err)
		return
	}
	transport.SendJSON(w, http.StatusOK, map[string]string{"status": "ok"})
}
