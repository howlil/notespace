package httpapi

import (
	"errors"
	"net/http"
	"strconv"

	"github.com/howlil/notespace/apps/server/internal/icon"
)

func (a API) serveEraserIcon(w http.ResponseWriter, r *http.Request) {
	entry, err := a.eraserIcons.Fetch(r.Context(), r.PathValue("slug"))
	switch {
	case errors.Is(err, icon.ErrInvalidName):
		send(w, http.StatusBadRequest, map[string]string{"error": "Invalid Eraser icon name"})
		return
	case errors.Is(err, icon.ErrNotFound):
		send(w, http.StatusNotFound, map[string]string{"error": "Eraser icon not found"})
		return
	case err != nil:
		send(w, http.StatusBadGateway, map[string]string{"error": "Could not load Eraser icon"})
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
