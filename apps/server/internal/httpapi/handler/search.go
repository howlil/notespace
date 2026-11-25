package handler

import (
	"net/http"

	"github.com/howlil/notespace/apps/server/internal/httpapi/transport"
)

func (h *Handler) Search(w http.ResponseWriter, r *http.Request) {
	data, err := h.deps.Library.Search(r.Context(), r.URL.Query().Get("q"))
	if err != nil {
		transport.Fail(w, err)
		return
	}
	transport.SendJSON(w, http.StatusOK, data)
}
