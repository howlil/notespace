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

const maxBackupBytes = 256 << 20

type libraryStore interface {
	TrashWorkspaceAtomic(context.Context, string) error
	ListTrashJSON(context.Context) ([]byte, error)
	RestoreTrashedWorkspace(context.Context, string) (project.Project, error)
	DeleteTrashedWorkspace(context.Context, string) error
	CategoryHasTrash(context.Context, string) (bool, error)
	ExportBackupJSONAtomic(context.Context) ([]byte, error)
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

// WithLibraryRoutes adds the user-owned library safety/portability boundary
// without changing the existing authored Workspace API or optimistic-save contract.
func WithLibraryRoutes(base http.Handler, store any) http.Handler {
	library, ok := store.(libraryStore)
	if !ok {
		panic("httpapi: store does not implement libraryStore")
	}
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("X-Content-Type-Options", "nosniff")
		w.Header().Set("Cache-Control", "no-store")

		if id, match := singlePathID(r.URL.Path, "/api/projects/"); match && r.Method == http.MethodDelete {
			if !sameOriginMutation(w, r) {
				return
			}
			if err := library.TrashWorkspaceAtomic(r.Context(), id); err != nil {
				fail(w, err)
				return
			}
			send(w, http.StatusNoContent, nil)
			return
		}

		if id, match := singlePathID(r.URL.Path, "/api/categories/"); match && r.Method == http.MethodDelete {
			if !sameOriginMutation(w, r) {
				return
			}
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
			data, err := library.ExportBackupJSONAtomic(r.Context())
			if err != nil {
				fail(w, err)
				return
			}
			w.Header().Set("Content-Type", "application/json")
			w.Header().Set("Content-Disposition", `attachment; filename="notespace-backup.json"`)
			w.WriteHeader(http.StatusOK)
			_, _ = w.Write(data)
			return

		case r.URL.Path == "/api/backup/restore" && r.Method == http.MethodPost:
			if !sameOriginMutation(w, r) {
				return
			}
			mediaType, _, err := mime.ParseMediaType(r.Header.Get("Content-Type"))
			if err != nil || mediaType != "application/json" {
				send(w, http.StatusUnsupportedMediaType, map[string]string{"error": "Expected a Notespace JSON backup"})
				return
			}
			r.Body = http.MaxBytesReader(w, r.Body, maxBackupBytes)
			data, err := io.ReadAll(r.Body)
			if err != nil {
				var tooLarge *http.MaxBytesError
				if errors.As(err, &tooLarge) {
					send(w, http.StatusRequestEntityTooLarge, map[string]string{"error": "Backup exceeds the 256 MiB restore limit"})
					return
				}
				fail(w, err)
				return
			}
			if err := library.RestoreBackupJSON(r.Context(), data); err != nil {
				fail(w, err)
				return
			}
			send(w, http.StatusNoContent, nil)
			return
		}

		if id, match := singlePathID(r.URL.Path, "/api/trash/"); match {
			if !sameOriginMutation(w, r) {
				return
			}
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

		base.ServeHTTP(w, r)
	})
}
