package httpapi

import (
	"errors"
	"io"
	"mime"
	"net/http"
	"strconv"
	"strings"

	"github.com/howlil/notespace/apps/server/internal/library"
	"github.com/howlil/notespace/apps/server/internal/workspace"
)

// Backup restore/export is still assembled in memory by the persistence adapter.
// Keep the HTTP round-trip bound conservative until that path is fully streamed.
const maxBackupBytes = 64 << 20


func singlePathID(path, prefix string) (string, bool) {
	if !strings.HasPrefix(path, prefix) {
		return "", false
	}
	id := strings.TrimPrefix(path, prefix)
	return id, id != "" && !strings.Contains(id, "/")
}

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
		send(w, 403, map[string]string{"error": "Cross-site request rejected"})
		return false
	}
	if origin := r.Header.Get("Origin"); origin != "" && origin != "http://"+r.Host && origin != "https://"+r.Host {
		send(w, 403, map[string]string{"error": "Origin rejected"})
		return false
	}
	return true
}

// WithSameOriginMutations protects every state-changing route in a composed
// application. Read routes remain directly cacheable and do not require an
// Origin header.
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

// WithLibraryRoutes owns recovery/portability and the compatibility transition
// from the old Project HTTP vocabulary to canonical Workspace routes.
func WithLibraryRoutes(base http.Handler, service library.Service) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("X-Content-Type-Options", "nosniff")
		w.Header().Set("Cache-Control", "no-store")
		if isLegacyProjectPath(r.URL.Path) {
			w.Header().Set("Deprecation", "true")
			w.Header().Set("Link", `</api/workspaces>; rel="successor-version"`)
		}

		if (isLegacyProjectPath(r.URL.Path) || strings.HasPrefix(r.URL.Path, "/api/workspaces/")) && r.Method == http.MethodDelete {
			prefix := "/api/workspaces/"
			if isLegacyProjectPath(r.URL.Path) {
				prefix = "/api/projects/"
			}
			id, match := singlePathID(r.URL.Path, prefix)
			if !match {
				base.ServeHTTP(w, r)
				return
			}
			version, err := expectedVersion(r)
			if err != nil {
				fail(w, err)
				return
			}
			if err := service.TrashWorkspace(r.Context(), id, version); err != nil {
				fail(w, err)
				return
			}
			send(w, http.StatusNoContent, nil)
			return
		}

		if id, match := singlePathID(r.URL.Path, "/api/categories/"); match && r.Method == http.MethodDelete {
			if err := service.DeleteCategory(r.Context(), id); err != nil {
				fail(w, err)
				return
			}
			send(w, http.StatusNoContent, nil)
			return
		}

		switch {
		case r.URL.Path == "/api/trash" && r.Method == http.MethodGet:
			items, err := service.ListTrash(r.Context())
			if err != nil {
				fail(w, err)
				return
			}
			send(w, http.StatusOK, items)
			return

		case r.URL.Path == "/api/backup" && r.Method == http.MethodGet:
			data, err := service.ExportBackup(r.Context())
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
			return

		case r.URL.Path == "/api/backup/restore" && r.Method == http.MethodPost:
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
				err = service.RestoreBackupJSON(r.Context(), data)
			} else {
				err = service.RestoreBackupArchive(r.Context(), data)
			}
			if err != nil {
				fail(w, err)
				return
			}
			send(w, http.StatusNoContent, nil)
			return
		}

		if id, match := singlePathID(r.URL.Path, "/api/trash/"); match {
			switch r.Method {
			case http.MethodPost:
				workspace, err := service.RestoreWorkspace(r.Context(), id)
				if err != nil {
					fail(w, err)
					return
				}
				send(w, http.StatusOK, workspace)
				return
			case http.MethodDelete:
				if err := service.DeleteTrash(r.Context(), id); err != nil {
					fail(w, err)
					return
				}
				send(w, http.StatusNoContent, nil)
				return
			}
		}

		base.ServeHTTP(w, r)
	})
}
