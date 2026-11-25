package transport

import (
	"log/slog"
	"net/http"

	"github.com/howlil/notespace/apps/server/internal/domain/apperr"
)

// Fail maps structured apperr.Error values uniformly by Kind without importing
// or switching over domain-specific sentinel lists.
func Fail(w http.ResponseWriter, err error) {
	appErr, ok := apperr.As(err)
	if !ok {
		slog.Error("request operation failed", "error", err)
		SendJSON(w, http.StatusInternalServerError, map[string]string{"error": "Unable to complete the request. Please retry."})
		return
	}
	status := http.StatusInternalServerError
	switch appErr.Kind {
	case apperr.KindNotFound:
		status = http.StatusNotFound
	case apperr.KindInvalid:
		status = http.StatusBadRequest
	case apperr.KindConflict, apperr.KindNotEmpty:
		status = http.StatusConflict
	case apperr.KindUnavailable:
		status = http.StatusBadGateway
	}
	body := map[string]string{"error": appErr.Message}
	if appErr.Code != "" {
		body["code"] = appErr.Code
	}
	SendJSON(w, status, body)
}
