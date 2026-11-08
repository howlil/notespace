package libraryhttp

import (
	"errors"
	"github.com/howlil/notespace/apps/server/internal/httpapi/internal/transport"
	"io"
	"mime"
	"net/http"
)

// Backup restore/export is still assembled in memory by the SQLite adapter.
// Keep the HTTP round-trip bound conservative until that path is fully streamed.
const maxBackupBytes = 64 << 20

func (a Handler) ListTrash(w http.ResponseWriter, r *http.Request) {
	items, err := a.library.ListTrash(r.Context())
	if err != nil {
		transport.Fail(w, err)
		return
	}
	transport.Send(w, http.StatusOK, items)
}

func (a Handler) RestoreTrash(w http.ResponseWriter, r *http.Request) {
	value, err := a.library.RestoreWorkspace(r.Context(), r.PathValue("id"))
	if err != nil {
		transport.Fail(w, err)
		return
	}
	transport.Send(w, http.StatusOK, value)
}

func (a Handler) DeleteTrash(w http.ResponseWriter, r *http.Request) {
	if err := a.library.DeleteTrash(r.Context(), r.PathValue("id")); err != nil {
		transport.Fail(w, err)
		return
	}
	transport.Send(w, http.StatusNoContent, nil)
}

func (a Handler) ExportBackup(w http.ResponseWriter, r *http.Request) {
	data, err := a.library.ExportBackup(r.Context())
	if err != nil {
		transport.Fail(w, err)
		return
	}
	if len(data) > maxBackupBytes {
		transport.Send(w, http.StatusRequestEntityTooLarge, map[string]string{"error": "Backup exceeds the 64 MiB round-trip limit"})
		return
	}
	w.Header().Set("Content-Type", "application/zip")
	w.Header().Set("Content-Disposition", `attachment; filename="notespace-backup.zip"`)
	w.WriteHeader(http.StatusOK)
	_, _ = w.Write(data)
}

func (a Handler) RestoreBackup(w http.ResponseWriter, r *http.Request) {
	mediaType, _, err := mime.ParseMediaType(r.Header.Get("Content-Type"))
	if err != nil || (mediaType != "application/zip" && mediaType != "application/x-zip-compressed" && mediaType != "application/json") {
		transport.Send(w, http.StatusUnsupportedMediaType, map[string]string{"error": "Expected a Notespace ZIP backup or legacy JSON backup"})
		return
	}
	r.Body = http.MaxBytesReader(w, r.Body, maxBackupBytes)
	data, err := io.ReadAll(r.Body)
	if err != nil {
		var tooLarge *http.MaxBytesError
		if errors.As(err, &tooLarge) {
			transport.Send(w, http.StatusRequestEntityTooLarge, map[string]string{"error": "Backup exceeds the 64 MiB restore limit"})
			return
		}
		transport.Fail(w, err)
		return
	}
	if mediaType == "application/json" {
		err = a.library.RestoreBackupJSON(r.Context(), data)
	} else {
		err = a.library.RestoreBackupArchive(r.Context(), data)
	}
	if err != nil {
		transport.Fail(w, err)
		return
	}
	transport.Send(w, http.StatusNoContent, nil)
}
