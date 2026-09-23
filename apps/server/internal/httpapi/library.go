package httpapi

import (
	"errors"
	"io"
	"mime"
	"net/http"
	"strconv"
	"strings"

	"github.com/howlil/notespace/apps/server/internal/workspace"
)

// Backup restore/export is still assembled in memory by the SQLite adapter.
// Keep the HTTP round-trip bound conservative until that path is fully streamed.
const maxBackupBytes = 64 << 20

func expectedVersion(r *http.Request) (*int, error) {
	raw := strings.TrimSpace(r.Header.Get("If-Match"))
	if raw == "" {
		return nil, nil
	}
	if strings.HasPrefix(raw, "W/") {
		raw = strings.TrimSpace(strings.TrimPrefix(raw, "W/"))
	}
	raw = strings.Trim(raw, `"`)
	value, err := strconv.Atoi(raw)
	if err != nil || value < 1 {
		return nil, workspace.ErrInvalid
	}
	return &value, nil
}

func sameOriginMutation(w http.ResponseWriter, r *http.Request) bool {
	if r.Method == http.MethodGet || r.Method == http.MethodHead {
		return true
	}
	if r.Header.Get("Sec-Fetch-Site") == "cross-site" {
		send(w, http.StatusForbidden, map[string]string{"error": "Cross-site request rejected"})
		return false
	}
	if origin := r.Header.Get("Origin"); origin != "" && origin != "http://"+r.Host && origin != "https://"+r.Host {
		send(w, http.StatusForbidden, map[string]string{"error": "Origin rejected"})
		return false
	}
	return true
}

func WithSameOriginMutations(base http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if !sameOriginMutation(w, r) {
			return
		}
		base.ServeHTTP(w, r)
	})
}

func isLegacyProjectPath(path string) bool {
	return path == "/api/projects" || strings.HasPrefix(path, "/api/projects/")
}

func (a API) listTrash(w http.ResponseWriter, r *http.Request) {
	items, err := a.library.ListTrash(r.Context())
	if err != nil {
		fail(w, err)
		return
	}
	send(w, http.StatusOK, items)
}

func (a API) restoreTrash(w http.ResponseWriter, r *http.Request) {
	value, err := a.library.RestoreWorkspace(r.Context(), r.PathValue("id"))
	if err != nil {
		fail(w, err)
		return
	}
	send(w, http.StatusOK, value)
}

func (a API) deleteTrash(w http.ResponseWriter, r *http.Request) {
	if err := a.library.DeleteTrash(r.Context(), r.PathValue("id")); err != nil {
		fail(w, err)
		return
	}
	send(w, http.StatusNoContent, nil)
}

func (a API) exportBackup(w http.ResponseWriter, r *http.Request) {
	data, err := a.library.ExportBackup(r.Context())
	if err != nil {
		fail(w, err)
		return
	}
	if len(data) > maxBackupBytes {
		send(w, http.StatusRequestEntityTooLarge, map[string]string{"error": "Backup exceeds the 64 MiB round-trip limit"})
		return
	}
	w.Header().Set("Content-Type", "application/zip")
	w.Header().Set("Content-Disposition", `attachment; filename="notespace-backup.zip"`)
	w.WriteHeader(http.StatusOK)
	_, _ = w.Write(data)
}

func (a API) restoreBackup(w http.ResponseWriter, r *http.Request) {
	mediaType, _, err := mime.ParseMediaType(r.Header.Get("Content-Type"))
	if err != nil || (mediaType != "application/zip" && mediaType != "application/x-zip-compressed" && mediaType != "application/json") {
		send(w, http.StatusUnsupportedMediaType, map[string]string{"error": "Expected a Notespace ZIP backup or legacy JSON backup"})
		return
	}
	r.Body = http.MaxBytesReader(w, r.Body, maxBackupBytes)
	data, err := io.ReadAll(r.Body)
	if err != nil {
		var tooLarge *http.MaxBytesError
		if errors.As(err, &tooLarge) {
			send(w, http.StatusRequestEntityTooLarge, map[string]string{"error": "Backup exceeds the 64 MiB restore limit"})
			return
		}
		fail(w, err)
		return
	}
	if mediaType == "application/json" {
		err = a.library.RestoreBackupJSON(r.Context(), data)
	} else {
		err = a.library.RestoreBackupArchive(r.Context(), data)
	}
	if err != nil {
		fail(w, err)
		return
	}
	send(w, http.StatusNoContent, nil)
}
