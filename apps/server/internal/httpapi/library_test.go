package httpapi_test

import (
	"bytes"
	"context"
	"net/http"
	"net/http/httptest"
	"path/filepath"
	"strings"
	"testing"

	"github.com/howlil/notespace/apps/server/internal/sqlite"
)

func TestBackupHTTPExportAndRestoreContract(t *testing.T) {
	store, err := sqlite.Open(context.Background(), filepath.Join(t.TempDir(), "backup-http.db"))
	if err != nil {
		t.Fatal(err)
	}
	defer store.Close()
	api := newAPI(store)

	original := decodeWorkspace(t, call(t, api, http.MethodPost, "/api/workspaces", map[string]string{"title": "Backup original"}))
	exported := call(t, api, http.MethodGet, "/api/backup", nil)
	expect(t, exported, http.StatusOK)
	if got := exported.Header().Get("Content-Type"); got != "application/zip" {
		t.Fatalf("Content-Type = %q", got)
	}
	if disposition := exported.Header().Get("Content-Disposition"); !strings.Contains(disposition, "notespace-backup.zip") {
		t.Fatalf("Content-Disposition = %q", disposition)
	}
	if exported.Body.Len() == 0 {
		t.Fatal("backup body is empty")
	}

	extra := decodeWorkspace(t, call(t, api, http.MethodPost, "/api/workspaces", map[string]string{"title": "Should disappear"}))
	restore := httptest.NewRequest(http.MethodPost, "/api/backup/restore", bytes.NewReader(exported.Body.Bytes()))
	restore.Header.Set("Content-Type", "application/zip")
	restoreResponse := httptest.NewRecorder()
	api.ServeHTTP(restoreResponse, restore)
	expect(t, restoreResponse, http.StatusNoContent)

	expect(t, call(t, api, http.MethodGet, "/api/workspaces/"+original.ID, nil), http.StatusOK)
	expect(t, call(t, api, http.MethodGet, "/api/workspaces/"+extra.ID, nil), http.StatusNotFound)
}

func TestBackupHTTPRejectsUnsupportedMediaType(t *testing.T) {
	store, err := sqlite.Open(context.Background(), filepath.Join(t.TempDir(), "backup-media.db"))
	if err != nil {
		t.Fatal(err)
	}
	defer store.Close()
	api := newAPI(store)

	req := httptest.NewRequest(http.MethodPost, "/api/backup/restore", bytes.NewReader([]byte("not a backup")))
	req.Header.Set("Content-Type", "text/plain")
	res := httptest.NewRecorder()
	api.ServeHTTP(res, req)
	expect(t, res, http.StatusUnsupportedMediaType)
}
