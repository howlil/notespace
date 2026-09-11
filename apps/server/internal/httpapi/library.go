package httpapi

import (
	"context"
	"errors"
	"io"
	"mime"
	"net/http"
	"strings"

	"github.com/howlil/notespace/apps/server/internal/project"
)

// Backup restore/export is still assembled in memory by the persistence adapter.
// Keep the HTTP round-trip bound conservative until that path is fully streamed.
const maxBackupBytes = 64 << 20

type libraryStore interface {
	TrashWorkspaceAtomic(context.Context, string) error
	ListTrashJSON(context.Context) ([]byte, error)
	RestoreTrashedWorkspace(context.Context, string) (project.Project, error)
	DeleteTrashedWorkspace(context.Context, string) error
	CategoryHasTrash(context.Context, string) (bool, error)
	ExportBackupArchiveAtomic(context.Context) ([]byte, error)
	RestoreBackupArchive(context.Context, []byte) error
	RestoreBackupJSON(context.Context, []byte) error
}

func singlePathID(path, prefix string) (string, bool) {
	if !strings.HasPrefix(path, prefix) {
		return "", false
	}
	id := strings.TrimPrefix(path, prefix)
	return id, id != "" && !strings.Contains(id, "/")
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

func legacyWorkspacePath(path string) (string, bool) {
	if path == "/api/workspaces" {
		return "/api/projects", true
	}
	const prefix = "/api/workspaces/"
	if !strings.HasPrefix(path, prefix) {
		return "", false
	}
	parts := strings.Split(strings.TrimPrefix(path, prefix), "/")
	if len(parts) == 1 && parts[0] != "" {
		return "/api/projects/" + parts[0], true
	}
	if len(parts) == 2 && parts[0] != "" && (parts[1] == "title" || parts[1] == "category") {
		return "/api/projects/" + parts[0] + "/" + parts[1], true
	}
	return "", false
}

func serveRewritten(base http.Handler, w http.ResponseWriter, r *http.Request, path string) {
	clone := r.Clone(r.Context())
	urlCopy := *r.URL
	urlCopy.Path = path
	clone.URL = &urlCopy
	base.ServeHTTP(w, clone)
}

// WithLibraryRoutes owns recovery/portability and the compatibility transition
// from the old Project HTTP vocabulary to canonical Workspace routes.
func WithLibraryRoutes(base http.Handler, library libraryStore) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("X-Content-Type-Options", "nosniff")
		w.Header().Set("Cache-Control", "no-store")

		if strings.HasPrefix(r.URL.Path, "/api/projects") {
			w.Header().Set("Deprecation", "true")
			w.Header().Set("Link", `</api/workspaces>; rel="successor-version"`)
		}

		if id, match := singlePathID(r.URL.Path, "/api/projects/"); match && r.Method == http.MethodDelete {
			if err := library.TrashWorkspaceAtomic(r.Context(), id); err != nil {
				fail(w, err)
				return
			}
			send(w, http.StatusNoContent, nil)
			return
		}
		if id, match := singlePathID(r.URL.Path, "/api/workspaces/"); match && r.Method == http.MethodDelete {
			if err := library.TrashWorkspaceAtomic(r.Context(), id); err != nil {
				fail(w, err)
				return
			}
			send(w, http.StatusNoContent, nil)
			return
		}

		if id, match := singlePathID(r.URL.Path, "/api/categories/"); match && r.Method == http.MethodDelete {
			hasTrash, err := library.CategoryHasTrash(r.Context(), id)
			if err != nil {
				fail(w, err)
				return
			}
			if hasTrash {
				fail(w, project.ErrNotEmpty)
				return
			}
		}

		switch {
		case r.URL.Path == "/api/trash" && r.Method == http.MethodGet:
			data, err := library.ListTrashJSON(r.Context())
			if err != nil {
				fail(w, err)
				return
			}
			w.Header().Set("Content-Type", "application/json")
			w.WriteHeader(http.StatusOK)
			_, _ = w.Write(data)
			return

		case r.URL.Path == "/api/backup" && r.Method == http.MethodGet:
			data, err := library.ExportBackupArchiveAtomic(r.Context())
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
				err = library.RestoreBackupJSON(r.Context(), data)
			} else {
				err = library.RestoreBackupArchive(r.Context(), data)
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
				workspace, err := library.RestoreTrashedWorkspace(r.Context(), id)
				if err != nil {
					fail(w, err)
					return
				}
				send(w, http.StatusOK, workspace)
				return
			case http.MethodDelete:
				if err := library.DeleteTrashedWorkspace(r.Context(), id); err != nil {
					fail(w, err)
					return
				}
				send(w, http.StatusNoContent, nil)
				return
			}
		}

		if legacyPath, ok := legacyWorkspacePath(r.URL.Path); ok {
			if r.URL.Path == "/api/workspaces" && r.Method != http.MethodPost {
				base.ServeHTTP(w, r)
				return
			}
			serveRewritten(base, w, r, legacyPath)
			return
		}
		base.ServeHTTP(w, r)
	})
}
