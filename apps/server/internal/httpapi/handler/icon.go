package handler

import (
	"net/http"
	"strconv"

	"github.com/howlil/notespace/apps/server/internal/domain"
	"github.com/howlil/notespace/apps/server/internal/domain/apperr"
	"github.com/howlil/notespace/apps/server/internal/httpapi/transport"
)

func (h *Handler) ServeEraserIcon(w http.ResponseWriter, r *http.Request) {
	entry, err := h.deps.Icons.Fetch(r.Context(), r.PathValue("slug"))
	if err != nil {
		if _, ok := apperr.As(err); !ok {
			err = apperr.Wrap(domain.ErrIconUnavailable, err)
		}
		transport.Fail(w, err)
		return
	}
	w.Header().Set("Content-Type", entry.ContentType)
	w.Header().Set("Content-Length", strconv.Itoa(len(entry.Data)))
	w.Header().Set("Cache-Control", "public,max-age=86400,immutable")
	w.Header().Set("X-Content-Type-Options", "nosniff")
	if r.Method != http.MethodHead {
		_, _ = w.Write(entry.Data)
	}
}
