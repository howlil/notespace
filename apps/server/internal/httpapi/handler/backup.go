package handler

import (
	"mime"
	"net/http"

	"github.com/howlil/notespace/apps/server/internal/httpapi/transport"
)

const maxBackupBytes = 64 << 20

func (h *Handler) ExportBackup(w http.ResponseWriter, r *http.Request) {
	data, err := h.deps.Library.ExportBackupArchive(r.Context())
	if err != nil {
		transport.Fail(w, err)
		return
	}
	if len(data) > maxBackupBytes {
		transport.SendJSON(w, http.StatusRequestEntityTooLarge, map[string]string{"error": "Backup exceeds the 64 MiB round-trip limit"})
		return
	}
	w.Header().Set("Content-Type", "application/zip")
	w.Header().Set("Content-Disposition", `attachment; filename="notespace-backup.zip"`)
	w.WriteHeader(http.StatusOK)
	_, _ = w.Write(data)
}

func (h *Handler) RestoreBackup(w http.ResponseWriter, r *http.Request) {
	mediaType, _, err := mime.ParseMediaType(r.Header.Get("Content-Type"))
	if err != nil || (mediaType != "application/zip" && mediaType != "application/x-zip-compressed") {
		transport.SendJSON(w, http.StatusUnsupportedMediaType, map[string]string{"error": "Expected a Notespace ZIP backup"})
		return
	}
	data, ok := transport.ReadBoundedBody(w, r, maxBackupBytes, "Backup exceeds the 64 MiB restore limit")
	if !ok {
		return
	}
	if err := h.deps.Library.RestoreBackupArchive(r.Context(), data); err != nil {
		transport.Fail(w, err)
		return
	}
	transport.SendNoContent(w)
}
